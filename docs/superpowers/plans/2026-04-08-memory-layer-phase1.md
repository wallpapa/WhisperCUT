# Memory Layer Phase 1 (Mem0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cross-session agent memory to WhisperCUT using Mem0, so the cover design agent and vibe editor remember what works across sessions.

**Architecture:** Progressive Enhancement — a `MemoryLayer` wrapper with Mem0 + Supabase providers. Only 4 tools get enhanced; 35 legacy tools stay untouched. Mem0 stores natural-language insights, Supabase keeps structured RL weights.

**Tech Stack:** mem0ai (npm v2.4.6), @supabase/supabase-js (existing), TypeScript, Node.js 22

---

## File Structure

```
NEW:
  src/memory/types.ts                — Shared types (MemoryEvent, RecallQuery, MemoryInsight)
  src/memory/providers/mem0.ts       — Mem0 npm adapter (remember/recall via mem0ai)
  src/memory/providers/supabase.ts   — Bridge existing RL data into MemoryInsight format
  src/memory/memory-layer.ts         — Core API: remember() / recall() / reflect()

MODIFY:
  package.json                       — add mem0ai dependency
  src/mcp/tools/cover-design.ts      — recall() before generate, remember() after select
  src/mcp/server.ts                  — init memory layer on startup (1 line)
```

---

### Task 1: Install mem0ai + define shared types

**Files:**
- Modify: `package.json`
- Create: `src/memory/types.ts`

- [ ] **Step 1: Install mem0ai**

```bash
cd /Users/witsarutkrimthungthong/WhisperCUT
npm install mem0ai
```

Expected: `added 1 package` in package.json dependencies

- [ ] **Step 2: Create types.ts with all shared interfaces**

Create `src/memory/types.ts`:

```typescript
/**
 * Memory Layer — Shared Types
 *
 * Used by memory-layer.ts and all providers (mem0, supabase, telemem future)
 */

// ── Events (what happened — stored after user action) ─────────

export type MemoryEventType =
  | "cover_selected"
  | "cover_rejected"
  | "video_published"
  | "feedback_scored"
  | "style_studied";

export interface MemoryEvent {
  type: MemoryEventType;
  channel: string;
  topic: string;
  data: Record<string, unknown>;
}

// ── Queries (what do we know — asked before generation) ───────

export interface RecallQuery {
  channel: string;
  topic?: string;
  intent: string;
  limit?: number;
}

// ── Results ───────────────────────────────────────────────────

export type MemorySource = "mem0" | "supabase" | "telemem";
export type MemoryScope = "cross_channel" | "per_channel" | "per_topic";

export interface MemoryInsight {
  text: string;
  confidence: number;
  source: MemorySource;
  scope: MemoryScope;
}

export interface Pattern {
  pattern: string;
  frequency: number;
  channels: string[];
}

// ── Provider Interface ────────────────────────────────────────

export interface MemoryProvider {
  name: MemorySource;
  remember(event: MemoryEvent): Promise<void>;
  recall(query: RecallQuery): Promise<MemoryInsight[]>;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/memory/types.ts
git commit -m "feat(memory): add mem0ai dependency + shared types"
```

---

### Task 2: Mem0 provider adapter

**Files:**
- Create: `src/memory/providers/mem0.ts`

- [ ] **Step 1: Create Mem0 provider**

Create `src/memory/providers/mem0.ts`:

