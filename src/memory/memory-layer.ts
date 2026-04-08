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
import { teleMemProvider, isTeleMemAvailable } from "./providers/telemem.js";
import { memFactoryProvider, hasGRPOPolicy } from "./providers/memfactory.js";

// ── Singleton ─────────────────────────────────────────────────

let _instance: MemoryLayer | null = null;

export class MemoryLayer {
  private providers: MemoryProvider[] = [];

  private _initPromise: Promise<void> | null = null;

  constructor() {
    // Phase 1: Mem0 + Supabase bridge (sync — always available)
    this.providers.push(mem0Provider);

    if (process.env.SUPABASE_URL) {
      this.providers.push(supabaseBridgeProvider);
    }

    // Phase 2: TeleMem + Phase 3: MemFactory (async init)
    this._initPromise = this._initAsync();
  }

  private async _initAsync() {
    // Phase 2: TeleMem video memory (if sidecar running)
    try {
      const teleMemReady = await isTeleMemAvailable();
      if (teleMemReady) {
        this.providers.push(teleMemProvider);
      }
    } catch {}

    // Phase 3: MemFactory GRPO policy (if trained policy exists)
    try {
      if (hasGRPOPolicy()) {
        this.providers.push(memFactoryProvider);
      }
    } catch {}

    console.error(
      `[memory-layer] Initialized with ${this.providers.length} providers: `
      + this.providers.map(p => p.name).join(", "),
    );
  }

  /** Wait for async providers to finish init */
  async ready(): Promise<void> {
    if (this._initPromise) await this._initPromise;
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
