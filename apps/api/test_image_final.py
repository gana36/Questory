import asyncio
import os
from google import genai
from google.genai import types
from src.services.image_gen import generate_image

async def main():
    print("Testing generate_image using generate_content structure...")
    try:
        url = await generate_image('A cute brave space dog', is_character=True)
        if url and url.startswith("data:"):
            print("Success! Got base64 data URL.")
            print(f"Length: {len(url)}")
        else:
            print("Result:", url)
    except Exception as e:
        print("Failed:", e)

asyncio.run(main())