```typescript
/**
 * Mem0 Provider — Wraps mem0ai npm package
 *
 * Stores natural language insights about what works per channel/topic.
 * Uses Mem0's built-in vector search for recall.
 *
 * Config: MEM0_API_KEY env var (or uses Mem0 local mode if not set)
 */

import type { MemoryProvider, MemoryEvent, RecallQuery, MemoryInsight } from "../types.js";

// ── Mem0 Client ───────────────────────────────────────────────

let mem0Client: any = null;

function getMem0() {
  if (mem0Client) return mem0Client;

  try {
    // Dynamic import to avoid hard crash if mem0ai not installed
    const { MemoryClient } = require("mem0ai");
    const apiKey = process.env.MEM0_API_KEY;

    if (apiKey) {
      mem0Client = new MemoryClient({ apiKey });
    } else {
      // Local mode — no API key, uses in-memory storage
      mem0Client = new MemoryClient();
    }
    return mem0Client;
  } catch {
    return null;
  }
}

// ── Event → Mem0 Message ──────────────────────────────────────

function eventToMessages(event: MemoryEvent): Array<{ role: string; content: string }> {
  const { type, channel, topic, data } = event;

  switch (type) {
    case "cover_selected":
      return [
        { role: "user", content: `Generate cover for channel "${channel}", topic "${topic}"` },
        {
          role: "assistant",
          content: `Selected cover style: expression=${data.expression}, lighting=${data.lighting_mood}, `
            + `color_scheme=${data.color_scheme}, background=${data.background_type}. `
            + `This style won against ${data.rejected_count || 3} other variants.`,
        },
      ];

    case "cover_rejected":
      return [
        { role: "user", content: `Generate cover for channel "${channel}", topic "${topic}"` },
        {
          role: "assistant",
          content: `Cover style rejected: expression=${data.expression}, lighting=${data.lighting_mood}. `
            + `User feedback: ${data.feedback || "not selected"}`,
        },
      ];

    case "feedback_scored":
      return [
        { role: "user", content: `Evaluate video for channel "${channel}", topic "${topic}"` },
        {
          role: "assistant",
          content: `Video scored: hook=${data.hook_score}/10, pacing=${data.pacing_score}/10, `
            + `vibe="${data.vibe}", completion_rate=${data.completion_rate}%. `
            + `${data.passed ? "Passed QA gate." : "Failed QA gate — needs improvement."}`,
        },
      ];

    case "style_studied":
      return [
        { role: "user", content: `Study TikTok style for channel "${channel}"` },
        {
          role: "assistant",
          content: `Style DNA extracted: ${data.style_summary}. Top patterns: ${data.top_patterns}`,
        },
      ];

    default:
      return [
        { role: "user", content: `${type} for channel "${channel}", topic "${topic}"` },
        { role: "assistant", content: JSON.stringify(data).slice(0, 500) },
      ];
  }
}

// ── Provider Implementation ───────────────────────────────────

export const mem0Provider: MemoryProvider = {
  name: "mem0",

  async remember(event: MemoryEvent): Promise<void> {
    const client = getMem0();
    if (!client) return;

    const messages = eventToMessages(event);
    const userId = `channel:${event.channel}`;
    const metadata = {
      topic: event.topic,
      channel: event.channel,
      event_type: event.type,
      timestamp: new Date().toISOString(),
    };

    try {
      await client.add(messages, {
        user_id: userId,
        metadata,
      });
    } catch (e: any) {
      console.error(`[mem0] remember failed: ${e.message}`);
    }
  },

  async recall(query: RecallQuery): Promise<MemoryInsight[]> {
    const client = getMem0();
    if (!client) return [];

    const insights: MemoryInsight[] = [];

    try {
      // Level 1: Per-Topic (highest priority)
      if (query.topic) {
        const topicResults = await client.search(
          `${query.intent} for topic "${query.topic}"`,
          {
            user_id: `channel:${query.channel}`,
            limit: query.limit || 3,
          },
        );

        for (const r of topicResults?.results || topicResults || []) {
          insights.push({
            text: r.memory || r.text || String(r),
            confidence: r.score ?? 0.8,
            source: "mem0",
            scope: "per_topic",
          });
        }
      }

      // Level 2: Per-Channel
      const channelResults = await client.search(query.intent, {
        user_id: `channel:${query.channel}`,
        limit: query.limit || 3,
      });

      for (const r of channelResults?.results || channelResults || []) {
        const text = r.memory || r.text || String(r);
        // Avoid duplicates from topic search
        if (!insights.some(i => i.text === text)) {
          insights.push({
            text,
            confidence: r.score ?? 0.6,
            source: "mem0",
            scope: "per_channel",
          });
        }
      }

      // Level 3: Cross-Channel (search without user_id filter)
      const globalResults = await client.search(query.intent, {
        limit: 2,
      });

      for (const r of globalResults?.results || globalResults || []) {
        const text = r.memory || r.text || String(r);
        if (!insights.some(i => i.text === text)) {
          insights.push({
            text,
            confidence: r.score ?? 0.4,
            source: "mem0",
            scope: "cross_channel",
          });
        }
      }
    } catch (e: any) {
      console.error(`[mem0] recall failed: ${e.message}`);
    }

    // Sort: per_topic first, then per_channel, then cross_channel
    const scopeOrder: Record<string, number> = { per_topic: 0, per_channel: 1, cross_channel: 2 };
    return insights.sort((a, b) => (scopeOrder[a.scope] ?? 9) - (scopeOrder[b.scope] ?? 9));
  },
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add src/memory/providers/mem0.ts
git commit -m "feat(memory): Mem0 provider — remember/recall with 3-level scope"
```

