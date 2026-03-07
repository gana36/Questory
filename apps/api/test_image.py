import asyncio
import os
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

async def main():
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    client = genai.Client(api_key=api_key)
    print("Testing imagen-3.0-generate-001...")
    try:
        result = await client.aio.models.generate_images(
            model='imagen-3.0-generate-001',
            prompt='A cute brave space dog',
            config=types.GenerateImagesConfig(
                number_of_images=1,
                output_mime_type="image/jpeg",
                aspect_ratio="1:1"
            )
        )
        print("Success!")
    except Exception as e:
        print("Failed:", e)

asyncio.run(main())
