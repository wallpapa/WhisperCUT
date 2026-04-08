/**
 * Veo 3 B-Roll Generator — AI Video Footage for TikTok Insert Cuts
 *
 * Generates 8-second video clips using Google Veo 3.1 for:
 *   - Medical B-roll (brain scans, lab equipment, clinic shots)
 *   - Concept visualization (screen time effects, neural connections)
 *   - Emotional footage (children, families, reactions)
 *   - Abstract/cinematic (transitions, overlays)
 *
 * Models:
 *   veo-3.1-generate-preview     — highest quality
 *   veo-3.1-lite-generate-preview — 50% cheaper, same speed
 *
 * Usage:
 *   npx tsx src/engine/veo-generator.ts "brain neural connections"
 */

import { GoogleGenAI } from "@google/genai";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import "dotenv/config";

// ── Types ─────────────────────────────────────────────────────

export interface VeoConfig {
  /** Duration: "4", "6", or "8" seconds */
  duration?: "4" | "6" | "8";
  /** Aspect ratio: "16:9" landscape or "9:16" vertical TikTok */
  aspectRatio?: "16:9" | "9:16";
  /** Resolution: "720p", "1080p", or "4k" */
  resolution?: "720p" | "1080p";
  /** Model: full quality or lite (50% cheaper) */
  model?: "full" | "lite";
}

export interface VeoResult {
  prompt: string;
  videoPath: string;
  model: string;
  duration: string;
  aspectRatio: string;
  resolution: string;
}

// ── Models ────────────────────────────────────────────────────

const MODELS = {
  full: "veo-3.1-generate-preview",
  lite: "veo-3.1-lite-generate-preview",
} as const;

const OUT_DIR = "./output/broll";

// ── B-Roll Prompt Templates ───────────────────────────────────

export const BROLL_PRESETS: Record<string, string> = {
  brain_activity: "Cinematic close-up of a human brain with glowing neural connections firing blue and gold light pulses. Dark background, medical visualization style. Slow camera orbit. 8K detail.",

  child_screen: "Close-up of a young child's face illuminated by blue screen light in a dark room. Reflection of the screen visible in the child's eyes. Soft focus, cinematic, slightly eerie mood.",

  clinic_interior: "Smooth tracking shot through a modern luxury medical clinic. Warm wood panels, soft marble accents, elegant lighting. No people. Cinematic dolly movement. 4K.",

  neuron_zoom: "Microscopic view zooming into brain neurons. Dendrites branching and connecting with electric sparks. Scientific visualization with warm gold and deep blue colors. Macro lens feel.",

  family_moment: "Warm cinematic shot of Thai family — mother and child reading a book together on a cozy sofa. Golden hour sunlight through window. Shallow depth of field. Emotional, heartwarming.",

  data_visualization: "Abstract 3D data visualization with flowing particles and graphs. Numbers and statistics floating in space. Blue and orange accent colors. Modern tech aesthetic.",

  doctor_hands: "Close-up of doctor's hands writing notes with a premium pen on a clipboard. White coat sleeve visible. Shallow depth of field. Warm clinic lighting. Professional medical feel.",

  transition_abstract: "Abstract flowing liquid gold and deep navy blue shapes. Smooth organic movement. Perfect for video transitions. Clean, minimal, premium feel.",
};

// ── Generator ─────────────────────────────────────────────────