---

### Task 3: Supabase bridge provider

**Files:**
- Create: `src/memory/providers/supabase.ts`

- [ ] **Step 1: Create Supabase bridge provider**

Create `src/memory/providers/supabase.ts`:

```typescript
/**
 * Supabase Bridge Provider — Reads existing RL data as MemoryInsights
 *
 * Bridges cover_preferences + rl_preferences → MemoryInsight format.
 * Read-only for recall; remember() is a no-op (RL writes handled by cover-design.ts).
 */

import { createClient } from "@supabase/supabase-js";
import type { MemoryProvider, MemoryEvent, RecallQuery, MemoryInsight } from "../types.js";

const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!,
  );
}

export const supabaseBridgeProvider: MemoryProvider = {
  name: "supabase",

  // No-op — RL writes are handled directly by cover-design.ts
  async remember(_event: MemoryEvent): Promise<void> {},

  async recall(query: RecallQuery): Promise<MemoryInsight[]> {
    const insights: MemoryInsight[] = [];

    try {
      const supabase = getSupabase();

      // Read cover_preferences for this channel
      const { data: prefs } = await supabase
        .from("cover_preferences")
        .select("dimension, value, win_rate, win_count, loss_count")
        .eq("channel", query.channel)
        .eq("user_email", USER_EMAIL)
        .order("win_rate", { ascending: false })
        .limit(query.limit || 10);

      if (prefs?.length) {
        // Group by dimension, take top value per dimension
        const topByDimension = new Map<string, typeof prefs[0]>();
        for (const p of prefs) {
          if (!topByDimension.has(p.dimension) && p.win_count > 0) {
            topByDimension.set(p.dimension, p);
          }
        }

        for (const [dim, pref] of topByDimension) {
          const total = pref.win_count + pref.loss_count;
          if (total < 2) continue; // Not enough data

          insights.push({
            text: `RL data: ${dim}="${pref.value}" has ${Math.round(pref.win_rate * 100)}% win rate (${total} samples) for channel "${query.channel}"`,
            confidence: Math.min(pref.win_rate, 0.95),
            source: "supabase",
            scope: "per_channel",
          });
        }
      }

      // Also check rl_preferences (general vibes/hooks)
      const { data: rlPrefs } = await supabase
        .from("rl_preferences")
        .select("dimension, value, win_rate, win_count, loss_count")
        .eq("user_email", USER_EMAIL)
        .order("win_rate", { ascending: false })
        .limit(5);

      if (rlPrefs?.length) {
        for (const p of rlPrefs) {
          const total = p.win_count + p.loss_count;
          if (total < 3) continue;

          insights.push({
            text: `Global RL: ${p.dimension}="${p.value}" wins ${Math.round(p.win_rate * 100)}% (${total} samples)`,
            confidence: Math.min(p.win_rate * 0.8, 0.7), // Lower confidence for global
            source: "supabase",
            scope: "cross_channel",
          });
        }
      }
    } catch (e: any) {
      console.error(`[supabase-bridge] recall failed: ${e.message}`);
    }

    return insights;
  },
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/memory/providers/supabase.ts
git commit -m "feat(memory): Supabase bridge — reads RL weights as MemoryInsights"
```

---

### Task 4: Core MemoryLayer

**Files:**
- Create: `src/memory/memory-layer.ts`

- [ ] **Step 1: Create the core memory layer**

Create `src/memory/memory-layer.ts`:

```typescript
/**
 * Memory Layer — Core API
 *
 * Unified interface over multiple memory providers.
 * remember() → fans out to all providers
 * recall() → merges results from all providers, sorted by scope priority
 * reflect() → aggregate cross-channel patterns (future: periodic cron)
 *
 * Progressive Enhancement: only enhanced tools use this.
 * Legacy tools continue using Supabase directly — zero breaking changes.
 */

import type { MemoryEvent, RecallQuery, MemoryInsight, MemoryProvider, Pattern } from "./types.js";
import { mem0Provider } from "./providers/mem0.js";
import { supabaseBridgeProvider } from "./providers/supabase.js";

// ── Singleton ─────────────────────────────────────────────────

let _instance: MemoryLayer | null = null;

export class MemoryLayer {
  private providers: MemoryProvider[] = [];

  constructor() {
    // Phase 1: Mem0 + Supabase bridge
    this.providers.push(mem0Provider);

    if (process.env.SUPABASE_URL) {
      this.providers.push(supabaseBridgeProvider);
    }

    console.error(
      `[memory-layer] Initialized with ${this.providers.length} providers: `
      + this.providers.map(p => p.name).join(", "),
    );
  }

  /** Store a memory event across all providers */
  async remember(event: MemoryEvent): Promise<void> {
    const results = await Promise.allSettled(
      this.providers.map(p => p.remember(event)),
    );

    const failed = results.filter(r => r.status === "rejected");
    if (failed.length > 0) {
      console.error(`[memory-layer] remember: ${failed.length}/${this.providers.length} providers failed`);
    }
  }

  /** Recall insights from all providers, merged and sorted by scope */
  async recall(query: RecallQuery): Promise<MemoryInsight[]> {
    const results = await Promise.allSettled(
      this.providers.map(p => p.recall(query)),
    );

    const allInsights: MemoryInsight[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        allInsights.push(...r.value);
      }
    }

    // Sort: per_topic > per_channel > cross_channel, then by confidence
    const scopeOrder: Record<string, number> = {
      per_topic: 0,
      per_channel: 1,
      cross_channel: 2,
    };

    return allInsights.sort((a, b) => {
      const scopeDiff = (scopeOrder[a.scope] ?? 9) - (scopeOrder[b.scope] ?? 9);
      if (scopeDiff !== 0) return scopeDiff;
      return b.confidence - a.confidence;
    });
  }

  /** Aggregate cross-channel patterns (simplified for Phase 1) */
  async reflect(channel?: string): Promise<Pattern[]> {
    // Phase 1: return empty — full reflection in Phase 2 with TeleMem
    return [];
  }

  /** Format insights as prompt text for injection into AI generation */
  formatForPrompt(insights: MemoryInsight[], maxInsights = 5): string {
    if (insights.length === 0) return "";

    const top = insights.slice(0, maxInsights);
    const lines = top.map((i, idx) => {
      const scopeTag = i.scope === "per_topic" ? "[TOPIC]"
        : i.scope === "per_channel" ? "[CHANNEL]"
        : "[GLOBAL]";
      return `${idx + 1}. ${scopeTag} ${i.text} (confidence: ${Math.round(i.confidence * 100)}%)`;
    });

    return `\n--- Memory Insights ---\n${lines.join("\n")}\n--- End Insights ---\n`;
  }

  /** Get provider count (for status display) */
  get providerCount(): number {
    return this.providers.length;
  }

  /** Get provider names */
  get providerNames(): string[] {
    return this.providers.map(p => p.name);
  }
}

/** Get or create singleton instance */
export function getMemoryLayer(): MemoryLayer {
  if (!_instance) {
    _instance = new MemoryLayer();
  }
  return _instance;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/memory/memory-layer.ts
git commit -m "feat(memory): MemoryLayer core — remember/recall/reflect with multi-provider merge"
```

---

### Task 5: Integrate into cover-design.ts

**Files:**
- Modify: `src/mcp/tools/cover-design.ts`

- [ ] **Step 1: Add import at top of cover-design.ts**

After the existing imports (line 11), add:

```typescript
import { getMemoryLayer } from "../../memory/memory-layer.js";
```

- [ ] **Step 2: Add recall() in handleGenerateCover**

In `handleGenerateCover`, after the Scene DNA generation (after `const category = detectTopicCategory(topic);`), add memory recall:

```typescript
  // 1.5 Recall memory insights
  const memory = getMemoryLayer();
  const insights = await memory.recall({
    channel,
    topic,
    intent: `best cover style for ${category} topic`,
    limit: 5,
  });

  const memoryContext = memory.formatForPrompt(insights);
  if (memoryContext) {
    console.error(`[cover-design] Memory recalled ${insights.length} insights`);
  }
```

- [ ] **Step 3: Add remember() in handleSelectCoverAI**

In `handleSelectCoverAI`, after the existing RL update loop (after `updatedDimensions++`), add memory storage:

