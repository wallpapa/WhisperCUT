<div align="center">
  <h1>🎬 WhisperCUT v3</h1>
  <p><strong>AI Agent as CapCut — Research-powered autonomous video production</strong></p>
  <p>
    <img src="https://img.shields.io/badge/version-3.0.0-blue" />
    <img src="https://img.shields.io/badge/MCP-15%20tools-green" />
    <img src="https://img.shields.io/badge/render-1080×1920%20%4060fps-orange" />
    <img src="https://img.shields.io/badge/voice-MiniMax%20Dr.Gwang-purple" />
    <img src="https://img.shields.io/badge/license-MIT-yellow" />
  </p>
</div>

---

## What is WhisperCUT?

WhisperCUT is an **AI-native video factory** where AI agents operate as creative directors + editors. No human in the loop.

```bash
# One MCP call → production-ready TikTok video
whispercut_vibe_edit(topic="พัฒนาการลูก 3 ขวบ", vibe="educational_warm", platform="tiktok")
```

Returns: `video_path` + `capcut_draft` + `science_report` + `predicted_completion_rate`

---

## Architecture

```
AI Agent (OpenClaw / Claude Desktop / Any MCP client)
         │
         ▼
┌─────────────────────────────────────┐
│        VIBE ENGINE (v3)             │  ← Science-encoded creative director
│  VibeLibrary → HookScorer           │
│  HormoneArcPlanner → CTASelector    │
│  TimelineEngine (CapCut-compatible) │
└──────────────────┬──────────────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
 VoiceEngine   RenderHQ      QA Gate
 (MiniMax      (FFmpeg        (Gemini
  Dr.Gwang)    1080p @60fps)  score ≥7.5)
                   │
                   ▼
          PublishEngine → TikTok / IG / YouTube / Facebook
                   │
                   ▼
          Supabase (logs, analytics, feedback loop)
```

---

## Research Foundation

Every creative decision is encoded from neuroscience + platform algorithm research:

| Finding | Encoded In |
|---------|-----------|
| Dopamine fires on **anticipation**, not reward — hook must open a gap | `HookScorer` taxonomy |
| 5-hormone arc: cortisol→dopamine→oxytocin→adrenaline→serotonin | `VibeLibrary` hormone beats |
| CTA conversion: CuriosityHook 8.3% vs FollowGeneric 2.1% | `CTASelector` |
| Cognitive load: optimal cut = 1/2–4sec, text display 3–5sec | `TimelineEngine` pacing |
| TikTok: completion 35%, re-watch 25%, share 20% of ranking | `QA Gate` thresholds |

---

## 15 MCP Tools

### 🎬 Vibe Engine (v3) — Use these first

| Tool | Description |
|------|-------------|
| `whispercut_vibe_edit` | **PRIMARY** — topic + vibe → full production video |
| `whispercut_list_vibes` | List all vibes with predicted performance |

### 🏭 Video Factory (v1)

| Tool | Description |
|------|-------------|
| `whispercut_analyze` | Transcribe & analyze any video |
| `whispercut_cut` | AI cut list from analysis |
| `whispercut_caption` | Burn animated Thai subtitles |
| `whispercut_render` | 9:16 render (talking-head + captions) |
| `whispercut_export_capcut` | Export CapCut draft JSON |
| `whispercut_publish` | Upload to TikTok |
| `whispercut_feedback` | AI quality score + improvement |

### 🧬 Style Cloner (v2)

| Tool | Description |
|------|-------------|
| `whispercut_study` | Analyze TikTok channel → style template |
| `whispercut_clone` | Generate script from template + topic |
| `whispercut_capcut_clone` | Export as CapCut draft |

### 🤖 Autonomous Agent

| Tool | Description |
|------|-------------|
| `whispercut_run_pipeline` | Full autonomous pipeline (no human) |
| `whispercut_schedule` | Add topic to content calendar |
| `whispercut_status` | Today's quota + pipeline status |

---

## 5 Vibes (Content Archetypes)

| Vibe | Best For | Completion | Share |
|------|----------|-----------|-------|
| `educational_warm` | Expert shares knowledge with empathy | 71% | 6.4% |
| `shocking_reveal` | Bold claim + myth bust | 74% | **8.3%** |
| `story_driven` | Narrative transportation | 68% | **9.1%** |
| `quick_tips` | Fast list, high info density | **77%** | 7.1% |
| `myth_bust` | Authority challenge + correction | 73% | 7.6% |
| `auto` | AI selects optimal for topic | — | — |

