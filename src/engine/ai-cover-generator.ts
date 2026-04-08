/**
 * AI Cover Generator — Hybrid AI Image + Thai Text Overlay
 *
 * Strategy:
 *   1. AI generates photorealistic background + doctor figure (no text)
 *   2. node-canvas overlays Thai text with @doctorwaleerat styling
 *
 * Provider fallback chain:
 *   xAI Aurora (Grok) → Imagen 3 → Gemini 2.0 Flash → gradient-only
 *
 * Usage:
 *   npx tsx src/engine/ai-cover-generator.ts [topic]
 *   XAI_API_KEY=... npx tsx src/engine/ai-cover-generator.ts
 */

import { GoogleGenAI } from "@google/genai";
import { createCanvas, loadImage, registerFont, type CanvasRenderingContext2D } from "canvas";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import "dotenv/config";

// ── Constants ─────────────────────────────────────────────────

const W = 1080;
const H = 1920;

const DESIGN = {
  red: "#FF4444",
  orange: "#FF6B35",
  gold: "#FFD700",
  white: "#FFFFFF",
  stroke: "#000000",
  strokeW: 8,
  authBg: "rgba(0,0,0,0.55)",
  authText: "#BBBBBB",
};

// ── Types ─────────────────────────────────────────────────────

interface CoverLine {
  text: string;
  color: string;
  size: number;
}

interface CoverInput {
  topic: string;
  lines: CoverLine[];
  badge?: string;
  lowerThird?: string;
  photoPath?: string; // optional real photo to composite
}

interface GenerationResult {
  provider: string;
  buffer: Buffer;
  model: string;
}

// ── Register Thai fonts if available ──────────────────────────

const FONT_DIR = join(process.cwd(), "assets/fonts");
try {
  if (existsSync(join(FONT_DIR, "Kanit-Black.ttf"))) {
    registerFont(join(FONT_DIR, "Kanit-Black.ttf"), { family: "Kanit", weight: "900" });
  }
  if (existsSync(join(FONT_DIR, "Kanit-Bold.ttf"))) {
    registerFont(join(FONT_DIR, "Kanit-Bold.ttf"), { family: "Kanit", weight: "bold" });
  }
  if (existsSync(join(FONT_DIR, "Kanit-Regular.ttf"))) {
    registerFont(join(FONT_DIR, "Kanit-Regular.ttf"), { family: "Kanit", weight: "normal" });
  }
  console.log("✅ Kanit Thai fonts registered");
} catch {
  console.log("⚠️ Kanit fonts not found, using system fallback");
}

const FONT_FAMILY = `"Kanit", "Noto Sans Thai", "Sarabun", "Arial Black", sans-serif`;

// ══════════════════════════════════════════════════════════════
// Phase 1: AI Background Generation
// ══════════════════════════════════════════════════════════════

function buildPrompt(topic: string, hasRealPhoto: boolean): string {
  if (hasRealPhoto) {
    // Background-only prompt (no person) for real photo composite
    return [
      "Create a dark cinematic background for a TikTok video thumbnail.",
      "STYLE: Deep navy-blue gradient, transitioning from dark navy #16213E at top to near-black #0A0A23 at bottom.",
      "ELEMENTS: Subtle abstract medical/science elements — faint neural network patterns, bokeh lights, or soft geometric shapes.",
      "MOOD: Professional, clean, dark, modern medical aesthetic.",
      "COMPOSITION: Leave center-bottom area empty for a person overlay. Top area slightly brighter for text.",
      "CRITICAL: Do NOT include ANY people, faces, text, titles, watermarks, or logos.",
      "FORMAT: Vertical 9:16 mobile phone format.",
      "QUALITY: High detail, cinematic lighting, depth of field effect.",
      `CONTEXT: Medical education about: ${topic}`,
    ].join("\n");
  }

  // Full scene prompt (AI doctor figure)
  return [
    "Create a professional TikTok video thumbnail background image.",
    "STYLE: Dark cinematic navy-blue gradient background transitioning from #16213E at top to #0A0A23 at bottom.",
    "SUBJECT: Professional Asian female doctor in a crisp white medical coat, positioned slightly left of center.",
    "FRAMING: Close-up from chest up, making confident eye contact with camera. Soft rim lighting from left side.",
    "MOOD: Authoritative, trustworthy, modern medical content creator aesthetic.",
    "COMPOSITION: Leave the top 30% and bottom 20% of the frame darker/empty for text overlay.",
    "CRITICAL: Do NOT include ANY text, titles, watermarks, logos, or UI elements.",
    "FORMAT: Vertical 9:16 mobile phone format, 1080x1920 pixels.",
    "QUALITY: Photorealistic, high detail, studio lighting, professional photography.",
    `CONTEXT: Medical education content about: ${topic}`,
  ].join("\n");
}

