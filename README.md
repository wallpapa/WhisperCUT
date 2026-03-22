# WhisperCUT — AI-Native Vertical Video Factory

**No UI. AI agents only. MCP or HTTP API.**

10 MCP tools for end-to-end TikTok/Reels/Shorts production — from raw footage to published video.

```
Primary users: Claude Cowork · OpenClaw · AI agents via MCP stdio or HTTP API
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  WhisperCUT MCP Server                  │
│                                                         │
│  ── Video Factory (v1) ─────────────────────────────── │
│  analyze → cut → caption → render → export → publish   │
│  feedback                                               │
│  Stack: Whisper · FFmpeg · OpenRouter · Supabase        │
│                                                         │
│  ── Style Cloner (v2, Gemini) ──────────────────────── │
│  study → clone → capcut_clone                           │
│  Stack: Gemini 2.5 Flash · yt-dlp · FFmpeg · Python    │
└─────────────────────────────────────────────────────────┘
```

---

## Tools

### Video Factory (v1)

| Tool | Description |
|------|-------------|
| `whispercut_analyze` | Transcribe & analyze a video file with Whisper |
| `whispercut_cut` | Generate cut list from analysis (remove silence, bad takes) |
| `whispercut_caption` | Burn animated subtitles with FFmpeg (Thai/EN) |
| `whispercut_render` | Full 9:16 render — talking-head + captions + music |
| `whispercut_export_capcut` | Export timeline as CapCut/JianYing draft |
| `whispercut_publish` | Upload directly to TikTok via session cookie |
| `whispercut_feedback` | AI quality score (hook/pacing/CTA) + improvement loop |

### Style Cloner (v2 — Gemini-powered)

| Tool | Description |
|------|-------------|
| `whispercut_study` | Batch analyze a TikTok channel → `style_template.json` |
| `whispercut_clone` | Generate clone script from template + topic |
| `whispercut_capcut_clone` | Export clone script as CapCut draft |

---

## Quick Start

```bash
# Clone
git clone https://github.com/wallpapa/WhisperCUT
cd WhisperCUT

# Install
npm install

# Configure
cp .env.example .env
# Add OPENROUTER_API_KEY + GEMINI_API_KEY + SUPABASE_* + TIKTOK_SESSION_ID

# Run MCP server (stdio)
npm run mcp

# Dev mode (watch)
npm run dev
```

### Python dependencies (Style Cloner)

```bash
pip install google-genai yt-dlp
```

---

## MCP Config (Claude Desktop / OpenClaw)

```json
{
  "mcpServers": {
    "whispercut": {
      "command": "npx",
      "args": ["tsx", "/path/to/WhisperCUT/src/mcp/server.ts"],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-v1-...",
        "GEMINI_API_KEY": "...",
        "SUPABASE_URL": "https://...",
        "SUPABASE_SERVICE_KEY": "...",
        "TIKTOK_SESSION_ID": "...",
        "WHISPERCUT_DATA_DIR": "/tmp/tiktok-clone"
      }
    }
  }
}
```

---

## Style Cloner Workflow

```
1. Study a channel (downloads + Gemini analysis, one API call per video):
   whispercut_study({ channel: "@doctorwaleerat", max_videos: 20 })

2. Clone a new video on any topic:
   whispercut_clone({ topic: "ทำไมเด็กสายตาสั้นมากขึ้น", duration_sec: 90 })

3. Export to CapCut for final editing:
   whispercut_capcut_clone({})

Cost: Gemini 2.5 Flash — ~$0.01/video (free tier: 65 videos/day)
```

---

## Repo Structure

```
WhisperCUT/
├── src/
│   ├── mcp/
│   │   ├── server.ts          # Unified MCP server (10 tools)
│   │   └── tools/
│   │       ├── analyze.ts     # v1: Whisper transcription
│   │       ├── cut.ts         # v1: Cut list generation
│   │       ├── caption.ts     # v1: Subtitle burn
│   │       ├── render.ts      # v1: FFmpeg 9:16 render
│   │       ├── export.ts      # v1: CapCut export
│   │       ├── publish.ts     # v1: TikTok upload
│   │       ├── feedback.ts    # v1: AI feedback loop
│   │       ├── study.ts       # v2: Channel style analysis
│   │       └── clone.ts       # v2: Clone + CapCut export
│   ├── engine/                # v1: FFmpeg, Whisper, Timeline
│   ├── ai/                    # v1: AI provider, prompts, feedback
│   └── db/                    # v1: Supabase client + schema
├── python/                    # v2: Python pipeline scripts
│   ├── batch_pipeline.py      # Download + analyze batch
│   ├── aggregate_style.py     # Aggregate analysis → template
│   ├── clone_generator.py     # Generate + render clone script
│   ├── capcut_export.py       # CapCut draft export
│   └── test_gemini.py         # Gemini API test
├── samples/
│   ├── sample_analysis.json   # Example video analysis output
│   └── style_template.json    # Example aggregated style template
├── api/                       # HTTP API wrapper (optional)
└── .env.example
```

---

## Requirements

- Node.js ≥ 22
- Python 3.10+ (for Style Cloner)
- FFmpeg (system install)
- Whisper (for v1 transcription)
- yt-dlp (for Style Cloner download)

## License

MIT
