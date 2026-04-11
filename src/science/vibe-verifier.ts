/**
 * 6-Dim Vibe Verifier — CutDeck-inspired hormone-mapped scoring
 *
 * Replaces single QA score (7.5/10) with 6-dimension VibeScore:
 *   cortisol_spike    — Hook tension (0-100)
 *   dopamine_gap      — Curiosity sustained (0-100)
 *   oxytocin_trust    — Middle builds rapport (0-100)
 *   adrenaline_peak   — Revelation impact (0-100)
 *   serotonin_close   — CTA satisfaction (0-100)
 *   rhythm_score      — Pacing match (0-100)
 *
 * + vibe_fidelity (0-100): overall match to target vibe
 * + predicted_completion (0-100): estimated watch-through %
 *
 * Threshold: vibe_fidelity >= 75 to proceed.
 * Below 75: auto-retry with failure context (3-Layer Immune System Layer 1).
 *
 * Part of DARWIN Engine Phase 2: Script Verification
 */

import { aiGenerateJSON } from "../ai/provider.js";
import { getMemoryLayer } from "../memory/memory-layer.js";
import { z } from "zod";

// ── Types ─────────────────────────────────────────────────────

export const VibeScoreSchema = z.object({
  cortisol_spike: z.number().min(0).max(100),
  dopamine_gap: z.number().min(0).max(100),
  oxytocin_trust: z.number().min(0).max(100),
  adrenaline_peak: z.number().min(0).max(100),
  serotonin_close: z.number().min(0).max(100),
  rhythm_score: z.number().min(0).max(100),
  silence_ratio: z.number().min(0).max(1),
  vibe_fidelity: z.number().min(0).max(100),
  predicted_completion: z.number().min(0).max(100),
  weakest_dimension: z.string(),
  improvement_suggestion: z.string(),
});

export type VibeScore = z.infer<typeof VibeScoreSchema>;

// ── Vibe Targets (from research + hormone arc science) ────────

const VIBE_TARGETS: Record<string, Partial<Record<keyof VibeScore, number>>> = {
  educational_warm: {
    cortisol_spike: 65, dopamine_gap: 60, oxytocin_trust: 80,
    adrenaline_peak: 55, serotonin_close: 75, rhythm_score: 70,
  },
  shocking_reveal: {
    cortisol_spike: 85, dopamine_gap: 75, oxytocin_trust: 50,
    adrenaline_peak: 90, serotonin_close: 60, rhythm_score: 75,
  },
  story_driven: {
    cortisol_spike: 70, dopamine_gap: 80, oxytocin_trust: 85,
    adrenaline_peak: 70, serotonin_close: 65, rhythm_score: 65,
  },
  quick_tips: {
    cortisol_spike: 60, dopamine_gap: 70, oxytocin_trust: 55,
    adrenaline_peak: 60, serotonin_close: 70, rhythm_score: 85,
  },
  myth_bust: {
    cortisol_spike: 80, dopamine_gap: 70, oxytocin_trust: 60,
    adrenaline_peak: 85, serotonin_close: 65, rhythm_score: 70,
  },
};

// ── Scoring ───────────────────────────────────────────────────

