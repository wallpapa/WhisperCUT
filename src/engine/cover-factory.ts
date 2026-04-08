/**
 * Cover Factory — ONE command, multiple professional TikTok covers
 *
 * Generates 4+ cover variants using AI background + perfect Thai text:
 *   - AI background (Pollinations FLUX, Gemini Imagen 3, xAI Aurora)
 *   - Thai text overlay with Kanit font (node-canvas, pixel-perfect)
 *   - 1080x1920 PNG, TikTok-ready
 *
 * Usage:
 *   npx tsx src/engine/cover-factory.ts
 *   npx tsx src/engine/cover-factory.ts --photo ./output/doctor-gwang.png
 *   npx tsx src/engine/cover-factory.ts --topic "หัวข้ออื่น"
 */

import { GoogleGenAI } from "@google/genai";
import { createCanvas, loadImage, registerFont, type CanvasRenderingContext2D } from "canvas";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import "dotenv/config";

// ── Canvas ────────────────────────────────────────────────────
const W = 1080, H = 1920;

// ── Register Kanit Thai font ──────────────────────────────────
const FONT_DIR = join(process.cwd(), "assets/fonts");
try {
  if (existsSync(join(FONT_DIR, "Kanit-Black.ttf")))
    registerFont(join(FONT_DIR, "Kanit-Black.ttf"), { family: "Kanit", weight: "900" });
  if (existsSync(join(FONT_DIR, "Kanit-Bold.ttf")))
    registerFont(join(FONT_DIR, "Kanit-Bold.ttf"), { family: "Kanit", weight: "bold" });
  if (existsSync(join(FONT_DIR, "Kanit-Regular.ttf")))
    registerFont(join(FONT_DIR, "Kanit-Regular.ttf"), { family: "Kanit", weight: "normal" });
} catch {}

const FONT = `"Kanit", "Noto Sans Thai", sans-serif`;

// ── Design tokens ─────────────────────────────────────────────
const C = {
  red: "#FF4444", orange: "#FF6B35", gold: "#FFD700",
  white: "#FFFFFF", stroke: "#000000",
};

// ── Types ─────────────────────────────────────────────────────
interface Line { text: string; color: string; size: number }
interface CoverSpec {
  lines: Line[];
  badge?: string;
  lowerThird?: string;
}

// ══════════════════════════════════════════════════════════════
//  AI Background Generators
// ══════════════════════════════════════════════════════════════

function bgPrompt(topic: string, hasPhoto: boolean): string {
  const base = hasPhoto
    ? "Dark cinematic navy-blue gradient background for TikTok thumbnail. Abstract medical/neural network patterns in background. No people, no text. Deep navy #16213E to near-black #0A0A23. Leave center-bottom area empty for person overlay."
    : "Professional TikTok thumbnail. Dark navy-blue gradient (#16213E to #0A0A23). Asian female doctor in white coat, center-left, waist up, eye contact, dramatic rim lighting. No text, no watermarks.";
  return `${base} Vertical 9:16. Photorealistic, high detail. Topic: ${topic}`;
}

async function fetchAIBackground(topic: string, hasPhoto: boolean, seed: number): Promise<Buffer | null> {
  const prompt = bgPrompt(topic, hasPhoto);

  // Try Gemini Imagen 3
  const gemKey = process.env.GEMINI_API_KEY;
  if (gemKey && gemKey.startsWith("AIza")) {
    try {
      const ai = new GoogleGenAI({ apiKey: gemKey });
      const res = await ai.models.generateImages({
        model: "imagen-3.0-generate-002",
        prompt,
        config: { numberOfImages: 1, aspectRatio: "9:16" },
      });
      const img = (res as any).generatedImages?.[0]?.image?.imageBytes;
      if (img) {
        console.log("  ✅ Imagen 3");
        return Buffer.from(img, "base64");
      }
    } catch (e: any) {
      console.log(`  ⚠️ Imagen 3: ${e.message?.slice(0, 80)}`);
    }
  }

  // Pollinations.ai (free)
  try {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1920&model=flux-pro&nologo=true&enhance=true&seed=${seed}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000), redirect: "follow" });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 5000) {
        console.log(`  ✅ Pollinations (${(buf.length / 1024).toFixed(0)} KB)`);
        return buf;
      }
    }
  } catch (e: any) {
    console.log(`  ⚠️ Pollinations: ${e.message?.slice(0, 80)}`);
  }

  return null;
}

