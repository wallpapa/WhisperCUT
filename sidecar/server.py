"""
TeleMem Sidecar — FastAPI server wrapping TeleMem for WhisperCUT

Endpoints:
  POST /add          — Store text memory (dialogue turns)
  POST /add_mm       — Store video memory (frames → captions → vector DB)
  POST /search       — Search text memories
  POST /search_mm    — Search video memories with ReAct reasoning
  GET  /health       — Health check

Usage:
  cd sidecar && pip install -r requirements.txt
  python server.py                     # port 8100
  TELEMEM_PORT=8200 python server.py   # custom port
"""

import os
import sys
import logging
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
import uvicorn

# ── Logging ────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="[telemem] %(message)s")
log = logging.getLogger("telemem")

# ── TeleMem Init ───────────────────────────────────────────────

DATA_DIR = Path(os.getenv("TELEMEM_DATA_DIR", "./telemem_data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

memory = None

def get_memory():
    global memory
    if memory is None:
        try:
            import telemem as mem0
            config_path = os.getenv("TELEMEM_CONFIG")
            if config_path and Path(config_path).exists():
                from telemem.utils import load_config
                config = load_config(config_path)
                memory = mem0.Memory(config=config)
            else:
                memory = mem0.Memory()
            log.info("TeleMem initialized")
        except ImportError:
            log.error("telemem not installed — run: pip install telemem")
            raise HTTPException(500, "telemem not installed")
    return memory

# ── FastAPI App ────────────────────────────────────────────────

app = FastAPI(title="TeleMem Sidecar", version="1.0.0")

# ── Models ─────────────────────────────────────────────────────

class AddRequest(BaseModel):
    messages: list[dict]
    user_id: str = "default"
    metadata: Optional[dict] = None

class SearchRequest(BaseModel):
    query: str
    user_id: str = "default"
    limit: int = 5

class AddVideoRequest(BaseModel):
    video_path: str
    clip_secs: int = 5
    user_id: str = "default"

class SearchVideoRequest(BaseModel):
    query: str
    user_id: str = "default"
    limit: int = 5

# ── Endpoints ──────────────────────────────────────────────────

@app.get("/health")
def health():
    has_telemem = False
    try:
        import telemem
        has_telemem = True
    except ImportError:
        pass
    return {
        "status": "ok",
        "telemem_installed": has_telemem,
        "data_dir": str(DATA_DIR),
    }


@app.post("/add")
def add_memory(req: AddRequest):
    """Store text memory (dialogue turns)."""
    mem = get_memory()
    try:
        result = mem.add(
            messages=req.messages,
            user_id=req.user_id,
            metadata=req.metadata or {},
        )
        return {"status": "ok", "result": result}
    except Exception as e:
        log.error(f"add failed: {e}")
        raise HTTPException(500, str(e))


@app.post("/search")
def search_memory(req: SearchRequest):
    """Search text memories."""
    mem = get_memory()
    try:
        results = mem.search(
            query=req.query,
            user_id=req.user_id,
            limit=req.limit,
        )
        # Normalize results to list of dicts
        normalized = []
        if isinstance(results, list):
            for r in results:
                if isinstance(r, dict):
                    normalized.append(r)
                else:
                    normalized.append({"memory": str(r)})
        return {"status": "ok", "results": normalized}
    except Exception as e:
        log.error(f"search failed: {e}")
        raise HTTPException(500, str(e))


@app.post("/add_mm")
def add_video_memory(req: AddVideoRequest):
    """Store video memory — extract frames, captions, and build vector DB."""
    mem = get_memory()
    video = Path(req.video_path)
    if not video.exists():
        raise HTTPException(404, f"Video not found: {req.video_path}")

    # Create per-video directories
    vid_name = video.stem
    frames_dir = DATA_DIR / "frames" / vid_name
    captions_dir = DATA_DIR / "captions" / vid_name
    vdb_dir = DATA_DIR / "vdb" / vid_name
    frames_dir.mkdir(parents=True, exist_ok=True)
    captions_dir.mkdir(parents=True, exist_ok=True)
    vdb_dir.mkdir(parents=True, exist_ok=True)

    try:
        mem.add_mm(
            video_path=str(video),
            frames_root=str(frames_dir),
            captions_root=str(captions_dir),
            vdb_root=str(vdb_dir),
            clip_secs=req.clip_secs,
        )
        return {
            "status": "ok",
            "video": str(video),
            "frames_dir": str(frames_dir),
            "captions_dir": str(captions_dir),
        }
    except Exception as e:
        log.error(f"add_mm failed: {e}")
        raise HTTPException(500, str(e))


@app.post("/search_mm")
def search_video_memory(req: SearchVideoRequest):
    """Search video memories with ReAct reasoning."""
    mem = get_memory()
    try:
        # Try search_mm if available, fallback to regular search
        if hasattr(mem, "search_mm"):
            results = mem.search_mm(
                query=req.query,
                user_id=req.user_id,
                limit=req.limit,
            )
        else:
            results = mem.search(
                query=req.query,
                user_id=req.user_id,
                limit=req.limit,
            )

        normalized = []
        if isinstance(results, list):
            for r in results:
                normalized.append(r if isinstance(r, dict) else {"memory": str(r)})
        return {"status": "ok", "results": normalized}
    except Exception as e:
        log.error(f"search_mm failed: {e}")
        raise HTTPException(500, str(e))


# ── Main ───────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("TELEMEM_PORT", "8100"))
    log.info(f"Starting TeleMem sidecar on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
