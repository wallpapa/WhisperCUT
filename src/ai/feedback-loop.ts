/**
 * AI Feedback Loop — Auto-improve video quality
 * Analyze → Score → Rewrite → Re-score until threshold met
 */
import { aiStructured } from "./provider.js";
import { scoreVideoPrompt, improveScriptPrompt } from "./prompts.js";
import { z } from "zod";

const ScoreSchema = z.object({
  hook_score: z.number().min(1).max(10),
  cta_score: z.number().min(1).max(10),
  pacing_score: z.number().min(1).max(10),
  engagement_score: z.number().min(1).max(10),
  overall: z.number().min(1).max(10),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  improvements: z.array(z.string()),
});

const ImproveSchema = z.object({
  revised_script: z.string(),
  changes_made: z.array(z.string()),
  estimated_score_improvement: z.object({
    hook: z.number(),
    cta: z.number(),
    pacing: z.number(),
    engagement: z.number(),
  }),
});

export type VideoScore = z.infer<typeof ScoreSchema>;

export interface FeedbackResult {
  iterations: FeedbackIteration[];
  final_score: VideoScore;
  final_script: string;
  improved: boolean;
}

export interface FeedbackIteration {
  iteration: number;
  score: VideoScore;
  script: string;
  changes?: string[];
}

const THRESHOLD = 7; // Minimum average score to pass
const MAX_ITERATIONS = 3;

/** Score a video transcript */
export async function scoreVideo(
  transcript: string,
  durationSec: number,
  useLocal = false
): Promise<VideoScore> {
  return aiStructured(
    scoreVideoPrompt(transcript, durationSec),
    ScoreSchema,
    { role: "text", useLocal }
  );
}

/** Run the full feedback loop: score → improve → re-score */
export async function feedbackLoop(
  transcript: string,
  durationSec: number,
  language: string,
  options: {
    aspects?: ("hook" | "cta" | "pacing" | "engagement")[];
    maxIterations?: number;
    threshold?: number;
    useLocal?: boolean;
  } = {}
): Promise<FeedbackResult> {
  const {
    aspects = ["hook", "cta", "pacing", "engagement"],
    maxIterations = MAX_ITERATIONS,
    threshold = THRESHOLD,
    useLocal = false,
  } = options;

  const iterations: FeedbackIteration[] = [];
  let currentScript = transcript;

  // Initial score
  let score = await scoreVideo(currentScript, durationSec, useLocal);
  iterations.push({ iteration: 0, score, script: currentScript });

  // Check if improvement needed
  const needsImprovement = (s: VideoScore) => {
    const checked = aspects.map((a) => s[`${a}_score`]);
    return checked.some((v) => v < threshold);
  };

  let iteration = 0;
  while (needsImprovement(score) && iteration < maxIterations) {
    iteration++;

    // Improve the script
    const improved = await aiStructured(
      improveScriptPrompt(currentScript, score, score.improvements, language),
      ImproveSchema,
      { role: "multilingual", useLocal }
    );

    currentScript = improved.revised_script;

    // Re-score
    score = await scoreVideo(currentScript, durationSec, useLocal);
    iterations.push({
      iteration,
      score,
      script: currentScript,
      changes: improved.changes_made,
    });
  }

  return {
    iterations,
    final_score: score,
    final_script: currentScript,
    improved: iterations.length > 1,
  };
}

/** Quick score without improvement loop — for monitoring */
export async function quickScore(
  transcript: string,
  durationSec: number
): Promise<{ average: number; scores: VideoScore }> {
  const scores = await scoreVideo(transcript, durationSec);
  const average =
    (scores.hook_score + scores.cta_score + scores.pacing_score + scores.engagement_score) / 4;
  return { average, scores };
}
