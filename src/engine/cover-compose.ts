/**
 * Cover Compose — Merge doctor photo + text overlay into final TikTok cover
 * Usage: npx tsx src/engine/cover-compose.ts <photo_path> [hook_text]
 */

import { createCanvas, loadImage, type CanvasRenderingContext2D } from "canvas";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const W = 1080;
const H = 1920;

// ── Design tokens ──────────────────────────────────────────

const T = {
  red: "#FF4444",
  orange: "#FF6B35",
  gold: "#FFD700",
  white: "#FFFFFF",
  stroke: "#000000",
  strokeW: 7,
};

// ── Text with stroke ───────────────────────────────────────

function txt(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number,
  color: string, size: number, strokeW = T.strokeW
) {
  ctx.font = `900 ${size}px "Noto Sans Thai", "Sarabun", "Arial Black", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.strokeStyle = T.stroke;
  ctx.lineWidth = strokeW;
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeText(text, x, y);
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

// ── Main compose function ──────────────────────────────────

async function compose(photoPath: string) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // ── 1. Dark gradient background ──
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#16213E");
  bg.addColorStop(0.3, "#0F3460");
  bg.addColorStop(0.6, "#1A1A2E");
  bg.addColorStop(1, "#0A0A23");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Doctor photo — center-left, bottom-aligned ──
  try {
    const photo = await loadImage(photoPath);
    const photoAR = photo.width / photo.height;

    // Scale to fill bottom 65% of canvas, center-left (Rule 7)
    const targetH = H * 0.7;
    const targetW = targetH * photoAR;
    const photoX = (W - targetW) / 2 - W * 0.05; // 5% left offset
    const photoY = H - targetH;

    ctx.drawImage(photo, photoX, photoY, targetW, targetH);
    console.log(`📷 Photo loaded: ${photo.width}×${photo.height} → scaled to ${Math.round(targetW)}×${Math.round(targetH)}`);
  } catch (e) {
    console.log(`⚠️ Photo not found: ${photoPath}, generating without photo`);
  }

  // ── 3. Dark overlay for text readability ──
  const overlay = ctx.createLinearGradient(0, 0, 0, H);
  overlay.addColorStop(0, "rgba(10, 10, 35, 0.88)");  // Top: very dark (text area)
  overlay.addColorStop(0.22, "rgba(10, 10, 35, 0.75)");
  overlay.addColorStop(0.4, "rgba(10, 10, 35, 0.35)"); // Middle: show face
  overlay.addColorStop(0.65, "rgba(10, 10, 35, 0.15)"); // Face area: mostly visible
  overlay.addColorStop(0.85, "rgba(10, 10, 35, 0.5)");
  overlay.addColorStop(1, "rgba(10, 10, 35, 0.9)");    // Bottom: dark for TikTok UI
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, W, H);

  // ── 4. Subtle decorative "?" ──
  ctx.save();
  ctx.globalAlpha = 0.035;
  ctx.font = "900 550px sans-serif";
  ctx.fillStyle = T.red;
  ctx.textAlign = "center";
  ctx.fillText("?", W * 0.83, H * 0.38);
  ctx.restore();

  // ── 5. Authority badge (Rule 9) ──
  const badge = "หมอกวาง วลีรัตน์คลินิก";
  ctx.font = "bold 26px sans-serif";
  const bw = ctx.measureText(badge).width + 50;
  const bx = (W - bw) / 2;
  ctx.fillStyle = "rgba(255, 107, 53, 0.15)";
  ctx.strokeStyle = T.orange;
  ctx.lineWidth = 2;
  roundRect(ctx, bx, 55, bw, 44, 22);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = T.orange;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(badge, W / 2, 77);

  // ── 6. Accent bar ──
  ctx.strokeStyle = T.red;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(W / 2 - 50, 240);
  ctx.lineTo(W / 2 + 50, 240);
  ctx.stroke();

  // ── 7. HEADLINE — the viral text ──
  const lines = [
    { text: "ลูกดูจอ",         color: T.red,   size: 108 },  // Rule 6: keyword RED
    { text: "35 ชม./สัปดาห์",  color: T.gold,  size: 96  },  // Rule 10: number GOLD
    { text: "สมองเสียหาย",     color: T.gold,  size: 96  },  // Rule 10: emotion GOLD
    { text: "ถาวรจริงมั้ย?",   color: T.white, size: 92  },  // Question hook WHITE
  ];

  let y = 265;
  for (const line of lines) {
    txt(ctx, line.text, W / 2, y, line.color, line.size);
    y += line.size * 1.25;
  }

  // ── 8. Lower third bar ──
  const barY = H * 0.78;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, barY, W, 48);
  ctx.fillStyle = T.red;
  ctx.fillRect(0, barY, W, 3);
  ctx.font = "28px sans-serif";
  ctx.fillStyle = "#BBBBBB";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Screen Time + Executive Function | @doctorwaleerat", W / 2, barY + 27);

  // ── 9. Export ──
  const outDir = "./output/cover-final";
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const filepath = join(outDir, "cover-final-A.png");
  writeFileSync(filepath, canvas.toBuffer("image/png"));
  console.log(`\n✅ Final cover: ${filepath} (${W}×${H})`);

  // ── 10. Generate Variant B (orange accent) ──
  // Redraw with orange instead of red for the keyword
  const canvas2 = createCanvas(W, H);
  const ctx2 = canvas2.getContext("2d");

  // Copy everything
  ctx2.drawImage(canvas, 0, 0);

  // Re-draw headline with orange keyword
  const overlayTop = ctx2.createLinearGradient(0, 200, 0, 750);
  overlayTop.addColorStop(0, "rgba(10, 10, 35, 0.9)");
  overlayTop.addColorStop(1, "rgba(10, 10, 35, 0.7)");
  ctx2.fillStyle = overlayTop;
  ctx2.fillRect(0, 230, W, 520);

  const linesB = [
    { text: "ลูกดูจอ",         color: T.orange, size: 108 },  // Orange variant
    { text: "35 ชม./สัปดาห์",  color: T.gold,   size: 96  },
    { text: "สมองเสียหาย",     color: T.white,  size: 96  },  // White instead of gold
    { text: "ถาวร...",         color: T.orange, size: 100 },  // Cliffhanger variant
  ];

  let y2 = 265;
  for (const line of linesB) {
    txt(ctx2, line.text, W / 2, y2, line.color, line.size);
    y2 += line.size * 1.25;
  }

  // Orange variant tag
  ctx2.fillStyle = T.orange;
  roundRect(ctx2, W - 210, 55, 190, 36, 18);
  ctx2.fill();
  ctx2.font = "bold 18px sans-serif";
  ctx2.fillStyle = T.white;
  ctx2.textAlign = "center";
  ctx2.textBaseline = "middle";
  ctx2.fillText("VARIANT B: bold claim", W - 115, 73);

  const filepath2 = join(outDir, "cover-final-B.png");
  writeFileSync(filepath2, canvas2.toBuffer("image/png"));
  console.log(`✅ Final cover: ${filepath2} (${W}×${H})`);
}

// ── CLI ────────────────────────────────────────────────────

const photoPath = process.argv[2] || "/Users/witsarutkrimthungthong/Downloads/Doctor/S__47775783.jpg";
console.log("=== WhisperCUT Cover Compose ===");
console.log(`Photo: ${photoPath}\n`);
compose(photoPath);
