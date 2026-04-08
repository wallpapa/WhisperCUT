# WhisperCUT Memory Layer — Frontier Research Integration

**Date:** 2026-04-08
**Status:** Approved
**Approach:** C — Progressive Enhancement (zero breaking changes)

---

## Problem

WhisperCUT's 39 MCP tools operate statelessly across sessions. Every new session loses context about what styles, expressions, hooks, and vibes performed well. The existing RL system (cover_preferences, rl_preferences) tracks structured win/loss weights but lacks natural language insights and cross-session memory.

## Solution

A 3-phase memory integration using frontier research, layered on top of existing Supabase storage without modifying legacy tools.

---

## Architecture

### 3-Phase Rollout

| Phase | Technology | Capability | Effort |
|-------|-----------|-----------|--------|
| 1 (NOW) | **Mem0** (npm) | Cross-session agent memory, natural language insights | Low |
| 2 | **TeleMem** (Python sidecar) | Video multimodal memory, competitor analysis | Medium |
| 3 | **MemFactory** (GRPO) | RL-trained memory policies, model fine-tuning | High |

### Memory Layer (Approach C: Progressive Enhancement)

```
┌──────────────────────────────────────────────┐
│                memory-layer.ts               │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐ │
│  │  Mem0     │  │ Supabase  │  │ TeleMem   │ │
│  │ (insights)│  │ (weights) │  │ (video)   │ │
│  │  Phase 1  │  │ existing  │  │ Phase 2   │ │
│  └──────────┘  └───────────┘  └───────────┘ │
└──────────────────────┬───────────────────────┘
                       │
          ┌────────────┴────────────┐
          │  Enhanced Tools (4)     │
          │  - generate_cover       │
          │  - select_cover_ai      │
          │  - feedback             │
          │  - vibe_edit            │
          └─────────────────────────┘
          
          Legacy Tools (35) → unchanged, direct Supabase
```

**Principle:** Mem0 stores **insights** (natural language), Supabase stores **weights** (structured numbers). They complement, not duplicate.

---

## Phase 1: Mem0 Integration

### API Design

```typescript
interface MemoryLayer {
  remember(event: MemoryEvent): Promise<void>
  recall(query: RecallQuery): Promise<MemoryInsight[]>
  reflect(channel?: string): Promise<Pattern[]>
}

interface MemoryEvent {
  type: "cover_selected" | "cover_rejected" | "video_published"
      | "feedback_scored" | "style_studied"
  channel: string
  topic: string
  data: Record<string, unknown>
}

interface RecallQuery {
  channel: string
  topic?: string
  intent: string  // natural language query
  limit?: number
}

interface MemoryInsight {
  text: string
  confidence: number
  source: "mem0" | "supabase" | "telemem"
  scope: "cross_channel" | "per_channel" | "per_topic"
}
```

### 3-Level Memory Scope

| Level | Example | Query Priority |
|-------|---------|---------------|
| **Per-Topic** | "หมอกวาง + ลูกดูจอ → worried + red accent" | Highest |
| **Per-Channel** | "หมอกวาง → pointing + quiet luxury" | Middle |
| **Cross-Channel** | "medical topics → warm lighting wins 78%" | Lowest |

Query merges all 3 levels with per-topic taking precedence over per-channel over cross-channel.

### Files

```
NEW:
  src/memory/memory-layer.ts        — Core API (remember/recall/reflect)
  src/memory/providers/mem0.ts      — Mem0 npm adapter
  src/memory/providers/supabase.ts  — Bridge existing data to memory format
  src/memory/types.ts               — Shared types

MODIFY (minimal):
  src/mcp/tools/cover-design.ts     — recall() before generate, remember() after select
  src/mcp/server.ts                 — Init memory layer on startup
  package.json                      — add mem0ai dependency
```

### Integration Points (4 tools only)

| Tool | remember() | recall() |
|------|-----------|----------|
| `whispercut_generate_cover` | — | Fetch preferences before generating variants |
| `whispercut_select_cover_ai` | Store selection + style as insight | — |
| `whispercut_feedback` | Store QA score + vibe performance | — |
| `whispercut_vibe_edit` | — | Fetch past wins before script generation |

All other 35 tools remain unchanged.

### Data Flow Example

