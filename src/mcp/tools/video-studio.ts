/**
 * MCP Tools — Video Studio (Analysis + B-Roll Generation)
 *
 * whispercut_analyze_video  — Study creator's style from real clips
 * whispercut_generate_broll — Generate AI B-roll footage with Veo 3.1
 */

import { analyzeVideo, analyzeChannel } from "../../engine/video-analyzer.js";
import { generateBRoll, generatePresetBRoll, generateBRollSet, BROLL_PRESETS } from "../../engine/veo-generator.js";
import { getMemoryLayer } from "../../memory/memory-layer.js";

// ══════════════════════════════════════════════════════════════
//  Tool 1: whispercut_analyze_video
// ══════════════════════════════════════════════════════════════

export const analyzeVideoTool = {
  name: "whispercut_analyze_video",
  description:
    "Analyze a TikTok/video clip using Gemini Video API. Extracts facial expressions, " +
    "verbal/non-verbal patterns, scene composition, and hook effectiveness. " +
    "Use to study a creator's style before cloning. Results stored in memory layer. " +
    "Cost: ~$0.003 per 10-min video (Gemini 2.5 Flash).",
  inputSchema: {
    type: "object" as const,
    required: ["video_path"],
    properties: {
      video_path: {
        type: "string",
        description: "Path to video file (MP4/MOV). Can be a local file or downloaded TikTok clip.",
      },
      channel: {
        type: "string",
        description: "Channel name for memory storage (default: 'doctorwaleerat')",
      },
      detailed: {
        type: "boolean",
        description: "Detailed analysis with expression timeline (default: true)",
      },
    },
  },
};

export async function handleAnalyzeVideo(args: {
  video_path: string;
  channel?: string;
  detailed?: boolean;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { video_path, channel = "doctorwaleerat", detailed = true } = args;

  const analysis = await analyzeVideo(video_path, { detailed });

  // Store in memory layer
  try {
    const memory = getMemoryLayer();
    await memory.remember({
      type: "style_studied",
      channel,
      topic: "video_analysis",
      data: {
        video_path,
        style_summary: analysis.summary,
        top_patterns: analysis.viral_factors.join(", "),
        hook_type: analysis.hook.type,
        hook_expression: analysis.hook.expression,
        verbal_tone: analysis.verbal.tone,
        verbal_pace: analysis.verbal.pace,
        outfit: analysis.styling.outfit,
        setting: analysis.scene.setting,
      },
    });
  } catch {}

  return {
    content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }],
  };
}

// ══════════════════════════════════════════════════════════════
//  Tool 2: whispercut_generate_broll
// ══════════════════════════════════════════════════════════════

export const generateBRollTool = {
  name: "whispercut_generate_broll",
  description:
    "Generate AI B-roll video footage using Google Veo 3.1. " +
    "Creates 4-8 second clips for TikTok insert cuts. " +
    "Supports custom prompts or presets: " +
    Object.keys(BROLL_PRESETS).join(", ") + ". " +
    "Default: 9:16 vertical, 1080p, 8 seconds, lite model.",
  inputSchema: {
    type: "object" as const,
    required: ["prompt"],
    properties: {
      prompt: {
        type: "string",
        description: "Video prompt or preset name (e.g. 'brain_activity', 'child_screen', or custom text)",
      },
      duration: {
        type: "string",
        enum: ["4", "6", "8"],
        description: "Duration in seconds (default: '8')",
      },
      aspect_ratio: {
        type: "string",
        enum: ["9:16", "16:9"],
        description: "Aspect ratio — 9:16 for TikTok vertical (default), 16:9 for landscape",
      },
      resolution: {
        type: "string",
        enum: ["720p", "1080p"],
        description: "Resolution (default: '1080p')",
      },
      model: {
        type: "string",
        enum: ["full", "lite"],
        description: "'lite' = 50% cheaper (default), 'full' = highest quality",
      },
      topic: {
        type: "string",
        description: "Topic for auto-selecting preset B-roll set (generates 3 clips)",
      },
    },
  },
};

export async function handleGenerateBRoll(args: {
  prompt: string;
  duration?: "4" | "6" | "8";
  aspect_ratio?: "9:16" | "16:9";
  resolution?: "720p" | "1080p";
  model?: "full" | "lite";
  topic?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const {
    prompt,
    duration = "8",
    aspect_ratio = "9:16",
    resolution = "1080p",
    model = "lite",
    topic,
  } = args;

  const config = {
    duration,
    aspectRatio: aspect_ratio,
    resolution,
    model,
  };

  let results;

  if (topic) {
    // Auto-generate B-roll set from topic
    results = await generateBRollSet(topic, 3, config);
  } else if (BROLL_PRESETS[prompt]) {
    // Preset name
    const result = await generatePresetBRoll(prompt, config);
    results = [result];
  } else {
    // Custom prompt
    const result = await generateBRoll(prompt, config);
    results = [result];
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        generated: results.length,
        clips: results.map(r => ({
          path: r.videoPath,
          prompt: r.prompt.slice(0, 80),
          duration: r.duration + "s",
          model: r.model,
        })),
        presets_available: Object.keys(BROLL_PRESETS),
      }, null, 2),
    }],
  };
}
