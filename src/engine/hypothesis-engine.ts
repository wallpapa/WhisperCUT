/**
 * Hypothesis Engine — Evidence-Based Content Ideation
 *
 * Generates testable hypotheses from 3 sources:
 *   1. Own data (RL preferences + past performance) — weight 0.5
 *   2. Competitor analysis (TeleMem video memory) — weight 0.3
 *   3. Research (Tavily + PubMed) — weight 0.2
 *
 * Lifecycle: GENERATE → PREDICT → TEST → VALIDATE → CONFIRM/REJECT
 *
 * Part of DARWIN Engine Phase 1: Ideation
 */

import { createClient } from "@supabase/supabase-js";
import { getMemoryLayer } from "../memory/memory-layer.js";
import { aiGenerateJSON } from "../ai/provider.js";
import { z } from "zod";

// ── Types ─────────────────────────────────────────────────────

export const HypothesisSchema = z.object({
  id: z.string(),
  statement: z.string(),
  topic: z.string(),
  vibe: z.string(),
  channel: z.string(),
  prediction: z.object({
    metric: z.enum(["views", "completion_rate", "shares", "saves"]),
    target: z.number(),
    confidence: z.number().min(0).max(1),
  }),
  evidence: z.object({
    own_data: z.array(z.string()),
    competitor: z.array(z.string()),
    research: z.array(z.string()),
  }),
  status: z.enum(["active", "testing", "confirmed", "rejected"]),
  test_count: z.number(),
  results: z.array(z.object({
    clip_id: z.string(),
    actual: z.number(),
    date: z.string(),
  })),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Hypothesis = z.infer<typeof HypothesisSchema>;

// ── Source Weights ─────────────────────────────────────────────

const SOURCE_WEIGHTS = {
  own_data: 0.5,
  competitor: 0.3,
  research: 0.2,
};

const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";

// ── Hypothesis Generation ─────────────────────────────────────

/** Generate hypotheses from all 3 sources */
export async function generateHypotheses(params: {
  channel: string;
  niche?: string;
  count?: number;
}): Promise<Hypothesis[]> {
  const { channel, niche = "medical parenting education", count = 3 } = params;

  // 1. Gather evidence from all sources
  const memory = getMemoryLayer();

  // Own data: recall past wins
  const ownInsights = await memory.recall({
    channel,
    intent: "top performing topics and vibes with highest views and completion",
    limit: 5,
  });

  // Competitor data: what worked for similar channels
  const competitorInsights = await memory.recall({
    channel: "whispercut-global",
    intent: "viral competitor patterns in medical education TikTok",
    limit: 3,
  });

  // Research: trending in niche (via AI — Tavily would be called separately)
  const researchContext = `Niche: ${niche}. Channel: ${channel}.`;

  // 2. AI generates hypotheses from evidence
  const prompt = `You are a content strategist for a Thai medical TikTok channel.

Based on this evidence, generate ${count} testable content hypotheses.

OWN CHANNEL DATA (highest priority):
${ownInsights.map(i => `- ${i.text}`).join("\n") || "- No data yet (new channel)"}

COMPETITOR INSIGHTS:
${competitorInsights.map(i => `- ${i.text}`).join("\n") || "- No competitor data available"}

RESEARCH CONTEXT:
${researchContext}

For each hypothesis, provide:
- statement: a specific testable claim (e.g. "ลูกดูจอ topic with shocking_reveal vibe will get 50K+ views")
- topic: the specific topic in Thai
- vibe: one of educational_warm, shocking_reveal, story_driven, quick_tips, myth_bust
- prediction: { metric: "views"|"completion_rate"|"shares"|"saves", target: number, confidence: 0-1 }
- evidence: { own_data: string[], competitor: string[], research: string[] }

Return JSON array of ${count} hypotheses, ranked by confidence.`;

  try {
    const hypotheses = await aiGenerateJSON<Array<{
      statement: string;
      topic: string;
      vibe: string;
      prediction: { metric: string; target: number; confidence: number };
      evidence: { own_data: string[]; competitor: string[]; research: string[] };
    }>>(prompt, { maxTokens: 4096 });

    const now = new Date().toISOString();
    return hypotheses.map((h, i) => ({
      id: `hyp-${Date.now()}-${i}`,
      statement: h.statement,
      topic: h.topic,
      vibe: h.vibe,
      channel,
      prediction: {
        metric: (h.prediction.metric as any) || "views",
        target: h.prediction.target,
        confidence: h.prediction.confidence,
      },
      evidence: h.evidence,
      status: "active" as const,
      test_count: 0,
      results: [],
      created_at: now,
      updated_at: now,
    }));
  } catch (e: any) {
    console.error(`[hypothesis] Generation failed: ${e.message}`);
    return [];
  }
}

/** Rank hypotheses by weighted evidence score */
export function rankHypotheses(hypotheses: Hypothesis[]): Hypothesis[] {
  return [...hypotheses].sort((a, b) => {
    const scoreA = computeEvidenceScore(a);
    const scoreB = computeEvidenceScore(b);
    return scoreB - scoreA;
  });
}

function computeEvidenceScore(h: Hypothesis): number {
  const ownScore = h.evidence.own_data.length * SOURCE_WEIGHTS.own_data;
  const compScore = h.evidence.competitor.length * SOURCE_WEIGHTS.competitor;
  const researchScore = h.evidence.research.length * SOURCE_WEIGHTS.research;
  return (ownScore + compScore + researchScore) * h.prediction.confidence;
}

// ── Hypothesis Validation ─────────────────────────────────────

/** Validate hypothesis against actual results */
export function validateHypothesis(
  hypothesis: Hypothesis,
  actual: number,
  clipId: string,
): { status: "confirmed" | "rejected" | "inconclusive"; reason: string } {
  const { target } = hypothesis.prediction;

  hypothesis.results.push({
    clip_id: clipId,
    actual,
    date: new Date().toISOString(),
  });
  hypothesis.test_count++;
  hypothesis.updated_at = new Date().toISOString();

  // Need at least 3 data points for meaningful validation
  if (hypothesis.test_count < 3) {
    hypothesis.status = "testing";
    return {
      status: "inconclusive",
      reason: `Only ${hypothesis.test_count}/3 tests completed. Need more data.`,
    };
  }

  // Calculate average actual performance
  const avgActual = hypothesis.results.reduce((sum, r) => sum + r.actual, 0) / hypothesis.results.length;

  if (avgActual >= target * 0.8) {
    hypothesis.status = "confirmed";
    return {
      status: "confirmed",
      reason: `Average ${avgActual.toFixed(0)} meets target ${target} (≥80% threshold). Hypothesis confirmed.`,
    };
  }

  if (avgActual < target * 0.5) {
    hypothesis.status = "rejected";
    return {
      status: "rejected",
      reason: `Average ${avgActual.toFixed(0)} far below target ${target} (<50%). Hypothesis rejected.`,
    };
  }

  return {
    status: "inconclusive",
    reason: `Average ${avgActual.toFixed(0)} is between 50-80% of target ${target}. Need more data or refinement.`,
  };
}

// ── Supabase Persistence ──────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!,
  );
}

