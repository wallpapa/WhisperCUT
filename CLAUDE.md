# WhisperCUT v3 — AI-Native Video Factory

## Project Overview
WhisperCUT is an MCP server (15 tools) that automates short-form video production for TikTok/Reels/Shorts. AI agents operate as creative directors + editors, using behavioral science (dopamine hooks, hormone arcs, cognitive load theory) to generate production-ready vertical video.

## Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Copy .env.example → .env and fill in API keys
cp .env.example .env

# 3. Build TypeScript
npm run build

# 4. Run MCP server (stdio)
npm start

# 5. Dev mode with hot reload
npm run dev
```

## Architecture

### 4 Tool Layers (15 tools total)

**Vibe Engine (v3 — Primary)**
- `whispercut_vibe_edit` — One-call video production: topic + vibe → MP4
- `whispercut_list_vibes` — List 5 vibes with performance predictions

**Video Factory (v1)**
- `whispercut_analyze` — Transcribe video with Whisper
- `whispercut_cut` — Generate cut list from analysis
- `whispercut_caption` — Burn animated Thai subtitles
- `whispercut_render` — Full 9:16 1080x1920 60fps render
- `whispercut_export_capcut` — Export as CapCut draft
- `whispercut_publish` — Upload to TikTok
- `whispercut_feedback` — AI quality scoring + improvement loop

**Style Cloner (v2)**
- `whispercut_study` — Analyze TikTok channel → style template
- `whispercut_clone` — Generate script from template
- `whispercut_capcut_clone` — Export clone as CapCut draft

**Autonomous Agent**
- `whispercut_run_pipeline` — Full pipeline: study→script→QA→voice→render→publish
- `whispercut_schedule` — Add to content calendar
- `whispercut_status` — Quota + pipeline metrics

### Key Directories
```
src/mcp/          → MCP server + tool handlers
src/engine/       → FFmpeg, Whisper, Voice (MiniMax), Timeline, CapCut
src/science/      → Hook scorer, CTA selector, Vibe library
src/ai/           → Gemini/OpenRouter providers, prompts, feedback loop
src/agent/        → Pipeline orchestrator, QA gate, scheduler, rate limiter
src/db/           → Supabase client + schema
src/api/          → Vercel serverless API routes
```

### External Services
- **Gemini 2.5 Flash** — Script generation, hook scoring, QA
- **MiniMax** — Dr.Gwang voice cloning TTS
- **faster-whisper** — Audio transcription (Thai)
- **FFmpeg** — Video rendering (1080x1920, 60fps, H.264)
- **Supabase** — Database (projects, analytics, content_calendar, pipeline_runs, style_templates, publish_log)

### Supabase Project
- **Project ID**: `yemtipemvgxepafrsxhh`
- **URL**: `https://yemtipemvgxepafrsxhh.supabase.co`
- 6 tables: projects, analytics, content_calendar, publish_log, pipeline_runs, style_templates

## Development Guidelines

### TypeScript
- Strict mode enabled, target ES2022
- Use `.js` extension in imports (ESM)
- Types exported from source modules (e.g., `Platform` from `rate-limiter.ts`, `VibeType` from `vibe-library.ts`)

### MCP Server
- Uses `@modelcontextprotocol/sdk` v1.12.1
- Old API pattern: `Server` class with `setRequestHandler(CallToolRequestSchema, ...)`
- stdio transport (local)
- Tool handlers in individual files under `src/mcp/tools/`

### Science Layer
- 5 vibes: educational_warm, shocking_reveal, story_driven, quick_tips, myth_bust
- 5-hormone arc: cortisol → dopamine → oxytocin → adrenaline → serotonin
- Hook scoring: 6 taxonomies (CuriosityGap, SocialProofShock, etc.)
- QA gate threshold: 7.5/10, max 3 retries

## Collaborators
- waleerat.marketing@gmail.com — AI TikTok Content co-developer