/** Try xAI Aurora (Grok) image generation */
async function tryXAI(prompt: string): Promise<GenerationResult | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;

  console.log("🎨 [1/3] Trying xAI Aurora (Grok)...");
  try {
    const res = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-2-image",
        prompt,
        n: 1,
        size: "1024x1792", // closest to 9:16
        response_format: "b64_json",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json() as any;
    if (data.data?.[0]?.b64_json) {
      console.log("✅ xAI Aurora generated successfully");
      return {
        provider: "xai",
        model: "grok-2-image",
        buffer: Buffer.from(data.data[0].b64_json, "base64"),
      };
    }

    // URL format fallback
    if (data.data?.[0]?.url) {
      console.log("📥 xAI returned URL, downloading...");
      const imgRes = await fetch(data.data[0].url);
      const arrBuf = await imgRes.arrayBuffer();
      return {
        provider: "xai",
        model: "grok-2-image",
        buffer: Buffer.from(arrBuf),
      };
    }

    throw new Error("No image in response");
  } catch (e: any) {
    console.log(`⚠️ xAI failed: ${e.message}`);
    return null;
  }
}

/** Try Google Imagen 3 */
async function tryImagen3(prompt: string, apiKey: string): Promise<GenerationResult | null> {
  console.log("🎨 [2/3] Trying Imagen 3...");
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt,
      config: {
        numberOfImages: 1,
        aspectRatio: "9:16",
      },
    });

    const img = (response as any).generatedImages?.[0]?.image;
    if (img?.imageBytes) {
      console.log("✅ Imagen 3 generated successfully");
      return {
        provider: "imagen3",
        model: "imagen-3.0-generate-002",
        buffer: Buffer.from(img.imageBytes, "base64"),
      };
    }
    throw new Error("No image bytes in response");
  } catch (e: any) {
    console.log(`⚠️ Imagen 3 failed: ${e.message}`);
    return null;
  }
}

/** Try Gemini 2.0 Flash native image generation */
async function tryGeminiFlash(prompt: string, apiKey: string): Promise<GenerationResult | null> {
  console.log("🎨 [3/3] Trying Gemini 2.0 Flash image gen...");
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp-image-generation",
      contents: prompt,
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    const parts = (response as any).candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith("image/")) {
          console.log("✅ Gemini Flash generated image successfully");
          return {
            provider: "gemini-flash",
            model: "gemini-2.0-flash-exp-image-generation",
            buffer: Buffer.from(part.inlineData.data, "base64"),
          };
        }
      }
    }
    throw new Error("No image part in response");
  } catch (e: any) {
    console.log(`⚠️ Gemini Flash image gen failed: ${e.message}`);
    return null;
  }
}

/** Try Pollinations.ai — FREE, no API key needed */
async function tryPollinations(prompt: string): Promise<GenerationResult | null> {
  console.log("🎨 [4/5] Trying Pollinations.ai (free, no key)...");
  try {
    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=1080&height=1920&model=flux-pro&nologo=true&enhance=true&seed=${Date.now() % 10000}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(90_000), // 90s timeout — generation can be slow
      redirect: "follow",
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const arrBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrBuf);

    if (buf.length < 10_000) throw new Error(`Image too small (${buf.length} bytes)`);

    console.log(`✅ Pollinations.ai generated (${(buf.length / 1024).toFixed(0)} KB)`);
    return {
      provider: "pollinations",
      model: "flux",
      buffer: buf,
    };
  } catch (e: any) {
    console.log(`⚠️ Pollinations.ai failed: ${e.message}`);
    return null;
  }
}

