/**
 * Cover Generator v2 — Viral TikTok Cover PNGs
 *
 * Cloned from @doctorwaleerat covers that got 1.9M-2.2M views:
 * - WHITE dominant text (bold, large)
 * - RED keyword accent (1-2 words only)
 * - GOLD emotion word (subtle, not dominant)
 * - Black stroke for legibility
 * - Dark gradient background
 * - Face zone for photo overlay
 * - Clean 3-layer design (Rule 8)
 */

import { createCanvas, type CanvasRenderingContext2D } from "canvas";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { CoverTemplate } from "./cover-template.js";

// ── Types ──────────────────────────────────────────────────

export interface CoverConfig {
  hook: string;                       // Full hook text (will be split into lines)
  style: CoverTemplate["style"];
  keyword: string;                    // 1-2 words → RED
  emotionWord?: string;               // 1 word → GOLD
  numberText?: string;                // Number → GOLD large
  lowerThirdText?: string;            // Bottom bar text
  authorityBadge?: string;            // Top badge
  isMedical?: boolean;
  outputDir: string;
}

export interface GeneratedCover {
  path: string;
  variant: "A" | "B";
  style: CoverTemplate["style"];
}

// ── Design Tokens (from @doctorwaleerat analysis) ──────────

const T = {
  // Canvas
  W: 1080,
  H: 1920,

  // Background gradient (dark for TikTok dark feed)
  bgTop: "#16213E",
  bgMid: "#0F3460",
  bgBot: "#0A0A23",

  // Text
  white: "#FFFFFF",
  stroke: "#000000",
  strokeW: 8,

  // Accent (from COVER_PATTERNS: top 3 all use #FF4444 or #FF6B35)
  red: "#FF4444",
  orange: "#FF6B35",
  gold: "#FFD700",

  // Authority
  authBg: "rgba(0,0,0,0.55)",
  authText: "#BBBBBB",
  authAccent: "#FF6B35",

  // Typography
  headlineSize: 96,
  headlineWeight: "900",
  keywordSize: 108,
  lowerSize: 28,
  badgeSize: 26,

  // Layout zones
  textStartY: 0.15,    // Headline starts at 15% from top
  faceStartY: 0.48,    // Face zone starts at 48%
  lowerBarY: 0.77,     // Lower third at 77%
  safeBottom: 0.82,    // TikTok UI below this
};

