import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
client = genai.Client(api_key=api_key)
print("Listing all models...")
try:
    for m in client.models.list():
        if 'image' in m.name.lower() or 'imagen' in m.name.lower() or '3.1' in m.name.lower() or '3.0' in m.name.lower():
            methods = getattr(m, 'supported_generation_methods', [])
            print(f"Model: {m.name}, Methods: {methods}")
except Exception as e:
    print("Error:", e)
