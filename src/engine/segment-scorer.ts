/**
 * Segment Scorer -- AI scores every N-second chunk of footage
 *
 * Reads transcript segments and scores each for:
 *   - content_quality (0-10): is this interesting/valuable?
 *   - emotional_impact (0-10): does this evoke emotion?
 *   - hook_potential (0-10): could this be the video's hook?
 *   - dead_air (boolean): silence, throat clearing, filler words
 *
 * Uses aiGenerateJSON from ../ai/provider.js
 */

import { aiGenerateJSON } from "../ai/provider.js";

// ── Types ───────────────────────────────────────────────────────────────────

export type HormoneFit = "cortisol" | "dopamine" | "oxytocin" | "adrenaline" | "serotonin";
export type SegmentVerdict = "keep" | "cut" | "trim";

export interface ScoredSegment {
  start_sec: number;
  end_sec: number;
  text: string;
  content_quality: number;
  emotional_impact: number;
  hook_potential: number;
  dead_air: boolean;
  composite_score: number;
  verdict: SegmentVerdict;
  hormone_fit: HormoneFit;
}

interface TranscriptChunk {
  index: number;
  start: number;
  end: number;
  text: string;
}

interface AISegmentScore {
  index: number;
  content_quality: number;
  emotional_impact: number;
  hook_potential: number;
  dead_air: boolean;
  hormone_fit: string;
}

// ── Weights ─────────────────────────────────────────────────────────────────

const WEIGHT_CONTENT   = 0.4;
const WEIGHT_EMOTIONAL = 0.3;
const WEIGHT_HOOK      = 0.3;

const KEEP_THRESHOLD = 7;
const CUT_THRESHOLD  = 4;

const VALID_HORMONES: ReadonlySet<string> = new Set([
  "cortisol", "dopamine", "oxytocin", "adrenaline", "serotonin",
]);

// ── Chunk Builder ───────────────────────────────────────────────────────────

function buildChunks(
  segments: Array<{ start: number; end: number; text: string }>,
  chunkSec: number,
): TranscriptChunk[] {
  if (segments.length === 0) return [];

  const totalEnd = segments[segments.length - 1].end;
  const chunks: TranscriptChunk[] = [];
  let chunkIndex = 0;
  let windowStart = segments[0].start;

  while (windowStart < totalEnd) {
    const windowEnd = windowStart + chunkSec;
    const overlapping = segments.filter(
      (s) => s.start < windowEnd && s.end > windowStart,
    );
    const text = overlapping.map((s) => s.text).join(" ").trim();

    if (text.length > 0) {
      chunks.push({
        index: chunkIndex,
        start: Math.round(windowStart * 100) / 100,
        end: Math.round(Math.min(windowEnd, totalEnd) * 100) / 100,
        text,
      });
      chunkIndex++;
    }

    windowStart = windowEnd;
  }

  return chunks;
}

// ── Composite Score ─────────────────────────────────────────────────────────

function computeComposite(cq: number, ei: number, hp: number): number {
  const raw = cq * WEIGHT_CONTENT + ei * WEIGHT_EMOTIONAL + hp * WEIGHT_HOOK;
  return Math.round(raw * 100) / 100;
}

function verdictFromScore(score: number): SegmentVerdict {
  if (score >= KEEP_THRESHOLD) return "keep";
  if (score >= CUT_THRESHOLD) return "trim";
  return "cut";
}

