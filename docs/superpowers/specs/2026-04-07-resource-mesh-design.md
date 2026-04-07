# Resource Mesh — Maximum User Resource Utilization

**Date**: 2026-04-07
**Principle**: Use every drop of user's local compute — Ollama GPU, FFmpeg CPU, Whisper, disk cache, API keys

## Problem

Current P2P network only shares 20% of AI API inference. Users have massive untapped resources:
- GPU running Ollama at 10% utilization
- FFmpeg capable of parallel encoding sitting idle
- Whisper model loaded in VRAM doing nothing between transcriptions
- Hundreds of GB disk space for caching
- Tavily/Canva API credits unused

## Solution: 6-Resource Mesh

Every WhisperCUT node advertises ALL capabilities. Jobs get routed to the optimal node.

## Resource Types

| Resource | Job Types | Credit Weight | Auto-Detect |
|----------|-----------|--------------|-------------|
| `ai_inference` | hook_score, qa_gate, vibe_script | 1-5 by complexity | Ollama API `/api/tags` |
| `video_render` | FFmpeg 1080p encode | 8 per 60s video | `ffmpeg -version` + nproc |
| `transcription` | Whisper audio→text | 4 per minute audio | `whisper --help` + GPU check |
| `research` | Tavily search, paper discovery | 2 per search | TAVILY_API_KEY env |
| `image_gen` | Canva autofill, local SDXL | 3 per batch | CANVA_ACCESS_TOKEN env |
| `storage_cache` | Model cache, template cache, video cache | 1 per GB/day | df -h output |

## Node Capability Profile

```typescript
interface NodeCapabilities {
  ai: {
    provider: string;        // "ollama" | "gemini" | "openrouter"
    model: string;           // "gemma3:27b"
    tokens_per_sec: number;  // measured at startup
    vram_gb: number;         // from ollama show
  } | null;
  render: {
    ffmpeg: boolean;
    version: string;
    cores: number;           // nproc
    gpu_accel: string;       // "videotoolbox" | "cuda" | "none"
  } | null;
  transcribe: {
    whisper: boolean;
    model: string;           // "large-v3" | "base"
    gpu: boolean;
  } | null;
  research: {
    tavily: boolean;
    monthly_remaining: number;
  } | null;
  image: {
    canva: boolean;
    sdxl_local: boolean;
  } | null;
  storage: {
    available_gb: number;
    cached_models: string[];
  } | null;
}
```

## Auto-Detection on Startup

```typescript
async function detectCapabilities(): Promise<NodeCapabilities> {
  const [ai, render, transcribe, research, image, storage] = await Promise.all([
    detectOllama(),      // GET http://localhost:11434/api/tags → list models + VRAM
    detectFFmpeg(),      // exec ffmpeg -version + os.cpus().length
    detectWhisper(),     // exec whisper --help, check CUDA
    detectTavily(),      // check TAVILY_API_KEY
    detectImageGen(),    // check CANVA_ACCESS_TOKEN or SDXL model
    detectStorage(),     // exec df -h, check cached models
  ]);
  return { ai, render, transcribe, research, image, storage };
}
```

## Smart Job Router

When a job arrives, router scores each online node:

```
score = capability_match × speed_metric × (1 - current_load) × tier_bonus
```

| Factor | Weight | Example |
|--------|--------|---------|
| `capability_match` | 1.0 if can do, 0 if can't | Node has ffmpeg? |
| `speed_metric` | 0-1 normalized | 16 cores = 1.0, 8 cores = 0.5 |
| `current_load` | 0-1 (inverted = available) | 30% loaded = 0.7 available |
| `tier_bonus` | 1.0/1.5/2.0 for free/power/full | Power tier gets 1.5x |

## Contribution Tiers

| Tier | Contribute | Get Back | Bonus |
|------|-----------|----------|-------|
| **Free** | 20% of resources | 20% of network | - |
| **Power** | 50% of resources | 50% + priority queue | 1.5x credits |
| **Full** | 80% of resources | 80% + instant routing | 2x credits + premium jobs |

Users set their tier in .env: `RESOURCE_TIER=free|power|full`

## Enhanced Database Schema

```sql
-- Add capability columns to p2p_workers
ALTER TABLE p2p_workers ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '{}';
ALTER TABLE p2p_workers ADD COLUMN IF NOT EXISTS resource_tier TEXT DEFAULT 'free';
ALTER TABLE p2p_workers ADD COLUMN IF NOT EXISTS current_load FLOAT DEFAULT 0;
ALTER TABLE p2p_workers ADD COLUMN IF NOT EXISTS benchmark_score FLOAT DEFAULT 0;

-- Add resource routing to p2p_jobs
ALTER TABLE p2p_jobs ADD COLUMN IF NOT EXISTS resource_type TEXT DEFAULT 'ai_inference';
ALTER TABLE p2p_jobs ADD COLUMN IF NOT EXISTS routing_scores JSONB DEFAULT '{}';
ALTER TABLE p2p_jobs ADD COLUMN IF NOT EXISTS routed_reason TEXT;
```

## New Files

| File | Purpose |
|------|---------|
| `src/p2p/resource-detector.ts` | Auto-detect all 6 resource types at startup |
| `src/p2p/resource-router.ts` | Smart routing: match job to best node |
| `src/p2p/benchmark.ts` | Quick benchmark at startup (AI tokens/sec, FFmpeg encode speed) |

## Modified Files

| File | Change |
|------|--------|
| `src/p2p/worker.ts` | Register full capabilities, report current_load |
| `src/mcp/server.ts` | Run detectCapabilities() + benchmark at startup |

## Verification

1. Start Node A (Ollama + FFmpeg) → capabilities auto-detected and registered
2. Start Node B (Gemini only) → capabilities registered
3. Submit render job → routed to Node A (has FFmpeg)
4. Submit hook_score job → routed to faster AI node
5. `whispercut_p2p_status` shows per-node capabilities + load
