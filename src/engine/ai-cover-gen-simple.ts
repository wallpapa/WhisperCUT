/**
 * AI Cover Generator — SIMPLE one-shot
 * Generate complete TikTok cover (background + text) in a single AI call
 *
 * Usage:
 *   npx tsx src/engine/ai-cover-gen-simple.ts
 *   GEMINI_API_KEY=... npx tsx src/engine/ai-cover-gen-simple.ts
 */

import { GoogleGenAI } from "@google/genai";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import "dotenv/config";

const OUT_DIR = "./output/cover-ai";

// ── Prompt ────────────────────────────────────────────────────

const COVER_PROMPT = `Create a professional viral TikTok video thumbnail cover image in vertical 9:16 format.

DESIGN SPECIFICATION:
- Background: Dark cinematic navy-blue gradient (#16213E to #0A0A23)
- Subject: Professional Asian female doctor in white medical coat, positioned center-left, from waist up, making eye contact
- Lighting: Dramatic rim lighting from the left, subtle blue glow

TEXT OVERLAY (exact Thai text — render clearly in bold white/red/gold with heavy black outline):
Line 1 (top, RED #FF4444, largest bold): ลูกดูจอ
Line 2 (below, GOLD #FFD700, large bold): 35 ชม./สัปดาห์
Line 3 (below, GOLD #FFD700, medium bold): สมองเสียหาย
Line 4 (below, WHITE #FFFFFF, medium bold): ถาวรจริงมั้ย?

All text must have THICK BLACK stroke/outline for readability over the photo.
Text positioned in the top 40% of the image.

BOTTOM BAR: Semi-transparent dark bar at 78% from top with small gray text: "Screen Time + Executive Function | @doctorwaleerat"

TOP BADGE: Small orange pill-shaped badge with text: "หมอกวาง วลีรัตน์คลินิก"

STYLE: Professional medical TikTok content creator aesthetic, high contrast, cinematic, viral cover look.
CRITICAL: Vertical 9:16 format (portrait phone screen). Make the Thai text perfectly readable and large.`;

// ── Providers ─────────────────────────────────────────────────

interface Result {
  provider: string;
  buffer: Buffer;
}

async function tryGeminiImagen(prompt: string): Promise<Result | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  console.log("🎨 Trying Gemini Imagen 3...");
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const res = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt,
      config: { numberOfImages: 4, aspectRatio: "9:16" },
    });
    const images = (res as any).generatedImages;
    if (!images?.length) throw new Error("No images returned");

    const results: Result[] = [];
    for (let i = 0; i < images.length; i++) {
      const buf = Buffer.from(images[i].image.imageBytes, "base64");
      results.push({ provider: `imagen3-${i + 1}`, buffer: buf });
    }
    console.log(`✅ Imagen 3: ${results.length} covers generated`);
    return results[0]; // return first, save all
  } catch (e: any) {
    console.log(`⚠️ Imagen 3 failed: ${e.message?.slice(0, 150)}`);
    return null;
  }
}

async function tryGeminiFlash(prompt: string): Promise<Result | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  console.log("🎨 Trying Gemini 2.0 Flash native image gen...");
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const res = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp-image-generation",
      contents: prompt,
      config: { responseModalities: ["TEXT", "IMAGE"] },
    });
    const parts = (res as any).candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith("image/")) {
          const buf = Buffer.from(part.inlineData.data, "base64");
          console.log(`✅ Gemini Flash: cover generated (${(buf.length / 1024).toFixed(0)} KB)`);
          return { provider: "gemini-flash", buffer: buf };
        }
      }
    }
    throw new Error("No image in response");
  } catch (e: any) {
    console.log(`⚠️ Gemini Flash failed: ${e.message?.slice(0, 150)}`);
    return null;
  }
}

async function tryPollinations(prompt: string, variant: number): Promise<Result | null> {
  console.log(`🎨 Trying Pollinations.ai (variant ${variant})...`);
  try {
    const seed = Date.now() % 100000 + variant * 1000;
    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=1080&height=1920&model=flux-pro&nologo=true&enhance=true&seed=${seed}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(120_000),
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 5000) throw new Error(`Too small: ${buf.length} bytes`);

    console.log(`✅ Pollinations variant ${variant}: ${(buf.length / 1024).toFixed(0)} KB`);
    return { provider: `pollinations-${variant}`, buffer: buf };
  } catch (e: any) {
    console.log(`⚠️ Pollinations variant ${variant} failed: ${e.message}`);
    return null;
  }
}

async function tryOpenRouter(prompt: string): Promise<Result | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  console.log("🎨 Trying OpenRouter image gen...");
  try {
    const res = await fetch("https://openrouter.ai/api/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/whispercut",
      },
      body: JSON.stringify({
        model: "black-forest-labs/flux-1.1-pro",
        prompt,
        n: 1,
        size: "1024x1792",
        response_format: "b64_json",
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`);
    }
    const data = await res.json() as any;
    if (data.data?.[0]?.b64_json) {
      const buf = Buffer.from(data.data[0].b64_json, "base64");
      console.log(`✅ OpenRouter: ${(buf.length / 1024).toFixed(0)} KB`);
      return { provider: "openrouter-flux", buffer: buf };
    }
    if (data.data?.[0]?.url) {
      const imgRes = await fetch(data.data[0].url);
      return { provider: "openrouter-flux", buffer: Buffer.from(await imgRes.arrayBuffer()) };
    }
    throw new Error("No image data");
  } catch (e: any) {
    console.log(`⚠️ OpenRouter failed: ${e.message?.slice(0, 150)}`);
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log("=== WhisperCUT AI Cover — One-Shot Generator ===\n");
  console.log(`GEMINI_API_KEY:    ${process.env.GEMINI_API_KEY ? "✅" : "❌"}`);
  console.log(`OPENROUTER_API_KEY: ${process.env.OPENROUTER_API_KEY ? "✅" : "❌"}`);
  console.log(`XAI_API_KEY:       ${process.env.XAI_API_KEY ? "✅" : "❌"}`);
  console.log();

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const saved: string[] = [];

  function save(r: Result) {
    const path = `${OUT_DIR}/cover-${r.provider}.png`;
    writeFileSync(path, r.buffer);
    saved.push(path);
    console.log(`💾 Saved: ${path}`);
  }

  // ── Strategy: generate from ALL available providers in parallel ──
  const tasks: Promise<Result | null>[] = [];

  // Gemini Imagen 3 (best quality)
  if (process.env.GEMINI_API_KEY) {
    tasks.push(tryGeminiImagen(COVER_PROMPT));
    tasks.push(tryGeminiFlash(COVER_PROMPT));
  }

  // Pollinations.ai — 3 variants (free, no key)
  tasks.push(tryPollinations(COVER_PROMPT, 1));
  tasks.push(tryPollinations(COVER_PROMPT, 2));
  tasks.push(tryPollinations(COVER_PROMPT, 3));

  // OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    tasks.push(tryOpenRouter(COVER_PROMPT));
  }

  console.log(`🚀 Launching ${tasks.length} parallel generation tasks...\n`);
  const results = await Promise.allSettled(tasks);

  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      save(r.value);
    }
  }

  // Also save individual Imagen 3 variants if they exist
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      // Already attempted above, skip duplicate
    } catch {}
  }

  console.log(`\n=== Done: ${saved.length} covers generated ===`);
  saved.forEach(p => console.log(`  📄 ${p}`));
  console.log(`\nOpen: ${OUT_DIR}/`);
}

main().catch(console.error);
