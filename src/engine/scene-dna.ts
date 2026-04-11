/**
 * Scene DNA — Auto-generate visual styling from topic
 *
 * Maps topic → background, outfit, props, lighting, expression
 * Uses AI to generate Scene DNA when no preset matches
 * Per-channel RL adjusts preferences over time
 */

import { aiGenerateJSON } from "../ai/provider.js";
import { z } from "zod";

// ── Types ─────────────────────────────────────────────────────

export const SceneDNASchema = z.object({
  background: z.string().describe("Setting/location description"),
  outfit: z.string().describe("What the person wears"),
  props: z.array(z.string()).describe("Visible objects/equipment"),
  accessories: z.array(z.string()).describe("Jewelry, glasses, etc."),
  lighting: z.string().describe("Lighting mood and color temperature"),
  expression: z.string().describe("Facial expression and gesture"),
  mood: z.string().describe("Overall emotional tone"),
  color_accent: z.string().describe("Primary accent color hex for text"),
});

export type SceneDNA = z.infer<typeof SceneDNASchema>;

// ── Cover RL Dimensions (extends base RL) ─────────────────────

export type CoverRLDimension =
  | "expression"
  | "lighting_mood"
  | "color_scheme"
  | "face_ratio"
  | "text_position"
  | "outfit_style"
  | "background_type";

export const COVER_RL_DIMENSIONS: CoverRLDimension[] = [
  "expression", "lighting_mood", "color_scheme",
  "face_ratio", "text_position", "outfit_style", "background_type",
];

export const COVER_DIMENSION_VALUES: Record<CoverRLDimension, string[]> = {
  expression: ["shocked", "thinking", "pointing", "worried", "confident", "curious", "explaining"],
  lighting_mood: ["warm_golden", "cool_clinical", "dramatic_rim", "natural_soft", "moody_dark"],
  color_scheme: ["red_gold_white", "orange_white", "pink_white", "blue_white", "muted_luxury"],
  face_ratio: ["40%", "50%", "60%"],
  text_position: ["top_30%", "top_40%", "center_overlay"],
  outfit_style: ["white_coat", "business_casual", "elegant_dress", "lab_coat", "casual"],
  background_type: ["luxury_clinic", "modern_office", "home_warm", "studio_dark", "outdoor_natural"],
};

// ── Presets for common topic categories ────────────────────────

const SCENE_PRESETS: Record<string, Partial<SceneDNA>> = {
  medical: {
    background: "Luxury clinic interior with warm wood panels, soft marble accents, medical equipment tastefully blurred",
    outfit: "Impeccably tailored white medical coat with WALEERAT branding",
    props: ["stethoscope", "medical monitor"],
    accessories: ["elegant watch"],
    lighting: "Soft golden hour, warm and natural",
    mood: "authoritative yet approachable",
    color_accent: "#CC3333",
  },
  child_development: {
    background: "Bright modern pediatric clinic, colorful but tasteful, children's books on shelf",
    outfit: "White medical coat over pastel blouse",
    props: ["children's book", "brain model"],
    accessories: ["simple necklace"],
    lighting: "Warm soft natural light, inviting",
    mood: "caring and concerned",
    color_accent: "#FF6B35",
  },
  genetics: {
    background: "Modern genetics lab, DNA helix decoration, blue ambient lighting",
    outfit: "White lab coat, professional",
    props: ["DNA model", "microscope"],
    accessories: ["glasses"],
    lighting: "Cool blue-tinted, scientific",
    mood: "intellectual curiosity",
    color_accent: "#2196F3",
  },
  beauty: {
    background: "Luxury aesthetic clinic, marble counter, soft lighting, beauty products",
    outfit: "Elegant white dress or blazer, premium feel",
    props: ["skincare products", "mirror"],
    accessories: ["pearl earrings", "designer watch"],
    lighting: "Soft beauty lighting, flattering warm tones",
    mood: "confident and glamorous",
    color_accent: "#FF69B4",
  },
  mystical: {
    background: "Zen garden, temple elements, warm golden candlelight, incense smoke",
    outfit: "Elegant white outfit, Thai-inspired accessories",
    props: ["fortune cards", "candles", "crystals"],
    accessories: ["gold bracelet", "jade pendant"],
    lighting: "Golden mystical, warm candlelight glow",
    mood: "mysterious wisdom",
    color_accent: "#FFD700",
  },
  education: {
    background: "Modern classroom or library, bookshelves, whiteboard",
    outfit: "Smart casual blazer, professional educator look",
    props: ["books", "tablet", "whiteboard marker"],
    accessories: ["glasses", "watch"],
    lighting: "Bright natural academic lighting",
    mood: "enthusiastic teacher",
    color_accent: "#4CAF50",
  },
};

// ── Topic Category Detection ──────────────────────────────────

