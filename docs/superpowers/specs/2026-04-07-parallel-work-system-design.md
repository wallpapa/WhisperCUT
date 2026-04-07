# Parallel Work System — Design Spec

**Date**: 2026-04-07
**Approach**: Git Worktree + Supabase Task Board (Approach A+C hybrid)

## Problem

WhisperCUT has 5+ pending features that are independent of each other. Currently, features are built sequentially — one at a time. This wastes time when multiple agents (Claude sessions, collaborators) could work in parallel.

## Solution

A 3-layer parallel work system:
- **Layer 1**: Multi-agent development — multiple Claude Code sessions build different features simultaneously using git worktrees
- **Layer 2**: Pipeline parallelism — WhisperCUT processes multiple content topics concurrently
- **Layer 3**: User parallel workflows — multiple collaborators work on different parts of the content pipeline simultaneously

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: Multi-Agent Development                           │
│                                                              │
│  Orchestrator (main session)                                │
│       │                                                      │
│       ├── worktree/tavily       → Agent: Tavily research    │
│       ├── worktree/memfactory   → Agent: Memory impl        │
│       ├── worktree/tiktok-biz   → Agent: TikTok Biz API    │
│       └── worktree/content-pipe → Agent: Pipeline parallel  │
│                                                              │
│  Coordination: Supabase parallel_tasks table                │
│  Conflict prevention: agents don't touch server.ts          │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2: Pipeline Parallelism                              │
│                                                              │
│  content_topics table (7 ready topics)                      │
│       ├── Topic 1 → [research → script → voice → render]   │
│       ├── Topic 2 → [research → script → voice → render]   │
│       └── Topic 3 → [research → script → voice → render]   │
│                                                              │
│  Concurrent: up to 3 topics (rate limit aware)              │
├─────────────────────────────────────────────────────────────┤
│  LAYER 3: User Parallel Workflows                           │
│                                                              │
│  wallpapa  → คิดหัวข้อ + research + QA                      │
│  waleerat  → เขียน script + ถ่าย + publish                  │
│                                                              │
│  Shared state: content_topics + shared_memories (Supabase)  │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### `parallel_tasks` table

```sql
CREATE TABLE parallel_tasks (
  id              BIGSERIAL PRIMARY KEY,
  task_id         TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  description     TEXT,
  branch_name     TEXT NOT NULL,
  status          TEXT DEFAULT 'queued',
  assigned_to     TEXT,
  priority        INT DEFAULT 3,
  files_to_create TEXT[] DEFAULT '{}',
  files_to_modify TEXT[] DEFAULT '{}',
  depends_on      TEXT[] DEFAULT '{}',
  progress_pct    INT DEFAULT 0,
  log             JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

Status flow: `queued → claimed → in_progress → review → merged | failed`

## Conflict Prevention Protocol

`server.ts` is modified by every feature (register new tools). This is the primary conflict zone.

**Rule**: Agents create new files only. They export tool definitions + handlers. Only the orchestrator modifies `server.ts` at merge time.

Agent workflow:
1. Claim task from `parallel_tasks`
2. Create git worktree branch (`feat/tavily`, `feat/memfactory`, etc.)
3. Implement in new files under `src/p2p/` and `src/mcp/tools/`
4. Export tool definitions and handler functions
5. Do NOT modify `server.ts`, `provider.ts`, or other shared files
6. Mark task status = `review`

Orchestrator merge workflow:
1. Review agent's branch (code review)
2. Wire new tools into `server.ts` (add imports + register)
3. `npm run build` — verify clean compile
4. E2E test
5. Merge to main, update task status = `merged`

## 5 Parallel Tasks

### Task 1: `tavily` (Priority 1)
- **Purpose**: Tavily API for deep topic research + paper discovery. Replace WebSearch with structured research.
- **New files**: `src/p2p/tavily.ts`, `src/mcp/tools/research.ts`
- **Env**: `TAVILY_API_KEY`
- **New tools**: `whispercut_research_topic`, `whispercut_find_research`
- **Dependencies**: None
- **Output**: Research results saved to `shared_memories` + `content_topics`

### Task 2: `memfactory-impl` (Priority 2)
- **Purpose**: Complete the Memfactory spec — wire `extractFromFeedback()` and `extractFromStudy()` into existing tools. Add weekly cron updater.
- **Modify**: `src/mcp/tools/feedback.ts`, `src/mcp/tools/study.ts`
- **New files**: `src/p2p/memory-cron.ts`
- **Dependencies**: None (shared_memories table already exists)

### Task 3: `tiktok-biz` (Priority 2)
- **Purpose**: Replace session cookie scraping with official TikTok Business API. Get completion_rate + avg_watch_time not available via scraping.
- **New files**: `src/p2p/tiktok-biz-api.ts`
- **Modify**: `src/p2p/tiktok-tracker.ts` (add official API as primary, session as fallback)
- **Env**: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_ACCESS_TOKEN`
- **Dependencies**: None

### Task 4: `content-pipeline` (Priority 3)
- **Purpose**: Process multiple content topics concurrently (up to 3). Rate-limit aware.
- **Modify**: `src/agent/pipeline.ts`, `src/agent/scheduler.ts`
- **New files**: `src/agent/parallel-runner.ts`
- **Dependencies**: None

### Task 5: `content-workflow` (Priority 3)
- **Purpose**: Let users claim topics, write scripts, and track production status. Enables wallpapa + waleerat to work on different parts simultaneously.
- **New files**: `src/mcp/tools/content-workflow.ts`
- **New tools**: `whispercut_claim_topic`, `whispercut_write_script`, `whispercut_production_status`
- **Dependencies**: Loosely depends on `content-pipeline` for status tracking

### Dependency Graph

```
tavily ──────────────┐
                     │
memfactory-impl ─────┼──→ merge to main (independent, any order)
                     │
tiktok-biz ──────────┤
                     │
content-pipeline ────┘
         │
content-workflow ────→ (merge after content-pipeline)
```

## Orchestrator MCP Tools

3 new tools for managing parallel work:

### `whispercut_parallel_status`
Show all tasks, progress percentage, who is working on what, and any blockers.

### `whispercut_parallel_dispatch`
Assign a task to an agent or worktree. Creates the git branch, updates task status, and provides the agent with its instructions.

### `whispercut_parallel_merge`
Review a completed task branch, wire tools into server.ts, build, test, and merge to main.

## New Tools Summary

| Layer | New Tools | Total |
|-------|-----------|-------|
| Orchestrator | `parallel_status`, `parallel_dispatch`, `parallel_merge` | 3 |
| Tavily Research | `research_topic`, `find_research` | 2 |
| Content Workflow | `claim_topic`, `write_script`, `production_status` | 3 |
| **Total new** | | **8** |
| **Grand total** | 21 existing + 8 new | **29 tools** |

## Verification Plan

1. Create `parallel_tasks` table in Supabase with 5 tasks pre-loaded
2. Dispatch Task 1 (tavily) to a worktree agent — verify isolation
3. Dispatch Task 3 (tiktok-biz) to another agent simultaneously
4. Both agents complete — orchestrator merges both to main
5. `npm run build` clean after merge
6. `whispercut_parallel_status` shows correct state throughout
