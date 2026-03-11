import json
import os
import tempfile
from pathlib import Path
from threading import Lock
from typing import Any


STORE_PATH = Path(
    os.environ.get(
        "QUESTORY_BACKEND_SESSION_STORE",
        str(Path(tempfile.gettempdir()) / "questory_backend_story_sessions.json"),
    )
)

_STORE_LOCK = Lock()


def _read_store() -> dict[str, Any]:
    if not STORE_PATH.exists():
        return {}

    try:
        return json.loads(STORE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_store(payload: dict[str, Any]) -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temp_path = STORE_PATH.with_suffix(".tmp")
    temp_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
    temp_path.replace(STORE_PATH)


def load_story_session(session_id: str) -> dict[str, Any] | None:
    with _STORE_LOCK:
        store = _read_store()
        value = store.get(session_id)
        return value if isinstance(value, dict) else None


def save_story_session(session_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    with _STORE_LOCK:
        store = _read_store()
        current = store.get(session_id)
        if not isinstance(current, dict):
            current = {}

        merged = dict(current)
        for key, value in updates.items():
            if value is None:
                continue
            merged[key] = value

        store[session_id] = merged
        _write_store(store)
        return merged
