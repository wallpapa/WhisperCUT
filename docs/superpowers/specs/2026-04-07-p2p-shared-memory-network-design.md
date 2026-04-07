# P2P Shared Memory Network — Design Spec

**Date**: 2026-04-07
**Inspired by**: [MemFactory (arxiv 2603.29493)](https://arxiv.org/abs/2603.29493)
**Approach**: Supabase-Native Memory Bank (Approach A)

## Problem

WhisperCUT users produce content independently. When user A discovers that a CuriosityGap hook scores 9/10 for parenting topics, that knowledge stays with user A. User B starts from scratch. The collective learning of the network is lost.

## Solution

A P2P shared memory network where every production event automatically extracts reusable patterns into a shared Supabase table. When any user generates new content, the system retrieves top-performing patterns from the collective memory and injects them into the AI prompt. Memories are scored by confidence (GRPO-inspired) and pruned weekly.

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Shared Memory Network                            │
│                                                   │
│  EXTRACTOR          RETRIEVER         UPDATER     │
│  (after production) (before generation) (weekly)  │
│       │                  │                │       │
│       └──────────────────┼────────────────┘       │
│                          │                        │
│                 shared_memories                    │
│                 (Supabase + Realtime)              │
└──────────────────────────────────────────────────┘
```

## Memory Types

| Type | What's Stored | Extracted From |
|------|--------------|----------------|
| `content_pattern` | Hook type, score, topic, vibe, CTA effectiveness | `vibe_edit`, `feedback` |
| `audience_insight` | Best post time, engagement rate, hashtag performance | `study`, future: real TikTok metrics |
| `production_technique` | Pacing, transitions, font/color, segment durations | `vibe_edit`, `render` |

## Database Schema

### `shared_memories` table

```sql
CREATE TABLE shared_memories (
  id              BIGSERIAL PRIMARY KEY,
  memory_type     TEXT NOT NULL,        -- content_pattern | audience_insight | production_technique
  category        TEXT NOT NULL,        -- hook, cta, vibe, pacing, timing, visual, audio
  pattern         TEXT NOT NULL,        -- human-readable pattern description
  context         JSONB NOT NULL,       -- {topic, platform, vibe, duration_sec, ...}
  score           FLOAT DEFAULT 0,      -- AI score at creation (0-10)
  confidence      FLOAT DEFAULT 0.3,    -- 0-1, GRPO-inspired scoring
  times_used      INT DEFAULT 0,        -- how many times retrieved
  times_confirmed INT DEFAULT 0,        -- how many times confirmed by engagement
  contributed_by  TEXT NOT NULL,         -- user email
  tags            TEXT[] DEFAULT '{}',   -- searchable tags
  status          TEXT DEFAULT 'active', -- active | deprecated | unconfirmed
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes**: `(memory_type, status)`, `tags` (GIN), `(confidence DESC, score DESC)`

**RLS**: open read for all authenticated users, write for service role.

## Retrieval Strategy

No pgvector needed. Filter-based retrieval:

```sql
SELECT * FROM shared_memories
WHERE memory_type = $type
  AND status = 'active'
  AND confidence > 0.5
  AND tags && $topic_tags   -- array overlap
ORDER BY (confidence * score * ln(times_confirmed + 1)) DESC
LIMIT 5
```

Top 5 memories are injected into the vibe_engine prompt as "NETWORK KNOWLEDGE" section.

## Confidence Scoring (GRPO-Inspired)

Instead of training a neural policy, we use a simple reward-driven scoring system:

| Event | Confidence Change |
|-------|------------------|
| Memory created | = 0.3 (unconfirmed) |
| Retrieved + used in a script that scores >= 7 | += 0.1 |
| Confirmed by real engagement metrics | += 0.2 |
| Not used for 7 days | -= 0.1 |
| Confidence drops below 0.1 | status = 'deprecated' |

This mirrors GRPO's advantage estimation: memories that consistently produce good outcomes rise in confidence, while underperformers decay.

## Module Design

### memory-extractor.ts

Called automatically after `vibe_edit`, `feedback`, and `study` complete.

```typescript
extractMemories(result: VibeEditResult | FeedbackResult | StudyResult): Promise<void>
```

Extracts 2-3 memories per production event:
- From `vibe_edit`: hook taxonomy + score, CTA type + conversion, pacing per segment
- From `feedback`: improvement patterns (what changes raised the score)
- From `study`: channel-level insights (posting time, hashtag effectiveness)

### memory-retriever.ts

Called before vibe script generation.

```typescript
retrieveMemories(params: {
  topic: string,
  platform: string,
  vibe: string,
  types?: MemoryType[]
}): Promise<SharedMemory[]>
```

Returns top 5 memories formatted as prompt injection text.

### memory-updater.ts

Weekly cron job (Sunday 03:00):

1. **Decay**: `confidence -= 0.1` for memories not used in 7 days
2. **Prune**: `DELETE WHERE confidence < 0.1` (deprecated)
3. **Merge**: Combine near-duplicate patterns (same category + >80% tag overlap)
4. **Stats**: Log network health metrics

## Integration Points

### Modified files

| File | Change |
|------|--------|
| `src/engine/vibe-engine.ts` | Inject retrieved memories into prompt before generation |
| `src/mcp/tools/vibe-edit.ts` | Call `extractMemories()` after result |
| `src/mcp/tools/feedback.ts` | Call `extractMemories()` after scoring |
| `src/mcp/tools/study.ts` | Call `extractMemories()` after channel analysis |
| `src/mcp/server.ts` | Register `whispercut_memory_status` tool, total 18 tools |

### New files

| File | Purpose |
|------|---------|
| `src/p2p/memory-extractor.ts` | Auto-extract patterns from production results |
| `src/p2p/memory-retriever.ts` | Query shared memories for prompt injection |
| `src/p2p/memory-updater.ts` | Weekly prune/decay/merge job |
| `src/mcp/tools/memory.ts` | MCP tool handler for `whispercut_memory_status` |

### New MCP Tool

`whispercut_memory_status` — Shows:
- Total memories by type and confidence level
- Top 10 highest-confidence patterns
- User's contribution count vs network total
- Memory health (active/deprecated/unconfirmed counts)

## Prompt Injection Format

When vibe_engine generates a script, retrieved memories appear as:

```
NETWORK KNOWLEDGE (from {n} creators, {m} videos):
1. [content_pattern] CuriosityGap hooks score 8.9 avg for parenting (confirmed 23x, confidence: 0.91)
2. [audience_insight] Post at 19:00-20:00 for 2.3x engagement (confirmed 15x, confidence: 0.85)
3. [production_technique] zoom_punch at revelation segment +12% retention (confirmed 8x, confidence: 0.78)

Use these insights to inform your script. Prioritize higher-confidence patterns.
```

## Verification Plan

1. `npm run build` — clean compile
2. Run `vibe_edit` → verify memories extracted to `shared_memories` table
3. Run `vibe_edit` again → verify memories retrieved and injected into prompt
4. Check `whispercut_memory_status` tool output
5. Simulate weekly updater → verify decay/prune logic
6. Two-user test: User A produces → User B retrieves A's memories

## Future Enhancements (Not in Scope)

- pgvector for semantic similarity search
- Real TikTok engagement metrics feedback loop (via API)
- GRPO neural policy training (when memory bank > 10K entries)
- Memory marketplace (sell premium insights for credits)
