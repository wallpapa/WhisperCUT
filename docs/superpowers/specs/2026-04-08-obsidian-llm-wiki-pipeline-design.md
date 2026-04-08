# Obsidian → LLM Wiki Pipeline — Design Spec

**Date:** 2026-04-08
**Status:** Approved
**Scope:** Dual-Layer Memory — Obsidian vault (human-curated) + Supabase shared_memories (agent-generated), connected via pgvector semantic search.

---

## 1. Problem

WhisperCUT has 130+ records in `shared_memories` — all agent-generated via War Room analysis. What's missing:
- **Human-curated knowledge** (research papers, playbooks, formulas) has no structured home
- **Semantic search** — current retrieval is tag-overlap only, misses conceptually related but differently tagged content
- **Editable knowledge base** — agents can write to Supabase but humans can't easily browse/edit/organize that data

## 2. Solution: Dual-Layer Memory

Two memory layers, each with its own strengths, queried together:

| Layer | Storage | Written By | Query Method | Strength |
|-------|---------|-----------|-------------|----------|
| **Layer 1: shared_memories** | Supabase table (existing) | Agents (War Room, RL engine) | Tag overlap + confidence sort | Structured, RL-scored, auto-growing |
| **Layer 2: knowledge_base** | Supabase pgvector (new) | Humans via Obsidian vault | Vector cosine similarity | Semantic search, rich context, editable |

Agents query **both layers** via enhanced `memory-retriever.ts`. Results merged, deduplicated, ranked.

## 3. Architecture

```
┌─────────────────────────────────────────────────────┐
│              HUMAN LAYER (Obsidian Vault)            │
│              ~/WhisperCUT-wiki/                      │
│                                                      │
│  research/        ← papers, findings, citations      │
│  playbooks/       ← hook formulas, content rules     │
│  personas/        ← 7 patient personas (detailed)    │
│  hypotheses/      ← 100+ viral hypotheses            │
│  retention/       ← curve patterns, bridge techniques│
│  legal/           ← Thai medical ad law, TikTok rules│
│  agents/          ← agent prompt reference material  │
│                                                      │
│  Human writes .md files → Git commits                │
└──────────────────┬──────────────────────────────────┘
                   │
                   │  npm run sync-wiki (nightly cron or manual)
                   │  src/p2p/obsidian-sync.ts
                   │
                   │  1. Read all .md files recursively
                   │  2. Chunk by headings (~500 tokens max)
                   │  3. Generate embeddings (text-embedding-3-small)
                   │  4. Compute content_hash (SHA-256)
                   │  5. Upsert to knowledge_base (skip unchanged)
                   ▼
┌─────────────────────────────────────────────────────┐
│           SUPABASE — knowledge_base (NEW)            │
│                                                      │
│  id bigserial PK                                     │
│  source_file text          — vault relative path     │
│  section text              — heading path            │
│  content text              — chunk text              │
│  embedding vector(1536)    — OpenAI embedding        │
│  content_hash text UNIQUE  — skip if unchanged       │
│  tags text[]               — auto-extracted          │
│  updated_at timestamptz    — last sync time          │
│                                                      │
│  INDEX: ivfflat (embedding vector_cosine_ops)        │
│  lists = 100 (for ~1000-5000 chunks)                 │
└──────────────────┬──────────────────────────────────┘
                   │
                   │  semantic search (cosine similarity)
                   ▼
┌─────────────────────────────────────────────────────┐
│       AGENT QUERY LAYER (memory-retriever.ts)        │
│                                                      │
│  retrieveMemories(topic, limit) — ENHANCED:          │
│    1. Tag-based search → shared_memories (existing)  │
│    2. Embed query → cosine search → knowledge_base   │
│    3. Merge + deduplicate + rank by score/similarity │
│    4. Return combined promptText for agents          │
│                                                      │
│  NEW: retrieveKnowledge(query, limit)                │
│    Pure vector search on knowledge_base only         │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│          AGENTS (War Room + Content Factory)          │
│  Receive BOTH:                                       │
│  • Tag-matched agent memories (RL-scored)            │
│  • Semantically similar human knowledge (embedded)   │
└─────────────────────────────────────────────────────┘
```

## 4. New Files

### 4a. `src/p2p/obsidian-sync.ts` (~150 lines)

Sync script that reads Obsidian vault and pushes to pgvector.

**Input:** Vault directory path (env var `OBSIDIAN_VAULT_PATH` or `~/WhisperCUT-wiki/`)

