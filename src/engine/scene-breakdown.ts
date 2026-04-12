/**
 * Scene Breakdown — Multi-Scene Path for Hook, Body, CTA
 *
 * Breaks down a TikTok clip into distinct scenes, each with its own:
 *   - Scene DNA (background, outfit, props, lighting)
 *   - Expression/reaction style
 *   - Camera angle reference
 *   - Cover design reference
 *
 * Maps to hormone arc:
 *   Hook scene  (0-3s)   → cortisol → shocked/worried expression
 *   Body scenes (3-55s)  → dopamine/oxytocin → explaining/thinking
 *   CTA scene   (55-75s) → serotonin → confident/pointing
 *
 * Uses approved digital twin reference images per scene type.
 */

import { type SceneDNA, getSceneDNAPreset, detectTopicCategory } from "./scene-dna.js";

// ── Types ─────────────────────────────────────────────────────

export interface SceneBreakdown {
  hook: SceneConfig;
  body: SceneConfig[];
  cta: SceneConfig;
  total_scenes: number;
  estimated_duration_sec: number;
}

export interface SceneConfig {
  id: string;
  label: string;
  segment: "hook" | "body" | "cta";
  time_range: [number, number];  // [start_sec, end_sec]
  hormone: string;

  // Visual config
  scene_dna: SceneDNA;
  expression: string;
  camera_angle: string;
  reference_image?: string;  // from digital twin pack

  // Script
  narration: string;
  on_screen_text?: string;

  // Cover reference (which scene generates the cover)
  is_cover_source: boolean;
}

// ── Reference Images per Scene Type ───────────────────────────

const SCENE_REFERENCES: Record<string, string> = {
  // From clone-master-set-v3
  hook_frontal: "output/digital-twins/drgwang/clone-master-set-v3/front-face-portrait.png",
  body_medium: "output/digital-twins/drgwang/clone-master-set-v3/front-face-portrait.png",
  body_profile: "output/digital-twins/drgwang/clone-master-set-v3/side-profile-portrait.png",
  cta_confident: "output/digital-twins/drgwang/clone-master-set-v3/front-face-portrait.png",
  full_body: "output/digital-twins/drgwang/clone-master-set-v3/full-body-front.png",
};

// ── Expression per Hormone Phase ──────────────────────────────

const HORMONE_EXPRESSIONS: Record<string, {
  expression: string;
  camera: string;
  mood: string;
}> = {
  cortisol: {
    expression: "deeply worried, slightly open mouth, wide concerned eyes, hand near face",
    camera: "close-up, eye-level, slightly off-center left",
    mood: "urgent, alarming",
  },
  dopamine: {
    expression: "curious, raised eyebrow, leaning forward, engaged look",
    camera: "medium close-up, eye-level",
    mood: "intriguing, mysterious",
  },
  oxytocin: {
    expression: "warm, gentle smile, soft eyes, nodding, open palms gesture",
    camera: "medium shot, slightly high angle (nurturing)",
    mood: "trustworthy, caring",
  },
  adrenaline: {
    expression: "shocked revelation, eyes wide, mouth slightly open, pointing gesture",
    camera: "close-up, dynamic angle, slight low angle (authority)",
    mood: "dramatic, revealing",
  },
  serotonin: {
    expression: "confident smile, direct eye contact, pointing up, nodding",
    camera: "medium close-up, eye-level, centered",
    mood: "reassuring, actionable",
  },
};

// ── Scene Breakdown Generator ─────────────────────────────────