// ── Helpers ────────────────────────────────────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function textWithStroke(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  fillColor: string,
  fontSize: number,
  strokeW: number = T.strokeW
) {
  ctx.font = `${T.headlineWeight} ${fontSize}px "Noto Sans Thai", "Sarabun", "Arial Black", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Stroke (Rule 11)
  ctx.strokeStyle = T.stroke;
  ctx.lineWidth = strokeW;
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeText(text, x, y);

  // Fill
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
}

// ── Split hook into styled lines ───────────────────────────

interface StyledLine {
  text: string;
  color: string;
  size: number;
}

function parseHookToLines(config: CoverConfig): StyledLine[] {
  // Split by newlines first, then by word length
  const rawLines = config.hook.includes("\n")
    ? config.hook.split("\n")
    : splitByLength(config.hook, 10);

  return rawLines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // Determine color for this line
    let color = T.white;
    let size = T.headlineSize;

    // Keyword line → RED (Rule 6)
    if (config.keyword && trimmed.includes(config.keyword)) {
      color = T.red;
      size = T.keywordSize;
    }
    // Emotion word line → GOLD (Rule 10)
    else if (config.emotionWord && trimmed.includes(config.emotionWord)) {
      color = T.gold;
      size = T.headlineSize * 1.05;
    }
    // Number line → GOLD large (Rule 10)
    else if (config.numberText && trimmed.includes(config.numberText)) {
      color = T.gold;
      size = T.keywordSize * 1.1;
    }

    return { text: trimmed, color, size };
  }).filter(Boolean) as StyledLine[];
}

function splitByLength(text: string, maxLen: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";

  for (const w of words) {
    if ((cur + " " + w).trim().length > maxLen && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + " " + w : w;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 5);
}

// ── Draw Layers ────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D, variant: "A" | "B") {
  const grad = ctx.createLinearGradient(0, 0, 0, T.H);

  if (variant === "A") {
    // Variant A: Cool blue-navy (Dr.Gwang's typical style)
    grad.addColorStop(0, "#16213E");
    grad.addColorStop(0.3, "#0F3460");
    grad.addColorStop(0.6, "#1A1A2E");
    grad.addColorStop(1, "#0A0A23");
  } else {
    // Variant B: Warmer dark purple-navy
    grad.addColorStop(0, "#1B1035");
    grad.addColorStop(0.3, "#2D1B69");
    grad.addColorStop(0.6, "#1A1A2E");
    grad.addColorStop(1, "#0A0E14");
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, T.W, T.H);

  // Subtle radial glow behind text area
  const glow = ctx.createRadialGradient(T.W / 2, T.H * 0.3, 50, T.W / 2, T.H * 0.3, T.W * 0.7);
  glow.addColorStop(0, "rgba(15, 52, 96, 0.4)");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, T.W, T.H);
}

function drawFaceZone(ctx: CanvasRenderingContext2D) {
  // Rule 1: 40-60% of frame | Rule 7: center-left
  const cx = T.W * 0.46;
  const cy = T.H * 0.62;
  const rx = T.W * 0.30;
  const ry = T.H * 0.22;

  // Subtle face silhouette
  ctx.save();
  ctx.globalAlpha = 0.06;
  const faceGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, rx);
  faceGrad.addColorStop(0, "#D4A574");
  faceGrad.addColorStop(1, "transparent");
  ctx.fillStyle = faceGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Label
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.font = "22px sans-serif";
  ctx.fillStyle = T.white;
  ctx.textAlign = "center";
  ctx.fillText("📷 วางรูปหมอกวางที่นี่", cx, cy - 10);
  ctx.fillText("(close-up, eye contact, center-left)", cx, cy + 20);
  ctx.restore();
}

function drawHeadlines(ctx: CanvasRenderingContext2D, lines: StyledLine[]) {
  const startY = T.H * T.textStartY;
  let y = startY;

  for (const line of lines) {
    const lineH = line.size * 1.25;
    textWithStroke(ctx, line.text, T.W / 2, y, line.color, line.size);
    y += lineH;
  }
}

function drawAuthorityBadge(ctx: CanvasRenderingContext2D, text: string, isMedical: boolean) {
  const y = T.H * 0.04;
  const h = 44;
  const pad = 28;

  ctx.font = `bold ${T.badgeSize}px sans-serif`;
  const tw = ctx.measureText(text).width;
  const w = tw + pad * 2;
  const x = (T.W - w) / 2;

  // Pill background
  ctx.save();
  if (isMedical) {
    ctx.fillStyle = "rgba(255, 107, 53, 0.15)";
    ctx.strokeStyle = T.authAccent;
    ctx.lineWidth = 2;
  } else {
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
  }
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Text
  ctx.fillStyle = isMedical ? T.authAccent : "rgba(255,255,255,0.7)";
  ctx.font = `bold ${T.badgeSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, T.W / 2, y + h / 2);
}

function drawAccentBar(ctx: CanvasRenderingContext2D, color: string) {
  const y = T.H * T.textStartY - 30;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(T.W / 2 - 50, y);
  ctx.lineTo(T.W / 2 + 50, y);
  ctx.stroke();
  ctx.restore();
}

function drawLowerThird(ctx: CanvasRenderingContext2D, text: string) {
  const y = T.H * T.lowerBarY;
  const h = 48;

  // Bar background
  ctx.fillStyle = T.authBg;
  ctx.fillRect(0, y, T.W, h);

  // Thin accent line on top
  ctx.fillStyle = T.red;
  ctx.fillRect(0, y, T.W, 2);

  // Text
  ctx.font = `${T.lowerSize}px sans-serif`;
  ctx.fillStyle = T.authText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, T.W / 2, y + h / 2);
}

