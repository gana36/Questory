import asyncio
import json
import os
from datetime import UTC, datetime
from typing import Any

from google import genai
from google.genai import types

from src.services.story_session_store import load_story_session, save_story_session


HEADSTART_MODEL_ID = "gemini-3.1-flash-lite-preview"
MIN_PANEL_COUNT = 6
MAX_PANEL_COUNT = 10

HEADSTART_SYSTEM_INSTRUCTION = """
You create the canonical opening comic-book story headstart for Questory.

Your job:
- Turn the chosen topic, concept, and hero into a strong educational comic opening.
- Decide whether the headstart needs 6, 8, or 10 panels based on the scope of the story seed.
- Make the story feel adventurous, specific, and child-friendly.
- Make sure every child question is educationally useful and tied to the chosen concept.
- The questions must reinforce something the child already saw, or prepare them for the next concept that is immediately coming.
- The questions should also help shape the next scene creatively when the child answers.
- Never include random filler questions.
- Spread the teaching naturally through the action.
- Leave room for the live guide to customize the story after the prepared sequence is finished.

Return JSON only.
"""

_HEADSTART_TASKS: dict[str, asyncio.Task[None]] = {}


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _coerce_text(value: Any, fallback: str = "") -> str:
    if isinstance(value, str):
        return value.strip()
    if value is None:
        return fallback
    return str(value).strip()


def _choose_panel_target(topic: str, concept: str) -> int:
    seed = " ".join(part for part in [topic.strip(), concept.strip()] if part).strip()
    char_count = len(seed)
    if char_count <= 60:
        return 6
    if char_count <= 140:
        return 8
    return 10


def _extract_json_blob(raw_text: str) -> dict[str, Any]:
    candidate = raw_text.strip()
    if candidate.startswith("```"):
        candidate = candidate.strip("`")
        if candidate.lower().startswith("json"):
            candidate = candidate[4:].strip()

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(candidate[start:end + 1])


def _normalize_panel(
    raw_panel: Any,
    *,
    index: int,
    topic: str,
    concept: str,
    hero_name: str,
) -> dict[str, Any]:
    source = raw_panel if isinstance(raw_panel, dict) else {}
    learning_objective = _coerce_text(source.get("learning_objective"))
    explanation_focus = _coerce_text(source.get("explanation_focus"), learning_objective or concept or topic)
    child_question = _coerce_text(source.get("child_question"))

    if not child_question:
        if learning_objective:
            child_question = (
                f"Now that we know {learning_objective.lower()}, what should {hero_name} try next?"
            )
        else:
            child_question = f"What should {hero_name} do next to learn more about {topic}?"

    integration_hint = _coerce_text(
        source.get("integration_hint"),
        "If the child gives a strong answer, praise it specifically and weave it into the next transition.",
    )
    visual_description = _coerce_text(source.get("visual_description"))
    if not visual_description:
        visual_description = (
            f"Dynamic comic-book panel showing {hero_name} in an adventurous {topic} scene. "
            f"Keep it vivid, kid-friendly, and visually clear."
        )

    narration = _coerce_text(source.get("narration"))
    if not narration:
        raise ValueError(f"Panel {index} is missing narration")

    story_role = _coerce_text(source.get("story_role"), "story")
    speech_bubble = _coerce_text(source.get("speech_bubble"))

    return {
        "panel_id": f"panel_{index}",
        "story_role": story_role,
        "narration": narration,
        "speech_bubble": speech_bubble or None,
        "visual_description": visual_description,
        "learning_objective": learning_objective or None,
        "explanation_focus": explanation_focus,
        "child_question": child_question,
        "question_purpose": _coerce_text(
            source.get("question_purpose"),
            "Reinforce the visible concept and help the child's answer shape the very next scene.",
        ),
        "integration_hint": integration_hint,
    }


def _normalize_headstart(
    payload: dict[str, Any],
    *,
    topic: str,
    concept: str,
    hero_name: str,
    panel_target: int,
) -> dict[str, Any]:
    raw_panels = payload.get("panels")
    if not isinstance(raw_panels, list) or not raw_panels:
        raise ValueError("Headstart response did not include panels")

    normalized_panels = [
        _normalize_panel(
            panel,
            index=index,
            topic=topic,
            concept=concept,
            hero_name=hero_name,
        )
        for index, panel in enumerate(raw_panels[:MAX_PANEL_COUNT], start=1)
    ]

    if len(normalized_panels) < MIN_PANEL_COUNT:
        raise ValueError(f"Expected at least {MIN_PANEL_COUNT} panels, got {len(normalized_panels)}")

    prepared_panel_count = len(normalized_panels)
    if prepared_panel_count not in {6, 8, 10}:
        if prepared_panel_count < 8:
            normalized_panels = normalized_panels[:6]
        elif prepared_panel_count < 10:
            normalized_panels = normalized_panels[:8]
        else:
            normalized_panels = normalized_panels[:10]
        prepared_panel_count = len(normalized_panels)

    if prepared_panel_count not in {6, 8, 10}:
        nearest_target = 6 if panel_target <= 6 else 8 if panel_target <= 8 else 10
        normalized_panels = normalized_panels[:nearest_target]
        prepared_panel_count = len(normalized_panels)

    return {
        "title": _coerce_text(payload.get("title"), f"{hero_name} and the {topic} Quest"),
        "story_goal": _coerce_text(
            payload.get("story_goal"),
            f"Help {hero_name} understand the big idea behind {concept or topic}.",
        ),
        "opening_hook": _coerce_text(
            payload.get("opening_hook"),
            f"{hero_name} is thrown into a high-stakes {topic} mystery that only real learning can solve.",
        ),
        "panel_count": prepared_panel_count,
        "panels": normalized_panels,
        "closing_narration": _coerce_text(
            payload.get("closing_narration"),
            f"{hero_name} finishes the opening mission with new knowledge about {concept or topic}.",
        ),
        "live_customization_brief": _coerce_text(
            payload.get("live_customization_brief"),
            "After the prepared sequence, let the child steer the next challenge while staying anchored to the chosen concept.",
        ),
        "generated_by": HEADSTART_MODEL_ID,
        "generated_at": _utc_now_iso(),
    }


