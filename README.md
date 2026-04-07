# WhisperCUT v3 — AI-Native Video Factory

> **AI agents operate as creative directors + editors.**
> One command. One topic. Production-ready TikTok video.

WhisperCUT is an MCP server with **17 tools** that automates short-form video production for TikTok, Instagram Reels, and YouTube Shorts. Every creative decision — hooks, pacing, transitions, CTAs — is driven by behavioral science research, not artistic intuition.

---

## Quick Start (1 command)

Get your `wcut_` token from the admin, then run:

```bash
curl -sL https://raw.githubusercontent.com/wallpapa/WhisperCUT/main/setup.sh | bash -s YOUR_TOKEN
```

The script will: verify token, clone, install, build, and configure Claude Code automatically.

---

## How It Works

```
Topic + Vibe ──→ WhisperCUT ──→ Production-Ready MP4
                     │
         ┌───────────┼───────────┐
         │           │           │
    Vibe Engine  Hook Scorer  Voice Engine
    (AI Script)  (Gemini/    (MiniMax TTS)
                  Ollama)
         │           │           │
         └───────────┼───────────┘
                     │
              FFmpeg Render
           (1080x1920 @60fps)
```

### 5-Hormone Story Arc

Every video follows a neuroscience-backed emotional arc:

| Time | Hormone | Purpose | Example |
|------|---------|---------|---------|
| 0-3s | **Cortisol** | Threat/tension hook | "ถ้าลูกคุณอายุ 3 ขวบ อ่านด่วน!" |
| 3-15s | **Dopamine** | Curiosity gap | "8/10 ครอบครัว ทำสิ่งนี้โดยไม่รู้ตัว" |
| 15-35s | **Oxytocin** | Trust building | Personal story, vulnerability |
| 35-55s | **Adrenaline** | Peak moment | Counter-intuitive revelation |
| 55-75s | **Serotonin** | Resolution + CTA | Actionable advice + save prompt |

### 5 Content Vibes

| Vibe | Completion | Share | Best For |
|------|-----------|-------|----------|
| `educational_warm` | 71% | 6.4% | Expert knowledge sharing |
| `shocking_reveal` | 74% | 8.3% | Myth-busting, bold claims |
| `story_driven` | 68% | 9.1% | Family/child narratives |
| `quick_tips` | 77% | 7.1% | Fast-paced lists |
| `myth_bust` | 73% | 7.6% | "Truth nobody tells you" |

---

## 17 MCP Tools

### Vibe Engine (v3) — PRIMARY

| Tool | Description |
|------|-------------|
| `whispercut_vibe_edit` | One-call video production: topic + vibe → MP4 with script, hook scoring, QA |
| `whispercut_list_vibes` | List 5 vibes with predicted completion/share rates |

### Video Factory (v1)

| Tool | Description |
|------|-------------|
| `whispercut_analyze` | Transcribe video with Whisper + AI analysis |
| `whispercut_cut` | Generate cut list from analysis |
| `whispercut_caption` | Burn animated Thai subtitles via FFmpeg |
| `whispercut_render` | Full 9:16 1080x1920 @60fps H.264 render |
| `whispercut_export_capcut` | Export timeline as CapCut draft |
| `whispercut_publish` | Upload to TikTok via session auth |
| `whispercut_feedback` | AI quality scoring + iterative improvement |

### Style Cloner (v2)

| Tool | Description |
|------|-------------|
| `whispercut_study` | Analyze TikTok channel → extract style template |
| `whispercut_clone` | Generate script from style template + topic |
| `whispercut_capcut_clone` | Export clone script as CapCut draft |

### Autonomous Agent

| Tool | Description |
|------|-------------|
| `whispercut_run_pipeline` | Full pipeline: study → script → QA → voice → render → publish |
| `whispercut_schedule` | Add topic to content calendar for scheduled run |
| `whispercut_status` | Today's quota, upcoming jobs, recent results |

### P2P Network

| Tool | Description |
|------|-------------|
| `whispercut_p2p_status` | Online workers, credit balance, leaderboard |
| `whispercut_p2p_submit` | Submit AI job to distributed network |

---

## P2P Distributed AI Network

Users contribute **20% of their AI processing power** to a shared pool. More users = more capacity = better service for everyone.

```
User A (Gemini)  ←──┐
                     │  Supabase Realtime
User B (Ollama GPU) ←┼──→ Job Queue ←──→ Credit Ledger
                     │
User C (OpenRouter) ←┘
```

