import asyncio
import base64
import json
import os
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

from src.services.image_gen import generate_image

COMIC_BUILDER_SYSTEM_INSTRUCTION = """
You are a magical Story Guide for Questory — a learning adventure app where kids discover real knowledge through epic comic book stories!

Your mission: build a comic story where every challenge the hero faces reveals something real and fascinating about the world. Kids learn because the story makes them NEED to know.

═══════════════════════════════════════
THE LEARNING PHILOSOPHY
═══════════════════════════════════════
- Every story arc introduces 1-2 real educational facts BEFORE quizzing about them.
- Facts are discoveries the hero makes, not definitions — they feel like secrets unlocked by the adventure.
- The child must SEE the knowledge in the story panels before any quiz tests it.
- Curiosity comes first: make the child WONDER before you explain.

═══════════════════════════════════════
THE STORY-TEACHING CYCLE (repeat 2-3x per story)
═══════════════════════════════════════

PANEL A — STORY BEAT (no learning_objective needed):
  Set the scene. Introduce a challenge, mystery, or danger.
  End your spoken narration with a curiosity hook question to the child:
  "Hmm, I wonder... do you know why [phenomenon] happens?"
  or "What do YOU think [hero name] should do right now?"
  Wait a moment for their response — then incorporate it!

PANEL B — TEACHING BEAT (include learning_objective):
  The hero's challenge reveals a real educational fact naturally in the narration.
  GOOD: "The volcano explodes with lava! That's because deep underground, liquid rock called
         magma pushes up through cracks where Earth's giant tectonic plates collide!"
  BAD:  "A volcano erupted. Volcanoes are mountains that erupt."
  After narrating, ask the child something creative: "Wow! If YOU could control a volcano, what would you do with it?"

PANEL C — DEEPER TEACHING BEAT (optional, include learning_objective):
  Build on the fact from Panel B — show a consequence, application, or related wonder.
  Example follow-up: "The lava cools and becomes brand new rock — that's how islands are born!"
  Ask another curiosity question before moving on.

QUIZ — TEST WHAT THE STORY TAUGHT:
  Call `ask_quiz` ONLY after panels that contained educational facts.
  Your spoken quiz intro MUST reference the story moment:
    "We just watched how the volcano formed from colliding tectonic plates — let's see what you learned!"
  The question must test exactly what Panels B/C narrated. Never quiz cold topics.
  RULE: If the story hasn't shown it yet, the quiz cannot ask about it.

REACTION — CELEBRATE AND CONTINUE:
  React enthusiastically whether they got it right or wrong.
  Right: "YES! You got it! [hero name] is amazing AND smart!"
  Wrong: "Ooh, tricky one! Remember when the story showed [reference to panel]? The answer was [fact]. Now you'll never forget it!"
  Then immediately launch the next story arc.

═══════════════════════════════════════
CHILD ENGAGEMENT RULES
═══════════════════════════════════════
After EVERY teaching panel, ask the child ONE of these before your next panel:
  - "What do you think [hero name] should do next?"
  - "Have you ever seen or heard about [educational concept] before?"
  - "If YOU were [hero name] right now, what would you do?"
  - "What do you think is going to happen next?"
  - "That's amazing, right?! What's the most surprising thing so far?"

When the child responds — use their idea! Say "Oh I love that idea!" then incorporate it into the next panel narration or story direction. This is THEIR story.

═══════════════════════════════════════
STORY STRUCTURE
═══════════════════════════════════════
Total panels: 9-12. Structure per arc:
  Arc 1 (panels 1-4): Open the world → Teach concept 1 → Quiz 1
  Arc 2 (panels 5-8): New challenge → Teach concept 2 → Quiz 2
  Arc 3 (panels 9-12): Climax using both concepts → Resolution → story_complete

═══════════════════════════════════════
TOOL CALLING RULES
═══════════════════════════════════════
- Start by greeting the child in 1-2 short spoken sentences before creating the first panel.
- Never describe your planning, workflow, or panel structure.
- Never say things like "I am crafting panel 1", "here is the structure", or "I established the opening panel".
- Never use markdown headings, production notes, or behind-the-scenes commentary.
- Call `add_comic_panel` after EVERY narration beat (story AND teaching panels).
- IMPORTANT: After calling `add_comic_panel`, follow the tool response exactly.
- If the tool response says the scene is still rendering, keep the child engaged ONLY about the currently visible scene or mission.
- While a new scene is rendering, do NOT describe unseen visuals, do NOT call `add_comic_panel` again, and do NOT call `ask_quiz` yet.
- When a tool response says a panel is visible, treat that as the exact on-screen truth. Resume only from what the child can currently see.
- After a scene becomes visible, first narrate the visible scene, then ask one grounded question, then WAIT for the child's reply before calling another tool.
- For teaching panels: set `learning_objective` to a short phrase like "How tectonic plates create volcanoes".
- For story/action panels: omit `learning_objective` or leave it empty.
- Call `ask_quiz` only after teaching panels — never cold.
- Only trigger a quiz after finishing the current scene interaction and clearly transitioning into quiz mode.
- After calling `ask_quiz`, stop speaking and wait for the later system update with the child's answer.
- Do not continue the story, narrate a new scene, or call any tool until that quiz-answer system update arrives.
- After the quiz-answer system update arrives, react to the child's actual answer briefly, then continue the story.
- Call `story_complete` when the story reaches a satisfying resolution.

═══════════════════════════════════════
TONE
═══════════════════════════════════════
- Warm, enthusiastic, and age-appropriate.
- Speak DIRECTLY to the child — use "you" and the hero's name constantly.
- Short sentences. Vivid verbs. Lots of energy!
- Learning is an adventure — treat every fact like a treasure just found.

START NOW: Begin narrating the opening scene immediately and call `add_comic_panel`!
"""

