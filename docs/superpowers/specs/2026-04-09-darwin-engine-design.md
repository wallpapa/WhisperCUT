# DARWIN Engine — Autonomous Workflow Architecture

**Date:** 2026-04-09
**Status:** Approved
**Acronym:** Data-driven Autonomous Research-poWered Iterative Network

---

## Problem

WhisperCUT has 41 MCP tools covering the entire video production pipeline (script → voice → cover → render → publish). However, the system operates as a "manual orchestra" — a human must invoke each tool in sequence. There is no autopilot that thinks of topics, produces content, learns from results, and self-heals when things break.

## Solution

DARWIN Engine wraps the existing E2E orchestrator with 6 phases, a hypothesis-driven learning loop, and a 3-layer auto-healing immune system. Two human gates preserve brand safety.

---

## Architecture Overview

```
TRIGGERS (3 types)
  Manual: "สร้างคลิปเรื่อง X"
  Calendar: content_calendar schedule (จ/พ/ศ)
  Event: trending topic / metric drop / competitor post
      ↓
PHASE 1: IDEATION
  Hypothesis Engine (Own data > Competitor > Research)
      ↓
PHASE 2: SCRIPT
  Vibe Engine v4.1 + Living Registry + 6-Dim Verification
      ↓
PHASE 3: ASSETS (parallel)
  Voice (MiniMax) + Cover (Nano Banana Pro) + B-Roll (Veo 3.1)
  🔒 GATE 1: Cover Selection (Human 3-Tap)
      ↓
PHASE 4: RENDER
  Auto Edit + Beat-Sync + CapCut Export
      ↓
PHASE 5: PUBLISH
  🔒 GATE 2: Human Final Approval
  Auto Upload + SEO + Optimal Timing
      ↓
PHASE 6: LEARN
  Performance Track → Hypothesis Validate → Mem0 Categorize → RL Update
      ↓
  (loop back to Phase 1 for next production)
```

---

## Phase 1: Ideation

### Hypothesis Engine

Generates testable content hypotheses from 3 sources with priority weighting:

| Priority | Source | Weight | Example |
|----------|--------|--------|---------|
| 1 (highest) | **Own data** | 0.5 | "worried expression got 73K views last time" |
| 2 | **Competitor analysis** | 0.3 | "หมอพี่โอ๋ genetics topic got 2.2M views" |
| 3 | **Research** | 0.2 | "PubMed: screen time + brain = high parent concern" |

### Hypothesis Format

```typescript
interface Hypothesis {
  id: string;
  statement: string;        // "topic X + vibe Y → predicted Z views"
  prediction: {
    metric: string;         // "views" | "completion_rate" | "shares"
    target: number;         // 50000
    confidence: number;     // 0.7
  };
  evidence: {
    own_data: string[];     // past performance references
    competitor: string[];   // competitor clip references
    research: string[];     // paper/article references
  };
  status: "active" | "testing" | "confirmed" | "rejected";
  test_count: number;
  results: Array<{ clip_id: string; actual: number; date: string }>;
}
```

### Topic Selection Flow

```
1. Load active hypotheses from Mem0
2. Load channel analysis (existing seed hypotheses)
3. Tavily: trending topics in niche
4. PubMed: recent papers matching channel themes
5. Rank by: (hypothesis confidence × source weight)
6. Select top topic + matching vibe
7. Create or update hypothesis for this production
```

### Integration

- **Existing:** `whispercut_research_topic` (Tavily), `whispercut_find_research` (PubMed)
- **Existing:** `content_topics` table (production board)
- **New:** `hypotheses` table in Supabase
- **New:** `src/engine/hypothesis-engine.ts`

---

## Phase 2: Script

### Vibe Engine v4.1

Enhances existing `whispercut_vibe_edit` with:

#### 2a. Living Vibe Registry

Replace static `src/science/vibe-library.ts` with GitHub-hosted JSON:

```
vibes/latest.json (hosted on GitHub)
  ├── version, updated, changelog
  ├── vibes[]: id, hormone_targets, hook_window, pace, proven_hooks
  ├── trending_vibes[]
  └── deprecated_vibes[]

Runtime: fetch from GitHub → cache 24h → bundled fallback
```

