# WhisperCUT v3 — Vibe-Driven AI Video Editor
## Architecture Design: AI Agent as CapCut

> Research-backed autonomous video editing system where AI agents
> operate as creative directors + editors simultaneously.
> No human in the loop. Science-encoded quality gates.

---

## CORE INSIGHT (from research synthesis)

**Current problem**: WhisperCUT clones *style* (surface: pacing, captions, transitions)
**Root cause**: Style without science = inconsistent virality

**New principle**:
> Virality is predictable. Dopamine arcs, hormone sequences, and platform signals
> follow measurable patterns. Encode the science → automate the results.

---

## ARCHITECTURE V3: "VIBE ENGINE"

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI AGENT INTERFACE LAYER                      │
│  OpenClaw / Claude Desktop / Any MCP client / HTTP REST API     │
│                                                                  │
│  whispercut_vibe_edit(topic, vibe, platform, duration)          │
│  → returns: video_url, script, analytics_prediction             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                      VIBE ENGINE CORE                            │
│                                                                  │
│  VibeClassifier → HormoneArcPlanner → ScriptAssembler           │
│       │                  │                    │                  │
│   [emotion]          [structure]          [platform-adapt]      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
┌──────▼──────┐  ┌─────────▼──────┐  ┌────────▼────────┐
│  KNOWLEDGE  │  │  SCIENCE LAYER  │  │  PLATFORM LAYER │
│   LAYER     │  │                 │  │                 │
│             │  │ HookScorer      │  │ TikTok adapter  │
│ StyleDB     │  │ PacingOptimizer │  │ IG adapter      │
│ ResearchDB  │  │ CTASelector     │  │ YT adapter      │
│ VibeLibrary │  │ EmotionMapper   │  │ FB adapter      │
└──────┬──────┘  └─────────┬──────┘  └────────┬────────┘
       │                   │                   │
