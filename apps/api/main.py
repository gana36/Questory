from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

from src.routers import live_router

app = FastAPI(title="Questory Backend")

# We must allow all origins since the frontend is likely running on a different port (e.g. 5173 or 3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(live_router.router, prefix="/api")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "questory-api"}
