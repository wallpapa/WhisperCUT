/**
 * whispercut_vibe_edit — Primary AI Agent Tool
 *
 * The single tool that replaces the entire editing pipeline.
 * AI agent passes topic + vibe → gets production-ready video.
 *
 * Internally runs:
 *   VibeEngine → HookScorer → CTASelector → VoiceEngine
 *   → TimelineEngine → RenderHQ → QAGate → (Publish optional)
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { vibeEdit, autoVibeEdit, type Platform, type VibeType } from "../../engine/vibe-engine.js";
import { generateVoice } from "../../engine/voice.js";
import { generateTimeline } from "../../engine/timeline-engine.js";
import { renderHQ } from "../../engine/ffmpeg.js";
import { listVibes } from "../../science/vibe-library.js";

const OUTPUT_DIR = process.env.OUTPUT_DIR || "./output";

// ── Tool Definition ─────────────────────────────────────────────────────────

export const vibeEditTool = {
  name: "whispercut_vibe_edit",
  description: `AI Vibe Video Editor — Research-powered autonomous video production.

Pass a topic + vibe → get a production-ready 1080p vertical video.
No human editing required. Science-encoded hormone arcs, hook taxonomy,
and CTA optimization are applied automatically.

Vibes available:
  educational_warm  — Warm expert, high oxytocin, builds trust (74% completion)
  shocking_reveal   — Bold claim + myth bust, adrenaline peak (74% completion, 8.3% share)
  story_driven      — Narrative transportation, highest share rate (91% share)
  quick_tips        — Fast list, completion obligation (77% completion)
  myth_bust         — Authority challenge, social proof shock (73% completion)
  auto              — AI selects optimal vibe for topic + platform

Platforms: tiktok | instagram | youtube | facebook`,

  inputSchema: {
    type: "object" as const,
    properties: {
      topic: {
        type: "string",
        description: "Video topic in Thai (e.g., 'พัฒนาการลูกวัย 3 ขวบ')",
      },
      vibe: {
        type: "string",
        enum: ["educational_warm", "shocking_reveal", "story_driven", "quick_tips", "myth_bust", "auto"],
        description: "Content vibe — determines hormone arc, hook type, pacing, and CTA",
      },
      platform: {
        type: "string",
        enum: ["tiktok", "instagram", "youtube", "facebook"],
        description: "Target platform (adapts script, captions, CTA)",
      },
      duration: {
        type: "number",
        description: "Duration in seconds (default: vibe-optimal, e.g., 75 for educational_warm)",
      },
      goal: {
        type: "string",
        enum: ["virality", "engagement", "saves", "followers"],
        description: "Optimization goal (default: virality)",
      },
      render: {
        type: "boolean",
        description: "Render to MP4 (default: true). Set false to get script+timeline only.",
      },
    },
    required: ["topic", "vibe", "platform"],
  },
};

// ── Tool Handler ────────────────────────────────────────────────────────────

export async function handleVibeEdit(args: any) {
  const {
    topic,
    vibe      = "auto",
    platform  = "tiktok",
    duration,
    goal      = "virality",
    render    = true,
  } = args;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const slug = topic.slice(0, 30).replace(/\s+/g, "_").replace(/[^\w\u0E00-\u0E7F]/g, "");
  const t0 = Date.now();

  console.error(`\n[vibe-edit] START: "${topic}" | vibe=${vibe} | platform=${platform}`);

  // ── [1] Generate vibe script ───────────────────────────────────────────
  console.error("[vibe-edit] [1/5] Generating science-encoded script...");
  const editResult = vibe === "auto"
    ? await autoVibeEdit({ topic, platform: platform as Platform, goal, duration })
    : await vibeEdit({
        topic,
        vibe: vibe as VibeType,
        platform: platform as Platform,
        duration,
        goal,
      });

  const { script, hook_score, cta_recommendation } = editResult;

  // Save script JSON
  const scriptPath = join(OUTPUT_DIR, `${slug}_script.json`);
  writeFileSync(scriptPath, JSON.stringify(script, null, 2));

  console.error(`[vibe-edit] Hook: ${hook_score.overall}/10 (${hook_score.taxonomy}, +${hook_score.taxonomy_lift_pct}%)`);
  console.error(`[vibe-edit] CTA: ${cta_recommendation.type} (${(cta_recommendation.conversion_rate * 100).toFixed(1)}% conv)`);
  console.error(`[vibe-edit] Predicted completion: ${(script.predicted_completion_rate * 100).toFixed(0)}%`);

  if (!render) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          status: "script_ready",
          script_path: scriptPath,
          hook_score: hook_score.overall,
          hook_taxonomy: hook_score.taxonomy,
          cta_type: cta_recommendation.type,
          predicted_completion_rate: script.predicted_completion_rate,
          predicted_share_rate: script.predicted_share_rate,
          segments: script.segments.map(s => ({
            label: s.label, duration: `${s.start_sec}–${s.end_sec}s`,
            hormone: s.hormone, narration_preview: s.narration.slice(0, 60),
          })),
        }, null, 2),
      }],
    };
  }

  // ── [2] Generate voice (MiniMax Dr.Gwang → F5-TTS fallback) ──────────
  console.error("[vibe-edit] [2/5] Generating voice (MiniMax Dr.Gwang)...");
  const voicePath = join(OUTPUT_DIR, `${slug}_voice.mp3`);
  let actualVoicePath = voicePath;
  try {
    actualVoicePath = await generateVoice({
      text: script.full_narration,
      outputPath: voicePath,
    });
  } catch (e: any) {
    console.error(`[vibe-edit] Voice failed: ${e.message} — rendering muted`);
    actualVoicePath = "";
  }

  // ── [3] Generate timeline ─────────────────────────────────────────────
  console.error("[vibe-edit] [3/5] Generating CapCut timeline...");
  const timeline = generateTimeline(script, actualVoicePath);
  const timelinePath = join(OUTPUT_DIR, `${slug}_timeline.json`);
  writeFileSync(timelinePath, JSON.stringify(timeline, null, 2));

  // ── [4] Render HQ video ───────────────────────────────────────────────
  console.error("[vibe-edit] [4/5] Rendering 1080p @60fps HQ...");
  const videoPath = join(OUTPUT_DIR, `${slug}.mp4`);

  // Pass text overlays to renderHQ for caption burning
  const textOverlaysForRender = timeline.text_overlays.map(t => ({
    text: t.text,
    startSec: t.start_sec,
    endSec: t.end_sec,
  }));

  await renderHQ(actualVoicePath, videoPath, script.duration_sec, textOverlaysForRender);
  console.error(`[vibe-edit] [4/5] Render done: ${videoPath}`);

  // ── [5] Quality check ─────────────────────────────────────────────────
  console.error("[vibe-edit] [5/5] Quality gate...");
  const qualityPassed =
    hook_score.overall >= 7.0 &&
    script.predicted_completion_rate >= 0.60;

  const duration_ms = Date.now() - t0;

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        status: qualityPassed ? "ready_to_publish" : "review_recommended",
        video_path: videoPath,
        script_path: scriptPath,
        timeline_path: timelinePath,
        capcut_draft_path: timelinePath,   // same file, CapCut-compatible

        vibe: script.vibe,
        platform: script.platform,
        duration_sec: script.duration_sec,

        science_report: {
          hook_score:        hook_score.overall,
          hook_taxonomy:     hook_score.taxonomy,
          hook_lift_pct:     hook_score.taxonomy_lift_pct,
          cta_type:          cta_recommendation.type,
          cta_conversion:    `${(cta_recommendation.conversion_rate * 100).toFixed(1)}%`,
          hormone_arc:       script.segments.map(s => `${s.label}(${s.hormone})`).join("→"),
          predicted_completion: `${(script.predicted_completion_rate * 100).toFixed(0)}%`,
          predicted_shares:     `${(script.predicted_share_rate * 100).toFixed(1)}%`,
        },

        quality_gate: { passed: qualityPassed },
        production_time_sec: (duration_ms / 1000).toFixed(1),

        ...(hook_score.suggestion && { hook_suggestion: hook_score.suggestion }),
      }, null, 2),
    }],
    isError: false,
  };
}

// ── whispercut_list_vibes tool ──────────────────────────────────────────────

export const listVibesTool = {
  name: "whispercut_list_vibes",
  description: "List all available content vibes with predicted performance metrics",
  inputSchema: { type: "object" as const, properties: {} },
};

export function handleListVibes(_args: any) {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        vibes: listVibes().map(v => ({
          ...v,
          completion: `${(v.completion * 100).toFixed(0)}%`,
          share:      `${(v.share * 100).toFixed(1)}%`,
        })),
        usage: 'whispercut_vibe_edit with vibe: "educational_warm" | "shocking_reveal" | "story_driven" | "quick_tips" | "myth_bust" | "auto"',
      }, null, 2),
    }],
  };
}
