from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field
from datetime import datetime

class Choice(BaseModel):
    id: str
    text: str
    next_scene_id: str
    correctness: Optional[bool] = None
    feedback: str

class Hotspot(BaseModel):
    id: str
    label: str
    x: float
    y: float
    w: float
    h: float
    dialogue: str
    expand_text: str
    sound_cue: Optional[str] = None

class Quiz(BaseModel):
    question: str
    options: List[str]
    correct_index: int
    explanation: str

class Scene(BaseModel):
    id: str
    narration: str
    image_prompt: Optional[str] = None
    choices: List[Choice]
    hotspots: List[Hotspot]
    quiz: Optional[Quiz] = None

class SessionState(BaseModel):
    current_scene_index: int
    score: int
    decisions: List[str]

class Session(BaseModel):
    id: str
    created_at: datetime
    topic: str
    settings: Optional[Dict[str, Any]] = Field(default_factory=dict)
    scenes: List[Scene]
    state: SessionState
