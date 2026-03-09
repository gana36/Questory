import json
import base64
import asyncio
import os
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
- Call `add_comic_panel` after EVERY narration beat (story AND teaching panels).
- For teaching panels: set `learning_objective` to a short phrase like "How tectonic plates create volcanoes".
- For story/action panels: omit `learning_objective` or leave it empty.
- Call `ask_quiz` only after teaching panels — never cold.
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


async def proxy_comic_builder_session(client_ws: WebSocket, session_id: str):
    """
    Proxies a WebSocket connection for the Comic Book Story Builder mode.
    Gemini co-creates a comic book story with the child, adding panels and quizzes.
    """
    await client_ws.accept()

    client_disconnected = asyncio.Event()

    async def safe_send(payload: dict):
        """Send JSON to the client WebSocket, but only if still connected."""
        if client_disconnected.is_set():
            return
        try:
            await client_ws.send_text(json.dumps(payload))
        except Exception:
            client_disconnected.set()

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
                                text_parts = [p["text"] for p in turn["parts"] if "text" in p]
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

                except WebSocketDisconnect:
                    print(f"[{session_id}] [Builder] Client disconnected")
                except Exception as e:
                    print(f"[{session_id}] [Builder] Client receive error: {e}")
                finally:
                    client_disconnected.set()

            async def receive_from_gemini():
                try:
                    while not client_disconnected.is_set():
                        async for response in gemini_session.receive():
                            if client_disconnected.is_set():
                                break

                            server_content = response.server_content
                            if server_content:
                                model_turn = server_content.model_turn
                                if model_turn:
                                    for part in model_turn.parts:
                                        if part.text:
                                            print(f"[{session_id}] [Builder] Gemini: {part.text[:80]}...")
                                            await safe_send({
                                                "serverContent": {
                                                    "modelTurn": {
                                                        "parts": [{"text": part.text}]
                                                    }
                                                }
                                            })

                                        if part.inline_data:
                                            b64_audio = base64.b64encode(part.inline_data.data).decode('utf-8')
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
                                for function_call in response.tool_call.function_calls:
                                    name = function_call.name
                                    args = (
                                        function_call.args
                                        if isinstance(function_call.args, dict)
                                        else (
                                            function_call.args.to_dict()
                                            if hasattr(function_call.args, 'to_dict')
                                            else dict(function_call.args)
                                        )
                                    )
                                    print(f"[{session_id}] [Builder] Tool call: {name}")

                                    if name == "add_comic_panel":
                                        panel_id = args.get("panel_id", "panel_unknown")
                                        narration = args.get("narration", "")
                                        speech_bubble = args.get("speech_bubble")
                                        visual_description = args.get("visual_description", "")
                                        learning_objective = args.get("learning_objective") or None

                                        # 1. Immediately send panel structure (loading state)
                                        await safe_send({
                                            "backendEvent": {
                                                "type": "panel_added",
                                                "panelId": panel_id,
                                                "narration": narration,
                                                "speechBubble": speech_bubble,
                                                "learningObjective": learning_objective,
                                                "imageStatus": "loading"
                                            }
                                        })

                                        # 2. Fire image generation asynchronously
                                        async def generate_panel_image(pid=panel_id, vdesc=visual_description):
                                            try:
                                                print(f"[{session_id}] [Builder] Generating image for {pid}")
                                                url = await generate_image(vdesc)
                                                status = "ready" if url else "error"
                                                await safe_send({
                                                    "backendEvent": {
                                                        "type": "panel_image_ready",
                                                        "panelId": pid,
                                                        "imageUrl": url,
                                                        "imageStatus": status
                                                    }
                                                })
                                            except Exception as e:
                                                print(f"[{session_id}] [Builder] Image gen error for {pid}: {e}")
                                                await safe_send({
                                                    "backendEvent": {
                                                        "type": "panel_image_ready",
                                                        "panelId": pid,
                                                        "imageUrl": None,
                                                        "imageStatus": "error"
                                                    }
                                                })

                                        asyncio.create_task(generate_panel_image())

                                        # 3. Immediately confirm to Gemini so it continues
                                        await gemini_session.send_tool_response(
                                            function_responses=[
                                                types.FunctionResponse(
                                                    name=name,
                                                    id=function_call.id,
                                                    response={"result": f"Panel {panel_id} added. Image is generating."}
                                                )
                                            ]
                                        )

                                    elif name == "ask_quiz":
                                        question = args.get("question", "")
                                        options = args.get("options", [])
                                        correct_index = args.get("correct_index", 0)
                                        explanation = args.get("explanation", "")
                                        point_value = args.get("point_value", 100)

                                        # Normalize options list
                                        parsed_options = []
                                        for opt in options:
                                            if isinstance(opt, str):
                                                parsed_options.append(opt)
                                            elif hasattr(opt, 'string_value'):
                                                parsed_options.append(opt.string_value)
                                            else:
                                                parsed_options.append(str(opt))

                                        await safe_send({
                                            "backendEvent": {
                                                "type": "quiz_started",
                                                "question": question,
                                                "options": parsed_options,
                                                "correctIndex": correct_index,
                                                "explanation": explanation,
                                                "pointValue": point_value
                                            }
                                        })

                                        # Respond immediately so Gemini doesn't hang
                                        await gemini_session.send_tool_response(
                                            function_responses=[
                                                types.FunctionResponse(
                                                    name=name,
                                                    id=function_call.id,
                                                    response={"result": "Quiz displayed. Waiting for the child's answer."}
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
                                                    response={"result": "Story complete signal sent to the frontend."}
                                                )
                                            ]
                                        )

                except Exception as e:
                    if not client_disconnected.is_set():
                        print(f"[{session_id}] [Builder] Gemini receive error: {e}")
                        client_disconnected.set()

            await asyncio.gather(
                receive_from_client(),
                receive_from_gemini()
            )

            print(f"[{session_id}] [Builder] Session ended cleanly")

    except Exception as e:
        print(f"[{session_id}] [Builder] Session failed: {e}")
        try:
            await client_ws.close(code=1011, reason=str(e))
        except Exception:
            pass