/** Save hypothesis to Supabase */
export async function saveHypothesis(h: Hypothesis): Promise<void> {
  if (!process.env.SUPABASE_URL) return;
  try {
    const supabase = getSupabase();
    await supabase.from("hypotheses").upsert({
      id: h.id,
      channel: h.channel,
      statement: h.statement,
      topic: h.topic,
      vibe: h.vibe,
      prediction_json: JSON.stringify(h.prediction),
      evidence_json: JSON.stringify(h.evidence),
      status: h.status,
      test_count: h.test_count,
      results_json: JSON.stringify(h.results),
      user_email: USER_EMAIL,
      created_at: h.created_at,
      updated_at: h.updated_at,
    }, { onConflict: "id" });
  } catch (e: any) {
    console.error(`[hypothesis] Save failed: ${e.message?.slice(0, 80)}`);
  }
}

/** Load active hypotheses for a channel */
export async function loadHypotheses(channel: string): Promise<Hypothesis[]> {
  if (!process.env.SUPABASE_URL) return [];
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("hypotheses")
      .select("*")
      .eq("channel", channel)
      .in("status", ["active", "testing"])
      .eq("user_email", USER_EMAIL)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!data) return [];
    return data.map((row: any) => ({
      id: row.id,
      statement: row.statement,
      topic: row.topic,
      vibe: row.vibe,
      channel: row.channel,
      prediction: JSON.parse(row.prediction_json),
      evidence: JSON.parse(row.evidence_json),
      status: row.status,
      test_count: row.test_count,
      results: JSON.parse(row.results_json || "[]"),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  } catch {
    return [];
  }
}

/** Select best topic from hypotheses */
export async function selectBestTopic(channel: string): Promise<{
  topic: string;
  vibe: string;
  hypothesis: Hypothesis | null;
  reason: string;
} | null> {
  const hypotheses = await loadHypotheses(channel);
  if (hypotheses.length === 0) {
    // Cold start — generate new hypotheses
    const newHypotheses = await generateHypotheses({ channel });
    if (newHypotheses.length === 0) return null;

    for (const h of newHypotheses) await saveHypothesis(h);
    const ranked = rankHypotheses(newHypotheses);
    const best = ranked[0];

    return {
      topic: best.topic,
      vibe: best.vibe,
      hypothesis: best,
      reason: `New hypothesis generated: "${best.statement}" (confidence: ${(best.prediction.confidence * 100).toFixed(0)}%)`,
    };
  }

  // Rank existing hypotheses
  const ranked = rankHypotheses(hypotheses);
  const best = ranked[0];

  return {
    topic: best.topic,
    vibe: best.vibe,
    hypothesis: best,
    reason: `Top hypothesis: "${best.statement}" (tested ${best.test_count}x, confidence: ${(best.prediction.confidence * 100).toFixed(0)}%)`,
  };
}