/** Try OpenRouter image generation (free models) */
async function tryOpenRouter(prompt: string): Promise<GenerationResult | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  console.log("🎨 [5/5] Trying OpenRouter (free model)...");
  try {
    // Use a multimodal model that can output images
    const res = await fetch("https://openrouter.ai/api/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/whispercut",
        "X-Title": "WhisperCUT",
      },
      body: JSON.stringify({
        model: "stabilityai/stable-diffusion-xl-base-1.0",
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
      console.log("✅ OpenRouter generated successfully");
      return {
        provider: "openrouter",
        model: "sdxl",
        buffer: Buffer.from(data.data[0].b64_json, "base64"),
      };
    }
    if (data.data?.[0]?.url) {
      const imgRes = await fetch(data.data[0].url);
      const arrBuf = await imgRes.arrayBuffer();
      return {
        provider: "openrouter",
        model: "sdxl",
        buffer: Buffer.from(arrBuf),
      };
    }
    throw new Error("No image in response");
  } catch (e: any) {
    console.log(`⚠️ OpenRouter failed: ${e.message}`);
    return null;
  }
}

/** Generate AI background with fallback chain */
async function generateBackground(topic: string, hasRealPhoto = false): Promise<GenerationResult | null> {
  const prompt = buildPrompt(topic, hasRealPhoto);
  const geminiKey = process.env.GEMINI_API_KEY || "";

  // Fallback chain: xAI → Imagen 3 → Gemini Flash → Pollinations → OpenRouter
  let result = await tryXAI(prompt);
  if (result) return result;

  if (geminiKey) {
    result = await tryImagen3(prompt, geminiKey);
    if (result) return result;

    result = await tryGeminiFlash(prompt, geminiKey);
    if (result) return result;
  }

  // FREE options — no API key needed
  result = await tryPollinations(prompt);
  if (result) return result;

  result = await tryOpenRouter(prompt);
  if (result) return result;

  console.log("⚠️ All providers failed — using gradient-only background");
  return null;
}

// ══════════════════════════════════════════════════════════════
// Phase 2: Text Overlay Composition (node-canvas)
// ══════════════════════════════════════════════════════════════

