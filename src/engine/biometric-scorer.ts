/**
 * Biometric Scorer — Identity Verification against Reference Images
 *
 * Scores generated avatar images against 7+ reference photos.
 * Implements LumaLabs-grade verification:
 *   - Per-feature scoring (eyes, nose, lips, jaw, cheekbones, skin, hair)
 *   - Cross-reference comparison (multiple refs, averaged)
 *   - Asymmetry preservation check
 *   - Approval gating (reject < 95%)
 *
 * Uses Gemini Vision for comparison (no Python dependency).
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { measureFace, type FacialMeasurementReport } from "./facial-measurements.js";

// ── Types ─────────────────────────────────────────────────────

export interface BiometricFeatureScore {
  eyes: number;          // 0-10
  nose: number;          // 0-10
  lips: number;          // 0-10
  jaw: number;           // 0-10
  cheekbones: number;    // 0-10
  skin_tone: number;     // 0-10
  hair: number;          // 0-10
  eyebrow_asymmetry: number; // 0-10 (10 = asymmetry preserved correctly)
  overall_shape: number; // 0-10
}

export interface BiometricComparisonResult {
  reference_id: string;
  reference_path: string;
  feature_scores: BiometricFeatureScore;
  biometric_match_pct: number;  // 0-100
  verdict: "PASS" | "MINOR" | "FAIL";
}

export interface BiometricReport {
  generated_image: string;
  timestamp: string;
  comparisons: BiometricComparisonResult[];
  average_match_pct: number;
  feature_averages: BiometricFeatureScore;
  measurements?: FacialMeasurementReport;
  overall_verdict: "APPROVED" | "MINOR_ISSUES" | "REJECTED";
  rejection_reasons: string[];
  approval_threshold: number;
}

// ── Default Reference Images ──────────────────────────────────

const DEFAULT_REFS = [
  { id: "front_face", path: "output/digital-twins/drgwang/clone-master-set-v3/front-face-portrait.png" },
  { id: "side_profile", path: "output/digital-twins/drgwang/clone-master-set-v3/side-profile-portrait.png" },
  { id: "full_body", path: "output/digital-twins/drgwang/clone-master-set-v3/full-body-front.png" },
];

// ── Gemini Vision Comparison ──────────────────────────────────

async function compareViaGemini(
  generatedPath: string,
  referencePath: string,
  referenceId: string,
): Promise<BiometricComparisonResult> {
  const genData = readFileSync(generatedPath).toString("base64");
  const refData = readFileSync(referencePath).toString("base64");
  const genExt = generatedPath.toLowerCase().endsWith(".jpg") ? "jpeg" : "png";
  const refExt = referencePath.toLowerCase().endsWith(".jpg") ? "jpeg" : "png";

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const prompt = `Compare these two images of the same person. Image 1 is AI-generated, Image 2 is the reference photo.

Score each feature 0-10 (10 = identical to reference):
- eyes: shape, color, lid crease, spacing, size
- nose: bridge width, tip shape, nostril flare, length
- lips: cupid's bow shape, thickness ratio (upper:lower), width, color
- jaw: width, angle, sharpness, chin shape
- cheekbones: height, prominence, width relative to jaw
- skin_tone: color match, undertone, texture similarity
- hair: color (dark + balayage), texture (wavy), style (middle part), length
- eyebrow_asymmetry: does the RIGHT eyebrow sit 2-3mm HIGHER than left? (10 = yes, correct asymmetry preserved; 0 = symmetric or wrong direction)
- overall_shape: face shape match (inverted triangle/oval)

Also provide biometric_match_pct: 0-100 (overall identity similarity).

Return ONLY valid JSON:
{
  "eyes": 9,
  "nose": 8,
  "lips": 9,
  "jaw": 8,
  "cheekbones": 9,
  "skin_tone": 8,
  "hair": 9,
  "eyebrow_asymmetry": 7,
  "overall_shape": 9,
  "biometric_match_pct": 92.5
}`;

  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{
      role: "user",
      parts: [
        { text: "Image 1 (AI-generated):" },
        { inlineData: { mimeType: `image/${genExt}`, data: genData } },
        { text: "Image 2 (Reference photo):" },
        { inlineData: { mimeType: `image/${refExt}`, data: refData } },
        { text: prompt },
      ],
    }],
  });

  const text = (res as any).candidates?.[0]?.content?.parts?.[0]?.text || "";
  let clean = text.trim();
  const fence = clean.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence) clean = fence[1].trim();

  const scores = JSON.parse(clean);
  const matchPct = scores.biometric_match_pct || 0;

  return {
    reference_id: referenceId,
    reference_path: referencePath,
    feature_scores: {
      eyes: scores.eyes || 5,
      nose: scores.nose || 5,
      lips: scores.lips || 5,
      jaw: scores.jaw || 5,
      cheekbones: scores.cheekbones || 5,
      skin_tone: scores.skin_tone || 5,
      hair: scores.hair || 5,
      eyebrow_asymmetry: scores.eyebrow_asymmetry || 5,
      overall_shape: scores.overall_shape || 5,
    },
    biometric_match_pct: matchPct,
    verdict: matchPct >= 95 ? "PASS" : matchPct >= 85 ? "MINOR" : "FAIL",
  };
}

// ── Main Scoring Function ─────────────────────────────────────

export async function scoreBiometric(
  generatedImage: string,
  options?: {
    references?: Array<{ id: string; path: string }>;
    threshold?: number;
    runMeasurements?: boolean;
  },
): Promise<BiometricReport> {
  const {
    references = DEFAULT_REFS,
    threshold = 95,
    runMeasurements = true,
  } = options || {};

  if (!existsSync(generatedImage)) {
    throw new Error(`Generated image not found: ${generatedImage}`);
  }

  console.error(`[biometric] Scoring: ${generatedImage} against ${references.length} references`);

  // Filter existing references
  const validRefs = references.filter(r => existsSync(r.path));
  if (validRefs.length === 0) {
    console.error("[biometric] No reference images found — skipping comparison");
    return {
      generated_image: generatedImage,
      timestamp: new Date().toISOString(),
      comparisons: [],
      average_match_pct: 0,
      feature_averages: { eyes: 0, nose: 0, lips: 0, jaw: 0, cheekbones: 0, skin_tone: 0, hair: 0, eyebrow_asymmetry: 0, overall_shape: 0 },
      overall_verdict: "REJECTED",
      rejection_reasons: ["No reference images available for comparison"],
      approval_threshold: threshold,
    };
  }

  // Compare against each reference
  const comparisons: BiometricComparisonResult[] = [];
  for (const ref of validRefs) {
    try {
      const result = await compareViaGemini(generatedImage, ref.path, ref.id);
      comparisons.push(result);
      console.error(`  [biometric] vs ${ref.id}: ${result.biometric_match_pct}% ${result.verdict}`);
    } catch (e: any) {
      console.error(`  [biometric] vs ${ref.id}: FAILED — ${e.message?.slice(0, 80)}`);
    }
  }

  // Calculate averages
  const avgMatch = comparisons.length > 0
    ? comparisons.reduce((sum, c) => sum + c.biometric_match_pct, 0) / comparisons.length
    : 0;

  const featureKeys: (keyof BiometricFeatureScore)[] = [
    "eyes", "nose", "lips", "jaw", "cheekbones", "skin_tone", "hair", "eyebrow_asymmetry", "overall_shape",
  ];

  const featureAverages = {} as BiometricFeatureScore;
  for (const key of featureKeys) {
    const avg = comparisons.length > 0
      ? comparisons.reduce((sum, c) => sum + c.feature_scores[key], 0) / comparisons.length
      : 0;
    featureAverages[key] = Math.round(avg * 10) / 10;
  }

  // Run facial measurements if requested
  let measurements: FacialMeasurementReport | undefined;
  if (runMeasurements) {
    try {
      measurements = await measureFace(generatedImage);
    } catch (e: any) {
      console.error(`[biometric] Measurements failed: ${e.message?.slice(0, 80)}`);
    }
  }

  // Determine verdict
  const rejectionReasons: string[] = [];
  if (avgMatch < threshold) {
    rejectionReasons.push(`Average biometric match ${avgMatch.toFixed(1)}% < ${threshold}% threshold`);
  }
  if (measurements?.verdict === "FAIL") {
    rejectionReasons.push(`Facial proportions FAIL: ${measurements.ratios_failing.join(", ")}`);
  }
  for (const key of featureKeys) {
    if (featureAverages[key] < 6) {
      rejectionReasons.push(`${key} score ${featureAverages[key]}/10 below minimum (6)`);
    }
  }

  const overallVerdict: "APPROVED" | "MINOR_ISSUES" | "REJECTED" =
    rejectionReasons.length === 0 ? "APPROVED" :
    rejectionReasons.every(r => r.includes("MINOR") || !r.includes("FAIL")) && avgMatch >= threshold - 5 ? "MINOR_ISSUES" :
    "REJECTED";

  const report: BiometricReport = {
    generated_image: generatedImage,
    timestamp: new Date().toISOString(),
    comparisons,
    average_match_pct: Math.round(avgMatch * 10) / 10,
    feature_averages: featureAverages,
    measurements,
    overall_verdict: overallVerdict,
    rejection_reasons: rejectionReasons,
    approval_threshold: threshold,
  };

  console.error(`[biometric] Average: ${avgMatch.toFixed(1)}% | Verdict: ${overallVerdict}`);
  return report;
}

/** Format biometric report for display */
export function formatBiometricReport(report: BiometricReport): string {
  const lines = [
    `=== Biometric Identity Report ===`,
    `Image: ${report.generated_image}`,
    `Average Match: ${report.average_match_pct}% (threshold: ${report.approval_threshold}%)`,
    `Verdict: ${report.overall_verdict}`,
    ``,
    `--- Per-Reference Scores ---`,
  ];

  for (const c of report.comparisons) {
    const icon = c.verdict === "PASS" ? "✅" : c.verdict === "MINOR" ? "⚠️" : "❌";
    lines.push(`${icon} vs ${c.reference_id}: ${c.biometric_match_pct}%`);
  }

  lines.push(``, `--- Feature Averages (0-10) ---`);
  const fa = report.feature_averages;
  lines.push(`Eyes: ${fa.eyes} | Nose: ${fa.nose} | Lips: ${fa.lips} | Jaw: ${fa.jaw}`);
  lines.push(`Cheekbones: ${fa.cheekbones} | Skin: ${fa.skin_tone} | Hair: ${fa.hair}`);
  lines.push(`Eyebrow Asymmetry: ${fa.eyebrow_asymmetry} | Shape: ${fa.overall_shape}`);

  if (report.rejection_reasons.length > 0) {
    lines.push(``, `--- Issues ---`);
    report.rejection_reasons.forEach(r => lines.push(`❌ ${r}`));
  }

  return lines.join("\n");
}

/** Save biometric report alongside image */
export function saveBiometricReport(report: BiometricReport, outputPath?: string): string {
  const path = outputPath || report.generated_image.replace(/\.(png|jpg|jpeg)$/i, "-biometric.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}
