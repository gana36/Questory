from fastapi import APIRouter, WebSocket

from src.services.comic_builder import proxy_comic_builder_session

router = APIRouter()


@router.websocket("/build/{session_id}")
async def comic_builder_websocket(websocket: WebSocket, session_id: str):
    print(f"[{session_id}] Incoming Comic Builder WebSocket connection")
    await proxy_comic_builder_session(websocket, session_id)