export async function generateBRoll(
  prompt: string,
  config: VeoConfig = {},
): Promise<VeoResult> {
  const {
    duration = "8",
    aspectRatio = "9:16",
    resolution = "1080p",
    model = "lite",
  } = config;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.startsWith("AIza")) {
    throw new Error("GEMINI_API_KEY required for Veo video generation");
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelId = MODELS[model];

  console.error(`[veo] Generating B-roll: "${prompt.slice(0, 60)}..." (${duration}s, ${aspectRatio}, ${resolution})`);
  console.error(`[veo] Model: ${modelId}`);

  // Start generation
  let operation = await ai.models.generateVideos({
    model: modelId,
    prompt,
    config: {
      durationSeconds: parseInt(duration) as any,
      aspectRatio,
      resolution,
    },
  });

  // Poll until complete (Veo generation takes 30-120 seconds)
  let pollCount = 0;
  const maxPolls = 30; // 5 minutes max
  while (!operation.done && pollCount < maxPolls) {
    await new Promise(r => setTimeout(r, 10_000)); // 10s intervals
    pollCount++;
    console.error(`[veo] Polling... (${pollCount * 10}s)`);

    operation = await ai.operations.getVideosOperation({ operation });
  }

  if (!operation.done) {
    throw new Error("Veo generation timed out after 5 minutes");
  }

  const videos = (operation as any).response?.generatedVideos;
  if (!videos?.length) {
    throw new Error("No video generated");
  }

  // Download video
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const slug = prompt.slice(0, 30).replace(/[^a-zA-Z0-9\u0E00-\u0E7F]/g, "_").toLowerCase();
  const filename = `broll-${slug}-${Date.now()}.mp4`;
  const videoPath = join(OUT_DIR, filename);

  // Download video bytes
  const videoFile = videos[0].video;
  if (videoFile?.uri) {
    const res = await fetch(videoFile.uri);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(videoPath, buf);
  } else {
    // Fallback: try direct download method
    const dl = (ai.files as any).download;
    if (dl) {
      await dl({ file: videoFile, downloadPath: videoPath });
    } else {
      throw new Error("Cannot download video — no URI or download method");
    }
  }

  console.error(`[veo] ✅ Saved: ${videoPath}`);

  return {
    prompt,
    videoPath,
    model: modelId,
    duration,
    aspectRatio,
    resolution,
  };
}

/** Generate B-roll from a preset name */
export async function generatePresetBRoll(
  presetName: string,
  config: VeoConfig = {},
): Promise<VeoResult> {
  const prompt = BROLL_PRESETS[presetName];
  if (!prompt) {
    throw new Error(`Unknown preset: ${presetName}. Available: ${Object.keys(BROLL_PRESETS).join(", ")}`);
  }
  return generateBRoll(prompt, config);
}

/** Generate multiple B-roll clips for a topic */
export async function generateBRollSet(
  topic: string,
  count = 3,
  config: VeoConfig = {},
): Promise<VeoResult[]> {
  // Auto-select relevant presets based on topic
  const topicLower = topic.toLowerCase();
  const relevant: string[] = [];

  if (topicLower.includes("สมอง") || topicLower.includes("brain")) {
    relevant.push("brain_activity", "neuron_zoom");
  }
  if (topicLower.includes("จอ") || topicLower.includes("screen")) {
    relevant.push("child_screen", "data_visualization");
  }
  if (topicLower.includes("ลูก") || topicLower.includes("เด็ก") || topicLower.includes("child")) {
    relevant.push("family_moment", "child_screen");
  }
  if (topicLower.includes("หมอ") || topicLower.includes("คลินิก") || topicLower.includes("doctor")) {
    relevant.push("clinic_interior", "doctor_hands");
  }

  // Fill remaining with transition
  while (relevant.length < count) {
    relevant.push("transition_abstract");
  }

  const results: VeoResult[] = [];
  for (const preset of relevant.slice(0, count)) {
    try {
      const result = await generatePresetBRoll(preset, config);
      results.push(result);
    } catch (e: any) {
      console.error(`[veo] ❌ ${preset}: ${e.message?.slice(0, 80)}`);
    }
  }

  return results;
}

// ── CLI ───────────────────────────────────────────────────────

async function main() {
  const prompt = process.argv[2];
  if (!prompt) {
    console.log("Usage: npx tsx src/engine/veo-generator.ts <prompt|preset>");
    console.log("\nPresets:", Object.keys(BROLL_PRESETS).join(", "));
    process.exit(1);
  }

  const isPreset = BROLL_PRESETS[prompt];
  const result = isPreset
    ? await generatePresetBRoll(prompt)
    : await generateBRoll(prompt);

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.includes("veo-generator")) {
  main().catch(console.error);
}
