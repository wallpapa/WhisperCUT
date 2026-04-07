/**
 * Smart Cutter -- Reorder segments into hormone arc
 *
 * Takes scored segments -> filters keeps -> reorders:
 *   1. Hook (highest hook_potential, cortisol)
 *   2. Problem (dopamine segments)
 *   3. Story (oxytocin segments)
 *   4. Revelation (adrenaline segments)
 *   5. CTA (serotonin, auto-generated if missing)
 *
 * Trims to target duration (default 60s)
 */

import { type ScoredSegment, findBestHook } from "./segment-scorer.js";

// ── Types ───────────────────────────────────────────────────────────────────

export type ArcLabel = "hook" | "problem" | "story" | "revelation" | "cta";
export type TransitionType = "hard_cut" | "l_cut" | "zoom_punch";

export interface CutPlanSegment {
  original_start: number;
  original_end: number;
  new_start: number;
  new_end: number;
  label: ArcLabel;
  hormone: string;
  text: string;
  transition: TransitionType;
}

export interface CutPlan {
  segments: CutPlanSegment[];
  total_duration: number;
  segments_kept: number;
  segments_cut: number;
  hook_text: string;
}

// ── Hormone -> Arc Label Mapping ────────────────────────────────────────────

const HORMONE_TO_LABEL: Record<string, ArcLabel> = {
  cortisol:   "hook",
  dopamine:   "problem",
  oxytocin:   "story",
  adrenaline: "revelation",
  serotonin:  "cta",
};

const LABEL_TO_TRANSITION: Record<ArcLabel, TransitionType> = {
  hook:       "hard_cut",
  problem:    "hard_cut",
  story:      "l_cut",
  revelation: "zoom_punch",
  cta:        "hard_cut",
};

// Arc ordering: determines the sequence segments appear in the final video
const ARC_ORDER: readonly ArcLabel[] = [
  "hook",
  "problem",
  "story",
  "revelation",
  "cta",
] as const;

// ── Duration Budgets (as fraction of target) ────────────────────────────────

const BUDGET_PCT: Record<ArcLabel, number> = {
  hook:       0.05,  //  ~3s of 60s
  problem:    0.20,  // ~12s
  story:      0.40,  // ~24s
  revelation: 0.25,  // ~15s
  cta:        0.10,  //  ~6s
};

// ── Bucket Builder ──────────────────────────────────────────────────────────

interface Bucket {
  label: ArcLabel;
  segments: ScoredSegment[];
  budget_sec: number;
}

function buildBuckets(
  kept: ScoredSegment[],
  targetDuration: number,
): Map<ArcLabel, Bucket> {
  const buckets = new Map<ArcLabel, Bucket>();

  for (const label of ARC_ORDER) {
    buckets.set(label, {
      label,
      segments: [],
      budget_sec: Math.round(targetDuration * BUDGET_PCT[label]),
    });
  }

  // Distribute segments into hormone buckets
  for (const seg of kept) {
    const label = HORMONE_TO_LABEL[seg.hormone_fit] ?? "story";
    const bucket = buckets.get(label)!;
    bucket.segments.push(seg);
  }

  // Sort each bucket: highest composite first
  for (const bucket of buckets.values()) {
    bucket.segments.sort((a, b) => b.composite_score - a.composite_score);
  }

  return buckets;
}

// ── Segment Selection ───────────────────────────────────────────────────────

/**
 * Select segments from a bucket up to the budget, preferring higher scores.
 * Returns selected segments in their original chronological order.
 */
function selectFromBucket(bucket: Bucket): ScoredSegment[] {
  const selected: ScoredSegment[] = [];
  let remaining = bucket.budget_sec;

  for (const seg of bucket.segments) {
    const segDuration = seg.end_sec - seg.start_sec;
    if (segDuration <= remaining) {
      selected.push(seg);
      remaining -= segDuration;
    }
    if (remaining <= 0) break;
  }

  // Sort by original start time to maintain narrative coherence within each arc beat
  selected.sort((a, b) => a.start_sec - b.start_sec);
  return selected;
}

// ── Default CTA ─────────────────────────────────────────────────────────────

function createDefaultCTA(
  startSec: number,
  budgetSec: number,
): ScoredSegment {
  return {
    start_sec: startSec,
    end_sec: startSec + budgetSec,
    text: "กดติดตามเพื่อรับเทคนิคใหม่ทุกสัปดาห์",
    content_quality: 6,
    emotional_impact: 5,
    hook_potential: 2,
    dead_air: false,
    composite_score: 5.0,
    verdict: "keep",
    hormone_fit: "serotonin",
  };
}

// ── Main Cut Plan Generator ─────────────────────────────────────────────────

