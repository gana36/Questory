from fastapi import APIRouter, HTTPException, WebSocket

from src.services.comic_builder import proxy_comic_builder_session
from src.services.story_session_store import load_story_session

router = APIRouter()


@router.websocket("/build/{session_id}")
async def comic_builder_websocket(websocket: WebSocket, session_id: str):
    print(f"[{session_id}] Incoming Comic Builder WebSocket connection")
    await proxy_comic_builder_session(websocket, session_id)


@router.get("/story-session/{session_id}")
async def get_story_session(session_id: str):
    story_session = load_story_session(session_id)
    if not story_session:
        raise HTTPException(status_code=404, detail="Story session not found")
    return story_session