async def generate_story_headstart(
    *,
    topic: str,
    concept: str,
    hero_name: str,
    art_style: str,
    age_range: int,
    quiz_frequency: str,
) -> dict[str, Any]:
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("Gemini API key is not configured")

    panel_target = _choose_panel_target(topic, concept)
    prompt = f"""
Create the opening comic headstart as JSON for Questory.

Topic: {topic}
Story concept: {concept}
Chosen hero: {hero_name}
Art style: {art_style}
Audience age bucket: {age_range}
Quiz frequency: {quiz_frequency}
Target prepared panel count: {panel_target}

Use this structure:
{{
  "title": "short title",
  "story_goal": "1 sentence",
  "opening_hook": "1-2 sentences",
  "panels": [
    {{
      "story_role": "opening|teaching|challenge|climax|resolution",
      "narration": "2-3 short exciting sentences for the panel caption",
      "speech_bubble": "optional short line",
      "visual_description": "detailed comic panel art prompt",
      "learning_objective": "short phrase or empty if pure story beat",
      "explanation_focus": "what the live guide should explain after this panel becomes visible",
      "child_question": "one educational, scene-shaping question tied to this panel and the chosen concept",
      "question_purpose": "why the question matters",
      "integration_hint": "how to absorb a strong child answer into the next beat"
    }}
  ],
  "closing_narration": "1-2 sentence handoff ending for the prepared sequence",
  "live_customization_brief": "1-2 sentences on how the live guide should customize after the prepared sequence"
}}

Rules:
- Decide whether the story needs 6, 8, or 10 prepared panels.
- Use the chosen hero in every panel.
- Teach the chosen concept through the adventure instead of stopping for textbook exposition.
- Make at least half of the panels carry a real learning objective.
- Every child_question must help the child understand the chosen concept better.
- Every child_question should also help the child's answer influence the next scene, action, or discovery.
- Questions must connect to what was just shown or what is immediately about to be shown next.
- Never ask random preference-only questions.
- Leave room after the prepared sequence for live customization.
"""

    client = genai.Client(api_key=api_key)
    response = await client.aio.models.generate_content(
        model=HEADSTART_MODEL_ID,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=HEADSTART_SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            temperature=0.8,
            max_output_tokens=4096,
        ),
    )

    raw_text = _coerce_text(getattr(response, "text", ""))
    if not raw_text:
        raise RuntimeError("Headstart model returned an empty response")

    payload = _extract_json_blob(raw_text)
    return _normalize_headstart(
        payload,
        topic=topic,
        concept=concept,
        hero_name=hero_name,
        panel_target=panel_target,
    )


async def _generate_and_store_story_headstart(
    *,
    session_id: str,
    topic: str,
    concept: str,
    hero_name: str,
    art_style: str,
    age_range: int,
    quiz_frequency: str,
) -> None:
    save_story_session(session_id, {
        "storyHeadstartStatus": "generating",
        "storyHeadstartError": "",
        "storyHeadstartRequestedAt": _utc_now_iso(),
    })

    try:
        story_headstart = await generate_story_headstart(
            topic=topic,
            concept=concept,
            hero_name=hero_name,
            art_style=art_style,
            age_range=age_range,
            quiz_frequency=quiz_frequency,
        )
        save_story_session(session_id, {
            "storyHeadstartStatus": "ready",
            "storyHeadstart": story_headstart,
            "storyHeadstartReadyAt": _utc_now_iso(),
            "storyHeadstartError": "",
        })
        print(f"[{session_id}] [Headstart] Prepared {story_headstart['panel_count']} panels with {HEADSTART_MODEL_ID}")
    except Exception as exc:
        save_story_session(session_id, {
            "storyHeadstartStatus": "failed",
            "storyHeadstartError": str(exc),
            "storyHeadstartFailedAt": _utc_now_iso(),
        })
        print(f"[{session_id}] [Headstart] Failed: {exc}")
        raise


def ensure_story_headstart(
    *,
    session_id: str,
    topic: str,
    concept: str,
    hero_name: str,
    art_style: str,
    age_range: int,
    quiz_frequency: str,
) -> None:
    current_session = load_story_session(session_id) or {}
    if current_session.get("storyHeadstartStatus") == "ready" and current_session.get("storyHeadstart"):
        return

    existing_task = _HEADSTART_TASKS.get(session_id)
    if existing_task and not existing_task.done():
        return

    task = asyncio.create_task(
        _generate_and_store_story_headstart(
            session_id=session_id,
            topic=topic,
            concept=concept,
            hero_name=hero_name,
            art_style=art_style,
            age_range=age_range,
            quiz_frequency=quiz_frequency,
        )
    )
    _HEADSTART_TASKS[session_id] = task

    def _cleanup(done_task: asyncio.Task[None]) -> None:
        _HEADSTART_TASKS.pop(session_id, None)
        try:
            done_task.result()
        except Exception:
            pass

    task.add_done_callback(_cleanup)