function drawVariantTag(ctx: CanvasRenderingContext2D, variant: "A" | "B", style: string, color: string) {
  const x = T.W - 200;
  const y = T.H * 0.04;

  ctx.fillStyle = color;
  roundRect(ctx, x, y, 180, 36, 18);
  ctx.fill();

  ctx.font = "bold 17px sans-serif";
  ctx.fillStyle = T.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`VARIANT ${variant}`, x + 90, y + 18);
}

function drawQuestionMark(ctx: CanvasRenderingContext2D, lines: StyledLine[]) {
  // Add large decorative "?" if it's a question hook
  const hasQuestion = lines.some(l => l.text.includes("?") || l.text.includes("มั้ย"));
  if (!hasQuestion) return;

  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.font = "900 600px sans-serif";
  ctx.fillStyle = T.red;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", T.W * 0.82, T.H * 0.35);
  ctx.restore();
}

// ── Main Generator ─────────────────────────────────────────

export function generateCover(config: CoverConfig): GeneratedCover[] {
  if (!existsSync(config.outputDir)) {
    mkdirSync(config.outputDir, { recursive: true });
  }

  const results: GeneratedCover[] = [];
  const accentColor = config.style === "bold_claim" ? T.orange : T.red;

  // Rule 15: 2 variants
  const variants: Array<{ v: "A" | "B"; style: CoverTemplate["style"] }> = [
    { v: "A", style: config.style },
    { v: "B", style: config.style === "question_hook" ? "bold_claim" : "question_hook" },
  ];

  for (const { v, style } of variants) {
    const canvas = createCanvas(T.W, T.H);
    const ctx = canvas.getContext("2d");

    // Parse hook into styled lines
    const lines = parseHookToLines({ ...config, style });

    // 1. Background
    drawBackground(ctx, v);

    // 2. Decorative question mark (if question hook)
    drawQuestionMark(ctx, lines);

    // 3. Face zone (Rule 1, 7)
    drawFaceZone(ctx);

    // 4. Accent bar
    drawAccentBar(ctx, v === "A" ? T.red : T.orange);

    // 5. Authority badge (Rule 9)
    if (config.authorityBadge) {
      drawAuthorityBadge(ctx, config.authorityBadge, config.isMedical ?? false);
    }

    // 6. Headlines (Rules 4, 5, 6, 10, 11)
    drawHeadlines(ctx, lines);

    // 7. Lower third
    if (config.lowerThirdText) {
      drawLowerThird(ctx, config.lowerThirdText);
    }

    // 8. Variant tag (Rule 15)
    drawVariantTag(ctx, v, style, v === "A" ? T.red : T.orange);

    // Export
    const filename = `cover-${v}-${style}.png`;
    const filepath = join(config.outputDir, filename);
    writeFileSync(filepath, canvas.toBuffer("image/png"));
    results.push({ path: filepath, variant: v, style });
    console.log(`✅ ${filename} (${T.W}×${T.H})`);
  }

  return results;
}

// ── CLI Test ───────────────────────────────────────────────

if (process.argv[1]?.includes("cover-generator")) {
  console.log("=== WhisperCUT Cover Generator v2 ===\n");

  generateCover({
    hook: "ลูกดูจอ\n35 ชม./สัปดาห์\nสมองเสียหาย\nถาวรจริงมั้ย?",
    style: "question_hook",
    keyword: "ลูกดูจอ",
    emotionWord: "สมองเสียหาย",
    numberText: "35",
    authorityBadge: "หมอกวาง วลีรัตน์คลินิก",
    lowerThirdText: "Screen Time + Executive Function | @doctorwaleerat",
    isMedical: false,
    outputDir: "./output/cover-v2",
  });

  console.log("\n✅ Done! Open output/cover-v2/ to see results.");
}