COMIC_TOOLS = [
    {
        "function_declarations": [
            {
                "name": "add_comic_panel",
                "description": "Add a new panel to the comic book. Call this after each narration beat to create a new scene.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "panel_id": {
                            "type": "STRING",
                            "description": "Unique panel ID, e.g. 'panel_1', 'panel_2'. Increment sequentially."
                        },
                        "narration": {
                            "type": "STRING",
                            "description": "The caption text that appears below the panel image. 2-3 short, exciting sentences."
                        },
                        "speech_bubble": {
                            "type": "STRING",
                            "description": "Short dialogue for the hero's speech bubble overlay. Under 15 words. Optional."
                        },
                        "visual_description": {
                            "type": "STRING",
                            "description": "Detailed visual description for image generation. Include the hero, setting, action, mood, lighting, and art style."
                        },
                        "learning_objective": {
                            "type": "STRING",
                            "description": "Short phrase describing what educational concept this panel teaches (e.g. 'How tectonic plates create volcanoes'). Only include for teaching panels — leave empty for pure story/action panels."
                        }
                    },
                    "required": ["panel_id", "narration", "visual_description"]
                }
            },
            {
                "name": "ask_quiz",
                "description": "Pause the story and quiz the child on something the story just taught in the preceding panels. IMPORTANT: Only call this after panels that contained educational facts (learning_objective was set). Never quiz on topics the story has not yet narrated.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "question": {
                            "type": "STRING",
                            "description": "The quiz question, tightly related to the story events or educational topic."
                        },
                        "options": {
                            "type": "ARRAY",
                            "description": "Exactly 4 answer options.",
                            "items": {"type": "STRING"}
                        },
                        "correct_index": {
                            "type": "INTEGER",
                            "description": "0-based index of the correct option."
                        },
                        "explanation": {
                            "type": "STRING",
                            "description": "1-2 sentence explanation shown after the child answers. Make it interesting and tie it to the story!"
                        },
                        "point_value": {
                            "type": "INTEGER",
                            "description": "Points awarded for a correct answer. Default 100."
                        }
                    },
                    "required": ["question", "options", "correct_index", "explanation"]
                }
            },
            {
                "name": "story_complete",
                "description": "Signal that the comic story has reached a satisfying conclusion. Call this after the final panel (8-12 panels total).",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "closing_narration": {
                            "type": "STRING",
                            "description": "A satisfying 1-2 sentence ending narration celebrating the hero's journey."
                        },
                        "total_panels": {
                            "type": "INTEGER",
                            "description": "Total number of panels added."
                        }
                    },
                    "required": ["closing_narration", "total_panels"]
                }
            }
        ]
    }
]