- **New:** `src/science/vibe-registry.ts`
- **Existing:** `src/science/vibe-library.ts` becomes bundled fallback

#### 2b. Self-Improving Script Generation

Uses categorized Mem0 memories (DSPy GEPA pattern):

```
4 memory categories:
  VIBE_WIN:      scripts with score > 80
  FAILURE:       scripts with score < 60
  USER_EDIT:     what user changed in CapCut draft
  BEAT_PREF:     user's preferred cut timing patterns

Before generation:
  → Fetch top 3 wins + top 2 failures + top 3 edits
  → Build few-shot prompt: "replicate wins, avoid failures, pre-apply edits"
```

- **Existing:** Mem0 provider (Phase 1 done)
- **New:** Category tagging in remember() calls
- **New:** `buildOptimizedVibePrompt()` in existing vibe-engine.ts

#### 2c. 6-Dim Vibe Verification

Replace single QA score with 6-dimension VibeScore:

```typescript
interface VibeScore {
  cortisol_spike: number;     // 0-100: Hook tension
  dopamine_gap: number;       // 0-100: Curiosity sustained
  oxytocin_trust: number;     // 0-100: Middle builds rapport
  adrenaline_peak: number;    // 0-100: Revelation impact
  serotonin_close: number;    // 0-100: CTA satisfaction
  rhythm_score: number;       // 0-100: Pacing match
  vibe_fidelity: number;      // 0-100: Overall vibe match
  predicted_completion: number; // 0-100: Estimated watch-through
}
```

Threshold: `vibe_fidelity >= 75` to proceed. Below 75: auto-retry with failure context.

- **New:** `src/science/vibe-verifier.ts`
- **Modify:** `whispercut_feedback` to output VibeScore

---

## Phase 3: Assets (Parallel)

Three assets generated simultaneously:

### 3a. Voice — MiniMax Dr.Gwang TTS
- **Existing:** `src/engine/voice.ts` (endpoint fixed, voice ID set)
- No changes needed

### 3b. Cover — Nano Banana Pro + Scene DNA
- **Existing:** `whispercut_generate_cover` (4 RL variants)
- **Existing:** Scene DNA auto-maps topic → style
- **Human Gate 1:** 3-Tap Cover Flow (select 1 of 4)

### 3c. B-Roll — Veo 3.1
- **Existing:** `whispercut_generate_broll` (8 presets + custom)
- Auto-select presets from topic keywords
- Default: 3 clips per production (2 topic-relevant + 1 transition)

### Integration into E2E

Currently these run separately. DARWIN connects them:

```
e2e-orchestrator.ts enhancement:
  After script generation (Stage 3.1):
    → Promise.all([
        generateVoice(script.full_narration),
        generateCover(topic, script.hook_text),  // NEW
        generateBRollSet(topic, 3),              // NEW
      ])
    → Cover Gate (human selects)
    → Continue to render with all assets
```

---

## Phase 4: Render

### Beat-Sync Enhancement

When background music provided, snap hormone window boundaries to beat grid:

```
Audio file → librosa (Python sidecar) → BeatGrid {bpm, beats[], downbeats[]}
Hormone windows → snapWindowToBeat(targetTime, beats, snapRadius=0.3)
Result: cuts land on musical beats within hormone timing
```

- **New:** `src/science/beat-sync.ts`
- **New:** `sidecar/beat_detect.py` (librosa)
- **Modify:** timeline-engine.ts to accept beat grid

### CapCut Export

- **Existing:** Full CapCut draft export working
- Now includes: cover image + B-roll clips + beat-snapped timeline

---

## Phase 5: Publish

### Human Gate 2

```
Display: rendered video + cover + script summary + VibeScore
User: "ใช้เลย" → publish
User: "แก้" → loop back to Phase 3 or 4
```

### Auto Publish

- **Existing:** `whispercut_publish` (TikTok via tiktok-uploader)
- SEO: auto-generate title + description + hashtags from script
- Timing: schedule based on historical best-performing times (from own data)
- Quota: respect platform limits (TikTok 1/day, IG 1/day)

---

## Phase 6: Learn

### Performance Tracking

```
Track at: 24h, 48h, 7d after publish
Metrics: views, completion_rate, shares, saves, comments, followers_gained
Source: TikTok Creator API (whispercut_sync_tiktok)
```

