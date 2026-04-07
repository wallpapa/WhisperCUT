/**
 * Vibe Engine — AI Agent's creative director
 *
 * Takes: topic + vibe → generates science-encoded script
 * with hormone arc, hook, pacing, CTA — all research-backed.
 *
 * This is the core of "AI Agent as CapCut Editor":
 * Instead of human choosing cuts, transitions, timing —
 * the vibe engine encodes the science and executes automatically.
 */

import { GoogleGenAI } from "@google/genai";
import { getVibe, recommendVibe, type VibeType } from "../science/vibe-library.js";
export type { VibeType };
import { scoreHook } from "../science/hook-scorer.js";
import { selectCTA } from "../science/cta-selector.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export type Platform = "tiktok" | "instagram" | "youtube" | "facebook";

export interface VibeScript {
  topic: string;
  vibe: VibeType;
  platform: Platform;
  duration_sec: number;

  // Structured script with timestamps
  segments: Array<{
    label: string;              // "hook" | "problem" | "story" | "revelation" | "solution" | "cta"
    start_sec: number;
    end_sec: number;
    narration: string;          // text for TTS
    on_screen_text: string;     // caption/overlay text (for muted viewing)
    hormone: string;            // dominant hormone in this segment
    cut_rate: number;           // cuts per second for this segment
    transition_in: string;      // transition type
    visual_direction: string;   // b-roll or visual note for editor
  }>;

  // Science metadata
  hook_text: string;            // first 3 seconds isolated
  cta_primary: string;
  cta_secondary: string;
  cta_placement_sec: number;

  // Full narration (concatenated, for TTS)
  full_narration: string;

  // Predicted performance
  predicted_completion_rate: number;
  predicted_share_rate: number;
}

export interface VibeEditResult {
  script: VibeScript;
  hook_score: Awaited<ReturnType<typeof scoreHook>>;
  cta_recommendation: ReturnType<typeof selectCTA>;
  quality_passed: boolean;
  iterations: number;
}

// ── Main Vibe Edit Function ─────────────────────────────────────────────────

export async function vibeEdit(params: {
  topic: string;
  vibe: VibeType;
  platform: Platform;
  duration?: number;
  goal?: "virality" | "engagement" | "saves" | "followers";
  max_retries?: number;
}): Promise<VibeEditResult> {
  const {
    topic,
    vibe,
    platform,
    duration = 75,
    goal = "virality",
    max_retries = 3,
  } = params;

  const vibeConfig = getVibe(vibe);
  const ctaRec = selectCTA({ vibe, platform, goal, duration_sec: duration });

  let script: VibeScript | null = null;
  let hookScore: Awaited<ReturnType<typeof scoreHook>> | null = null;
  let iterations = 0;

  for (let attempt = 1; attempt <= max_retries; attempt++) {
    iterations = attempt;
    console.error(`[vibe-engine] Attempt ${attempt}/${max_retries} — generating ${vibe} script...`);

    script = await generateVibeScript({
      topic, vibe: vibeConfig, platform, duration, ctaRec,
      hookRewrite: hookScore?.rewrite,  // pass rewrite suggestion on retry
    });

    // Score the hook specifically
    hookScore = await scoreHook(script.hook_text, topic, platform);
    console.error(`[vibe-engine] Hook score: ${hookScore.overall}/10 (${hookScore.taxonomy}, +${hookScore.taxonomy_lift_pct}% lift)`);

    if (hookScore.overall >= 8.0) {
      console.error(`[vibe-engine] ✅ Hook passed (${hookScore.overall}/10)`);
      break;
    }

    if (attempt < max_retries) {
      console.error(`[vibe-engine] Hook score ${hookScore.overall}/10 < 8.0 — regenerating with suggestion: "${hookScore.suggestion}"`);
    }
  }

  const qualityPassed =
    (hookScore?.overall ?? 0) >= 7.0 &&   // hook threshold
    script !== null;

  return {
    script: script!,
    hook_score: hookScore!,
    cta_recommendation: ctaRec,
    quality_passed: qualityPassed,
    iterations,
  };
}

// ── Script Generator ────────────────────────────────────────────────────────

