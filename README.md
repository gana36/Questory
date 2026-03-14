# Questory

An AI-powered interactive learning adventure. Children choose a topic, pick a hero, and experience a personalized comic book story generated in real time by a live AI voice guide. Educational facts are woven into the narrative and tested via embedded quizzes.

Built for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/?ref_feature=challenge&ref_medium=discover) — **Creative Storyteller** category.

---

## How It Works

1. The child tells Dora (the AI voice guide) what they want to learn — by speaking, typing, pasting a YouTube URL, or uploading a PDF.
2. Dora proposes three heroes based on the topic. Portrait images are generated for each in parallel.
3. The child picks a hero. While the selection happens, the opening comic panels are pre-generated silently in the background.
4. The story begins: Dora narrates panel by panel over real-time audio, AI-generated illustrations appear one by one, and quizzes test what each panel just taught.
5. The child's spoken answers shape what happens next. Completed stories are saved to a personal library.

---

## Architecture

```mermaid
graph TD
    Browser["Browser (React / Vite)"]

    Browser -- "WS /api/live/{id}" --> LiveRouter
    Browser -- "WS /api/build/{id}" --> BuildRouter

    subgraph FastAPI Backend
        LiveRouter[live_router.py]
        BuildRouter[build_router.py]
        ImageRouter[image_router.py]

        LiveRouter --> GeminiLive[gemini_live.py]
        BuildRouter --> ComicBuilder[comic_builder.py]
        ImageRouter --> ImageGen

        GeminiLive -- "propose_heroes" --> ImageGen[image_gen.py]
        GeminiLive -- "generate_custom_hero" --> ImageGen
        GeminiLive -- "generate_scene_image" --> ImageGen
        GeminiLive -- "start_comic_builder" --> Headstart[story_headstart.py]

        ComicBuilder -- "add_comic_panel" --> ImageGen
        ComicBuilder -- "present_prebuilt_panel" --> Headstart
    end

    GeminiLive <-- "audio stream" --> GeminiLiveAPI["Gemini Live API"]
    ComicBuilder <-- "audio stream" --> GeminiLiveAPI
    ImageGen --> ImageModel["gemini-3.1-flash-image-preview"]
    Headstart --> LiteModel["gemini-3.1-flash-lite-preview"]
```

### Session lifecycle

```mermaid
sequenceDiagram
    participant Child as Child (Browser)
    participant Live as gemini_live.py
    participant GeminiAPI as Gemini Live API
    participant ImageGen as image_gen.py
    participant Headstart as story_headstart.py
    participant Builder as comic_builder.py

    Child->>Live: speaks topic
    Live->>GeminiAPI: audio stream (bidirectional)
    GeminiAPI-->>Live: tool call: propose_heroes
    Live->>ImageGen: generate 3 hero portraits (parallel)
    ImageGen-->>Child: hero images streamed as they complete
    Child->>Live: picks a hero
    GeminiAPI-->>Live: tool call: start_comic_builder
    Live->>Headstart: pre-generate 6-10 opening panels (async)
    Live-->>Child: navigate to /build/{sessionId}

    Child->>Builder: connects via WS
    Builder->>GeminiAPI: audio stream (comic phase)
    loop Each panel
        GeminiAPI-->>Builder: tool call: present_prebuilt_panel / add_comic_panel
        Builder->>ImageGen: generate panel image
        ImageGen-->>Child: panel image
        GeminiAPI-->>Builder: tool call: ask_quiz
        Builder-->>Child: quiz overlay
        Child-->>Builder: answer
        Builder->>GeminiAPI: quiz result
        GeminiAPI-->>Child: Dora reacts, story continues
    end
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, TailwindCSS |
| 3D voice avatar | Three.js via @react-three/fiber and @react-three/drei, real-time lip-sync |
| Backend | FastAPI, Python 3.11+, asyncio WebSocket proxy |
| Voice AI | gemini-2.5-flash-native-audio-preview-12-2025 (Gemini Live API) |
| Image AI | gemini-3.1-flash-image-preview (Google GenAI SDK) |
| Story pre-generation | gemini-3.1-flash-lite-preview |
| Monorepo | npm workspaces (apps/api, apps/web, packages/shared) |
| Containerization | Docker, deployable to Cloud Run |

---

## Project Structure

```
Questory/
├── apps/
│   ├── api/                          # FastAPI backend
│   │   ├── main.py                   # Entry point, CORS, static file mount
│   │   ├── src/
│   │   │   ├── routers/
│   │   │   │   ├── live_router.py    # WS /api/live/{id}
│   │   │   │   ├── build_router.py   # WS /api/build/{id}, REST library API
│   │   │   │   └── image_router.py   # POST /api/generate-image
│   │   │   └── services/
│   │   │       ├── gemini_live.py         # Story setup agent (Dora)
│   │   │       ├── comic_builder.py       # Comic story agent, panel orchestration
│   │   │       ├── image_gen.py           # Gemini image generation
│   │   │       ├── story_headstart.py     # Async opening panel pre-generation
│   │   │       └── story_session_store.py # Session state (memory + disk)
│   │   └── Dockerfile
│   └── web/                          # React frontend
│       └── src/
│           ├── pages/
│           │   ├── LandingPage.tsx
│           │   ├── CreateStoryPage.tsx    # Voice setup, hero selection
│           │   ├── StoryBuilderPage.tsx   # Live comic reader + quizzes
│           │   ├── StoryViewerPage.tsx    # Completed story viewer
│           │   └── LibraryPage.tsx        # Story library
│           └── hooks/
│               └── useGeminiLive.ts       # WebSocket audio hook
└── packages/
    └── shared/                       # Shared TypeScript types
```

---

## Getting Started

### Prerequisites

- Node.js 20+ and npm 10+
- Python 3.11+
- Gemini API key from [Google AI Studio](https://aistudio.google.com/)

### 1. Install dependencies

```bash
# From the repo root — installs web and api npm packages
npm install
```

```bash
# Python dependencies
cd apps/api
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment

Create `apps/api/.env`:

```env
GEMINI_API_KEY=your_api_key_here
```

### 3. Run in development

Run both servers from the repo root:

```bash
npm run dev
```

Or run them separately:

```bash
# Backend — http://localhost:8000
cd apps/api
source venv/bin/activate
uvicorn main:app --reload --port 8000

# Frontend — http://localhost:5173
cd apps/web
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Docker (backend only)

```bash
cd apps/api
docker build -t questory-api .
docker run -p 8000:8000 -e GEMINI_API_KEY=your_key questory-api
```

---

## License

MIT — see [LICENSE](LICENSE).
