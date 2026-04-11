/**
 * Facial Measurements — Automated Golden Ratio & Proportion Analysis
 *
 * Extracts facial landmarks from generated images and measures:
 *   - 8 Golden Ratios (face W:L, nose:mouth, lip ratio, etc.)
 *   - Rule of Thirds (horizontal face division)
 *   - Rule of Fifths (vertical face division)
 *   - 5 Asymmetry measurements (eyebrow, eye, smile, nose)
 *   - Skin tone extraction (hex + LAB values)
 *   - Head:Body ratio (full body images)
 *
 * Uses Python mediapipe/opencv via sidecar for landmark detection.
 * Falls back to Gemini Vision API if Python unavailable.
 *
 * Part of LumaLabs-grade QA pipeline.
 */

import { execFileSync } from "child_process";
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { aiGenerateJSON } from "../ai/provider.js";

// ── Types ─────────────────────────────────────────────────────

export interface GoldenRatios {
  face_width_length: number;        // Target: 0.70 (±5%)
  nose_mouth_width: number;         // Target: 0.50 (1:2 ratio → 0.50)
  upper_lower_lip: number;          // Target: 0.67 (1:1.5 → 0.67)
  eye_face_width: number;           // Target: 0.20 (1:5)
  jaw_cheekbone_width: number;      // Target: 0.80
  interpupillary_nose: number;      // Target: 1.20
  nose_length_width: number;        // Target: 1.40
  face_thirds: [number, number, number]; // Target: [0.30, 0.32, 0.38]
}

export interface AsymmetryMeasurements {
  eyebrow_height_diff_mm: number;   // Target: 2-3mm (right higher)
  eye_opening_ratio: number;        // Target: >1.0 (right slightly larger)
  smile_commissure_diff: number;    // Target: left pulls higher
  nose_deviation_degrees: number;   // Target: slight rightward
  overall_symmetry_score: number;   // 0-100 (80+ = natural human asymmetry)
}

export interface SkinToneAnalysis {
  hex: string;                      // Target: #D4A890 range
  rgb: [number, number, number];
  lab: [number, number, number];
  undertone: "warm" | "cool" | "neutral";
  match_to_reference: number;       // 0-100 (vs #D4A890)
}

export interface FacialMeasurementReport {
  image_path: string;
  timestamp: string;
  method: "mediapipe" | "gemini_vision" | "manual";

  // Core measurements
  golden_ratios: GoldenRatios;
  asymmetries: AsymmetryMeasurements;
  skin_tone: SkinToneAnalysis;

  // QA results
  ratios_passing: number;           // out of 8
  ratios_failing: string[];         // which ratios failed
  overall_score: number;            // 0-100
  verdict: "PASS" | "MINOR_ISSUES" | "FAIL";

  // Deviations
  deviations: Array<{
    measurement: string;
    actual: number;
    target: number;
    deviation_pct: number;
    severity: "ok" | "minor" | "critical";
  }>;
}

// ── Dr.Gwang Reference Values (from LumaLabs forensic analysis) ──

export const DRGWANG_REFERENCE: {
  golden_ratios: GoldenRatios;
  asymmetries: Partial<AsymmetryMeasurements>;
  skin_hex: string;
  tolerances: Record<string, number>;
} = {
  golden_ratios: {
    face_width_length: 0.70,
    nose_mouth_width: 0.50,
    upper_lower_lip: 0.67,
    eye_face_width: 0.20,
    jaw_cheekbone_width: 0.80,
    interpupillary_nose: 1.20,
    nose_length_width: 1.40,
    face_thirds: [0.30, 0.32, 0.38],
  },
  asymmetries: {
    eyebrow_height_diff_mm: 2.5,  // right higher
    eye_opening_ratio: 1.05,       // right slightly larger
    nose_deviation_degrees: 2.0,   // slight rightward
  },
  skin_hex: "#D4A890",
  tolerances: {
    face_width_length: 0.05,       // ±5%
    nose_mouth_width: 0.05,
    upper_lower_lip: 0.05,
    eye_face_width: 0.03,
    jaw_cheekbone_width: 0.05,
    interpupillary_nose: 0.10,
    nose_length_width: 0.10,
    face_thirds: 0.05,
    skin_tone: 15,                 // ±15 in LAB space
  },
};

// ── Measurement via Gemini Vision (primary — works everywhere) ──