async function generateVibeScript(params: {
  topic: string;
  vibe: ReturnType<typeof getVibe>;
  platform: Platform;
  duration: number;
  ctaRec: ReturnType<typeof selectCTA>;
  hookRewrite?: string | null;
}): Promise<VibeScript> {
  const { topic, vibe, platform, duration, ctaRec, hookRewrite } = params;

  // Build hormone arc guidance from vibe config
  const hormoneGuidance = vibe.hormone_arc.map(beat => {
    const startSec = Math.round(beat.start_pct / 100 * duration);
    const endSec   = Math.round(beat.end_pct   / 100 * duration);
    return `  [${startSec}s–${endSec}s] ${beat.hormone.toUpperCase()} (intensity ${beat.intensity}/3): ${beat.script_guidance}`;
  }).join("\n");

  const hookInstruction = hookRewrite
    ? `IMPORTANT: The previous hook was scored poorly. Use this improved version as your hook:\n"${hookRewrite}"`
    : `Hook must be: ${vibe.hook_taxonomy} type (${vibe.hook_taxonomy === "DirectAddress" ? "speak directly to viewer" : vibe.hook_taxonomy === "CuriosityGap" ? "open an unanswered question" : vibe.hook_taxonomy === "BoldClaim" ? "make a counter-intuitive statement" : "create immediate engagement"})`;

  const prompt = `You are a world-class Thai short-form video scriptwriter and neuroscience-informed content strategist.

Create a ${vibe.display_name} style video script for:
TOPIC: ${topic}
PLATFORM: ${platform}
DURATION: ${duration} seconds
VIBE: ${vibe.name} — ${vibe.description}

HORMONE ARC TO FOLLOW (research-backed structure):
${hormoneGuidance}

HOOK REQUIREMENT (first 3 seconds — most critical):
${hookInstruction}

CTA (call-to-action at ${Math.round(ctaRec.placement_pct / 100 * duration)}s):
Primary: "${ctaRec.text_th}" (${ctaRec.type} — ${(ctaRec.conversion_rate * 100).toFixed(1)}% conversion rate)
Secondary at 28s: "${ctaRec.secondary?.text_th}" (for early drop-off viewers)

STORY PATTERN: ${vibe.story_pattern}
PACING: hook=${vibe.hook_cut_rate} cuts/sec, body=${vibe.body_cut_rate}, story=${vibe.story_cut_rate}

PLATFORM NOTES FOR ${platform.toUpperCase()}:
${vibe.platform_notes[platform] ?? "Standard vertical format"}

REWATCH ELEMENT: ${vibe.rewatch_element}

OUTPUT REQUIREMENTS:
- Write in Thai (สนทนาธรรมดา, not formal)
- Each segment: narration must be speakable in exactly the time window
- on_screen_text: short enough to read in the segment duration (for muted viewing)
- visual_direction: specific instruction for what to show/film

Respond in JSON only:
{
  "segments": [
    {
      "label": "hook",
      "start_sec": 0,
      "end_sec": 3,
      "narration": "...",
      "on_screen_text": "...",
      "hormone": "cortisol",
      "cut_rate": ${vibe.hook_cut_rate},
      "transition_in": "hard_cut",
      "visual_direction": "..."
    },
    ... more segments following the hormone arc ...
    {
      "label": "cta",
      "start_sec": ${Math.round(ctaRec.placement_pct / 100 * duration)},
      "end_sec": ${duration},
      "narration": "${ctaRec.text_th}",
      "on_screen_text": "${ctaRec.text_th}",
      "hormone": "serotonin",
      "cut_rate": 0.2,
      "transition_in": "hard_cut",
      "visual_direction": "face to camera, slow zoom in"
    }
  ]
}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  let raw = (response.text ?? "").trim();
  if (raw.startsWith("```")) {
    raw = raw.split("\n").slice(1).join("\n").replace(/```$/, "").trim();
  }

  const parsed = JSON.parse(raw);
  const segments = parsed.segments as VibeScript["segments"];

  const hookSegment = segments.find(s => s.label === "hook");
  const ctaSegment  = segments.find(s => s.label === "cta");
  const fullNarration = segments.map(s => s.narration).join(" ");

  return {
    topic,
    vibe: vibe.name,
    platform,
    duration_sec: duration,
    segments,
    hook_text:              hookSegment?.narration ?? "",
    cta_primary:            ctaRec.text_th,
    cta_secondary:          ctaRec.secondary?.text_th ?? "",
    cta_placement_sec:      Math.round(ctaRec.placement_pct / 100 * duration),
    full_narration:         fullNarration,
    predicted_completion_rate: vibe.predicted_completion_rate,
    predicted_share_rate:      vibe.predicted_share_rate,
  };
}

/** Auto-select best vibe for a topic and generate script */
export async function autoVibeEdit(params: {
  topic: string;
  platform: Platform;
  contentType?: "educational" | "story" | "news" | "tips";
  goal?: "virality" | "engagement" | "saves" | "followers";
  duration?: number;
}): Promise<VibeEditResult> {
  const {
    topic,
    platform,
    contentType = "educational",
    goal = "virality",
    duration,
  } = params;

  const safePlatform = platform === "facebook" ? "instagram" : platform;
  const recommendedVibe = recommendVibe(contentType, safePlatform, goal === "saves" ? "saves" : "completion");
  console.error(`[vibe-engine] Auto-selected vibe: "${recommendedVibe}" for ${contentType}/${platform}/${goal}`);

  return vibeEdit({ topic, vibe: recommendedVibe, platform, duration, goal });
}
