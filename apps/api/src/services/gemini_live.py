import json
import base64
import asyncio
import os
from fastapi import WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

from src.services.image_gen import generate_image

# Common Configuration for the Story Gemini
SCENE_SYSTEM_INSTRUCTION = """
You are Dora, the enthusiastic guide and Game Master for an interactive learning story app called Questory.
You are currently helping the user set up their new adventure. 

Follow this flow strictly:
1. The user will tell you what topic they want to learn about or what kind of story they want (e.g., "Dinosaurs", "Space Pirates", "Ancient Egypt").
2. Acknowledge their choice enthusiastically in 1-2 short sentences.
3. Immediately generate a 1-sentence "Story Concept" based on their topic.
4. Immediately generate 3 distinct "Hero Options" for them to play as in this story.
5. YOU MUST CALL the `propose_heroes` tool with the concept and the 3 hero options.
6. Then, ask the user which hero they want to be, or if they want to create their own custom hero.
7. If they ask for a custom hero, YOU MUST CALL the `generate_custom_hero` tool, then excitedly confirm their choice.
8. Once a hero is chosen, ask them if they are ready to start the adventure.

Keep all spoken responses under 3 sentences. Be energetic and magical!
"""

TOOLS = [
    {
        "function_declarations": [
            {
                "name": "generate_scene_image",
                "description": "Call this when the user moves to a new location to generate the visual background.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "visual_description": {
                            "type": "STRING", 
                            "description": "A detailed visual description of the new dreamy, prehistoric forest setting for the image generator (e.g. 'A sunlit clearing with a sparkling waterfall and a gentle brontosaurus drinking')."
                        }
                    },
                    "required": ["visual_description"]
                }
            },
            {
                "name": "propose_heroes",
                "description": "Call this to propose 3 distinct hero options based on the user's topic.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "concept": {
                            "type": "STRING",
                            "description": "A 1-sentence summary of the story concept."
                        },
                        "heroes": {
                            "type": "ARRAY",
                            "description": "Exactly 3 hero options.",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "id": {"type": "STRING", "description": "Unique ID for the hero (e.g., 'hero_1')"},
                                    "name": {"type": "STRING", "description": "The hero's name/class (e.g., 'Captain Rex')"},
                                    "description": {"type": "STRING", "description": "1 sentence describing their abilities or personality."},
                                    "visual_description": {"type": "STRING", "description": "A detailed visual prompt for generating their image (e.g., 'A brave space pirate puppy wearing goggles and a red cape')."}
                                },
                                "required": ["id", "name", "description", "visual_description"]
                            }
                        }
                    },
                    "required": ["concept", "heroes"]
                }
            },
            {
                "name": "generate_custom_hero",
                "description": "Call this if the user asks for a completely custom hero instead of the 3 proposed options.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "id": {"type": "STRING", "description": "Unique ID for the custom hero (e.g., 'custom_hero')"},
                        "name": {"type": "STRING", "description": "The custom hero's name"},
                        "visual_description": {"type": "STRING", "description": "Detailed visual description for the image generator."}
                    },
                    "required": ["id", "name", "visual_description"]
                }
            }
        ]
    }
]

# --- Live API Config ---
# The model must support bidiGenerateContent. Use a native audio model.
MODEL_ID = "gemini-2.5-flash-native-audio-preview-12-2025"


