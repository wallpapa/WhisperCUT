/**
 * Video Analyzer — Gemini Video Understanding API
 *
 * Analyzes TikTok clips to extract:
 *   - Facial expressions & reactions (frame-by-frame)
 *   - Verbal patterns (hook timing, tone, pace)
 *   - Non-verbal communication (gestures, posture, eye contact)
 *   - Scene composition (camera angles, lighting, background)
 *   - Hook effectiveness (first 3 seconds analysis)
 *
 * Uses: Gemini 2.5 Flash ($0.003 per 10-min video)
 * Input: Video file path (MP4/MOV)
 * Output: Structured analysis JSON + TeleMem storage
 */

import { GoogleGenAI } from "@google/genai";
import { readFileSync, existsSync } from "fs";
import { z } from "zod";
import "dotenv/config";

// ── Types ─────────────────────────────────────────────────────

export const VideoAnalysisSchema = z.object({
  // Hook analysis (first 3 seconds)
  hook: z.object({
    text: z.string().describe("What is said in the first 3 seconds"),
    type: z.string().describe("Hook type: question, bold_claim, shock, curiosity_gap, etc."),
    expression: z.string().describe("Facial expression in hook: shocked, concerned, smiling, etc."),
    gesture: z.string().describe("Hand/body gesture in hook: pointing, open palms, chin touch, etc."),
    effectiveness: z.number().min(1).max(10).describe("Hook effectiveness score 1-10"),
  }),

  // Expression timeline
  expressions: z.array(z.object({
    timestamp: z.string().describe("Approximate timestamp (e.g. '0:00-0:03')"),
    expression: z.string().describe("Facial expression: happy, concerned, excited, thinking, etc."),
    intensity: z.number().min(1).max(10).describe("Expression intensity 1-10"),
  })),

  // Verbal patterns
  verbal: z.object({
    pace: z.string().describe("Speaking pace: slow, medium, fast, variable"),
    tone: z.string().describe("Voice tone: authoritative, warm, urgent, playful"),
    language_style: z.string().describe("Formal, casual, mix, medical-casual"),
    key_phrases: z.array(z.string()).describe("Memorable phrases used"),
  }),

  // Non-verbal communication
  nonverbal: z.object({
    eye_contact: z.string().describe("Direct, occasional, minimal"),
    hand_gestures: z.array(z.string()).describe("Key gestures used"),
    posture: z.string().describe("Upright, relaxed, leaning forward"),
    props_used: z.array(z.string()).describe("Objects interacted with"),
  }),

  // Scene composition
  scene: z.object({
    setting: z.string().describe("Where: clinic, home, studio, outdoor"),
    lighting: z.string().describe("Natural, studio, warm, cool, dramatic"),
    camera_angle: z.string().describe("Close-up, medium, wide, varying"),
    background_elements: z.array(z.string()).describe("Visible background items"),
  }),

  // Outfit & styling
  styling: z.object({
    outfit: z.string().describe("What they're wearing"),
    accessories: z.array(z.string()).describe("Visible accessories"),
    overall_look: z.string().describe("Professional, casual, elegant, etc."),
  }),

  // Overall assessment
  summary: z.string().describe("2-3 sentence summary of the creator's style"),
  viral_factors: z.array(z.string()).describe("What makes this video potentially viral"),
});

export type VideoAnalysis = z.infer<typeof VideoAnalysisSchema>;

// ── Analyzer ──────────────────────────────────────────────────

const ANALYSIS_PROMPT = `Analyze this TikTok video in extreme detail. You are studying a Thai medical content creator's style to clone it precisely.

For each aspect, be SPECIFIC — don't say "good expression", say exactly WHAT expression (e.g. "concerned frown with slightly open mouth, eyes widened, left hand touching chin").

Return a JSON object with these fields:
- hook: { text, type, expression, gesture, effectiveness (1-10) }
- expressions: [{ timestamp, expression, intensity (1-10) }] — every 3-5 seconds
- verbal: { pace, tone, language_style, key_phrases[] }
- nonverbal: { eye_contact, hand_gestures[], posture, props_used[] }
- scene: { setting, lighting, camera_angle, background_elements[] }
- styling: { outfit, accessories[], overall_look }
- summary: 2-3 sentence style summary
- viral_factors: what makes this video work

Be extremely detailed about facial expressions, micro-expressions, and gestures.
Thai language analysis is expected — the creator speaks Thai.`;

export async function analyzeVideo(
  videoPath: string,
  options: { model?: string; detailed?: boolean } = {},
): Promise<VideoAnalysis> {
  const { model = "gemini-2.5-flash", detailed = true } = options;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.startsWith("AIza")) {
    throw new Error("GEMINI_API_KEY required for video analysis");
  }

  if (!existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const ai = new GoogleGenAI({ apiKey });

  // Read video file
  const videoData = readFileSync(videoPath);
  const ext = videoPath.toLowerCase().endsWith(".mov") ? "quicktime" : "mp4";
  const base64 = videoData.toString("base64");

  console.error(`[video-analyzer] Analyzing ${videoPath} (${(videoData.length / 1024 / 1024).toFixed(1)} MB) with ${model}`);

  const prompt = detailed ? ANALYSIS_PROMPT : "Briefly describe what happens in this video. Focus on the person's expressions and speaking style.";

  const res = await ai.models.generateContent({
    model,
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType: `video/${ext}`, data: base64 } },
        { text: prompt + "\n\nReturn ONLY valid JSON, no markdown fences." },
      ],
    }],
  });

  const text = (res as any).candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Parse JSON from response
  let clean = text.trim();
  const fenceMatch = clean.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) clean = fenceMatch[1].trim();

  const parsed = JSON.parse(clean);
  return VideoAnalysisSchema.parse(parsed);
}

/** Analyze multiple videos and aggregate patterns */
export async function analyzeChannel(
  videoPaths: string[],
  channel: string,
): Promise<{
  analyses: VideoAnalysis[];
  patterns: {
    top_expressions: string[];
    common_hooks: string[];
    style_dna: string;
    verbal_signature: string;
  };
}> {
  const analyses: VideoAnalysis[] = [];

  for (const path of videoPaths) {
    try {
      const analysis = await analyzeVideo(path);
      analyses.push(analysis);
      console.error(`[video-analyzer] ✅ ${path}`);
    } catch (e: any) {
      console.error(`[video-analyzer] ❌ ${path}: ${e.message?.slice(0, 80)}`);
    }
  }

  // Aggregate patterns
  const allExpressions = analyses.flatMap(a => a.expressions.map(e => e.expression));
  const expressionCounts = new Map<string, number>();
  for (const e of allExpressions) {
    expressionCounts.set(e, (expressionCounts.get(e) || 0) + 1);
  }
  const topExpressions = [...expressionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([e]) => e);

  const commonHooks = analyses.map(a => a.hook.type);
  const styleDNA = analyses.map(a => a.styling.overall_look).join(", ");
  const verbalSig = analyses.map(a => `${a.verbal.tone}/${a.verbal.pace}`).join(", ");

  return {
    analyses,
    patterns: {
      top_expressions: topExpressions,
      common_hooks: [...new Set(commonHooks)],
      style_dna: styleDNA,
      verbal_signature: verbalSig,
    },
  };
}
