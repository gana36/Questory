import os
import base64
from typing import Optional
from google import genai
from google.genai import types

async def generate_image(prompt: str, is_character: bool = False) -> Optional[str]:
    """
    Calls the Gemini 3.1 Flash Image API to generate an image.
    Returns a base64 data URI string if successful, else None.
    """
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("Warning: API key not set for image generation.")
        return None

    # Default to 16:9 for backgrounds, 1:1 for heroes
    aspect_ratio = "1:1" if is_character else "16:9"
    
    # Prepend style instructions
    if not is_character:
        full_prompt = f"A beautiful, immersive, slightly dreamy, kid-friendly 3D video game background scene: {prompt}"
    else:
        full_prompt = f"A lively character portrait: {prompt}. Clean background, vibrant colors."

    try:
        client = genai.Client(api_key=api_key)
        
        # Use generate_content instead of generate_images for the 3.1-flash-image-preview model
        response = await client.aio.models.generate_content(
            model='gemini-3.1-flash-image-preview',
            contents=[full_prompt],
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"]
            )
        )
        
        candidates = response.candidates
        if candidates and candidates[0].content:
            parts = candidates[0].content.parts
            for part in parts:
                if part.inline_data:
                    image_b64 = base64.b64encode(part.inline_data.data).decode("utf-8")
                    return f"data:{part.inline_data.mime_type};base64,{image_b64}"
            
        print("Warning: Gemini returned no image inline_data.")
    except Exception as e:
        print(f"Error generating image with Gemini: {e}")
        print("Falling back to placeholder images because the image model failed.")

    # Fallback if Gemini fails
    import urllib.parse
    if is_character:
        # Generate a cool dynamic avatar using DiceBear based on the prompt
        safe_prompt = urllib.parse.quote(prompt[:50])
        return f"https://api.dicebear.com/7.x/bottts/svg?seed={safe_prompt}&backgroundColor=1e293b"
    else:
        # Fallback background
        return "/dreamy_forest_scene.png"
