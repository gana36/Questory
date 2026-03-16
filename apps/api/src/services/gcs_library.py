import json
import base64
import os
from google.cloud import storage

BUCKET_NAME = os.environ.get("GCS_BUCKET_NAME", "questtory-stories")


def _get_bucket():
    return storage.Client().bucket(BUCKET_NAME)


def save_story_to_gcs(session_id: str, session: dict) -> dict:
    """
    Uploads panel images and story.json to GCS.
    Replaces base64 data URIs with public GCS URLs in-place.
    Returns the updated session dict.
    """
    bucket = _get_bucket()
    panels = session.get("panels", [])

    for idx, panel in enumerate(panels):
        image_url = panel.get("imageUrl") or panel.get("image_url")

        # Normalize snake_case keys from backend to camelCase for frontend
        for old, new in [("image_url", "imageUrl"), ("panel_id", "panelId"),
                         ("speech_bubble", "speechBubble"), ("learning_objective", "learningObjective")]:
            if old in panel and new not in panel:
                panel[new] = panel.pop(old)

        if image_url and image_url.startswith("data:image/"):
            try:
                header, b64_data = image_url.split(",", 1)
                ext = ".jpg" if ("jpeg" in header or "jpg" in header) else ".png"
                content_type = "image/jpeg" if ext == ".jpg" else "image/png"

                blob = bucket.blob(f"stories/{session_id}/panel_{idx}{ext}")
                blob.upload_from_string(base64.b64decode(b64_data), content_type=content_type)
                panel["imageUrl"] = f"https://storage.googleapis.com/{BUCKET_NAME}/stories/{session_id}/panel_{idx}{ext}"
            except Exception as e:
                print(f"[GCS] Error uploading panel {idx} for session {session_id}: {e}")

    session["is_permanently_saved"] = True
    session["id"] = session_id

    story_blob = bucket.blob(f"stories/{session_id}/story.json")
    story_blob.upload_from_string(
        json.dumps(session, indent=2, ensure_ascii=False),
        content_type="application/json",
    )

    return session


def list_stories_from_gcs() -> list[dict]:
    """Return all saved stories by loading each story.json from GCS."""
    client = storage.Client()
    bucket = client.bucket(BUCKET_NAME)
    stories = []

    # Pages expose the virtual folder prefixes when delimiter="/"
    iterator = client.list_blobs(BUCKET_NAME, prefix="stories/", delimiter="/")
    for page in iterator.pages:
        for prefix in page.prefixes:  # type: ignore[attr-defined]
            session_id = prefix.rstrip("/").split("/")[-1]
            story = _load_story_blob(bucket, session_id)
            if story:
                stories.append(story)

    return stories


def load_story_from_gcs(session_id: str) -> dict | None:
    """Load a single story.json from GCS, or None if not found."""
    return _load_story_blob(_get_bucket(), session_id)


def _load_story_blob(bucket, session_id: str) -> dict | None:
    blob = bucket.blob(f"stories/{session_id}/story.json")
    try:
        data = json.loads(blob.download_as_text())
        data["id"] = session_id
        return data
    except Exception:
        return None