### Hypothesis Validation

```
For each active hypothesis:
  prediction: "topic X + vibe Y → 50K views"
  actual: 73K views at 7d mark
  
  if actual >= prediction × 0.8:  → CONFIRMED
  if actual < prediction × 0.5:   → REJECTED + analyze why
  else:                            → INCONCLUSIVE (need more data)
  
  Confirmed → add to GRPO policy (MemFactory Phase 3)
  Rejected → store failure pattern + generate new hypothesis
```

### Categorized Memory Save

```
After each production:
  Mem0.remember(category: VIBE_WIN)    if vibe_fidelity > 80
  Mem0.remember(category: FAILURE)     if vibe_fidelity < 60
  Mem0.remember(category: USER_EDIT)   if user modified in CapCut
  Mem0.remember(category: BEAT_PREF)   if beat_sync was used

  RL collector → JSONL for GRPO training
  Supabase → cover_preferences, rl_preferences update
```

---

## 3-Layer Immune System (Auto-Healing)

Active across ALL phases:

### Layer 1: SKIN (Self-Retry)

| Trigger | Action | Max Retries |
|---------|--------|-------------|
| API timeout | Retry with exponential backoff | 3 |
| QA score < threshold | Regenerate with different params | 3 |
| File missing/corrupt | Re-download or re-generate | 2 |
| TTS failed | Fallback to F5-TTS local | 1 |
| Image gen failed | Fallback to gradient cover | 1 |

### Layer 2: WHITE BLOOD CELLS (Self-Diagnose)

| Pattern Detected | Diagnosis | Strategy Change |
|-----------------|-----------|-----------------|
| Cover rejected 3x | Expression doesn't match topic | Switch expression (e.g. pointing → worried) |
| Script pacing score < 60 | Wrong vibe for topic | Auto-switch vibe (educational → quick_tips) |
| Hook score < 6 three times | Hook type ineffective | Try different hook taxonomy |
| Voice quality complaints | MiniMax issue | Switch to higher-quality model or adjust params |
| Render artifacts | FFmpeg encoding issue | Reduce CRF or change codec preset |

### Layer 3: ANTIBODIES (Self-Evolve)

```
Hypothesis Lifecycle:
  GENERATE: Pattern detected from data
    → "worried expression + medical topic = 30% higher selection rate"
  
  PREDICT: Measurable KPI defined
    → "Next 5 medical covers with worried should get >40K avg views"
  
  TEST: Produce 3-5 clips with hypothesis applied
    → A/B where possible (2 with worried, 2 with pointing)
  
  VALIDATE: Compare prediction vs actual
    → p < 0.1 (rough threshold with small samples)
    
  CONFIRM: Add to RL policy (MemFactory GRPO)
    → Permanently boost "worried + medical" in cover_preferences
    → Update vibe registry with new evidence
    
  OR REJECT: Store as failure
    → Memory: "worried + medical hypothesis rejected — actual 12K avg"
    → Generate new hypothesis from failure analysis
```

---

## Implementation — New Files

```
NEW:
  src/engine/darwin-engine.ts          — Main orchestrator (6 phases)
  src/engine/hypothesis-engine.ts      — Generate/test/validate hypotheses
  src/science/vibe-verifier.ts         — 6-dim VibeScore
  src/science/vibe-registry.ts         — Living vibe registry (GitHub JSON)
  src/science/beat-sync.ts             — Beat detection + snap
  src/memory/categories.ts             — Memory category constants
  sidecar/beat_detect.py               — librosa beat detection
  vibes/latest.json                    — Living vibe registry data

MODIFY:
  src/engine/e2e-orchestrator.ts       — DARWIN wrapper, parallel assets
  src/engine/vibe-engine.ts            — Self-improving prompt builder
  src/mcp/tools/e2e.ts                 — Add hypothesis + darwin options
  src/mcp/server.ts                    — Register new tools
  src/memory/providers/mem0.ts         — Category tagging
```

---

## Integration with Existing Systems