function textWithStroke(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  size: number,
  strokeW = DESIGN.strokeW,
) {
  ctx.font = `900 ${size}px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Heavy black stroke (Rule 11)
  ctx.strokeStyle = DESIGN.stroke;
  ctx.lineWidth = strokeW;
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeText(text, x, y);

  // Color fill
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawGradientBackground(ctx: CanvasRenderingContext2D, variant: "A" | "B") {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  if (variant === "A") {
    grad.addColorStop(0, "#16213E");
    grad.addColorStop(0.3, "#0F3460");
    grad.addColorStop(0.6, "#1A1A2E");
    grad.addColorStop(1, "#0A0A23");
  } else {
    grad.addColorStop(0, "#1B1035");
    grad.addColorStop(0.3, "#2D1B69");
    grad.addColorStop(0.6, "#1A1A2E");
    grad.addColorStop(1, "#0A0E14");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Radial glow behind text area
  const glow = ctx.createRadialGradient(W / 2, H * 0.3, 50, W / 2, H * 0.3, W * 0.7);
  glow.addColorStop(0, "rgba(15, 52, 96, 0.3)");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

function drawTextOverlay(ctx: CanvasRenderingContext2D, input: CoverInput, variant: "A" | "B") {
  // ── 1. Dark overlay for text readability (over AI background or gradient) ──
  const overlay = ctx.createLinearGradient(0, 0, 0, H);
  overlay.addColorStop(0, "rgba(10, 10, 35, 0.88)");
  overlay.addColorStop(0.22, "rgba(10, 10, 35, 0.70)");
  overlay.addColorStop(0.40, "rgba(10, 10, 35, 0.25)");
  overlay.addColorStop(0.65, "rgba(10, 10, 35, 0.10)");
  overlay.addColorStop(0.82, "rgba(10, 10, 35, 0.50)");
  overlay.addColorStop(1, "rgba(10, 10, 35, 0.92)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Decorative giant "?" (if question hook) ──
  const hasQuestion = input.lines.some(l => l.text.includes("?") || l.text.includes("มั้ย"));
  if (hasQuestion) {
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.font = "900 600px sans-serif";
    ctx.fillStyle = DESIGN.red;
    ctx.textAlign = "center";
    ctx.fillText("?", W * 0.82, H * 0.38);
    ctx.restore();
  }

  // ── 3. Authority badge (Rule 9) ──
  if (input.badge) {
    const badgeY = 55;
    ctx.font = `bold 26px ${FONT_FAMILY}`;
    const bw = ctx.measureText(input.badge).width + 56;
    const bx = (W - bw) / 2;

    ctx.fillStyle = "rgba(255, 107, 53, 0.15)";
    ctx.strokeStyle = DESIGN.orange;
    ctx.lineWidth = 2;
    roundRect(ctx, bx, badgeY, bw, 44, 22);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = DESIGN.orange;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(input.badge, W / 2, badgeY + 22);
  }

  // ── 4. Accent bar ──
  const barColor = variant === "A" ? DESIGN.red : DESIGN.orange;
  ctx.strokeStyle = barColor;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(W / 2 - 55, 240);
  ctx.lineTo(W / 2 + 55, 240);
  ctx.stroke();

  // ── 5. HEADLINE — viral text (Rules 4, 5, 6, 10, 11) ──
  let y = 265;
  for (const line of input.lines) {
    // Variant B swaps red → orange for variety
    const color = variant === "B" && line.color === DESIGN.red ? DESIGN.orange : line.color;
    textWithStroke(ctx, line.text, W / 2, y, color, line.size);
    y += line.size * 1.28;
  }

  // ── 6. Lower third bar ──
  if (input.lowerThird) {
    const ltY = H * 0.78;
    ctx.fillStyle = DESIGN.authBg;
    ctx.fillRect(0, ltY, W, 48);
    ctx.fillStyle = barColor;
    ctx.fillRect(0, ltY, W, 3);
    ctx.font = `28px ${FONT_FAMILY}`;
    ctx.fillStyle = DESIGN.authText;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(input.lowerThird, W / 2, ltY + 27);
  }

  // ── 7. Variant tag (Rule 15) ──
  const tagX = W - 210;
  const tagY = 55;
  ctx.fillStyle = barColor;
  roundRect(ctx, tagX, tagY, 190, 36, 18);
  ctx.fill();
  ctx.font = "bold 18px sans-serif";
  ctx.fillStyle = DESIGN.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`VARIANT ${variant}`, tagX + 95, tagY + 18);
}

// ══════════════════════════════════════════════════════════════
// Phase 3: Composite Final Cover
// ══════════════════════════════════════════════════════════════

async function composeCover(
  input: CoverInput,
  aiBg: GenerationResult | null,
  variant: "A" | "B",
  outputDir: string,
): Promise<string> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // ── Layer 1: Background ──
  if (aiBg) {
    try {
      const bgImage = await loadImage(aiBg.buffer);
      // Scale to cover the full canvas (9:16)
      const scale = Math.max(W / bgImage.width, H / bgImage.height);
      const sw = bgImage.width * scale;
      const sh = bgImage.height * scale;
      const sx = (W - sw) / 2;
      const sy = (H - sh) / 2;
      ctx.drawImage(bgImage, sx, sy, sw, sh);
      console.log(`📷 AI background: ${bgImage.width}x${bgImage.height} → ${W}x${H} (${aiBg.provider})`);
    } catch (e: any) {
      console.log(`⚠️ Failed to load AI image: ${e.message}, using gradient`);
      drawGradientBackground(ctx, variant);
    }
  } else {
    drawGradientBackground(ctx, variant);
  }

  // ── Layer 1b: Real photo overlay (if provided) ──
  if (input.photoPath) {
    try {
      const photo = await loadImage(input.photoPath);
      const photoAR = photo.width / photo.height;
      const targetH = H * 0.70;
      const targetW = targetH * photoAR;
      const photoX = (W - targetW) / 2 - W * 0.05;
      const photoY = H - targetH;
      ctx.drawImage(photo, photoX, photoY, targetW, targetH);
      console.log(`📷 Photo overlay: ${photo.width}x${photo.height}`);
    } catch (e: any) {
      console.log(`⚠️ Photo not found: ${input.photoPath}`);
    }
  }

  // ── Layer 2: Text overlay ──
  drawTextOverlay(ctx, input, variant);

  // ── Export ──
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const providerTag = aiBg ? aiBg.provider : "gradient";
  const filename = `cover-${variant}-${providerTag}.png`;
  const filepath = join(outputDir, filename);
  writeFileSync(filepath, canvas.toBuffer("image/png"));

  console.log(`✅ ${filename} (${W}x${H})`);
  return filepath;
}

// ══════════════════════════════════════════════════════════════
// Main Entry
// ══════════════════════════════════════════════════════════════

async function main() {
  console.log("=== WhisperCUT AI Cover Generator ===\n");

  // ── Config ──
  const topic = process.argv[2] || "ลูกดูจอ 35 ชม./สัปดาห์ สมองเสียหาย ถาวรจริงมั้ย?";
  const photoPath = process.argv[3]; // optional real photo

  const coverInput: CoverInput = {
    topic,
    lines: [
      { text: "ลูกดูจอ",            color: DESIGN.red,   size: 108 },
      { text: "35 ชม./สัปดาห์",     color: DESIGN.gold,  size: 96  },
      { text: "สมองเสียหาย",        color: DESIGN.gold,  size: 96  },
      { text: "ถาวรจริงมั้ย?",      color: DESIGN.white, size: 92  },
    ],
    badge: "หมอกวาง วลีรัตน์คลินิก",
    lowerThird: "Screen Time + Executive Function | @doctorwaleerat",
    photoPath,
  };

  const outputDir = "./output/cover-ai";

  // ── Status ──
  console.log(`Topic: ${topic}`);
  console.log(`Photo: ${photoPath || "(none — AI-generated figure)"}`);
  console.log(`XAI_API_KEY: ${process.env.XAI_API_KEY ? "✅ set" : "❌ not set"}`);
  console.log(`GEMINI_KEY:  ${(process.env.AI_API_KEY || process.env.GEMINI_API_KEY) ? "✅ set" : "❌ not set"}`);
  console.log();

  // ── Phase 1: AI Background ──
  console.log("── Phase 1: AI Background Generation ──");
  const aiBg = await generateBackground(topic);

  // Save raw AI background for inspection
  if (aiBg) {
    const rawPath = join(outputDir, `raw-bg-${aiBg.provider}.png`);
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    writeFileSync(rawPath, aiBg.buffer);
    console.log(`💾 Raw AI background saved: ${rawPath}`);
  }

  // ── Phase 2: Compose covers ──
  console.log("\n── Phase 2: Text Overlay + Composition ──");
  const pathA = await composeCover(coverInput, aiBg, "A", outputDir);
  const pathB = await composeCover(coverInput, aiBg, "B", outputDir);

  // ── Summary ──
  console.log("\n=== Generation Complete ===");
  console.log(`Provider: ${aiBg?.provider || "gradient-only"} (${aiBg?.model || "N/A"})`);
  console.log(`Variant A: ${pathA}`);
  console.log(`Variant B: ${pathB}`);
  console.log(`\nOpen: ${outputDir}/`);
}

main().catch(console.error);