// ══════════════════════════════════════════════════════════════
//  Thai Text Renderer (node-canvas)
// ══════════════════════════════════════════════════════════════

function strokeText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size: number) {
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  // Black stroke
  ctx.strokeStyle = C.stroke;
  ctx.lineWidth = 8;
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeText(text, x, y);
  // Color fill
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function renderCover(bgBuf: Buffer | null, photo: Buffer | null, spec: CoverSpec, accentColor: string): Buffer {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // ── 1. Background (AI image or gradient) ──
  if (bgBuf) {
    try {
      // We need to use loadImage synchronously — since it returns a promise,
      // we'll draw gradient first and overlay AI bg async won't work here.
      // Instead, use canvas drawImage with buffer.
      // loadImage is async, so we'll handle this differently
    } catch {}
  }
  // Draw gradient as base (will be covered by AI image if available)
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#16213E");
  grad.addColorStop(0.3, "#0F3460");
  grad.addColorStop(0.6, "#1A1A2E");
  grad.addColorStop(1, "#0A0A23");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Radial glow
  const glow = ctx.createRadialGradient(W / 2, H * 0.3, 50, W / 2, H * 0.3, W * 0.7);
  glow.addColorStop(0, "rgba(15, 52, 96, 0.3)");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  return canvas.toBuffer("image/png");
}

// Async version that properly handles image loading
async function renderCoverAsync(bgBuf: Buffer | null, photoPath: string | null, spec: CoverSpec, accentColor: string, tag: string): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // ── 1. Background ──
  if (bgBuf) {
    try {
      const bgImg = await loadImage(bgBuf);
      const scale = Math.max(W / bgImg.width, H / bgImg.height);
      const sw = bgImg.width * scale, sh = bgImg.height * scale;
      ctx.drawImage(bgImg, (W - sw) / 2, (H - sh) / 2, sw, sh);
    } catch {
      drawGradient(ctx);
    }
  } else {
    drawGradient(ctx);
  }

  // ── 2. Real photo (if provided) ──
  if (photoPath) {
    try {
      const photo = await loadImage(photoPath);
      const ar = photo.width / photo.height;
      const tH = H * 0.70, tW = tH * ar;
      ctx.drawImage(photo, (W - tW) / 2 - W * 0.05, H - tH, tW, tH);
    } catch {}
  }

  // ── 3. Dark overlay for text readability ──
  const ov = ctx.createLinearGradient(0, 0, 0, H);
  ov.addColorStop(0, "rgba(10, 10, 35, 0.88)");
  ov.addColorStop(0.22, "rgba(10, 10, 35, 0.65)");
  ov.addColorStop(0.40, "rgba(10, 10, 35, 0.20)");
  ov.addColorStop(0.65, "rgba(10, 10, 35, 0.08)");
  ov.addColorStop(0.82, "rgba(10, 10, 35, 0.50)");
  ov.addColorStop(1, "rgba(10, 10, 35, 0.92)");
  ctx.fillStyle = ov;
  ctx.fillRect(0, 0, W, H);

  // ── 4. Decorative "?" ──
  if (spec.lines.some(l => l.text.includes("?") || l.text.includes("มั้ย"))) {
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.font = "900 600px sans-serif";
    ctx.fillStyle = C.red;
    ctx.textAlign = "center";
    ctx.fillText("?", W * 0.82, H * 0.38);
    ctx.restore();
  }

  // ── 5. Authority badge ──
  if (spec.badge) {
    ctx.font = `bold 26px ${FONT}`;
    const bw = ctx.measureText(spec.badge).width + 56;
    const bx = (W - bw) / 2;
    ctx.fillStyle = "rgba(255, 107, 53, 0.15)";
    ctx.strokeStyle = C.orange;
    ctx.lineWidth = 2;
    pill(ctx, bx, 55, bw, 44, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.orange;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(spec.badge, W / 2, 77);
  }

  // ── 6. Accent bar ──
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(W / 2 - 55, 240);
  ctx.lineTo(W / 2 + 55, 240);
  ctx.stroke();

  // ── 7. Headlines ──
  let y = 265;
  for (const line of spec.lines) {
    strokeText(ctx, line.text, W / 2, y, line.color, line.size);
    y += line.size * 1.28;
  }

  // ── 8. Lower third ──
  if (spec.lowerThird) {
    const ltY = H * 0.78;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, ltY, W, 48);
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, ltY, W, 3);
    ctx.font = `28px ${FONT}`;
    ctx.fillStyle = "#BBBBBB";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(spec.lowerThird, W / 2, ltY + 27);
  }

  // ── 9. Tag ──
  ctx.fillStyle = accentColor;
  pill(ctx, W - 210, 55, 190, 36, 18);
  ctx.fill();
  ctx.font = "bold 18px sans-serif";
  ctx.fillStyle = C.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(tag, W - 115, 73);

  return canvas.toBuffer("image/png");
}