**Process:**
```typescript
1. readVaultFiles(vaultPath)      // recursive .md glob
2. for each file:
   a. parseMarkdown(content)      // split by ## headings
   b. for each section:
      i.  chunk = truncate(section, 500 tokens)
      ii. hash = sha256(chunk)
      iii. skip if hash exists in knowledge_base
      iv. embedding = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: chunk
          })
      v.  tags = extractTags(file path + headings)
      vi. upsert to knowledge_base
3. deleteOrphans()                // remove chunks whose source_file no longer exists
4. log summary: {added, updated, skipped, deleted}
```

**Tag extraction** from file path:
- `research/retention-curves.md` → `['research', 'retention', 'curves']`
- `playbooks/hook-formulas.md` → `['playbooks', 'hook', 'formulas']`
- Plus heading words from the section

**Environment:**
- `OBSIDIAN_VAULT_PATH` — path to vault (default: `~/WhisperCUT-wiki/`)
- `OPENAI_API_KEY` — for embeddings
- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` — existing

**Run:** `npm run sync-wiki` (added to package.json scripts)

### 4b. Extension to `src/p2p/memory-retriever.ts`

Add new function and enhance existing:

```typescript
// NEW: Pure vector search on knowledge_base
export async function retrieveKnowledge(params: {
  query: string;
  limit?: number;
}): Promise<{ chunks: KnowledgeChunk[]; promptText: string }> {
  const embedding = await embedQuery(params.query);
  const { data } = await supabase.rpc('match_knowledge', {
    query_embedding: embedding,
    match_threshold: 0.7,
    match_count: params.limit || 5
  });
  return { chunks: data, promptText: formatChunks(data) };
}