### How It Works
1. Your MCP server starts → registers as a worker
2. You do your own work (80%)
3. Network jobs come in → your worker picks up + processes (20%)
4. You earn weighted credits for helping others

### Credit System

| Job Type | Credits | Weight |
|----------|---------|--------|
| `hook_score` | 1 | Light — score a hook |
| `weekly_plan` | 2 | Medium — generate content plan |
| `qa_gate` | 3 | Medium — review script quality |
| `vibe_script` | 5 | Heavy — generate full script |

New users get **10 free credits** on signup.

---

## BYOK — Bring Your Own Key

Users provide their own AI API key. The system has zero AI costs.

### Option A: Gemini Free (Recommended)
```env
AI_PROVIDER=gemini
AI_API_KEY=your-key-from-aistudio.google.com
```
Get free key: https://aistudio.google.com/apikey (250 req/day)

### Option B: Ollama Local (Free Forever)
```bash
brew install ollama && ollama pull gemma3:27b && ollama serve
```
```env
AI_PROVIDER=ollama
AI_MODEL=gemma3:27b
```

### Option C: OpenRouter Free Models
```env
AI_PROVIDER=openrouter
AI_MODEL=google/gemma-3-27b-it:free
AI_API_KEY=sk-or-v1-your-key
```

### Option D: Any OpenAI-Compatible API (GLM, Deepseek, etc.)
```env
AI_PROVIDER=custom
AI_MODEL=glm-4-flash
AI_API_KEY=your-key
AI_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
```

---

## Architecture

```
src/
├── mcp/              # MCP server + 17 tool handlers
│   ├── server.ts     # Main entry (stdio transport, v3.1.0)
│   └── tools/        # One file per tool domain
├── engine/           # Core production engines
│   ├── vibe-engine   # AI script generation (hormone arc)
│   ├── ffmpeg        # Video rendering (1080x1920 @60fps)
│   ├── whisper       # Audio transcription (Thai)
│   ├── voice         # MiniMax TTS (Dr.Gwang clone)
│   ├── timeline      # Timeline composition
│   └── capcut        # CapCut draft export
├── science/          # Behavioral science algorithms
│   ├── hook-scorer   # 6-taxonomy hook evaluation
│   ├── cta-selector  # Conversion-optimized CTA
│   └── vibe-library  # 5 research-encoded vibes
├── ai/               # Unified AI provider (BYOK)
│   ├── provider      # Gemini/OpenRouter/Ollama/Custom gateway
│   ├── prompts       # Prompt templates
│   └── feedback-loop # Auto-improve cycle
├── agent/            # Autonomous orchestration
│   ├── pipeline      # 8-stage production pipeline
│   ├── qa-gate       # Quality gate (7.5/10 threshold)
│   ├── scheduler     # Content calendar + weekly AI plan
│   └── rate-limiter  # Multi-platform quota tracking
├── p2p/              # Distributed AI network
│   ├── worker        # Realtime job processing daemon
│   ├── submitter     # Job submission + fallback
│   └── credits       # Weighted credit system
└── db/               # Supabase client + schema (10 tables)
```

---

## Research Foundation

All creative decisions are encoded from peer-reviewed research:

- **Dopamine Prediction Error** — Schultz et al., 1997
- **Narrative Transportation Theory** — Green & Brock, 2000
- **Fogg Behavior Model** — BJ Fogg, 2009
- **Zeigarnik Effect** — Unresolved tension drives completion
- **TikTok Creator Academy** — Platform algorithm research (2022-2025)
- **10K+ Video Dataset** — Completion rate predictions

### Hook Taxonomy (6 types)

| Type | Watch-Through Lift |
|------|-------------------|
| CuriosityGap | +67% |
| SocialProofShock | +54% |
| VisualContrast | +48% |
| DirectAddress | +43% |
| BoldClaim | +41% |
| StoryOpening | +38% |

---

## Development

```bash
git clone https://github.com/wallpapa/WhisperCUT.git
cd WhisperCUT
npm install
npm run build
npm start          # stdio MCP server
npm run dev        # hot reload
npx tsx test_e2e.ts  # E2E test (8 layers)
```

### Tech Stack
- **Runtime**: Node.js 22+ / TypeScript (strict, ES2022)
- **MCP**: @modelcontextprotocol/sdk v1.12.1 (stdio)
- **AI**: Vercel AI SDK + @ai-sdk/openai-compatible
- **Database**: Supabase (Postgres + Realtime + Storage)
- **Video**: FFmpeg (H.264, 1080x1920, 60fps, Thai font)
- **TTS**: MiniMax (Dr.Gwang cloned voice)

## License

MIT