```typescript
  // 3.5 Store selection in memory layer
  try {
    const memory = getMemoryLayer();
    const selectedVariant = variants.find((v: any) => v.label === selected);

    if (selectedVariant?.style) {
      await memory.remember({
        type: "cover_selected",
        channel,
        topic: gen.topic || "unknown",
        data: {
          ...selectedVariant.style,
          feedback,
          rejected_count: variants.length - 1,
        },
      });

      // Also remember rejections (lower weight)
      for (const v of variants) {
        if (v.label !== selected && v.style) {
          await memory.remember({
            type: "cover_rejected",
            channel,
            topic: gen.topic || "unknown",
            data: { ...v.style, feedback: "not selected" },
          });
        }
      }
    }
  } catch (e: any) {
    console.error(`[cover-design] Memory remember failed: ${e.message}`);
  }
```

- [ ] **Step 4: Add topic to cover_generations query**

In `handleSelectCoverAI`, change the Supabase select to include topic:

```typescript
    const { data: gen } = await supabase
      .from("cover_generations")
      .select("variants, topic")
      .eq("id", generation_id)
      .single();
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/mcp/tools/cover-design.ts
git commit -m "feat(memory): integrate recall/remember into cover-design agent"
```

---

### Task 6: Init memory layer in server.ts

**Files:**
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: Add import in server.ts**

After the cover-design import, add:

```typescript
// ── Memory Layer ────────────────────────────────────────────────
import { getMemoryLayer } from "../memory/memory-layer.js";
```

- [ ] **Step 2: Init in main() function**

In the `main()` function, after the agent registration block (after `const agentStats = getAgentStats();`), add:

```typescript
  // Init memory layer
  const memoryLayer = getMemoryLayer();
  console.error(`[memory] Layer ready: ${memoryLayer.providerNames.join(", ")} (${memoryLayer.providerCount} providers)`);
```

- [ ] **Step 3: Update version string**

Change the version in the console.error message:

```typescript
  console.error(`WhisperCUT MCP server v5.2.0 running — 39 tools + ${agentStats.total_agents} agents + memory layer ready`);
```

- [ ] **Step 4: Verify full compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/mcp/server.ts
git commit -m "feat(memory): init memory layer on MCP server startup"
```

---

### Task 7: Smoke test end-to-end

**Files:**
- No new files

- [ ] **Step 1: Run MCP server to verify startup**

```bash
timeout 5 npx tsx src/mcp/server.ts 2>&1 || true
```

Expected output should include:
```
[memory-layer] Initialized with 2 providers: mem0, supabase
[memory] Layer ready: mem0, supabase (2 providers)
WhisperCUT MCP server v5.2.0 running
```

- [ ] **Step 2: Test memory layer standalone**

```bash
node -e "
require('dotenv/config');
const { getMemoryLayer } = require('./dist/memory/memory-layer.js');
// If dist doesn't exist, use tsx:
" 2>&1 || npx tsx -e "
import 'dotenv/config';
import { getMemoryLayer } from './src/memory/memory-layer.js';

const mem = getMemoryLayer();
console.log('Providers:', mem.providerNames);

// Test remember
await mem.remember({
  type: 'cover_selected',
  channel: 'doctorwaleerat',
  topic: 'ลูกดูจอ',
  data: { expression: 'pointing', lighting_mood: 'warm_golden' },
});
console.log('Remember: OK');

// Test recall
const insights = await mem.recall({
  channel: 'doctorwaleerat',
  topic: 'ลูกดูจอ',
  intent: 'best cover style for medical topic',
});
console.log('Recall:', insights.length, 'insights');
for (const i of insights) {
  console.log('  -', i.scope, ':', i.text.slice(0, 80));
}
" 2>&1
```

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(memory): Phase 1 complete — Mem0 + Supabase bridge memory layer

Memory Layer v1.0:
- 3-level scope: per-topic > per-channel > cross-channel
- 2 providers: mem0 (insights), supabase (RL weights bridge)
- 4 tools enhanced: generate_cover, select_cover_ai, feedback, vibe_edit
- 35 legacy tools unchanged (zero breaking changes)
- Progressive Enhancement architecture (Approach C)

Success criteria ready to validate:
1. Cross-session memory (remember → recall across sessions)
2. Cover quality improvement (A-exploit win rate tracking)
3. Reduced manual repeat (preferences auto-loaded)"
```

---

## Verification Checklist

After all tasks complete, validate the 3 success criteria:

- [ ] **Test 1: Cross-Session Memory** — remember a cover selection, restart, recall it
- [ ] **Test 2: RL Boost** — generate covers, verify recalled insights influence variant ranking
- [ ] **Test 3: No Regressions** — run `npx tsc --noEmit` clean, MCP server starts normally
