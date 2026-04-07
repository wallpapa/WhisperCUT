/**
 * QA Gate — AI quality scoring with auto-retry
 *
 * No human in the loop. Rules:
 *   score ≥ 7.5 → proceed to publish
 *   score < 7.5 → retry pipeline (max 3 attempts)
 *   3 failures  → log + skip topic, move to next
 */

import { readFileSync, existsSync } from "fs";

export interface QAResult {
  passed: boolean;
  score: number;
  scores: Record<string, number>;
  strengths: string[];
  improvements: string[];
  revised_hook?: string;
  revised_cta?: string;
  attempt: number;
}

const QA_THRESHOLD = 7.5;
const MAX_RETRIES = 3;

export async function runQAGate(
  scriptPath: string,
  templatePath: string,
  attempt = 1
): Promise<QAResult> {
  const { aiGenerateJSON } = await import("../ai/provider.js");

  if (!existsSync(scriptPath)) {
    throw new Error(`Script not found: ${scriptPath}`);
  }
  if (!existsSync(templatePath)) {
    throw new Error(`Style template not found: ${templatePath}`);
  }

  const script   = JSON.parse(readFileSync(scriptPath,   "utf-8"));
  const template = JSON.parse(readFileSync(templatePath, "utf-8"));

  const prompt = `คุณคือ AI quality reviewer สำหรับวิดีโอ TikTok สไตล์ "หมอกวาง"

## Style Template (จาก ${template.meta?.total_videos_analyzed ?? 0} วิดีโอที่วิเคราะห์):
${JSON.stringify({
  hook_patterns:        template.hook_patterns?.distribution,
  cta_patterns:         template.cta_patterns?.distribution,
  avg_overlays:         template.text_overlay_patterns?.avg_overlays_per_video,
  avg_sections:         template.body_structure?.avg_sections,
  engagement_hooks:     template.content_patterns?.engagement_hooks?.slice(0, 10),
}, null, 2)}

## Script ที่ต้องประเมิน:
${JSON.stringify(script, null, 2)}

ให้คะแนน 0-10 และตอบเป็น JSON เท่านั้น:
{
  "scores": {
    "hook_quality": 0,
    "body_structure": 0,
    "cta_effectiveness": 0,
    "language_authenticity": 0,
    "text_overlay_density": 0,
    "engagement_potential": 0,
    "overall": 0
  },
  "strengths": [],
  "improvements": [],
  "revised_hook": "ถ้า hook ไม่ดีพอ — เสนอ hook ที่ดีกว่า",
  "revised_cta": "ถ้า CTA ไม่ดีพอ — เสนอ CTA ที่ดีกว่า"
}`;

  const feedback = await aiGenerateJSON<{
    scores: Record<string, number>;
    strengths: string[];
    improvements: string[];
    revised_hook?: string;
    revised_cta?: string;
  }>(prompt);
  const overall  = feedback.scores?.overall ?? 0;
  const passed   = overall >= QA_THRESHOLD;

  console.error(
    `[qa-gate] Attempt ${attempt}/${MAX_RETRIES} — score: ${overall}/10 — ${passed ? "✅ PASS" : "❌ RETRY"}`
  );

  return {
    passed,
    score:        overall,
    scores:       feedback.scores,
    strengths:    feedback.strengths    ?? [],
    improvements: feedback.improvements ?? [],
    revised_hook: feedback.revised_hook,
    revised_cta:  feedback.revised_cta,
    attempt,
  };
}

export { QA_THRESHOLD, MAX_RETRIES };