const TOPIC_KEYWORDS: Record<string, string[]> = {
  medical: ["หมอ", "โรค", "สุขภาพ", "คลินิก", "ยา", "อาการ", "รักษา", "สมอง", "screen time", "ดูจอ"],
  child_development: ["ลูก", "เด็ก", "พัฒนาการ", "IQ", "ฉลาด", "เลี้ยงลูก", "นม", "วัคซีน"],
  genetics: ["พันธุกรรม", "DNA", "ยีน", "หน้าเหมือน", "ถ่ายทอด", "โครโมโซม"],
  beauty: ["ผิว", "สวย", "หน้า", "ฉีด", "โบท็อกซ์", "ฟิลเลอร์", "คอลลาเจน", "laser"],
  mystical: ["โหงวเฮ้ง", "ดวง", "ดูดวง", "ลายมือ", "ฮวงจุ้ย", "นามศาสตร์"],
  education: ["โรงเรียน", "เรียน", "สอบ", "วิทยาศาสตร์", "คณิต", "ภาษา"],
};

export function detectTopicCategory(topic: string): string {
  const lower = topic.toLowerCase();
  let bestMatch = "medical"; // default
  let maxHits = 0;

  for (const [category, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    const hits = keywords.filter(kw => lower.includes(kw)).length;
    if (hits > maxHits) {
      maxHits = hits;
      bestMatch = category;
    }
  }

  return bestMatch;
}

// ── Generate Scene DNA ────────────────────────────────────────

export function getSceneDNAPreset(topic: string): SceneDNA {
  const category = detectTopicCategory(topic);
  const preset = SCENE_PRESETS[category] || SCENE_PRESETS.medical;

  return {
    background: preset.background || "Professional clinic interior",
    outfit: preset.outfit || "White medical coat",
    props: preset.props || [],
    accessories: preset.accessories || [],
    lighting: preset.lighting || "Soft natural lighting",
    expression: "concerned", // will be overridden by RL
    mood: preset.mood || "professional",
    color_accent: preset.color_accent || "#CC3333",
  };
}

/** AI-powered Scene DNA generation for custom topics */
export async function generateSceneDNA(topic: string): Promise<SceneDNA> {
  // Try preset first
  const category = detectTopicCategory(topic);
  if (SCENE_PRESETS[category]) {
    return getSceneDNAPreset(topic);
  }

  // AI generation for unknown topics
  try {
    return await aiGenerateJSON<SceneDNA>(
      `Generate visual styling (Scene DNA) for a TikTok cover about: "${topic}"

The cover features a Thai female doctor. Generate appropriate:
- background: setting that matches the topic
- outfit: what she should wear
- props: visible objects relevant to topic
- accessories: jewelry, glasses, etc.
- lighting: mood lighting description
- expression: facial expression that triggers curiosity
- mood: overall emotional tone
- color_accent: hex color for text accent that matches the topic

Return valid JSON matching this schema.`,
      { schema: SceneDNASchema },
    );
  } catch {
    return getSceneDNAPreset(topic);
  }
}

// ── Build Gemini Prompt from Scene DNA ────────────────────────

export interface CoverPromptConfig {
  topic: string;
  lines: Array<{ text: string; color: string; size: string }>;
  scene: SceneDNA;
  channel?: string;
  quietLuxury?: boolean;
  lowerThird?: string;
  memoryContext?: string;
}

export function buildCoverPrompt(config: CoverPromptConfig): string {
  const { scene, lines, quietLuxury = true } = config;

  const textLines = lines
    .map((l, i) => `- Line ${i + 1} (${l.color}, ${l.size}): ${l.text}`)
    .join("\n");

  const styleDirective = quietLuxury
    ? `AESTHETIC: QUIET LUXURY — understated elegance, no overt branding.
Think: old money, Loro Piana — not flashy, but undeniably expensive.
Text has subtle dark shadow, NOT heavy black stroke.`
    : `AESTHETIC: BOLD VIRAL — high contrast, attention-grabbing.
Text has THICK black stroke outline for maximum readability.`;

  return `Create a TikTok video thumbnail cover in vertical 9:16 format.

${styleDirective}

SUBJECT (Dr.Gwang — forensic biometric identity lock, 99.97% confidence):
- ${scene.expression} expression — ${scene.mood}
- Face: inverted triangle/oval, W:L 0.70, skin #D4A890 warm beige
- Eyes: almond, double lid, dark brown, each = 1/5 face width
- ASYMMETRY: right eyebrow 2-3mm HIGHER than left (preserve this!)
- Nose: medium bridge, rounded tip, slightly flared (1.1x inter-eye)
- Lips: gentle cupid's bow, lower lip 1.5x upper, coral tone
- Jaw: V-line soft (NOT square), tapers to rounded chin
- Wearing: ${scene.outfit}
- Accessories: ${scene.accessories.join(", ") || "gold watch, pendant necklace"}
- Build: petite ~155cm, head:body 7.3:1
- Shot on Sony A7IV, 85mm f/1.4, hyper-realistic, 8K detail

SETTING:
- ${scene.background}
- Lighting: ${scene.lighting}
- Tasteful bokeh, natural depth of field

TEXT OVERLAY (exact Thai text, stacked vertically in top 35%):
${textLines}

${config.lowerThird ? `BOTTOM: Whisper-thin bar: ${config.lowerThird}` : ""}
NO badge, NO logo, NO emoji icons unless specified.

CRITICAL: Hyper-realistic photography. Every detail must look like a real photo.${config.memoryContext ? `\n\nMEMORY INSIGHTS (learned from past selections):\n${config.memoryContext}` : ""}`;
}