---

## Quick Start

### 1. Clone & install
```bash
git clone https://github.com/wallpapa/WhisperCUT.git
cd WhisperCUT
npm install
cp .env.example .env
```

### 2. Set API keys in `.env`
```bash
# Required for script generation + QA
GEMINI_API_KEY=AIza...

# Required for Dr.Gwang voice
MINIMAX_API_KEY=eyJ...
MINIMAX_GROUP_ID=1234...
MINIMAX_VOICE_ID=Dr.Gwang   # Voice ID from My Voices page

# Supabase (free tier)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Social publishing
TIKTOK_SESSION_ID=...
TIKTOK_ACCOUNT_ID=...
```

### 3. Run Supabase schema
```sql
-- Run src/db/schema.sql in Supabase SQL editor
```

### 4. Add to Claude Desktop / OpenClaw
```json
{
  "mcpServers": {
    "whispercut": {
      "command": "npx",
      "args": ["tsx", "/path/to/WhisperCUT/src/mcp/server.ts"],
      "env": {
        "GEMINI_API_KEY": "...",
        "MINIMAX_API_KEY": "...",
        "MINIMAX_VOICE_ID": "Dr.Gwang"
      }
    }
  }
}
```

### 5. Test E2E
```bash
# FFmpeg-only test (no API keys needed)
npx tsx test_e2e.ts

# Full test with voice + real script
export GEMINI_API_KEY="..."
export MINIMAX_API_KEY="..."
npx tsx test_e2e.ts
```

---

## Autonomous Scheduler (OpenClaw Cron)

```yaml
# OpenClaw cron config
name: "whispercut-daily"
schedule: "0 6 * * *"
instruction: "Run the WhisperCUT pipeline for today's scheduled content"
```

Or schedule via MCP:
```
whispercut_schedule(topic="พัฒนาการสมองลูก", scheduled_date="2026-03-23", platforms=["tiktok","instagram"])
```

---

## BYOE (Bring Your Own Everything)

Platform cost: **~$0/month**

| Component | Provider | Cost |
|-----------|----------|------|
| Script generation | Gemini 2.5 Flash | Free (250 req/day) |
| Voice TTS | MiniMax (Dr.Gwang) | Pay-per-use (~$0.02/video) |
| Video render | FFmpeg on your GPU | $0 |
| Database | Supabase free tier | $0 |
| MCP server | Your machine | $0 |

---

## Video Output Specs

```
Resolution:  1080 × 1920 (9:16 vertical)
Frame rate:  60fps
Codec:       H.264 High Profile, CRF 18
Audio:       AAC 320kbps stereo, 44100Hz
Container:   MP4 (faststart for streaming)
Fonts:       Sarabun (Thai) auto-detected
```

---

## AutoResearchClaw Integration

Run weekly knowledge updates from academic research:
```bash
cd /tmp/arc-research
export GEMINI_API_KEY="..."
researchclaw run --topic "Psychological mechanisms of viral short-form video" --auto-approve
```

Findings automatically update `vibe-library.ts` hormone arc weights.

---

## Project Structure

```
WhisperCUT/
├── src/
│   ├── science/          # Research-encoded science layer
│   │   ├── vibe-library.ts      # 5 vibes with hormone arcs
│   │   ├── hook-scorer.ts       # Taxonomy-based hook QA
│   │   └── cta-selector.ts      # Behavioral economics CTA
│   ├── engine/           # Production layer
│   │   ├── vibe-engine.ts       # Core AI creative director
│   │   ├── timeline-engine.ts   # CapCut-compatible timeline
│   │   ├── ffmpeg.ts            # HQ render (1080p @60fps)
│   │   └── voice.ts             # MiniMax + F5-TTS
│   ├── agent/            # Autonomous pipeline
│   │   ├── pipeline.ts          # Full zero-human pipeline
│   │   ├── scheduler.ts         # OpenClaw cron integration
│   │   ├── qa-gate.ts           # Gemini quality scoring
│   │   └── rate-limiter.ts      # Platform quota management
│   ├── mcp/              # MCP server + tools
│   └── db/               # Supabase schema
├── templates/            # Community style templates
├── python/               # Style cloner (v2)
├── research/             # Research synthesis docs
└── test_e2e.ts           # End-to-end test
```

---

## License

MIT — build freely, attribute appreciated.

Built with: FFmpeg · MiniMax TTS · Gemini AI · Supabase · Model Context Protocol