/** Score a script against its target vibe using 6-dim VibeScore */
export async function scoreVibe(params: {
  script: string;
  targetVibe: string;
  channel?: string;
  topic?: string;
}): Promise<VibeScore> {
  const { script, targetVibe, channel = "doctorwaleerat", topic } = params;
  const targets = VIBE_TARGETS[targetVibe] || VIBE_TARGETS.educational_warm;

  // Recall past performance from memory
  let memoryContext = "";
  try {
    const memory = getMemoryLayer();
    const insights = await memory.recall({
      channel,
      topic,
      intent: `${targetVibe} script scoring patterns and common failures`,
      limit: 3,
    });
    if (insights.length > 0) {
      memoryContext = `\nPast performance insights:\n${insights.map(i => `- ${i.text}`).join("\n")}`;
    }
  } catch {}

  const prompt = `You are a viral video analyst scoring a Thai TikTok script.

TARGET VIBE: ${targetVibe}
TARGET SCORES: ${JSON.stringify(targets)}
${memoryContext}

Score each dimension 0-100:
- cortisol_spike: Does the hook (first 3 seconds) create threat/tension/urgency? Target: >${targets.cortisol_spike || 70}
- dopamine_gap: Is curiosity sustained through the middle section (3-15s)? Target: >${targets.dopamine_gap || 65}
- oxytocin_trust: Does the middle section build rapport and trust with the audience? Target: >${targets.oxytocin_trust || 60}
- adrenaline_peak: Does the revelation/key insight hit hard emotionally? Target: >${targets.adrenaline_peak || 75}
- serotonin_close: Is the CTA emotionally satisfying and clear? Target: >${targets.serotonin_close || 65}
- rhythm_score: Does the word pacing match the ${targetVibe} energy level? Target: >${targets.rhythm_score || 70}
- silence_ratio: What fraction of the script is dead air/pauses? (0-1, lower is better for most vibes)
- vibe_fidelity: Overall, how well does this script match the ${targetVibe} archetype? Target: >75
- predicted_completion: Estimated % of viewers who watch to the end? Target: >70
- weakest_dimension: Which dimension scores lowest and why?
- improvement_suggestion: One specific, actionable fix for the weakest dimension

SCRIPT TO SCORE:
"""
${script.slice(0, 3000)}
"""

Return JSON only. Be harsh but fair — this score determines whether the script ships.`;

  try {
    return await aiGenerateJSON<VibeScore>(prompt, {
      schema: VibeScoreSchema,
      maxTokens: 2048,
    });
  } catch (e: any) {
    console.error(`[vibe-verifier] Scoring failed: ${e.message}`);
    // Return neutral scores on failure
    return {
      cortisol_spike: 50, dopamine_gap: 50, oxytocin_trust: 50,
      adrenaline_peak: 50, serotonin_close: 50, rhythm_score: 50,
      silence_ratio: 0.1, vibe_fidelity: 50, predicted_completion: 50,
      weakest_dimension: "unknown",
      improvement_suggestion: "Scoring failed — manual review recommended",
    };
  }
}

// ── Verification Gate ─────────────────────────────────────────

export interface VerificationResult {
  passed: boolean;
  score: VibeScore;
  attempt: number;
  max_attempts: number;
  failing_dimensions: string[];
  action: "proceed" | "retry" | "manual_review";
}

/** Verify script meets vibe threshold. Returns retry action if below 75. */
export function verifyVibe(
  score: VibeScore,
  attempt: number,
  maxAttempts = 3,
): VerificationResult {
  const failing: string[] = [];

  // Check each dimension against its target
  if (score.cortisol_spike < 50) failing.push("cortisol_spike");
  if (score.dopamine_gap < 50) failing.push("dopamine_gap");
  if (score.rhythm_score < 50) failing.push("rhythm_score");

  const passed = score.vibe_fidelity >= 75;

  let action: "proceed" | "retry" | "manual_review";
  if (passed) {
    action = "proceed";
  } else if (attempt < maxAttempts) {
    action = "retry";
  } else {
    action = "manual_review";
  }

  return {
    passed,
    score,
    attempt,
    max_attempts: maxAttempts,
    failing_dimensions: failing,
    action,
  };
}

/** Format VibeScore for display */
export function formatVibeScore(score: VibeScore): string {
  const bar = (val: number) => {
    const filled = Math.round(val / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
  };

  return [
    `Cortisol (Hook):     ${bar(score.cortisol_spike)} ${score.cortisol_spike}/100`,
    `Dopamine (Curiosity):${bar(score.dopamine_gap)} ${score.dopamine_gap}/100`,
    `Oxytocin (Trust):    ${bar(score.oxytocin_trust)} ${score.oxytocin_trust}/100`,
    `Adrenaline (Reveal): ${bar(score.adrenaline_peak)} ${score.adrenaline_peak}/100`,
    `Serotonin (CTA):     ${bar(score.serotonin_close)} ${score.serotonin_close}/100`,
    `Rhythm (Pacing):     ${bar(score.rhythm_score)} ${score.rhythm_score}/100`,
    `──────────────────────────────────`,
    `Vibe Fidelity:       ${bar(score.vibe_fidelity)} ${score.vibe_fidelity}/100 ${score.vibe_fidelity >= 75 ? "✅" : "❌"}`,
    `Predicted Completion: ${score.predicted_completion}%`,
    `Weakest: ${score.weakest_dimension}`,
    `Fix: ${score.improvement_suggestion}`,
  ].join("\n");
}
