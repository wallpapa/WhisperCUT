/**
 * WhisperCUT AI Cover Generator
 *
 * One-shot TikTok cover generation using Gemini image models:
 *   - Nano Banana Pro  (gemini-3-pro-image-preview)     — best quality
 *   - Nano Banana      (gemini-2.5-flash-preview-image-generation) — faster
 *
 * Clones @doctorwaleerat viral TikTok cover style:
 *   Face visible, bold Thai text with color coding, clean minimal design
 *
 * Usage:
 *   npx tsx src/engine/cover-ai.ts
 *   npx tsx src/engine/cover-ai.ts --model flash
 *   npx tsx src/engine/cover-ai.ts --count 4
 */

import { GoogleGenAI } from "@google/genai";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import "dotenv/config";

// ── Config ────────────────────────────────────────────────────

const MODELS = {
  pro: "gemini-3-pro-image-preview",           // Nano Banana Pro
  flash: "gemini-2.5-flash-image",  // Nano Banana
} as const;

type ModelKey = keyof typeof MODELS;

const OUT_DIR = "./output/cover-ai";

// ── Cover Prompt Builder ──────────────────────────────────────

interface CoverConfig {
  /** Lines of Thai text with color coding */
  lines: Array<{ text: string; color: string; size: string }>;
  /** Top badge text */
  badge?: string;
  /** Bottom bar text */
  lowerThird?: string;
  /** Topic context for AI */
  topic?: string;
  /** Path to real photo — AI will use this face as reference */
  photoPath?: string;
}

function buildPrompt(config: CoverConfig): string {
  const textLines = config.lines
    .map((l, i) => `- Line ${i + 1} (${l.color}, ${l.size}): ${l.text}`)
    .join("\n");

  return `Create a TikTok video thumbnail cover in vertical 9:16 format.

CLONE THIS EXACT STYLE from @doctorwaleerat (Thai medical TikTok creator with 1.4M+ likes):

SUBJECT: Professional Thai female doctor in white medical coat.
- Close-up from chest/waist up
- Looking at camera with concerned/thoughtful expression
- Natural warm indoor clinic lighting, slightly blurred background
- Face clearly visible in center-lower area of frame

TEXT OVERLAY (exact Thai text, BOLD with thick BLACK stroke outline):
${textLines}

TEXT LAYOUT:
- All text stacked vertically, centered horizontally
- Positioned in the TOP 40% of the image
- Every line has HEAVY black text-stroke for readability over the photo
- Text must be perfectly legible and spelled correctly

${config.badge ? `TOP BADGE: Small orange pill-shaped badge: "${config.badge}"` : ""}
${config.lowerThird ? `BOTTOM BAR: Thin semi-transparent dark bar near bottom with small gray text: "${config.lowerThird}"` : ""}

STYLE RULES:
- Clean, minimal design — NO borders, NO complex graphics, NO logos
- TikTok viral medical content thumbnail aesthetic
- High contrast between text and background
- Photorealistic doctor, studio-quality portrait
- Warm indoor lighting (clinic/office feel)
${config.topic ? `\nTOPIC CONTEXT: ${config.topic}` : ""}`;
}

// ── Generator ─────────────────────────────────────────────────

async function generateCover(
  config: CoverConfig,
  modelKey: ModelKey = "pro",
  count = 1,
): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.startsWith("AIza")) {
    throw new Error(
      "Valid GEMINI_API_KEY required (starts with AIzaSy...). Get one at: https://aistudio.google.com/apikey",
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = MODELS[modelKey];
  const prompt = buildPrompt(config);

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  // Load reference photo if provided
  let photoParts: any[] = [];
  if (config.photoPath && existsSync(config.photoPath)) {
    const photoData = readFileSync(config.photoPath);
    const ext = config.photoPath.toLowerCase().endsWith(".jpg") ? "jpeg" : "png";
    photoParts = [{ inlineData: { mimeType: `image/${ext}`, data: photoData.toString("base64") } }];
    console.log(`📷 Reference photo: ${config.photoPath} (${(photoData.length / 1024).toFixed(0)} KB)`);
  }

  console.log(`Model: ${model} (${modelKey})`);
  console.log(`Count: ${count}`);
  console.log();

  const saved: string[] = [];

  for (let i = 0; i < count; i++) {
    const tag = count > 1 ? `-${i + 1}` : "";
    console.log(`🎨 Generating cover${tag}...`);

    try {
      // Build contents — with or without reference photo
      const contents = photoParts.length > 0
        ? [{
            role: "user" as const,
            parts: [
              ...photoParts,
              { text: `Using this EXACT person in the photo as the subject (keep same face, same features), ${prompt}` },
            ],
          }]
        : prompt;

      const res = await ai.models.generateContent({
        model,
        contents,
        config: { responseModalities: ["IMAGE"] },
      });

      const parts = (res as any).candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const buf = Buffer.from(part.inlineData.data, "base64");
          const path = `${OUT_DIR}/cover-${modelKey}${tag}.png`;
          writeFileSync(path, buf);
          saved.push(path);
          console.log(`✅ ${path} (${(buf.length / 1024).toFixed(0)} KB)`);
          break;
        }
      }
    } catch (e: any) {
      console.log(`❌ Failed: ${e.message?.slice(0, 150)}`);
    }
  }

  return saved;
}

// ── Default Cover Spec (ลูกดูจอ topic) ───────────────────────

const DEFAULT_COVER: CoverConfig = {
  lines: [
    { text: "ลูกดูจอ",           color: "RED #FF4444", size: "biggest 120px bold" },
    { text: "35 ชม./สัปดาห์",    color: "GOLD #FFD700", size: "large 100px bold" },
    { text: "สมองเสียหาย",       color: "WHITE #FFFFFF", size: "large 100px bold" },
    { text: "ถาวรจริงมั้ย!?",    color: "WHITE #FFFFFF", size: "large 96px bold" },
  ],
  badge: "หมอกวาง วลีรัตน์คลินิก",
  lowerThird: "Screen Time + Executive Function | @doctorwaleerat",
  topic: "Children's screen time and brain development — medical education",
};

// ── CLI ───────────────────────────────────────────────────────

async function main() {
  console.log("=== WhisperCUT AI Cover Generator ===\n");

  const args = process.argv.slice(2);
  let modelKey: ModelKey = "pro";
  let count = 1;
  let photoPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" && args[i + 1]) {
      const m = args[++i];
      if (m === "flash" || m === "pro") modelKey = m;
    }
    if (args[i] === "--count" && args[i + 1]) count = parseInt(args[++i]) || 1;
    if (args[i] === "--photo" && args[i + 1]) photoPath = args[++i];
  }

  const cover = { ...DEFAULT_COVER, photoPath };
  const paths = await generateCover(cover, modelKey, count);

  console.log(`\n=== Done: ${paths.length} covers ===`);
  paths.forEach((p) => console.log(`  📄 ${p}`));
}

main().catch(console.error);

// ── Export for MCP tool integration ───────────────────────────

export { generateCover, buildPrompt, MODELS };
export type { CoverConfig, ModelKey };