function drawGradient(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#16213E");
  grad.addColorStop(0.3, "#0F3460");
  grad.addColorStop(0.6, "#1A1A2E");
  grad.addColorStop(1, "#0A0A23");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.3, 50, W / 2, H * 0.3, W * 0.7);
  glow.addColorStop(0, "rgba(15, 52, 96, 0.3)");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

// ══════════════════════════════════════════════════════════════
//  Main Factory
// ══════════════════════════════════════════════════════════════

async function main() {
  console.log("=== WhisperCUT Cover Factory ===\n");

  // ── Parse args ──
  const args = process.argv.slice(2);
  let photoPath: string | null = null;
  let topic = "ลูกดูจอ 35 ชม./สัปดาห์ สมองเสียหาย ถาวรจริงมั้ย?";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--photo" && args[i + 1]) photoPath = args[++i];
    else if (args[i] === "--topic" && args[i + 1]) topic = args[++i];
  }

  const spec: CoverSpec = {
    lines: [
      { text: "ลูกดูจอ",            color: C.red,   size: 108 },
      { text: "35 ชม./สัปดาห์",     color: C.gold,  size: 96  },
      { text: "สมองเสียหาย",        color: C.gold,  size: 96  },
      { text: "ถาวรจริงมั้ย?",      color: C.white, size: 92  },
    ],
    badge: "หมอกวาง วลีรัตน์คลินิก",
    lowerThird: "Screen Time + Executive Function | @doctorwaleerat",
  };

  const outDir = "./output/cover-factory";
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  console.log(`Topic: ${topic}`);
  console.log(`Photo: ${photoPath || "(AI-generated)"}`);
  console.log();

  // ── Generate 3 AI backgrounds in parallel ──
  console.log("🚀 Generating AI backgrounds...");
  const bgTasks = [1, 2, 3].map(async (i) => {
    const seed = Math.floor(Math.random() * 100000);
    console.log(`  [${i}/3] seed=${seed}`);
    return fetchAIBackground(topic, !!photoPath, seed);
  });

  const backgrounds = await Promise.allSettled(bgTasks);
  const bgBuffers: (Buffer | null)[] = backgrounds.map(r =>
    r.status === "fulfilled" ? r.value : null
  );

  // Add gradient-only variant
  bgBuffers.push(null);

  // ── Render covers ──
  console.log("\n🎨 Rendering covers...");
  const variants: { tag: string; accent: string; bg: Buffer | null }[] = [
    { tag: "AI + RED",       accent: C.red,    bg: bgBuffers[0] },
    { tag: "AI + ORANGE",    accent: C.orange, bg: bgBuffers[1] },
    { tag: "AI + RED v2",    accent: C.red,    bg: bgBuffers[2] },
    { tag: "GRADIENT + RED", accent: C.red,    bg: null },
  ];

  const saved: string[] = [];
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const buf = await renderCoverAsync(v.bg, photoPath, spec, v.accent, v.tag);
    const path = join(outDir, `cover-${i + 1}-${v.tag.replace(/\s+/g, "-").toLowerCase()}.png`);
    writeFileSync(path, buf);
    saved.push(path);
    console.log(`  ✅ ${path}`);
  }

  // Also save raw AI backgrounds
  for (let i = 0; i < 3; i++) {
    if (bgBuffers[i]) {
      const rawPath = join(outDir, `raw-bg-${i + 1}.png`);
      writeFileSync(rawPath, bgBuffers[i]!);
    }
  }

  console.log(`\n=== Done: ${saved.length} covers ===`);
  console.log(`Open: ${outDir}/`);
}

main().catch(console.error);