// ENHANCED: Merge both sources
export async function retrieveAll(params: {
  topic: string;
  limit?: number;
}): Promise<{ memories: RetrievedMemory[]; knowledge: KnowledgeChunk[]; promptText: string }> {
  const [memories, knowledge] = await Promise.all([
    retrieveMemories(params),
    retrieveKnowledge({ query: params.topic, limit: params.limit })
  ]);
  return {
    memories: memories.memories,
    knowledge: knowledge.chunks,
    promptText: memories.promptText + '\n---\n' + knowledge.promptText
  };
}
```

### 4c. Supabase RPC function for similarity search

```sql
CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
) RETURNS TABLE (
  id bigint,
  source_file text,
  section text,
  content text,
  similarity float
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.source_file,
    kb.section,
    kb.content,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE 1 - (kb.embedding <=> query_embedding) > match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

## 5. Database Migration

### Migration 1: Enable pgvector extension
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Migration 2: Create knowledge_base table
```sql
CREATE TABLE knowledge_base (
  id bigserial PRIMARY KEY,
  source_file text NOT NULL,
  section text,
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  content_hash text UNIQUE NOT NULL,
  tags text[] DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_knowledge_base_embedding 
  ON knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_knowledge_base_tags 
  ON knowledge_base USING gin (tags);

CREATE INDEX idx_knowledge_base_source 
  ON knowledge_base (source_file);
```

### Migration 3: Create match_knowledge RPC
(SQL from section 4c above)

## 6. Obsidian Vault Structure

```
~/WhisperCUT-wiki/
├── research/
│   ├── retention-curves.md          ← 6 named patterns, benchmarks
│   ├── retention-bridges.md         ← 10 techniques with evidence
│   ├── hook-psychology.md           ← taxonomy + dopamine theory
│   ├── tiktok-algorithm-2026.md     ← wave system, signals, weights
│   ├── thai-medical-law.md          ← แพทยสภา, สบส., banned words
│   ├── neuroscience-attention.md    ← 15 PubMed papers summary
│   └── papers/                      ← individual paper notes
│       ├── schultz-1997-dopamine.md
│       ├── rejer-2024-mixed-emotions-eeg.md
│       └── ...
├── playbooks/
│   ├── hook-formulas.md             ← proven hooks with lift %
│   ├── emotional-triggers.md        ← 8 trigger categories
│   ├── content-ratio-6-3-1.md       ← magnet:bridge:closer
│   ├── social-weapon-pattern.md     ← share >35% content design
│   └── dm-funnel-scripts.md         ← WhisperChat.co templates
├── personas/
│   ├── khun-nid.md                  ← คุณนิด (45, แม่บ้าน)
│   ├── khun-mint.md                 ← คุณมิ้นท์ (32, สาวออฟฟิศ)
│   ├── khun-mae-jan.md              ← คุณแม่จันทร์ (58)
│   ├── khun-bell.md                 ← คุณเบล (28, เจ้าสาว)
│   ├── khun-boss.md                 ← คุณบอส (35, ผู้ชาย)
│   ├── nong-prae.md                 ← น้องแพร (22, นศ.)
│   └── khun-noi.md                  ← คุณหน่อย (40, แม่เลี้ยงเดี่ยว)
├── hypotheses/
│   ├── 100-viral-hypotheses.md      ← from @doctorwaleerat analysis
│   └── 1000-clinic-hypotheses.md    ← from @waleeratclinic analysis
├── retention/
│   ├── curve-patterns.md            ← cliff, ski-slope, plateau, etc.
│   ├── bridge-techniques.md         ← 10 ranked techniques
│   └── benchmarks.md                ← thresholds by niche + length
├── legal/
│   ├── banned-words-15.md           ← แพทยสภา list
│   ├── tiktok-community-guidelines.md
│   └── suppressed-terms.md          ← TikTok medical content classifier
└── README.md                        ← vault overview + sync instructions
```

**No Obsidian plugins required.** Plain markdown files. Any editor works.

## 7. What Goes Where

| Content Type | Obsidian Vault | Supabase shared_memories |
|-------------|---------------|-------------------------|
| Research papers + findings | ✅ Human curates, links, annotates | ❌ |
| Hook formulas + playbooks | ✅ Human edits, version-controlled | ❌ |
| Agent-generated clip findings | ❌ | ✅ Auto-written by War Room |
| Video performance metrics | ❌ | ✅ video_performance table |
| RL preferences | ❌ | ✅ rl_preferences table |
| Patient personas (rich detail) | ✅ Multi-page markdown | Summary in shared_memories |
| Retention benchmarks | ✅ With citations + context | ✅ retention_benchmarks table |
| Legal compliance rules | ✅ Full reference docs | Summary in shared_memories |
| Emotional trigger library | ✅ Organized by category | ❌ |
| Topic hypotheses | ✅ Browsable, linkable | ❌ |

## 8. Sync Workflow

```
Daily (automated):
  1. cron runs: npm run sync-wiki
  2. obsidian-sync.ts reads vault
  3. Chunks changed files only (content_hash comparison)
  4. Generates embeddings for new/changed chunks
  5. Upserts to knowledge_base
  6. Logs: "Synced: 3 added, 1 updated, 0 deleted, 47 skipped"

On-demand (manual):
  Human edits vault → runs: npm run sync-wiki
  Or: Claude Code runs it when asked "sync the wiki"
```

## 9. Cost Estimate

| Component | Cost |
|-----------|------|
| OpenAI text-embedding-3-small | ~$0.02 per 1M tokens (~$0.001 per sync of 500 chunks) |
| Supabase pgvector | Included in existing plan (vector extension free) |
| Obsidian app | Free (personal use) |
| Storage | Negligible (~5MB for 500 chunks with embeddings) |
| **Total** | **~$0.03/month** |

## 10. Zero Breaking Changes

- All 36 MCP tools: unchanged
- `shared_memories` (130+ records): untouched
- RL engine: untouched
- War Room + Content Factory skills: untouched (they call `retrieveMemories()` which now returns more context)
- `memory-retriever.ts`: additive change only — new function added, existing function enhanced with optional vector search
- If pgvector unavailable: vector search returns empty, tag search continues working

## 11. Success Criteria

| Metric | Target |
|--------|--------|
| Vault files synced | 20+ initial .md files |
| knowledge_base chunks | 200-500 embedded chunks |
| Semantic search latency | <500ms per query |
| Agent context quality | Agents receive research-backed knowledge alongside pattern memories |
| Sync reliability | Nightly cron, zero manual intervention |
| No regression | All existing MCP tools + agents work identically |

## 12. Implementation Scope

### New files (3):
1. `src/p2p/obsidian-sync.ts` — vault → pgvector sync script (~150 lines)
2. `~/WhisperCUT-wiki/README.md` — vault setup instructions
3. Initial vault `.md` files (migrated from `docs/research/`)

### Modified files (2):
1. `src/p2p/memory-retriever.ts` — add `retrieveKnowledge()` + `retrieveAll()`
2. `package.json` — add `sync-wiki` script

### Database migrations (3):
1. Enable pgvector extension
2. Create `knowledge_base` table + indexes
3. Create `match_knowledge` RPC function

### NOT modified:
- All `src/agents/` code
- All `src/mcp/tools/` code
- All `.claude/skills/` files
- `shared_memories`, `rl_preferences`, `video_performance` tables
- RL engine, P2P worker, job queue