MODEL_ID = "gemini-2.5-flash-native-audio-preview-12-2025"
MAX_OPENING_RECOVERY_ATTEMPTS = 2

async def proxy_comic_builder_session(client_ws: WebSocket, session_id: str):
    """
    Proxies a WebSocket connection for the Comic Book Story Builder mode.
    Gemini co-creates a comic book story with the child, adding panels and quizzes.
    """
    await client_ws.accept()

    client_disconnected = asyncio.Event()
    pending_tasks: set[asyncio.Task] = set()
    pending_scene_contexts: dict[str, dict[str, Any]] = {}
    pending_quiz_contexts: dict[str, dict[str, Any]] = {}
    last_panel_image_b64: str | None = None
    visible_panels: list[dict[str, Any]] = []

    async def close_client_connection(code: int, reason: str):
        client_disconnected.set()
        try:
            await client_ws.close(code=code, reason=reason)
        except Exception:
            pass

    async def safe_send(payload: dict[str, Any]):
        if client_disconnected.is_set():
            return
        try:
            await client_ws.send_text(json.dumps(payload))
        except Exception:
            client_disconnected.set()

    def build_runtime_context(
        *,
        next_step: str,
        pending_panel: dict[str, Any] | None = None,
        quiz: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        recent_panels = [
            {
                "panelId": panel["panel_id"],
                "panelIndex": panel["panel_index"],
                "narration": panel["narration"],
                "learningObjective": panel.get("learning_objective"),
            }
            for panel in visible_panels[-3:]
        ]
        last_panel = visible_panels[-1] if visible_panels else None
        return {
            "visiblePanelCount": len(visible_panels),
            "lastVisiblePanelId": last_panel["panel_id"] if last_panel else None,
            "lastVisibleNarration": last_panel["narration"] if last_panel else None,
            "lastLearningObjective": last_panel.get("learning_objective") if last_panel else None,
            "recentPanels": recent_panels,
            "pendingPanel": pending_panel,
            "activeQuiz": quiz,
            "nextStep": next_step,
        }

    try:
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        client = genai.Client(api_key=api_key)

        config = {
            "response_modalities": ["AUDIO"],
            "system_instruction": COMIC_BUILDER_SYSTEM_INSTRUCTION,
            "tools": COMIC_TOOLS,
            "speech_config": {
                "voice_config": {
                    "prebuilt_voice_config": {
                        "voice_name": "Aoede"
                    }
                }
            }
        }

        async with client.aio.live.connect(model=MODEL_ID, config=config) as gemini_session:
            print(f"[{session_id}] [Builder] Connected to Gemini Live ({MODEL_ID})")

            async def receive_from_client():
                nonlocal last_panel_image_b64
                audio_chunk_count = 0
                try:
                    while True:
                        message = await client_ws.receive_text()
                        data = json.loads(message)

                        if "realtimeInput" in data:
                            for chunk in data["realtimeInput"]["mediaChunks"]:
                                mime_type = chunk["mimeType"]
                                b64_data = chunk["data"]
                                binary_data = base64.b64decode(b64_data)
                                await gemini_session.send_realtime_input(
                                    audio=types.Blob(
                                        mime_type=mime_type,
                                        data=binary_data
                                    )
                                )
                                audio_chunk_count += 1
                                if audio_chunk_count % 100 == 1:
                                    print(f"[{session_id}] [Builder] Audio streaming... ({audio_chunk_count} chunks)")

                        elif "clientContent" in data:
                            for turn in data["clientContent"]["turns"]:
                                text_parts = [part["text"] for part in turn["parts"] if "text" in part]
                                if text_parts:
                                    text = " ".join(text_parts)
                                    content = types.Content(
                                        parts=[types.Part.from_text(text=text)],
                                        role="user"
                                    )
                                    await gemini_session.send_client_content(
                                        turns=content,
                                        turn_complete=True
                                    )
                                    print(f"[{session_id}] [Builder] Text: {text[:80]}")

                        elif "clientEvent" in data:
                            client_event = data["clientEvent"]
                            event_type = client_event.get("type")

                            if event_type == "scene_visible_ack":
                                panel_id = client_event.get("panelId")
                                if isinstance(panel_id, str):
                                    pending_scene = pending_scene_contexts.pop(panel_id, None)
                                    if pending_scene:
                                        visible_panels.append({
                                            "panel_id": pending_scene["panel_id"],
                                            "panel_index": pending_scene["panel_index"],
                                            "narration": pending_scene["narration"],
                                            "speech_bubble": pending_scene.get("speech_bubble"),
                                            "learning_objective": pending_scene.get("learning_objective"),
                                        })
                                        if pending_scene.get("image_url"):
                                            last_panel_image_b64 = pending_scene["image_url"]
                                        print(f"[{session_id}] [Builder] Scene visible ack: {panel_id}")

                                        scene_prompt = (
                                            f"SYSTEM UPDATE FOR STORYBUILDER: Panel {panel_id} is now visible to the child. "
                                            f"Visible scene narration: {pending_scene['narration']} "
                                            f"Learning objective: {pending_scene.get('learning_objective') or 'none'}. "
                                            "Now narrate what the child can see in this visible scene in 1-2 short spoken sentences using concrete details. "
                                            "Then ask exactly one grounded question about this visible scene. "
                                            "Wait for the child's reply before creating another scene or triggering a quiz."
                                        )
                                        await gemini_session.send_client_content(
                                            turns=types.Content(
                                                parts=[types.Part.from_text(text=scene_prompt)],
                                                role="user",
                                            ),
                                            turn_complete=True,
                                        )

                            elif event_type == "quiz_answer_ack":
                                quiz_id = client_event.get("quizId")
                                if isinstance(quiz_id, str):
                                    pending_quiz = pending_quiz_contexts.pop(quiz_id, None)
                                    if pending_quiz:
                                        print(f"[{session_id}] [Builder] Quiz answer ack: {quiz_id}")

                                        selected_index = client_event.get("selectedIndex")
                                        selected_option = client_event.get("selectedOption")
                                        correct_index = client_event.get("correctIndex")
                                        correct_option = client_event.get("correctOption")
                                        is_correct = bool(client_event.get("isCorrect"))
                                        scene_reference = visible_panels[-1]["narration"] if visible_panels else "none"

                                        quiz_result_prompt = (
                                            f"SYSTEM UPDATE FOR STORYBUILDER: Quiz {quiz_id} is complete. "
                                            f"The visible scene right before the quiz was: {scene_reference} "
                                            f"Quiz question: {pending_quiz['question']} "
                                            f"Child selected option {selected_index}: {selected_option}. "
                                            f"Correct answer was option {correct_index}: {correct_option}. "
                                            f"The child was {'correct' if is_correct else 'incorrect'}. "
                                            f"Explanation to ground your reaction: {pending_quiz['explanation']} "
                                            "Now react briefly to the child's actual answer, connect it back to the visible scene and lesson, "
                                            "and only then continue the story."
                                        )
                                        await gemini_session.send_client_content(
                                            turns=types.Content(
                                                parts=[types.Part.from_text(text=quiz_result_prompt)],
                                                role="user",
                                            ),
                                            turn_complete=True,
                                        )

                            elif event_type == "quiz_presented_ack":
                                quiz_id = client_event.get("quizId")
                                if isinstance(quiz_id, str):
                                    pending_quiz = pending_quiz_contexts.get(quiz_id)
                                    if pending_quiz is not None:
                                        pending_quiz["presented"] = True
                                        print(f"[{session_id}] [Builder] Quiz presented ack: {quiz_id}")

                except WebSocketDisconnect:
                    print(f"[{session_id}] [Builder] Client disconnected")
                except Exception as exc:
                    print(f"[{session_id}] [Builder] Client receive error: {exc}")
                finally:
                    client_disconnected.set()

            async def receive_from_gemini():
                nonlocal last_panel_image_b64

                try:
                    opening_recovery_attempts = 0
                    while not client_disconnected.is_set():
                        turn_had_tool_call = False
                        turn_had_audio = False
                        turn_had_text = False

                        async for response in gemini_session.receive():
                            if client_disconnected.is_set():
                                break

                            server_content = response.server_content
                            if server_content:
                                model_turn = server_content.model_turn
                                if model_turn:
                                    for part in model_turn.parts:
                                        if part.text:
                                            turn_had_text = True
                                            preview = part.text[:80]
                                            print(f"[{session_id}] [Builder] Gemini: {preview}...")
                                            await safe_send({
                                                "serverContent": {
                                                    "modelTurn": {
                                                        "parts": [{"text": part.text}]
                                                    }
                                                }
                                            })

                                        if part.inline_data:
                                            turn_had_audio = True
                                            print(f"[{session_id}] [Builder] Sending audio response ({len(part.inline_data.data)} bytes)")
                                            b64_audio = base64.b64encode(part.inline_data.data).decode("utf-8")
                                            await safe_send({
                                                "serverContent": {
                                                    "modelTurn": {
                                                        "parts": [{
                                                            "inlineData": {
                                                                "mimeType": part.inline_data.mime_type,
                                                                "data": b64_audio
                                                            }
                                                        }]
                                                    }
                                                }
                                            })

                                if server_content.turn_complete:
                                    print(f"[{session_id}] [Builder] Turn complete")
                                    await safe_send({
                                        "serverContent": {"turnComplete": True}
                                    })

                                if server_content.interrupted:
                                    await safe_send({
                                        "serverContent": {"interrupted": True}
                                    })

                            if response.tool_call:
                                turn_had_tool_call = True
                                for function_call in response.tool_call.function_calls:
                                    name = function_call.name
                                    args = (
                                        function_call.args
                                        if isinstance(function_call.args, dict)
                                        else (
                                            function_call.args.to_dict()
                                            if hasattr(function_call.args, "to_dict")
                                            else dict(function_call.args)
                                        )
                                    )
                                    print(f"[{session_id}] [Builder] Tool call: {name}")

                                    if name == "add_comic_panel":
                                        if pending_scene_contexts:
                                            wait_step = (
                                                "A new scene is already rendering and is not visible yet. "
                                                "Do not create another scene. Keep the child engaged with the current visible scene only "
                                                "and wait for the later system update."
                                            )
                                            await gemini_session.send_tool_response(
                                                function_responses=[
                                                    types.FunctionResponse(
                                                        name=name,
                                                        id=function_call.id,
                                                        response={
                                                            "result": wait_step,
                                                            "runtimeContext": build_runtime_context(
                                                                next_step=wait_step,
                                                            ),
                                                        }
                                                    )
                                                ]
                                            )
                                            continue

                                        panel_id = args.get("panel_id", "panel_unknown")
                                        narration = args.get("narration", "")
                                        speech_bubble = args.get("speech_bubble")
                                        visual_description = args.get("visual_description", "")
                                        learning_objective = args.get("learning_objective") or None
                                        panel_index = len(visible_panels)

                                        panel_context = {
                                            "panelId": panel_id,
                                            "panelIndex": panel_index,
                                            "narration": narration,
                                            "learningObjective": learning_objective,
                                            "visualDescription": visual_description,
                                            "speechBubble": speech_bubble,
                                        }

                                        pending_scene_contexts[panel_id] = {
                                            "panel_id": panel_id,
                                            "panel_index": panel_index,
                                            "narration": narration,
                                            "speech_bubble": speech_bubble,
                                            "learning_objective": learning_objective,
                                            "visual_description": visual_description,
                                            "image_url": None,
                                            "image_status": "loading",
                                        }

                                        await safe_send({
                                            "backendEvent": {
                                                "type": "scene_stage_started",
                                                "panelId": panel_id,
                                                "panelIndex": panel_index,
                                                "narration": narration,
                                                "speechBubble": speech_bubble,
                                                "learningObjective": learning_objective,
                                                "isFirstScene": panel_index == 0,
                                            }
                                        })

                                        reference_image = last_panel_image_b64
                                        function_call_id = function_call.id

                                        if visible_panels:
                                            current_visible_panel = visible_panels[-1]
                                            bridge_step = (
                                                f"A new scene ({panel_id}) is rendering in the background. "
                                                f"The child still sees panel {current_visible_panel['panel_id']}: {current_visible_panel['narration']} "
                                                "Keep the child engaged with the CURRENT visible scene only. "
                                                "Acknowledge their last idea if relevant, or share one short interesting fact grounded in this current scene, "
                                                "and you may ask one brief grounded follow-up question. "
                                                "Do not describe the unseen new scene. Do not call add_comic_panel again. Do not call ask_quiz yet. "
                                                "Wait for a later system update telling you the new scene is visible."
                                            )
                                        else:
                                            bridge_step = (
                                                f"The opening scene ({panel_id}) is rendering. "
                                                "Keep the child engaged with the hero, mission, and immediate stakes in 1-2 short spoken sentences. "
                                                "Do not describe unseen visuals. Do not call add_comic_panel again. Do not call ask_quiz yet. "
                                                "Wait for a later system update telling you the first scene is visible."
                                            )

                                        await gemini_session.send_tool_response(
                                            function_responses=[
                                                types.FunctionResponse(
                                                    name=name,
                                                    id=function_call_id,
                                                    response={
                                                        "result": bridge_step,
                                                        "runtimeContext": build_runtime_context(
                                                            next_step=bridge_step,
                                                            pending_panel=panel_context,
                                                        ),
                                                    }
                                                )
                                            ]
                                        )

                                        async def build_panel_in_background(
                                            *,
                                            pid: str = panel_id,
                                            pindex: int = panel_index,
                                            narration_text: str = narration,
                                            speech: str | None = speech_bubble,
                                            learning: str | None = learning_objective,
                                            visual_desc: str = visual_description,
                                            ref_image: str | None = reference_image,
                                        ):
                                            image_url: str | None = None
                                            image_status = "error"

                                            try:
                                                print(f"[{session_id}] [Builder] Generating image for {pid} (ref={'yes' if ref_image else 'no'})")
                                                image_url = await generate_image(
                                                    visual_desc,
                                                    reference_image_b64=ref_image,
                                                )
                                                image_status = "ready" if image_url else "error"
                                            except Exception as image_error:
                                                print(f"[{session_id}] [Builder] Image gen error for {pid}: {image_error}")

                                            pending_scene = pending_scene_contexts.get(pid)
                                            if pending_scene is not None:
                                                pending_scene["image_url"] = image_url
                                                pending_scene["image_status"] = image_status

                                            await safe_send({
                                                "backendEvent": {
                                                    "type": "scene_ready",
                                                    "panelId": pid,
                                                    "panelIndex": pindex,
                                                    "narration": narration_text,
                                                    "speechBubble": speech,
                                                    "learningObjective": learning,
                                                    "imageUrl": image_url,
                                                    "imageStatus": image_status,
                                                }
                                            })

                                        task = asyncio.create_task(build_panel_in_background())
                                        pending_tasks.add(task)
                                        task.add_done_callback(pending_tasks.discard)

                                    elif name == "ask_quiz":
                                        question = args.get("question", "")
                                        options = args.get("options", [])
                                        correct_index = args.get("correct_index", 0)
                                        explanation = args.get("explanation", "")
                                        point_value = args.get("point_value", 100)
                                        quiz_id = f"quiz_{function_call.id}"

                                        parsed_options: list[str] = []
                                        for option in options:
                                            if isinstance(option, str):
                                                parsed_options.append(option)
                                            elif hasattr(option, "string_value"):
                                                parsed_options.append(option.string_value)
                                            else:
                                                parsed_options.append(str(option))

                                        quiz_context = {
                                            "quizId": quiz_id,
                                            "question": question,
                                            "correctIndex": correct_index,
                                            "pointValue": point_value,
                                        }
                                        pending_quiz_contexts[quiz_id] = {
                                            "question": question,
                                            "options": parsed_options,
                                            "correct_index": correct_index,
                                            "explanation": explanation,
                                            "point_value": point_value,
                                            "presented": False,
                                        }

                                        await safe_send({
                                            "backendEvent": {
                                                "type": "quiz_presented",
                                                "quizId": quiz_id,
                                                "question": question,
                                                "options": parsed_options,
                                                "correctIndex": correct_index,
                                                "explanation": explanation,
                                                "pointValue": point_value
                                            }
                                        })
                                        quiz_step = (
                                            "The quiz is now being staged for the child. "
                                            "Stop the story here. Do not narrate more story, do not call add_comic_panel, and do not call ask_quiz again. "
                                            "Wait for a later system update containing the child's actual answer before you react or continue."
                                        )
                                        await gemini_session.send_tool_response(
                                            function_responses=[
                                                types.FunctionResponse(
                                                    name=name,
                                                    id=function_call.id,
                                                    response={
                                                        "result": quiz_step,
                                                        "runtimeContext": build_runtime_context(
                                                            next_step=quiz_step,
                                                            quiz=quiz_context,
                                                        ),
                                                    }
                                                )
                                            ]
                                        )

                                    elif name == "story_complete":
                                        closing_narration = args.get("closing_narration", "")
                                        total_panels = args.get("total_panels", 0)

                                        await safe_send({
                                            "backendEvent": {
                                                "type": "story_complete",
                                                "closingNarration": closing_narration,
                                                "totalPanels": total_panels
                                            }
                                        })

                                        await gemini_session.send_tool_response(
                                            function_responses=[
                                                types.FunctionResponse(
                                                    name=name,
                                                    id=function_call.id,
                                                    response={
                                                        "result": "Story complete signal sent to the frontend.",
                                                        "runtimeContext": build_runtime_context(
                                                            next_step="Conclude warmly. The story is finished."
                                                        ),
                                                    }
                                                )
                                            ]
                                        )

                        if client_disconnected.is_set():
                            break

                        if visible_panels:
                            opening_recovery_attempts = 0
                            continue

                        if not turn_had_tool_call and opening_recovery_attempts < MAX_OPENING_RECOVERY_ATTEMPTS:
                            opening_recovery_attempts += 1
                            correction_text = (
                                "SYSTEM CORRECTION FOR STORYBUILDER: "
                                "Do not explain your plan or use headings. "
                                "Speak directly to the child in 1-2 short spoken sentences, "
                                "then immediately call add_comic_panel for panel_1. "
                                "No markdown. No meta commentary. Start now."
                            )
                            print(f"[{session_id}] [Builder] Recovering opening turn (attempt {opening_recovery_attempts})")
                            await gemini_session.send_client_content(
                                turns=types.Content(
                                    parts=[types.Part.from_text(text=correction_text)],
                                    role="user",
                                ),
                                turn_complete=True,
                            )
                            continue

                        if not turn_had_tool_call and not turn_had_audio and turn_had_text:
                            print(f"[{session_id}] [Builder] Gemini finished a text-only turn without creating a panel")

                except Exception as exc:
                    if not client_disconnected.is_set():
                        print(f"[{session_id}] [Builder] Gemini receive error: {exc}")
                        await close_client_connection(
                            code=1011,
                            reason="gemini_live_receive_error",
                        )

            await asyncio.gather(
                receive_from_client(),
                receive_from_gemini()
            )

            for task in pending_tasks:
                task.cancel()
            if pending_tasks:
                await asyncio.gather(*pending_tasks, return_exceptions=True)
                print(f"[{session_id}] [Builder] Cancelled {len(pending_tasks)} pending tasks")

            print(f"[{session_id}] [Builder] Session ended cleanly")

    except Exception as exc:
        print(f"[{session_id}] [Builder] Session failed: {exc}")
        try:
            await client_ws.close(code=1011, reason=str(exc))
        except Exception:
            pass
