/**
 * MemFactory Provider — GRPO-trained policy for cover/vibe optimization
 *
 * Phase 3: Loads trained GRPO policy weights to boost RL predictions.
 *
 * Architecture:
 *   1. rl-collector.ts captures selections → JSONL
 *   2. sidecar/train_grpo.py trains policy (cloud GPU or simple mode)
 *   3. This provider loads grpo_policy.json → boosts recall() insights
 *
 * Policy format (grpo_policy.json):
 *   { "channel:category": { "dimension": { "value": advantage_score } } }
 *
 * The provider is read-only for recall() — remember() is a no-op since
 * training happens offline via the GRPO script.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { MemoryProvider, MemoryEvent, RecallQuery, MemoryInsight } from "../types.js";
import { detectTopicCategory } from "../../engine/scene-dna.js";

// ── Policy Loading ────────────────────────────────────────────

type GRPOPolicy = Record<string, Record<string, Record<string, number>>>;

const POLICY_PATHS = [
  join(process.cwd(), "grpo_output/grpo_policy.json"),
  join(process.cwd(), "data/grpo_output/grpo_policy.json"),
  join(process.cwd(), "sidecar/grpo_output/grpo_policy.json"),
];

let _policy: GRPOPolicy | null = null;
let _policyLoaded = false;

function loadPolicy(): GRPOPolicy | null {
  if (_policyLoaded) return _policy;
  _policyLoaded = true;

  // Also check env var
  const envPath = process.env.GRPO_POLICY_PATH;
  const paths = envPath ? [envPath, ...POLICY_PATHS] : POLICY_PATHS;

  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const data = JSON.parse(readFileSync(p, "utf-8"));
        _policy = data;
        console.error(`[memfactory] Loaded GRPO policy from ${p}`);
        return _policy;
      } catch (e: any) {
        console.error(`[memfactory] Failed to load ${p}: ${e.message}`);
      }
    }
  }

  console.error("[memfactory] No GRPO policy found — Phase 3 inactive");
  return null;
}

// ── Provider Implementation ───────────────────────────────────

export const memFactoryProvider: MemoryProvider = {
  name: "telemem", // Reuse "telemem" source tag since MemFactory extends it

  // No-op — training happens offline
  async remember(_event: MemoryEvent): Promise<void> {},

  async recall(query: RecallQuery): Promise<MemoryInsight[]> {
    const policy = loadPolicy();
    if (!policy) return [];

    const insights: MemoryInsight[] = [];
    const category = query.topic ? detectTopicCategory(query.topic) : "medical";

    // Look up policy for this channel+category
    const key = `${query.channel}:${category}`;
    const groupPolicy = policy[key];

    if (!groupPolicy) return [];

    // Convert policy advantages to insights
    for (const [dimension, values] of Object.entries(groupPolicy)) {
      // Find best value for this dimension
      let bestValue = "";
      let bestScore = -Infinity;

      for (const [value, score] of Object.entries(values)) {
        if (score > bestScore) {
          bestScore = score;
          bestValue = value;
        }
      }

      if (bestValue && bestScore > 0) {
        insights.push({
          text: `GRPO policy: ${dimension}="${bestValue}" has advantage ${bestScore.toFixed(3)} for ${key}`,
          confidence: Math.min(0.5 + bestScore, 0.95), // Scale advantage → confidence
          source: "telemem", // Grouped under telemem source
          scope: "per_channel",
        });
      }
    }

    return insights;
  },
};

/** Check if a trained GRPO policy is available */
export function hasGRPOPolicy(): boolean {
  return loadPolicy() !== null;
}

/** Get policy stats */
export function getGRPOPolicyStats(): {
  loaded: boolean;
  groups: number;
  dimensions: number;
  path: string | null;
} {
  const policy = loadPolicy();
  if (!policy) return { loaded: false, groups: 0, dimensions: 0, path: null };

  const groups = Object.keys(policy).length;
  const dims = new Set<string>();
  for (const group of Object.values(policy)) {
    for (const dim of Object.keys(group)) dims.add(dim);
  }

  const path = POLICY_PATHS.find(p => existsSync(p)) || process.env.GRPO_POLICY_PATH || null;
  return { loaded: true, groups, dimensions: dims.size, path };
}
