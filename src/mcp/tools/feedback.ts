/**
 * whispercut_feedback — AI feedback loop for video quality improvement
 */
import { feedbackLoop, quickScore } from "../../ai/feedback-loop.js";
import type { FeedbackResult, VideoScore } from "../../ai/feedback-loop.js";

export const feedbackTool = {
  name: "whispercut_feedback",
  description:
    "Run AI feedback loop on a video: score hook/CTA/pacing/engagement (1-10 each), suggest improvements, and optionally auto-rewrite the script until scores meet threshold (default: 7).",
  inputSchema: {
    type: "object" as const,
    properties: {
      transcript: {
        type: "string",
        description: "The video transcript or script text",
      },
      duration_sec: {
        type: "number",
        description: "Video duration in seconds",
      },
      language: {
        type: "string",
        description: "Language code (th, en, zh, ja, ar)",
        default: "th",
      },
      aspects: {
        type: "array",
        items: {
          type: "string",
          enum: ["hook", "cta", "pacing", "engagement"],
        },
        description: "Which aspects to evaluate and improve",
        default: ["hook", "cta", "pacing", "engagement"],
      },
      auto_improve: {
        type: "boolean",
        description: "If true, auto-rewrite script until scores meet threshold",
        default: true,
      },
      threshold: {
        type: "number",
        description: "Minimum score threshold (1-10, default: 7)",
        default: 7,
      },
      max_iterations: {
        type: "number",
        description: "Max improvement iterations (default: 3)",
        default: 3,
      },
    },
    required: ["transcript", "duration_sec"],
  },
};

export async function handleFeedback(args: any) {
  const {
    transcript,
    duration_sec,
    language = "th",
    aspects = ["hook", "cta", "pacing", "engagement"],
    auto_improve = true,
    threshold = 7,
    max_iterations = 3,
  } = args;

  if (auto_improve) {
    // Full feedback loop: score → improve → re-score
    const result: FeedbackResult = await feedbackLoop(
      transcript,
      duration_sec,
      language,
      { aspects, maxIterations: max_iterations, threshold }
    );

    const avgScore = (s: VideoScore) =>
      (s.hook_score + s.cta_score + s.pacing_score + s.engagement_score) / 4;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            improved: result.improved,
            iterations: result.iterations.length,
            initial_score: avgScore(result.iterations[0].score).toFixed(1),
            final_score: avgScore(result.final_score).toFixed(1),
            scores: result.final_score,
            final_script: result.final_script,
            improvement_history: result.iterations.map((it) => ({
              iteration: it.iteration,
              average: avgScore(it.score).toFixed(1),
              hook: it.score.hook_score,
              cta: it.score.cta_score,
              pacing: it.score.pacing_score,
              engagement: it.score.engagement_score,
              changes: it.changes,
            })),
          }, null, 2),
        },
      ],
    };
  } else {
    // Quick score only, no improvement
    const { average, scores } = await quickScore(transcript, duration_sec);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            improved: false,
            average_score: average.toFixed(1),
            scores,
          }, null, 2),
        },
      ],
    };
  }
}
