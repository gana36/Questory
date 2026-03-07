import asyncio
import os
from google import genai
from google.genai import types

async def main():
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    client = genai.Client(api_key=api_key, http_options={'api_version': 'v1alpha'})
    print("Testing aio.models.generate_images with v1alpha...")
    try:
        result = await client.aio.models.generate_images(
            model='gemini-3.1-flash-image-preview',
            prompt='A cute brave space dog',
            config=types.GenerateImagesConfig(
                number_of_images=1,
                output_mime_type="image/jpeg",
                aspect_ratio="1:1"
            )
        )
        for img in result.generated_images:
            print(f"Generated image size: len bytes")
    except Exception as e:
        print("Async failed v1alpha:", e)
        
    client2 = genai.Client(api_key=api_key)
    print("Testing aio.models.generate_images with v1beta (default)...")
    try:
        result = await client2.aio.models.generate_images(
            model='gemini-3.1-flash-image-preview',
            prompt='A cute brave space dog',
            config=types.GenerateImagesConfig(
                number_of_images=1,
                output_mime_type="image/jpeg",
                aspect_ratio="1:1"
            )
        )
        for img in result.generated_images:
            print(f"Generated image size v1beta: len bytes")
    except Exception as e:
        print("Async failed v1beta:", e)

asyncio.run(main())
