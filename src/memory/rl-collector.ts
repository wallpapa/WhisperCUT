/**
 * RL Data Collector — Captures production events into GRPO training format
 *
 * Phase 3 prep: collects cover selections, feedback scores, and video metrics
 * into a training-ready JSONL format for MemFactory GRPO optimization.
 *
 * Data flow:
 *   User selection → RLCollector.record() → JSONL file + Supabase
 *   Later: JSONL → MemFactory GRPO training (cloud GPU)
 *   Result: trained policy → MemoryLayer provider
 *
 * Training data format (MemFactory-compatible):
 *   { "input": <context>, "output": <action>, "reward": <score> }
 */

import { createClient } from "@supabase/supabase-js";
import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// ── Types ─────────────────────────────────────────────────────

export interface RLTrainingExample {
  /** Unique ID for this example */
  id: string;
  /** Timestamp */
  timestamp: string;
  /** Channel this data belongs to */
  channel: string;

  /** Input context (what the agent saw before deciding) */
  input: {
    topic: string;
    category: string;
    channel: string;
    /** Memory insights available at decision time */
    memory_context: string[];
    /** RL preferences at decision time */
    rl_weights: Record<string, Record<string, number>>;
  };

  /** Output action (what the agent chose) */
  output: {
    /** Which variant strategy was selected */
    strategy: string;
    /** Style dimensions of the selected variant */
    style: Record<string, string>;
    /** Which variant label (A/B/C/D) */
    variant_label: string;
  };

  /** Reward signal */
  reward: {
    /** Was this variant selected by user? +1 selected, -0.25 rejected */
    selection_score: number;
    /** QA feedback score if available (0-10) */
    feedback_score?: number;
    /** TikTok performance if available */
    tiktok_views?: number;
    tiktok_completion_rate?: number;
    /** Composite reward (weighted sum) */
    composite: number;
  };

  /** Metadata for filtering/grouping */
  meta: {
    model: string;
    quiet_luxury: boolean;
    generation_id?: number;
  };
}

// ── Config ────────────────────────────────────────────────────

const DATA_DIR = join(process.cwd(), "data/rl-training");
const JSONL_FILE = join(DATA_DIR, "cover_selections.jsonl");

const REWARD_WEIGHTS = {
  selection: 0.5,    // user picked this variant
  feedback: 0.3,     // QA score (normalized 0-1)
  performance: 0.2,  // TikTok metrics (normalized 0-1)
};

// ── Reward Computation ────────────────────────────────────────

export function computeReward(params: {
  selected: boolean;
  feedbackScore?: number;
  tiktokViews?: number;
  tiktokCompletionRate?: number;
}): { composite: number; breakdown: Record<string, number> } {
  const { selected, feedbackScore, tiktokViews, tiktokCompletionRate } = params;

  // Selection reward: +1 if selected, -0.25 if rejected
  const selectionReward = selected ? 1.0 : -0.25;

  // Feedback reward: normalize 0-10 → 0-1
  const feedbackReward = feedbackScore != null ? feedbackScore / 10 : 0.5;

  // Performance reward: normalize views + completion
  let perfReward = 0.5; // neutral default
  if (tiktokCompletionRate != null) {
    perfReward = Math.min(tiktokCompletionRate / 100, 1.0);
  } else if (tiktokViews != null) {
    // Log-scale normalization: 1K=0.3, 10K=0.5, 100K=0.7, 1M=0.9
    perfReward = Math.min(Math.log10(Math.max(tiktokViews, 1)) / 7, 1.0);
  }

  const composite =
    REWARD_WEIGHTS.selection * selectionReward +
    REWARD_WEIGHTS.feedback * feedbackReward +
    REWARD_WEIGHTS.performance * perfReward;

  return {
    composite: Math.round(composite * 1000) / 1000,
    breakdown: {
      selection: selectionReward,
      feedback: feedbackReward,
      performance: perfReward,
    },
  };
}

// ── Data Collection ───────────────────────────────────────────

/** Record a training example to JSONL file + optional Supabase */
export async function recordTrainingExample(example: RLTrainingExample): Promise<void> {
  // 1. Append to local JSONL file
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const line = JSON.stringify(example) + "\n";
  appendFileSync(JSONL_FILE, line);

  // 2. Store in Supabase (if available)
  if (process.env.SUPABASE_URL) {
    try {
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!,
      );
      await supabase.from("rl_training_data").insert({
        example_id: example.id,
        channel: example.channel,
        input_json: JSON.stringify(example.input),
        output_json: JSON.stringify(example.output),
        reward_composite: example.reward.composite,
        reward_json: JSON.stringify(example.reward),
        meta_json: JSON.stringify(example.meta),
        created_at: example.timestamp,
      });
    } catch (e: any) {
      // Non-fatal — JSONL file is the primary store
      console.error(`[rl-collector] Supabase write failed: ${e.message?.slice(0, 80)}`);
    }
  }
}

// ── Convenience: Record from Cover Selection ──────────────────

/** Create training examples from a cover generation + selection event */
export async function recordCoverSelection(params: {
  channel: string;
  topic: string;
  category: string;
  variants: Array<{
    label: string;
    strategy: string;
    style: Record<string, string>;
  }>;
  selectedLabel: string;
  model: string;
  quietLuxury: boolean;
  generationId?: number;
  memoryContext?: string[];
  rlWeights?: Record<string, Record<string, number>>;
  feedbackScore?: number;
}): Promise<number> {
  const {
    channel, topic, category, variants, selectedLabel,
    model, quietLuxury, generationId,
    memoryContext = [], rlWeights = {},
    feedbackScore,
  } = params;

  const timestamp = new Date().toISOString();
  let recorded = 0;

  for (const variant of variants) {
    const isSelected = variant.label === selectedLabel;
    const { composite } = computeReward({ selected: isSelected, feedbackScore });

    const example: RLTrainingExample = {
      id: `${Date.now()}-${variant.label}`,
      timestamp,
      channel,
      input: {
        topic,
        category,
        channel,
        memory_context: memoryContext,
        rl_weights: rlWeights,
      },
      output: {
        strategy: variant.strategy,
        style: variant.style,
        variant_label: variant.label,
      },
      reward: {
        selection_score: isSelected ? 1.0 : -0.25,
        feedback_score: feedbackScore,
        composite,
      },
      meta: {
        model,
        quiet_luxury: quietLuxury,
        generation_id: generationId,
      },
    };

    await recordTrainingExample(example);
    recorded++;
  }

  return recorded;
}

// ── Stats ─────────────────────────────────────────────────────

/** Get training data stats */
export function getTrainingStats(): {
  file: string;
  exists: boolean;
  lineCount: number;
  sizeKB: number;
} {
  if (!existsSync(JSONL_FILE)) {
    return { file: JSONL_FILE, exists: false, lineCount: 0, sizeKB: 0 };
  }

  const { readFileSync, statSync } = require("fs");
  const content = readFileSync(JSONL_FILE, "utf-8");
  const lines = content.trim().split("\n").filter((l: string) => l.length > 0);
  const stats = statSync(JSONL_FILE);

  return {
    file: JSONL_FILE,
    exists: true,
    lineCount: lines.length,
    sizeKB: Math.round(stats.size / 1024),
  };
}