function sanitizeHormone(h: string): HormoneFit {
  const lower = h.toLowerCase().trim();
  if (VALID_HORMONES.has(lower)) return lower as HormoneFit;
  return "dopamine"; // safe default
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ── AI Scoring ──────────────────────────────────────────────────────────────

/**
 * Score every N-second chunk of a transcript using AI.
 *
 * @param transcript - Array of { start, end, text } segments from Whisper
 * @param topic      - Video topic hint for AI context
 * @param chunkSec   - Chunk window in seconds (default 5)
 */
export async function scoreSegments(
  transcript: Array<{ start: number; end: number; text: string }>,
  topic: string,
  chunkSec: number = 5,
): Promise<ScoredSegment[]> {
  const chunks = buildChunks(transcript, chunkSec);

  if (chunks.length === 0) {
    return [];
  }

  const chunkList = chunks
    .map((c) => `[${c.index}] (${c.start}s-${c.end}s): "${c.text}"`)
    .join("\n");

  const prompt = `You are a professional TikTok/Reels video editor analyzing raw footage transcript.

TOPIC: "${topic}"

Below are ${chunks.length} transcript chunks from raw footage.
Score EACH chunk for editing decisions.

TRANSCRIPT CHUNKS:
${chunkList}

SCORING CRITERIA (0-10 each):
- content_quality: Is this chunk interesting, informative, or valuable to the viewer? (10=extremely valuable, 0=useless filler)
- emotional_impact: Does this evoke emotion — surprise, empathy, excitement, curiosity? (10=strong emotional response, 0=flat/boring)
- hook_potential: Could this chunk work as the video's opening hook to stop the scroll? (10=perfect hook, 0=terrible opener)
- dead_air: Is this mostly silence, "uhh", "umm", throat clearing, or filler? (true=dead air, false=real content)

HORMONE FIT — which part of the 5-hormone TikTok arc does this chunk best serve?
The 5-hormone arc for viral short-form video:
  1. cortisol (0-3s): Stress/urgency hook — grabs attention through threat or curiosity gap
  2. dopamine (3-15s): Reward anticipation — promises value, "here's what you'll learn"
  3. oxytocin (15-40s): Trust/connection — story, empathy, personal experience
  4. adrenaline (40-55s): Excitement peak — revelation, twist, key insight
  5. serotonin (55-60s): Satisfaction — resolution, CTA, "follow for more"

Assign the BEST hormone_fit for each chunk based on its emotional tone.

Respond in JSON array only (no markdown, no explanation):
[
  { "index": 0, "content_quality": 8, "emotional_impact": 7, "hook_potential": 9, "dead_air": false, "hormone_fit": "cortisol" },
  ...
]`;

  const aiScores = await aiGenerateJSON<AISegmentScore[]>(prompt, {
    system: "You are a video editing AI. Respond with valid JSON array only.",
    maxTokens: Math.max(4096, chunks.length * 120),
  });

  // Build a lookup map from AI results
  const scoreMap = new Map<number, AISegmentScore>();
  if (Array.isArray(aiScores)) {
    for (const s of aiScores) {
      if (typeof s.index === "number") {
        scoreMap.set(s.index, s);
      }
    }
  }

  // Merge AI scores with chunk data
  const scored: ScoredSegment[] = chunks.map((chunk) => {
    const ai = scoreMap.get(chunk.index);

    const content_quality  = clamp(ai?.content_quality  ?? 5, 0, 10);
    const emotional_impact = clamp(ai?.emotional_impact ?? 5, 0, 10);
    const hook_potential   = clamp(ai?.hook_potential   ?? 3, 0, 10);
    const dead_air         = ai?.dead_air ?? false;
    const hormone_fit      = sanitizeHormone(ai?.hormone_fit ?? "dopamine");

    // Dead air segments get score penalty
    const effectiveCQ = dead_air ? Math.min(content_quality, 2) : content_quality;
    const composite   = computeComposite(effectiveCQ, emotional_impact, hook_potential);

    return {
      start_sec: chunk.start,
      end_sec: chunk.end,
      text: chunk.text,
      content_quality: effectiveCQ,
      emotional_impact,
      hook_potential,
      dead_air,
      composite_score: composite,
      verdict: dead_air ? "cut" as const : verdictFromScore(composite),
      hormone_fit,
    };
  });

  return scored;
}

// ── Best Hook Finder ────────────────────────────────────────────────────────

/**
 * Find the segment with the highest hook potential.
 * Prefers non-dead-air segments. Falls back to first segment if all are dead air.
 */
export function findBestHook(segments: ScoredSegment[]): ScoredSegment {
  if (segments.length === 0) {
    throw new Error("[segment-scorer] Cannot find hook in empty segment list");
  }

  const candidates = segments.filter((s) => !s.dead_air);
  const pool = candidates.length > 0 ? candidates : segments;

  let best = pool[0];
  for (const s of pool) {
    if (s.hook_potential > best.hook_potential) {
      best = s;
    } else if (
      s.hook_potential === best.hook_potential &&
      s.composite_score > best.composite_score
    ) {
      best = s;
    }
  }

  return best;
}