```
TAP 1: whispercut_generate_cover("ลูกดูจอ")
  ├→ recall({ channel: "หมอกวาง", topic: "ลูกดูจอ",
  │           intent: "best style for this topic" })
  │   ├→ Mem0: "pointing expression won 3/4 times for medical"
  │   └→ Supabase: cover_preferences RL weights
  ├→ Merge insights → boost RL weights for recalled patterns
  └→ Generate 4 variants (RL-boosted by memory)

TAP 2: whispercut_select_cover_ai(selected: "A-exploit")
  ├→ remember({ type: "cover_selected", channel: "หมอกวาง",
  │             topic: "ลูกดูจอ", data: { expression: "pointing", ... } })
  ├→ Mem0: stores natural language insight
  └→ Supabase: updates RL weights (structured)
```

---

## Phase 2: TeleMem Video Memory (Future)

### Architecture

```
src/memory/providers/telemem.ts
  ├─ Local mode: spawn Python subprocess (child_process)
  ├─ Cloud mode: HTTP API call to TeleMem service
  └─ MemoryLayer auto-detects available mode
```

### Video Sources

| Source | Trigger | Memory Type |
|--------|---------|-------------|
| Own published clips | After `whispercut_publish` | Performance feedback |
| Competitor viral clips | Via `whispercut_study` | Inspiration patterns |

### Capabilities Unlocked

- ReAct-style video QA: "ช่วง 0-3 วิแรก creator ทำอะไร?"
- Extract hormone arc timing from real videos
- Learn expression/gesture patterns from video frames
- Study verbal + non-verbal communication of Dr. Kwang from real clips

### Deployment Flexibility

- Local Mac: Python subprocess alongside Node.js MCP server
- Cloud: TeleMem as separate HTTP service, MemoryLayer calls via fetch
- Design supports both without code changes in consuming tools

---

## Phase 3: MemFactory RL Training (Future)

### Integration Point

MemFactory's 4 modules map to WhisperCUT:

| MemFactory Module | WhisperCUT Component |
|-------------------|---------------------|
| Extractor | `whispercut_feedback` + TikTok metrics |
| Updater | `memory-layer.remember()` |
| Retriever | `memory-layer.recall()` |
| Agent | `whispercut_vibe_edit` optimizer |

### Requirements

- GPU for GRPO training
- Sufficient training data (50+ video performance records)
- MemFactory Python integration via same sidecar pattern as TeleMem

---

## Success Criteria (Phase 1)

All 3 must pass:

### Test 1: Reduce Manual Repeat
- Session A: generate cover → select "pointing"
- Session B (new): generate cover → system proposes "pointing" as A-exploit
- User does NOT need to re-specify preference

### Test 2: Cover Quality Improvement
- After 10+ selections: A-exploit variant wins > 60%
- Baseline: 25% random chance

### Test 3: Cross-Session Memory Proof
- New session → `whispercut_cover_preferences_ai`
- Returns learned preferences from previous sessions
- Includes natural language insights (not just numbers)

---

## Cost

### Phase 1 (Mem0)
- Mem0 npm: Free tier available (1000 memories)
- Supabase: existing, no additional cost
- Development: ~1 day

### Phase 2 (TeleMem)
- Python sidecar: free (open source)
- Storage: existing Supabase pgvector
- Development: ~2-3 days

### Phase 3 (MemFactory)
- GPU: required for GRPO training
- Development: ~1 week
- Data requirement: 50+ video performance records

---

## Named Concepts (from brainstorming)

| Concept | Definition |
|---------|-----------|
| **"3-Tap Cover Flow"** | topic → select → approve |
| **"Chat-as-Selector"** | Claude Code chat = selection UI |
| **"Selection IS the Signal"** | User choice = RL reward |
| **"Scene DNA"** | Topic → auto-style mapping |
| **"Anchor Elements"** | Face + font + colors = fixed brand identity |
| **"Quiet Luxury"** | Understated elegance, no overt branding |

---

## References

- **Mem0:** github.com/mem0ai/mem0 (52.3K stars) — arXiv:2504.19413
- **TeleMem:** github.com/TeleAI-UAGI/telemem (457 stars) — Tech Report v4 (Jan 2026)
- **MemFactory:** github.com/MemTensor/MemFactory — arXiv:2603.29493 (2026)