| Existing System | DARWIN Role | Changes |
|----------------|-------------|---------|
| `whispercut_e2e` | Entry point for manual trigger | Add `darwin: true` option |
| `whispercut_vibe_edit` | Phase 2 script engine | Add vibe registry + self-improving prompt |
| `whispercut_generate_cover` | Phase 3 cover asset | Auto-called in parallel |
| `whispercut_generate_broll` | Phase 3 B-roll asset | Auto-called in parallel |
| `whispercut_feedback` | Phase 2 verification | Output VibeScore instead of single score |
| `whispercut_publish` | Phase 5 auto-publish | Called after Gate 2 approval |
| `whispercut_schedule` | Calendar trigger | Feeds into DARWIN Phase 1 |
| Memory Layer (Mem0) | All phases | Category tagging for self-improvement |
| RL Collector | Phase 6 learn | Feeds GRPO training data |
| TeleMem | Phase 1 competitor analysis | Video memory for competitor clips |
| Content Workflow | Phase 1 topic board | Hypothesis-ranked topic selection |

---

## Human Gates (Brand Safety)

Only 2 points require human input:

| Gate | Phase | Human Action | Fallback |
|------|-------|-------------|----------|
| **Gate 1** | Phase 3 | Select cover (1 of 4) | Auto-select A-exploit if no response in 1h |
| **Gate 2** | Phase 5 | "ใช้เลย" or "แก้" | Hold in queue, no auto-publish without approval |

Everything else is fully autonomous.

---

## Triggers

### Manual Trigger
```
User: "สร้างคลิปเรื่อง ลูกดูจอ 35 ชม."
→ DARWIN Phase 1 (topic provided, skip ideation ranking)
→ Phase 2-6 auto
```

### Calendar Trigger
```
content_calendar: { topic: "โหงวเฮ้ง EP.2", scheduled: "2026-04-10 10:00" }
→ DARWIN Phase 1-6 auto
→ Gate 1 + Gate 2 notifications sent to user
```

### Event Trigger
```
Detected: trending topic "สมองเด็กกับ AI" on TikTok
→ DARWIN Phase 1: generate hypothesis for trending topic
→ Phase 2-6 auto (if hypothesis scores high enough)
→ Hold at Gate 2 for approval
```

---

## Success Criteria

### Quantitative
- Vibe Engine self-improvement: **A-exploit win rate > 60%** (from 25% baseline)
- Hypothesis validation: **>50% confirmed** after 20 productions
- Auto-healing: **<5% manual intervention** on retry-able failures
- Production speed: **<15 min** topic → ready-to-publish (from ~45 min manual)

### Qualitative
- User only makes 2 decisions per clip (cover + publish)
- System learns what works per channel without manual tuning
- Failed hypotheses are automatically replaced, not repeated

---

## Named Concepts

| Concept | Definition |
|---------|-----------|
| **DARWIN Engine** | Data-driven Autonomous Research-poWered Iterative Network |
| **3-Layer Immune System** | SKIN (retry) → WHITE BLOOD CELLS (diagnose) → ANTIBODIES (evolve) |
| **Hypothesis Lifecycle** | GENERATE → PREDICT → TEST → VALIDATE → CONFIRM/REJECT |
| **3-Tap Cover Flow** | topic → select 1/4 → approve |
| **Chat-as-Selector** | Claude Code chat = selection UI |
| **Scene DNA** | Topic → auto-style mapping |
| **Living Vibe Registry** | GitHub-hosted JSON, community-updatable |
| **6-Dim VibeScore** | cortisol + dopamine + oxytocin + adrenaline + serotonin + rhythm |

---

## References

- **CutDeck** (github.com/Agions/CutDeck) — 6-dim AI scoring validation
- **montage-ai** (github.com/mfahsold/montage-ai) — Beat-sync + story engine
- **mem0-dspy** (github.com/avbiswas/mem0-dspy) — Categorized memory + DSPy
- **jiaoben** (github.com/1-SKILL/jiaoben) — Living hook formula registry
- **openclip** (github.com/linzzzzzz/openclip) — User-intent guided extraction
- **ai-mixed-cut** (github.com/toki-plus/ai-mixed-cut) — Deconstruct-reconstruct pattern
- **MemFactory** (github.com/MemTensor/MemFactory) — GRPO RL training
- **Mem0** (github.com/mem0ai/mem0) — Universal memory layer
- **TeleMem** (github.com/TeleAI-UAGI/telemem) — Video multimodal memory
