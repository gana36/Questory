import asyncio
import os
from google import genai

async def main():
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    client = genai.Client(api_key=api_key, http_options={'api_version': 'v1alpha'})
    print("Testing aio.models.generate_images...")
    try:
        result = await client.aio.models.generate_images(
            model='gemini-3.1-flash-image-preview',
            prompt='A cute brave space dog',
            config=dict(
                number_of_images=1,
                output_mime_type="image/jpeg",
                aspect_ratio="1:1"
            )
        )
        for img in result.generated_images:
            print(f"Generated image size: {len(img.image.image_bytes)} bytes")
    except Exception as e:
        print("Async failed v1alpha:", e)
        
    client2 = genai.Client(api_key=api_key)
    try:
        result = await client2.aio.models.generate_images(
            model='imagen-3.0-generate-001',
            prompt='A cute brave space dog',
            config=dict(
                number_of_images=1,
                output_mime_type="image/jpeg",
                aspect_ratio="1:1"
            )
        )
        for img in result.generated_images:
            print(f"Generated image size imagen3: {len(img.image.image_bytes)} bytes")
    except Exception as e:
        print("Async failed imagen3:", e)

asyncio.run(main())
