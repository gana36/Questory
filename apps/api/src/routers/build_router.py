from fastapi import APIRouter, HTTPException, WebSocket, Request
from pydantic import BaseModel
from fastapi.responses import Response

from src.services.comic_builder import proxy_comic_builder_session
from src.services.story_session_store import load_story_session

router = APIRouter()

class TTSRequest(BaseModel):
    text: str

@router.post("/tts")
async def generate_tts(req: TTSRequest):
    import os
    from google import genai
    from google.genai import types
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model='gemini-2.5-flash-native-audio-preview-12-2025',
        contents='Read the following text out loud: ' + req.text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name="Aoede"
                    )
                )
            )
        )
    )
    audio_data = None
    for part in response.candidates[0].content.parts:
        if part.inline_data:
            audio_data = part.inline_data.data
            break
            
    if not audio_data:
        raise HTTPException(status_code=500, detail="No audio returned")
    
    return Response(content=audio_data, media_type="audio/wav")

def normalize_story_session(s: dict):
    """Ensure consistent keys and non-empty hero/topic."""
    import random
    
    # 1. Normalize Hero Name
    # Support both backend key (selectedHero) and frontend key (heroName)
    if "selectedHero" in s and not s.get("heroName"):
        s["heroName"] = s.pop("selectedHero")
        
    if not s.get("heroName") or s.get("heroName").lower() == "unknown":
        random_heroes = [
            "Captain Spark", "Star Explorer", "Magic Mira", "Forest Warden", 
            "Sky Runner", "Luna Moon", "Finley Fox", "Iron Bolt", 
            "Dream Weaver", "Aqua Scout", "Rex the Brave", "Piper Puff"
        ]
        s["heroName"] = random.choice(random_heroes)

    # 2. Normalize Topic/Title
    if not s.get("topic"):
        context = s.get("storyConcept") or "Unfinished Adventure"
        hero = s.get("heroName")
        s["topic"] = f"{hero}'s {context}"

    # 3. Normalize Panel Keys
    if s.get("panels"):
        for p in s["panels"]:
            if "image_url" in p and "imageUrl" not in p:
                p["imageUrl"] = p.pop("image_url")
            if "panel_id" in p and "panelId" not in p:
                p["panelId"] = p.pop("panel_id")
            if "speech_bubble" in p and "speechBubble" not in p:
                p["speechBubble"] = p.pop("speech_bubble")
            if "learning_objective" in p and "learningObjective" not in p:
                p["learningObjective"] = p.pop("learning_objective")
    
    return s

@router.websocket("/build/{session_id}")
async def comic_builder_websocket(websocket: WebSocket, session_id: str):
    print(f"[{session_id}] Incoming Comic Builder WebSocket connection")
    await proxy_comic_builder_session(websocket, session_id)


@router.get("/story-session/{session_id}")
async def get_story_session(session_id: str):
    from pathlib import Path
    import json
    
    # Try permanent first
    data_dir = Path(__file__).parent.parent.parent / "data" / session_id
    json_path = data_dir / "story.json"
    
    story_session = None
    if json_path.exists():
        try:
             story_session = json.loads(json_path.read_text("utf-8"))
        except Exception:
             pass

    # Fallback to temporary
    if not story_session:
        story_session = load_story_session(session_id)
        
    if not story_session:
        raise HTTPException(status_code=404, detail="Story session not found")
        
    return normalize_story_session(story_session)

@router.post("/library/force-complete/{session_id}")
async def force_complete_library_story(session_id: str, request: Request):
    from src.services.story_session_store import load_story_session, save_story_session, save_story_to_library
    
    # 1. Ensure it exists
    curr = load_story_session(session_id)
    if not curr:
        raise HTTPException(status_code=404, detail="Session not found")
        
    # Get frontend panels if provided
    try:
        req_data = await request.json()
        frontend_panels = req_data.get("panels", [])
    except Exception:
        frontend_panels = []

    # 2. Force close the status right now
    save_updates = {
        "status": "completed", 
        "closingNarration": "The hero abruptly concluded their adventure!"
    }
    if frontend_panels:
        save_updates["panels"] = frontend_panels
        
    save_story_session(session_id, save_updates)
    
    # 3. Explicitly extract and save the files 
    try:
        saved_session = save_story_to_library(session_id)
        return {"status": "success", "story": saved_session}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/library/save/{session_id}")
async def save_library_story(session_id: str):
    from src.services.story_session_store import save_story_to_library
    try:
        saved_session = save_story_to_library(session_id)
        return {"status": "success", "story": saved_session}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/library")
async def get_library():
    import json
    from pathlib import Path

    stories_dict = {}

    # Read ALL physically saved stories in the /data dir
    data_dir = Path(__file__).parent.parent.parent / "data"
    if data_dir.exists():
        for story_folder in data_dir.iterdir():
            if story_folder.is_dir():
                json_path = story_folder / "story.json"
                if json_path.exists():
                    try:
                        saved_story = json.loads(json_path.read_text("utf-8"))
                        stories_dict[saved_story.get("id")] = saved_story
                    except Exception as e:
                        print(f"Failed to load saved story {story_folder.name}: {e}")

    stories_with_panels = [normalize_story_session(s) for s in stories_dict.values()]
            
    return {"stories": stories_with_panels}