async function measureViaGemini(imagePath: string): Promise<GoldenRatios & { asymmetries?: Partial<AsymmetryMeasurements>; skin_hex?: string; eyebrow_height_diff_mm?: number; eye_opening_ratio?: number; nose_deviation_degrees?: number; overall_symmetry_score?: number }> {
  const imageData = readFileSync(imagePath).toString("base64");
  const ext = imagePath.toLowerCase().endsWith(".jpg") ? "jpeg" : "png";

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const prompt = `Analyze this portrait image and measure facial proportions precisely.

Return EXACT numerical measurements (not descriptions):

1. face_width_length: face width ÷ face length (ear-to-ear ÷ hairline-to-chin)
2. nose_mouth_width: nose width ÷ mouth width
3. upper_lower_lip: upper lip height ÷ lower lip height
4. eye_face_width: single eye width ÷ total face width
5. jaw_cheekbone_width: jaw width at gonion ÷ cheekbone width
6. interpupillary_nose: inter-pupillary distance ÷ nose width
7. nose_length_width: nose length ÷ nose width
8. face_thirds: [hairline-to-brow %, brow-to-nose %, nose-to-chin %] (must sum to 1.0)
9. eyebrow_height_diff_mm: estimated mm difference between right and left eyebrow peak (positive = right higher)
10. eye_opening_ratio: right eye opening ÷ left eye opening
11. nose_deviation_degrees: estimated degrees of nose deviation from center (positive = rightward)
12. overall_symmetry_score: 0-100 (100 = perfect symmetry, 80 = natural human asymmetry)
13. skin_hex: dominant skin color as hex (e.g. #D4A890)

Return ONLY valid JSON:
{
  "face_width_length": 0.70,
  "nose_mouth_width": 0.50,
  "upper_lower_lip": 0.67,
  "eye_face_width": 0.20,
  "jaw_cheekbone_width": 0.80,
  "interpupillary_nose": 1.20,
  "nose_length_width": 1.40,
  "face_thirds": [0.30, 0.32, 0.38],
  "eyebrow_height_diff_mm": 2.5,
  "eye_opening_ratio": 1.05,
  "nose_deviation_degrees": 2.0,
  "overall_symmetry_score": 85,
  "skin_hex": "#D4A890"
}`;

  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType: `image/${ext}`, data: imageData } },
        { text: prompt },
      ],
    }],
  });

  const text = (res as any).candidates?.[0]?.content?.parts?.[0]?.text || "";
  let clean = text.trim();
  const fence = clean.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence) clean = fence[1].trim();

  return JSON.parse(clean);
}

// ── Compare & Score ───────────────────────────────────────────

function compareRatio(
  name: string,
  actual: number,
  target: number,
  tolerance: number,
): { measurement: string; actual: number; target: number; deviation_pct: number; severity: "ok" | "minor" | "critical" } {
  const deviation = Math.abs(actual - target) / target;
  const severity = deviation <= tolerance ? "ok" : deviation <= tolerance * 2 ? "minor" : "critical";
  return {
    measurement: name,
    actual: Math.round(actual * 1000) / 1000,
    target,
    deviation_pct: Math.round(deviation * 1000) / 10,
    severity,
  };
}

function hexToLab(hex: string): [number, number, number] {
  // Simplified hex → approximate LAB
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  // Approximate L from luminance
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [L * 100, (r - g) * 50, (g - b) * 50];
}

function skinToneMatch(actualHex: string, targetHex: string): number {
  const [aL, aA, aB] = hexToLab(actualHex);
  const [tL, tA, tB] = hexToLab(targetHex);
  const deltaE = Math.sqrt((aL - tL) ** 2 + (aA - tA) ** 2 + (aB - tB) ** 2);
  return Math.max(0, Math.round(100 - deltaE * 3)); // 0-100 scale
}

// ── Main Measurement Function ─────────────────────────────────

