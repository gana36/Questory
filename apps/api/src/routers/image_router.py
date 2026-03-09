from fastapi import APIRouter
from pydantic import BaseModel
from src.services.nano_banana import generate_dreamy_background

router = APIRouter()


class ImagePromptRequest(BaseModel):
    prompt: str


@router.post("/generate-image")
async def generate_image(request: ImagePromptRequest):
    """
    REST endpoint to test Nano Banana image generation.
    Accepts a text prompt and returns a base64 data URL of the generated image.
    """
    result = await generate_dreamy_background(request.prompt)
    return {"image_url": result}