/**
 * Generate a cut plan: filter kept segments, reorder into hormone arc,
 * trim to target duration, and assign transitions.
 *
 * @param scored          - All scored segments from segment-scorer
 * @param targetDuration  - Target output duration in seconds (default: 60)
 */
export function generateCutPlan(
  scored: ScoredSegment[],
  targetDuration: number = 60,
): CutPlan {
  // ── Filter: keep + trim segments ──────────────────────────────────────
  const kept = scored.filter((s) => s.verdict === "keep" || s.verdict === "trim");
  const cutCount = scored.length - kept.length;

  if (kept.length === 0) {
    // Nothing usable -- return empty plan
    return {
      segments: [],
      total_duration: 0,
      segments_kept: 0,
      segments_cut: scored.length,
      hook_text: "",
    };
  }

  // ── Find best hook before bucketing ───────────────────────────────────
  const bestHook = findBestHook(kept);

  // ── Build hormone buckets ─────────────────────────────────────────────
  const buckets = buildBuckets(kept, targetDuration);

  // Ensure the best hook is in the hook bucket (move it if AI labeled it differently)
  const hookBucket = buckets.get("hook")!;
  const hookAlreadyInBucket = hookBucket.segments.some(
    (s) => s.start_sec === bestHook.start_sec && s.end_sec === bestHook.end_sec,
  );
  if (!hookAlreadyInBucket) {
    // Remove from its current bucket
    for (const bucket of buckets.values()) {
      const idx = bucket.segments.findIndex(
        (s) => s.start_sec === bestHook.start_sec && s.end_sec === bestHook.end_sec,
      );
      if (idx !== -1) {
        bucket.segments.splice(idx, 1);
        break;
      }
    }
    hookBucket.segments.unshift(bestHook);
  }

  // ── Select segments per bucket ────────────────────────────────────────
  const selectedByLabel = new Map<ArcLabel, ScoredSegment[]>();
  for (const [label, bucket] of buckets) {
    selectedByLabel.set(label, selectFromBucket(bucket));
  }

  // ── Ensure CTA exists ─────────────────────────────────────────────────
  const ctaSelected = selectedByLabel.get("cta")!;
  if (ctaSelected.length === 0) {
    const ctaBudget = buckets.get("cta")!.budget_sec;
    // We'll set the actual start time during sequential layout below
    ctaSelected.push(createDefaultCTA(0, ctaBudget));
  }

  // ── Assemble in arc order + assign sequential timestamps ──────────────
  const planSegments: CutPlanSegment[] = [];
  let cursor = 0;

  for (const label of ARC_ORDER) {
    const segs = selectedByLabel.get(label) ?? [];
    const transition = LABEL_TO_TRANSITION[label];

    for (const seg of segs) {
      const segDuration = seg.end_sec - seg.start_sec;
      planSegments.push({
        original_start: seg.start_sec,
        original_end: seg.end_sec,
        new_start: Math.round(cursor * 100) / 100,
        new_end: Math.round((cursor + segDuration) * 100) / 100,
        label,
        hormone: seg.hormone_fit,
        text: seg.text,
        transition,
      });
      cursor += segDuration;
    }
  }

  // ── Trim from the end if over target ──────────────────────────────────
  while (planSegments.length > 1 && cursor > targetDuration) {
    const last = planSegments[planSegments.length - 1];
    // Never trim the hook (first segment) or the CTA (last arc beat)
    if (last.label === "hook") break;

    // Try removing the last non-CTA segment
    const removeIdx = findLastNonCTAIndex(planSegments);
    if (removeIdx === -1) break;

    const removed = planSegments.splice(removeIdx, 1)[0];
    const removedDuration = removed.new_end - removed.new_start;
    cursor -= removedDuration;

    // Recalculate sequential timestamps after removal
    recalculateTimestamps(planSegments);
    cursor = planSegments.length > 0
      ? planSegments[planSegments.length - 1].new_end
      : 0;
  }

  const totalKept = planSegments.length;
  const hookText = planSegments.length > 0 ? planSegments[0].text : "";

  return {
    segments: planSegments,
    total_duration: Math.round(cursor * 100) / 100,
    segments_kept: totalKept,
    segments_cut: cutCount + (kept.length - totalKept),
    hook_text: hookText,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function findLastNonCTAIndex(segments: CutPlanSegment[]): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].label !== "cta" && segments[i].label !== "hook") {
      return i;
    }
  }
  return -1;
}

function recalculateTimestamps(segments: CutPlanSegment[]): void {
  let cursor = 0;
  for (const seg of segments) {
    const duration = seg.original_end - seg.original_start;
    seg.new_start = Math.round(cursor * 100) / 100;
    seg.new_end = Math.round((cursor + duration) * 100) / 100;
    cursor += duration;
  }
}