export function breakdownScript(params: {
  topic: string;
  vibe: string;
  segments: Array<{
    label: string;
    hormone: string;
    narration: string;
    on_screen_text?: string;
    start_sec: number;
    end_sec: number;
  }>;
  channel?: string;
}): SceneBreakdown {
  const { topic, vibe, segments, channel = "doctorwaleerat" } = params;
  const category = detectTopicCategory(topic);
  const baseScene = getSceneDNAPreset(topic);

  const scenes: SceneConfig[] = segments.map((seg, i) => {
    const hormoneConfig = HORMONE_EXPRESSIONS[seg.hormone] || HORMONE_EXPRESSIONS.dopamine;
    const isHook = seg.label === "hook" || seg.start_sec === 0;
    const isCTA = seg.label.includes("cta") || seg.label.includes("CTA");

    // Select reference image based on scene type
    let referenceImage = SCENE_REFERENCES.body_medium;
    if (isHook) referenceImage = SCENE_REFERENCES.hook_frontal;
    if (isCTA) referenceImage = SCENE_REFERENCES.cta_confident;
    if (seg.hormone === "oxytocin") referenceImage = SCENE_REFERENCES.body_medium;

    const sceneDna: SceneDNA = {
      ...baseScene,
      expression: hormoneConfig.expression,
      mood: hormoneConfig.mood,
      lighting: isHook ? "dramatic warm rim light, slight orange glow"
        : isCTA ? "bright, warm, confident studio lighting"
        : baseScene.lighting,
    };

    return {
      id: `scene-${i + 1}-${seg.label}`,
      label: seg.label,
      segment: isHook ? "hook" : isCTA ? "cta" : "body",
      time_range: [seg.start_sec, seg.end_sec],
      hormone: seg.hormone,
      scene_dna: sceneDna,
      expression: hormoneConfig.expression,
      camera_angle: hormoneConfig.camera,
      reference_image: referenceImage,
      narration: seg.narration,
      on_screen_text: seg.on_screen_text,
      is_cover_source: isHook, // Hook scene generates the cover
    };
  });

  const hookScene = scenes.find(s => s.segment === "hook") || scenes[0];
  const ctaScene = scenes.find(s => s.segment === "cta") || scenes[scenes.length - 1];
  const bodyScenes = scenes.filter(s => s.segment === "body");

  const totalDuration = Math.max(...segments.map(s => s.end_sec));

  return {
    hook: hookScene,
    body: bodyScenes,
    cta: ctaScene,
    total_scenes: scenes.length,
    estimated_duration_sec: totalDuration,
  };
}

/** Format scene breakdown for display */
export function formatSceneBreakdown(breakdown: SceneBreakdown): string {
  const lines = [
    `=== Scene Breakdown (${breakdown.total_scenes} scenes, ${breakdown.estimated_duration_sec}s) ===`,
    ``,
    `── HOOK (${breakdown.hook.time_range[0]}-${breakdown.hook.time_range[1]}s) ──`,
    `  Hormone: ${breakdown.hook.hormone}`,
    `  Expression: ${breakdown.hook.expression}`,
    `  Camera: ${breakdown.hook.camera_angle}`,
    `  Reference: ${breakdown.hook.reference_image}`,
    `  Cover source: ${breakdown.hook.is_cover_source ? "YES" : "no"}`,
    ``,
  ];

  for (const body of breakdown.body) {
    lines.push(`── BODY: ${body.label} (${body.time_range[0]}-${body.time_range[1]}s) ──`);
    lines.push(`  Hormone: ${body.hormone}`);
    lines.push(`  Expression: ${body.expression}`);
    lines.push(`  Camera: ${body.camera_angle}`);
    lines.push(``);
  }

  lines.push(`── CTA (${breakdown.cta.time_range[0]}-${breakdown.cta.time_range[1]}s) ──`);
  lines.push(`  Hormone: ${breakdown.cta.hormone}`);
  lines.push(`  Expression: ${breakdown.cta.expression}`);
  lines.push(`  Camera: ${breakdown.cta.camera_angle}`);

  return lines.join("\n");
}

/** Default 5-segment breakdown for shocking_reveal vibe */
export function defaultShockingRevealBreakdown(topic: string): SceneBreakdown {
  return breakdownScript({
    topic,
    vibe: "shocking_reveal",
    segments: [
      { label: "hook", hormone: "cortisol", start_sec: 0, end_sec: 3,
        narration: "Hook — cortisol spike", on_screen_text: "⚠️ keyword" },
      { label: "curiosity", hormone: "dopamine", start_sec: 3, end_sec: 15,
        narration: "Build curiosity gap", on_screen_text: "Research reference" },
      { label: "trust", hormone: "oxytocin", start_sec: 15, end_sec: 35,
        narration: "Build trust + authority", on_screen_text: "Expert explanation" },
      { label: "reveal", hormone: "adrenaline", start_sec: 35, end_sec: 55,
        narration: "Shocking revelation", on_screen_text: "Key insight" },
      { label: "cta", hormone: "serotonin", start_sec: 55, end_sec: 75,
        narration: "CTA with specific promise", on_screen_text: "กดเซฟ + ติดตาม" },
    ],
  });
}