┌──────▼───────────────────▼───────────────────▼────────┐
│                   PRODUCTION LAYER                      │
│                                                         │
│  VoiceEngine → TimelineEngine → RenderEngine → QAGate  │
│  (MiniMax)      (FFmpeg+ML)     (HQ 1080p)    (Gemini) │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   FEEDBACK LOOP                          │
│  PublishEngine → AnalyticsCollector → StyleEvolver      │
│  (TikTok/IG/YT)   (completion rate)    (Supabase)       │
└─────────────────────────────────────────────────────────┘
```

---

## THE 7 NEW MCP TOOLS (v3 API)

### [1] whispercut_vibe_edit — Primary tool (replaces 5 tools)
```typescript
// AI agent calls ONE tool, gets complete video
{
  topic: string,           // "พัฒนาการลูกวัย 3 ขวบ"
  vibe: VibeType,          // "educational_warm" | "shocking_reveal" | "myth_bust" | "story_driven" | "quick_tips"
  platform: Platform,      // auto-adapts script + format
  duration: 60 | 90 | 120,
  voice?: VoiceProfile,    // "Dr.Gwang" (default) or custom
  style_ref?: string       // channel to clone style from (optional)
}
// Returns:
{
  video_url: string,
  script: ScriptObject,    // full structured script with timestamps
  hormone_arc: HormoneArc, // predicted emotion curve
  qa_scores: QAScores,     // hook_score, cta_score, pacing_score, completion_predicted
  publish_ready: boolean
}
```

### [2] whispercut_analyze_vibe — Learn from any video
```typescript
// Feed any video → extract its vibe fingerprint
{ video_url: string }
// Returns: VibeFingerprint (hormone_arc, hook_type, cta_type, pacing_pattern, style_tokens)
```

### [3] whispercut_science_score — Research-backed QA
```typescript
// Score any script against the 5-hormone arc + platform science
{ script: string, platform: Platform }
// Returns: { hook_score, dopamine_arc, oxytocin_moments, cta_effectiveness, completion_predicted }
```

### [4] whispercut_timeline_plan — AI Timeline Designer
```typescript
// Generate CapCut-style timeline with exact timestamps
{ script: ScriptObject, vibe: VibeType, assets: string[] }
// Returns: TimelinePlan { cuts[], transitions[], text_overlays[], music_cues[], b_roll_prompts[] }
```

### [5] whispercut_batch_produce — Factory mode
```typescript
// Produce N videos from content calendar (scheduler calls this)
{ jobs: PipelineJob[], parallel: number }
```

### [6] whispercut_style_learn — Continuous learning
```typescript
// Feed performance data back → evolve style template
{ channel: string, top_videos: string[], metric: "completion" | "shares" }
```

### [7] whispercut_knowledge_query — Research access
```typescript
// AI agent queries the research knowledge base
{ question: string }  // "what hook works best for child development content?"
// Returns: ResearchAnswer with evidence and suggested implementation
```

---

## SCIENCE LAYER — The Core Innovation

### HormoneArcPlanner
Maps topic + vibe to optimal emotional sequence:
```typescript
interface HormoneArc {
  beats: Array<{
    hormone: "cortisol" | "dopamine" | "oxytocin" | "adrenaline" | "serotonin";
    start_sec: number;
    end_sec: number;
    intensity: 1 | 2 | 3;  // 3 = peak
    trigger: string;         // specific technique to use
    script_guidance: string; // what to say/show
  }>;
  predicted_completion_rate: number;  // 0–1
  predicted_share_rate: number;
}
```

### HookScorer (replaces current QA gate hook scoring)
```typescript
// Scores hook against 6-taxonomy system from research:
// CuriosityGap | SocialProofShock | VisualContrast | DirectAddress | BoldClaim | StoryOpening
interface HookScore {
  taxonomy: HookType;
  dopamine_trigger_strength: number;  // 0–100
  pattern_interrupt: boolean;
  curiosity_gap_opened: boolean;
  first_3_sec_compelling: boolean;
  overall: number;  // 0–10
  suggestion: string;
}
```

### PacingOptimizer
```typescript
// Based on cognitive load theory:
// calculates optimal cut timing per section
interface PacingPlan {
  sections: Array<{
    type: "hook" | "problem" | "story" | "revelation" | "solution" | "cta";
    cut_rate_per_sec: number;  // from research: hook=0.5-1, story=0.2-0.3
    transition_type: TransitionType;
    text_display_sec: number;  // 3-5 optimal
  }>;
}
```

### CTASelector
```typescript
// Picks optimal CTA based on platform + content type:
// CuriosityHook | SaveUtility | ShareGift | CommentQuestion | FollowGeneric
// Ranked by conversion: 8.3% | 7.1% | 6.4% | 5.8% | 2.1%
interface CTARecommendation {
  primary_cta: CTAType;
  cta_text: string;
  placement_sec: number;  // at serotonin peak
  secondary_cta?: string;  // for early drop-off viewers (<30sec)
}
```

---

## KNOWLEDGE LAYER — Research as Data

### ResearchDB (Supabase table: research_findings)
```sql
CREATE TABLE research_findings (
  id          BIGSERIAL PRIMARY KEY,
  domain      TEXT,        -- "hook" | "cta" | "pacing" | "hormone" | "algorithm"
  finding     TEXT,        -- the research insight
  evidence    TEXT,        -- source / paper / data
  metric      JSONB,       -- { lift: 0.67, confidence: 0.85 }
  platform    TEXT[],      -- applicable platforms
  content_type TEXT[],     -- "educational" | "story" | "entertainment"
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### VibeLibrary (pre-encoded vibe templates)
```json
{
  "educational_warm": {
    "hormone_arc": "cortisol→oxytocin→serotonin→dopamine",
    "hook_taxonomy": "DirectAddress",
    "story_pattern": "Problem-Agitate-Solve",
    "pacing": "medium-slow",
    "cta_type": "SaveUtility",
    "face_time_pct": 0.7,
    "caption_density": 0.5,
    "optimal_duration_sec": 75
  },
  "shocking_reveal": {
    "hormone_arc": "cortisol→dopamine→adrenaline→serotonin",
    "hook_taxonomy": "BoldClaim",
    "story_pattern": "Myth-Bust-Truth",
    "pacing": "fast",
    "cta_type": "CuriosityHook",
    "face_time_pct": 0.6,
    "caption_density": 0.6,
    "optimal_duration_sec": 63
  },
  "story_driven": {
    "hormone_arc": "cortisol→oxytocin→oxytocin→adrenaline→serotonin",
    "hook_taxonomy": "StoryOpening",
    "story_pattern": "Before-During-After",
    "pacing": "slow-medium",
    "cta_type": "ShareGift",
    "face_time_pct": 0.8,
    "caption_density": 0.4,
    "optimal_duration_sec": 89
  }
}
```

---

## VIBE EDITING ENGINE — CapCut Replacement

### TimelineEngine (the real innovation)
```typescript
interface CapCutStyleTimeline {
  duration_sec: number;
  tracks: {
    video: VideoTrack[];      // clips + b-roll
    audio: AudioTrack[];      // voice + music + sfx
    text: TextTrack[];        // captions + hooks + emphasis
    effects: EffectTrack[];   // zoom punches, transitions
    stickers: StickerTrack[]; // arrows, circles, emphasis
  };
  
  // Science-encoded metadata
  hormone_beats: HormoneArc;
  pacing_profile: PacingPlan;
  hook_window: [0, 3];        // first 3 seconds — non-negotiable
  cta_window: [number, number]; // at serotonin peak
  rewatch_element: string;    // planted Easter egg for rewatch
}
```

### Render Pipeline (upgraded)
```
Script + VibeTemplate
        ↓
   TimelineEngine
   (AI generates cut-by-cut plan)
        ↓
   VoiceEngine
   (MiniMax TTS → Dr.Gwang)
        ↓
   FFmpeg HQ Composer
   (1080×1920 @60fps, color grade per vibe)
        ↓
   Caption Burner
   (word-level highlighting, platform-safe margins)
        ↓
   HQ Encoder
   (H.264 High Profile, CRF 18, faststart)
        ↓
   Science QA Gate
   (hook_score ≥8, completion_predicted ≥70%, cta_score ≥7)
```

---

## FEEDBACK LOOP — Self-Improving System

### Analytics → Style Evolution
```
Publish → 24h wait → Collect:
  - completion_rate (TikTok API)
  - share_rate
  - comment_rate
  - re_watch_rate

→ Compare vs predicted (from QA gate)
→ Update VibeTemplate weights:
  - if actual > predicted: reinforce style choices
  - if actual < predicted: flag for human review OR auto-adjust

→ Store in style_evolution_log (Supabase)
→ Regenerate vibe templates weekly
```

---

## SUPABASE SCHEMA V3 ADDITIONS

```sql
-- Vibe library (auto-updated from performance data)
CREATE TABLE vibe_templates (
  id           BIGSERIAL PRIMARY KEY,
  vibe_name    TEXT NOT NULL UNIQUE,
  config       JSONB NOT NULL,    -- full vibe config
  performance  JSONB DEFAULT '{}', -- avg completion, share rates
  version      INT DEFAULT 1,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Research knowledge base
CREATE TABLE research_findings (
  id           BIGSERIAL PRIMARY KEY,
  domain       TEXT NOT NULL,
  finding      TEXT NOT NULL,
  evidence     TEXT,
  metric       JSONB,
  platform     TEXT[],
  content_type TEXT[],
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Timeline plans (for CapCut-style export)
CREATE TABLE timeline_drafts (
  id           BIGSERIAL PRIMARY KEY,
  project_id   UUID REFERENCES projects(id),
  timeline     JSONB NOT NULL,   -- full CapCut-style timeline
  vibe         TEXT,
  hormone_arc  JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Performance tracking (feedback loop)
CREATE TABLE video_performance (
  id                BIGSERIAL PRIMARY KEY,
  publish_log_id    BIGINT REFERENCES publish_log(id),
  platform          TEXT,
  completion_rate   FLOAT,
  share_rate        FLOAT,
  comment_rate      FLOAT,
  rewatch_rate      FLOAT,
  predicted_completion FLOAT,   -- what QA gate predicted
  delta             FLOAT,      -- actual - predicted
  collected_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

---

## MIGRATION PATH: v2 → v3

| Component | v2 (current) | v3 (new) |
|-----------|-------------|----------|
| Script generation | clone_generator.py (Python) | VibeScriptEngine (TypeScript + Gemini) |
| QA Gate | Overall score 0–10 | 5-dimensional science score |
| Voice | MiniMax + F5-TTS | MiniMax primary (Dr.Gwang), ElevenLabs fallback |
| Render | renderHQ() basic | VibeRenderer + color grade per vibe |
| Timeline | None | CapCut-compatible JSON export |
| MCP tools | 13 tools | 7 vibe-native tools |
| Platform adaptation | None | Platform-specific script variants |
| Feedback loop | Log only | Analytics → style evolution |
| Knowledge | None | ResearchDB queryable by agents |

---

## IMPLEMENTATION PRIORITY

### Phase 1 — Science Layer (Week 1)
- [ ] `src/science/hormone-arc.ts` — HormoneArcPlanner
- [ ] `src/science/hook-scorer.ts` — HookScorer (replaces QA gate hook section)
- [ ] `src/science/pacing-optimizer.ts` — PacingOptimizer
- [ ] `src/science/cta-selector.ts` — CTASelector
- [ ] `src/data/vibe-library.ts` — 5 pre-built vibe templates
- [ ] Supabase: research_findings, vibe_templates tables

### Phase 2 — Vibe Engine (Week 2)
- [ ] `src/engine/vibe-engine.ts` — VibeClassifier + orchestrator
- [ ] `src/engine/timeline-engine.ts` — CapCut-compatible timeline generator
- [ ] `src/engine/vibe-renderer.ts` — per-vibe color grade + pacing
- [ ] Replace 13 MCP tools with 7 vibe-native tools

### Phase 3 — Feedback Loop (Week 3)
- [ ] `src/analytics/collector.ts` — platform API analytics
- [ ] `src/analytics/style-evolver.ts` — auto-update vibe templates
- [ ] `src/agent/knowledge-query.ts` — research KB query tool
- [ ] AutoResearchClaw integration — weekly knowledge update