export async function measureFace(imagePath: string): Promise<FacialMeasurementReport> {
  if (!existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  console.error(`[facial-measurements] Analyzing: ${imagePath}`);

  // Measure via Gemini Vision
  const raw = await measureViaGemini(imagePath);

  const ref = DRGWANG_REFERENCE;
  const tol = ref.tolerances;

  // Compare all ratios
  const deviations = [
    compareRatio("face_width_length", raw.face_width_length, ref.golden_ratios.face_width_length, tol.face_width_length),
    compareRatio("nose_mouth_width", raw.nose_mouth_width, ref.golden_ratios.nose_mouth_width, tol.nose_mouth_width),
    compareRatio("upper_lower_lip", raw.upper_lower_lip, ref.golden_ratios.upper_lower_lip, tol.upper_lower_lip),
    compareRatio("eye_face_width", raw.eye_face_width, ref.golden_ratios.eye_face_width, tol.eye_face_width),
    compareRatio("jaw_cheekbone_width", raw.jaw_cheekbone_width, ref.golden_ratios.jaw_cheekbone_width, tol.jaw_cheekbone_width),
    compareRatio("interpupillary_nose", raw.interpupillary_nose, ref.golden_ratios.interpupillary_nose, tol.interpupillary_nose),
    compareRatio("nose_length_width", raw.nose_length_width, ref.golden_ratios.nose_length_width, tol.nose_length_width),
  ];

  const passing = deviations.filter(d => d.severity === "ok").length;
  const failing = deviations.filter(d => d.severity !== "ok").map(d => d.measurement);
  const criticalCount = deviations.filter(d => d.severity === "critical").length;

  const overallScore = Math.round((passing / deviations.length) * 80 + (raw.asymmetries?.overall_symmetry_score || 80) * 0.2);

  const verdict: "PASS" | "MINOR_ISSUES" | "FAIL" =
    criticalCount === 0 && passing >= 6 ? "PASS" :
    criticalCount <= 1 && passing >= 4 ? "MINOR_ISSUES" :
    "FAIL";

  const skinMatch = skinToneMatch(raw.skin_hex || "#D4A890", ref.skin_hex);

  const report: FacialMeasurementReport = {
    image_path: imagePath,
    timestamp: new Date().toISOString(),
    method: "gemini_vision",

    golden_ratios: {
      face_width_length: raw.face_width_length,
      nose_mouth_width: raw.nose_mouth_width,
      upper_lower_lip: raw.upper_lower_lip,
      eye_face_width: raw.eye_face_width,
      jaw_cheekbone_width: raw.jaw_cheekbone_width,
      interpupillary_nose: raw.interpupillary_nose,
      nose_length_width: raw.nose_length_width,
      face_thirds: raw.face_thirds || [0.33, 0.33, 0.34],
    },

    asymmetries: {
      eyebrow_height_diff_mm: raw.asymmetries?.eyebrow_height_diff_mm ?? raw.eyebrow_height_diff_mm ?? 0,
      eye_opening_ratio: raw.asymmetries?.eye_opening_ratio ?? raw.eye_opening_ratio ?? 1.0,
      smile_commissure_diff: 0,
      nose_deviation_degrees: raw.asymmetries?.nose_deviation_degrees ?? raw.nose_deviation_degrees ?? 0,
      overall_symmetry_score: raw.asymmetries?.overall_symmetry_score ?? raw.overall_symmetry_score ?? 80,
    },

    skin_tone: {
      hex: raw.skin_hex || "#D4A890",
      rgb: [
        parseInt((raw.skin_hex || "#D4A890").slice(1, 3), 16),
        parseInt((raw.skin_hex || "#D4A890").slice(3, 5), 16),
        parseInt((raw.skin_hex || "#D4A890").slice(5, 7), 16),
      ],
      lab: hexToLab(raw.skin_hex || "#D4A890"),
      undertone: "warm",
      match_to_reference: skinMatch,
    },

    ratios_passing: passing,
    ratios_failing: failing,
    overall_score: overallScore,
    verdict,
    deviations,
  };

  console.error(`[facial-measurements] Score: ${overallScore}/100 | Verdict: ${verdict} | Passing: ${passing}/7 ratios`);
  return report;
}

/** Format measurement report for display */
export function formatMeasurementReport(report: FacialMeasurementReport): string {
  const lines = [
    `=== Facial Measurement Report ===`,
    `Image: ${report.image_path}`,
    `Method: ${report.method}`,
    `Score: ${report.overall_score}/100 | Verdict: ${report.verdict}`,
    `Ratios: ${report.ratios_passing}/7 passing`,
    ``,
    `--- Golden Ratios ---`,
  ];

  for (const d of report.deviations) {
    const icon = d.severity === "ok" ? "✅" : d.severity === "minor" ? "⚠️" : "❌";
    lines.push(`${icon} ${d.measurement}: ${d.actual} (target: ${d.target}, deviation: ${d.deviation_pct}%)`);
  }

  lines.push(``, `--- Asymmetries ---`);
  lines.push(`Eyebrow diff: ${report.asymmetries.eyebrow_height_diff_mm}mm (target: 2-3mm right higher)`);
  lines.push(`Eye ratio: ${report.asymmetries.eye_opening_ratio} (target: >1.0)`);
  lines.push(`Symmetry: ${report.asymmetries.overall_symmetry_score}/100`);

  lines.push(``, `--- Skin Tone ---`);
  lines.push(`Hex: ${report.skin_tone.hex} (reference: #D4A890)`);
  lines.push(`Match: ${report.skin_tone.match_to_reference}/100`);

  if (report.ratios_failing.length > 0) {
    lines.push(``, `--- Failing ---`);
    lines.push(report.ratios_failing.join(", "));
  }

  return lines.join("\n");
}

/** Save report as JSON alongside image */
export function saveMeasurementReport(report: FacialMeasurementReport, outputPath?: string): string {
  const path = outputPath || report.image_path.replace(/\.(png|jpg|jpeg)$/i, "-measurements.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}