async def proxy_gemini_live_session(client_ws: WebSocket, session_id: str):
    """
    Proxies a WebSocket connection from the frontend to the Gemini Live API.
    Intercepts specific tool calls (like image generation) to execute backend logic.
    """
    await client_ws.accept()
    
    # Shared flag to signal when the client has disconnected,
    # preventing the Gemini receiver from writing to a closed WebSocket.
    client_disconnected = asyncio.Event()
    pending_tasks: set[asyncio.Task] = set()

    async def safe_send(payload: dict):
        """Send JSON to the client WebSocket, but only if still connected."""
        if client_disconnected.is_set():
            return
        try:
            await client_ws.send_text(json.dumps(payload))
        except Exception:
            client_disconnected.set()

    try:
        # Initialize the google-genai client
        # It automatically picks up GOOGLE_API_KEY / GEMINI_API_KEY from the environment,
        # but we pass it explicitly here for robustness.
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        client = genai.Client(api_key=api_key)
        
        # Build config using dict format (recommended by the latest SDK docs)
        config = {
            "response_modalities": ["AUDIO"],
            "system_instruction": SCENE_SYSTEM_INSTRUCTION,
            "tools": TOOLS,
            "speech_config": {
                "voice_config": {
                    "prebuilt_voice_config": {
                        # Available voices: "Aoede", "Puck", "Charon", "Kore", "Fenrir", "Briton"
                        "voice_name": "Aoede"
                    }
                }
            }
        }

        # Connect to Gemini Live API
        async with client.aio.live.connect(model=MODEL_ID, config=config) as gemini_session:
            print(f"[{session_id}] Connected to Gemini Live ({MODEL_ID})")

            # Task 1: Read from Frontend WebSocket -> Send to Gemini
            async def receive_from_client():
                audio_chunk_count = 0
                try:
                    while True:
                        message = await client_ws.receive_text()
                        data = json.loads(message)
                        
                        # The frontend sends "realtimeInput" for audio chunks
                        # and "clientContent" for text interrupts
                        
                        if "realtimeInput" in data:
                            # Forward audio chunks using the new SDK method
                            for chunk in data["realtimeInput"]["mediaChunks"]:
                                mime_type = chunk["mimeType"]
                                b64_data = chunk["data"]
                                binary_data = base64.b64decode(b64_data)
                                
                                # New SDK: send_realtime_input with audio kwarg
                                await gemini_session.send_realtime_input(
                                    audio=types.Blob(
                                        mime_type=mime_type,
                                        data=binary_data
                                    )
                                )
                                audio_chunk_count += 1
                                if audio_chunk_count % 100 == 1:
                                    print(f"[{session_id}] 🎤 Audio streaming... ({audio_chunk_count} chunks sent)")
                                
                        elif "clientContent" in data:
                            # Forward text turns using the new SDK method
                            for turn in data["clientContent"]["turns"]:
                                text_parts = [p["text"] for p in turn["parts"] if "text" in p]
                                if text_parts:
                                    text = " ".join(text_parts)
                                    content = types.Content(
                                        parts=[types.Part.from_text(text=text)],
                                        role="user"
                                    )
                                    # New SDK: send_client_content with turns kwarg
                                    await gemini_session.send_client_content(
                                        turns=content,
                                        turn_complete=True
                                    )
                                    print(f"[{session_id}] 💬 Text received: {text}")
                                    
                        elif "toolResponse" in data:
                            # Forward frontend tool responses if any
                            # (Currently we handle tools in the backend, but just in case)
                            pass 

                except WebSocketDisconnect:
                    print(f"[{session_id}] Client disconnected")
                except Exception as e:
                    print(f"[{session_id}] Client receive error: {e}")
                finally:
                    # Signal the Gemini receiver to stop sending to this WebSocket
                    client_disconnected.set()

            # Task 2: Read from Gemini -> Send to Frontend
            async def receive_from_gemini():
                try:
                    # receive() is a per-turn generator that exits after turn_complete.
                    # Loop to keep receiving across multiple turns indefinitely.
                    while not client_disconnected.is_set():
                        async for response in gemini_session.receive():
                            if client_disconnected.is_set():
                                break

                            server_content = response.server_content
                            if server_content:
                                model_turn = server_content.model_turn
                                if model_turn:
                                    for part in model_turn.parts:
                                        # Forward Text
                                        if part.text:
                                            print(f"[{session_id}] 🗣️ Gemini says: {part.text[:80]}..." if len(part.text) > 80 else f"[{session_id}] 🗣️ Gemini says: {part.text}")
                                            await safe_send({
                                                "serverContent": {
                                                    "modelTurn": {
                                                        "parts": [{"text": part.text}]
                                                    }
                                                }
                                            })

                                        # Forward Audio
                                        if part.inline_data:
                                            print(f"[{session_id}] 🔊 Sending audio response ({len(part.inline_data.data)} bytes)")
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

                                # Forward Turn Complete
                                if server_content.turn_complete:
                                    print(f"[{session_id}] ✅ Turn complete")
                                    await safe_send({
                                        "serverContent": {"turnComplete": True}
                                    })

                                # Forward Interrupted signal
                                if server_content.interrupted:
                                    print(f"[{session_id}] ⚡ Interrupted by user")
                                    await safe_send({
                                        "serverContent": {"interrupted": True}
                                    })

                            # Handle Tool Calls explicitly in the backend
                            if response.tool_call:
                                for function_call in response.tool_call.function_calls:
                                    name = function_call.name
                                    args = function_call.args if isinstance(function_call.args, dict) else (function_call.args.to_dict() if hasattr(function_call.args, 'to_dict') else dict(function_call.args))
                                    print(f"[{session_id}] Gemini requested tool: {name} with parsed args: {args}")

                                    if name == "generate_scene_image":
                                        visual_description = args.get("visual_description", "")

                                        # 1. Tell the frontend we are generating
                                        await safe_send({
                                            "backendEvent": {
                                                "type": "image_generation_started"
                                            }
                                        })

                                        # 2. Generate with Image API
                                        new_image_url = await generate_image(visual_description)

                                        # 3. Tell the frontend to update the image
                                        if new_image_url:
                                            await safe_send({
                                                "backendEvent": {
                                                    "type": "scene_update",
                                                    "imageUrl": new_image_url
                                                }
                                            })

                                        # 4. Tell Gemini the tool is done using the new SDK method
                                        await gemini_session.send_tool_response(
                                            function_responses=[
                                                types.FunctionResponse(
                                                    name=name,
                                                    id=function_call.id,
                                                    response={"result": "Image generated successfully. The user can see it now."}
                                                )
                                            ]
                                        )

                                    elif name == "propose_heroes":
                                        concept = args.get("concept", "")
                                        heroes = args.get("heroes", [])
                                        # Convert heroes to a list of dicts safely in case they are Protobuf Structs
                                        parsed_heroes = []
                                        for h in heroes:
                                            if hasattr(h, 'to_dict'):
                                                parsed_heroes.append(h.to_dict())
                                            elif isinstance(h, dict):
                                                parsed_heroes.append(h)
                                            else:
                                                parsed_heroes.append(dict(h)) # Attempt coercion

                                        # 1. Immediately send the text concepts to the frontend
                                        await safe_send({
                                            "backendEvent": {
                                                "type": "heroes_proposed",
                                                "concept": concept,
                                                "heroes": [{"id": h.get("id", f"hero_{i}"), "name": h.get("name", "Unknown"), "description": h.get("description", "")} for i, h in enumerate(parsed_heroes)]
                                            }
                                        })

                                        # 2. Concurrently generate images for all 3 heroes
                                        async def generate_and_send(hero_data):
                                            try:
                                                print(f"[{session_id}] [Thread] Generating image for hero: {hero_data.get('name')}")
                                                visual_desc = hero_data.get('visual_description', '')
                                                url = await generate_image(visual_desc, is_character=True)
                                                if url:
                                                    print(f"[{session_id}] [Thread] Sending generated image for hero: {hero_data.get('name')}")
                                                    await safe_send({
                                                        "backendEvent": {
                                                            "type": "hero_image_generated",
                                                            "id": hero_data.get("id"),
                                                            "imageUrl": url
                                                        }
                                                    })
                                            except Exception as task_e:
                                                print(f"[{session_id}] [Thread] Error generating hero image: {task_e}")
                                        
                                        # Fire off the generation tasks without blocking the main loop
                                        for h in parsed_heroes:
                                            task = asyncio.create_task(generate_and_send(h))
                                            pending_tasks.add(task)
                                            task.add_done_callback(pending_tasks.discard)

                                        # 3. Tell Gemini we showed the options
                                        await gemini_session.send_tool_response(
                                            function_responses=[
                                                types.FunctionResponse(
                                                    name=name,
                                                    id=function_call.id,
                                                    response={"result": "Hero options displayed to user. Waiting for their choice."}
                                                )
                                            ]
                                        )
                                        
                                    elif name == "generate_custom_hero":
                                        custom_id = args.get("id", "custom_hero")
                                        hero_name = args.get("name", "Custom Hero")
                                        visual_desc = args.get("visual_description", "")
                                        
                                        await safe_send({
                                            "backendEvent": {
                                                "type": "custom_hero_generating",
                                                "id": custom_id,
                                                "name": hero_name
                                            }
                                        })
                                        
                                        url = await generate_image(visual_desc, is_character=True)
                                        
                                        if url:
                                            await safe_send({
                                                "backendEvent": {
                                                    "type": "hero_image_generated",
                                                    "id": custom_id,
                                                    "imageUrl": url
                                                }
                                            })
                                            
                                        await gemini_session.send_tool_response(
                                            function_responses=[
                                                types.FunctionResponse(
                                                    name=name,
                                                    id=function_call.id,
                                                    response={"result": "Custom hero image generated successfully."}
                                                )
                                            ]
                                        )

                except Exception as e:
                    if not client_disconnected.is_set():
                        print(f"[{session_id}] Gemini receive error: {e}")
                        client_disconnected.set()

            # Run both read loops concurrently
            await asyncio.gather(
                receive_from_client(),
                receive_from_gemini()
            )

            # Cancel any in-flight image generation tasks
            for task in pending_tasks:
                task.cancel()
            if pending_tasks:
                await asyncio.gather(*pending_tasks, return_exceptions=True)
                print(f"[{session_id}] Cancelled {len(pending_tasks)} pending tasks")

            print(f"[{session_id}] Session ended cleanly")

    except Exception as e:
        print(f"[{session_id}] Session failed: {e}")
        try:
            await client_ws.close(code=1011, reason=str(e))
        except:
            pass
