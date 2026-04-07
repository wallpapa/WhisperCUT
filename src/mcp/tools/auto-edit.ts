/**
 * whispercut_auto_edit -- Upload footage -> get production-ready TikTok video
 *
 * MCP tool handler for the auto-edit pipeline.
 * AI transcribes, analyzes, cuts dead air, reorders into hormone arc,
 * adds Thai subtitles, and renders 1080x1920 @60fps.
 */

import { autoEdit, type AutoEditResult } from "../../engine/auto-editor.js";

// ── Tool Definition ─────────────────────────────────────────────────────────

export const autoEditTool = {
  name: "whispercut_auto_edit",
  description:
    "Upload raw video footage and get a production-ready TikTok video. " +
    "AI transcribes, analyzes, cuts dead air, reorders into hormone arc, " +
    "adds Thai subtitles, and renders 1080x1920 @60fps. " +
    "From 15-min raw footage -> 60-sec TikTok in one command.",
  inputSchema: {
    type: "object" as const,
    required: ["video_path"] as const,
    properties: {
      video_path: {
        type: "string" as const,
        description: "Path to raw video file (local) or Supabase URL",
      },
      topic: {
        type: "string" as const,
        description:
          "Video topic hint (AI can detect from transcript if not given)",
      },
      vibe: {
        type: "string" as const,
        enum: [
          "educational_warm",
          "shocking_reveal",
          "story_driven",
          "quick_tips",
          "myth_bust",
          "auto",
        ] as const,
        description: "Content vibe (default: auto)",
      },
      target_duration: {
        type: "number" as const,
        description: "Target output duration in seconds (default: 60)",
      },
      platform: {
        type: "string" as const,
        enum: ["tiktok", "instagram", "youtube"] as const,
        description: "Target platform (default: tiktok)",
      },
    },
  },
};

// ── Tool Handler ────────────────────────────────────────────────────────────

export async function handleAutoEdit(args: Record<string, unknown>) {
  const video_path = args.video_path as string | undefined;

  if (!video_path || typeof video_path !== "string" || video_path.trim() === "") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: "error",
              error: "video_path is required. Provide a local file path to raw video footage.",
              usage: 'whispercut_auto_edit({ video_path: "/path/to/raw_footage.mp4" })',
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }

  const topic = (args.topic as string) || undefined;
  const vibe = (args.vibe as string) || "auto";
  const target_duration = (args.target_duration as number) || 60;
  const platform = (args.platform as string) || "tiktok";

  const t0 = Date.now();

  try {
    const result: AutoEditResult = await autoEdit({
      video_path: video_path.trim(),
      topic,
      vibe,
      target_duration,
      platform,
    });

    const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
    const hasVideo = result.rendered_video !== "";

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: hasVideo ? "complete" : "partial",
              message: hasVideo
                ? `Auto-edit complete in ${elapsedSec}s. Production-ready video rendered.`
                : `Analysis complete in ${elapsedSec}s. Video render failed -- see cut_plan and transcript for manual editing.`,

              // Output files
              video_path: result.rendered_video || null,
              capcut_draft: result.capcut_draft || null,

              // Metrics
              duration_original: `${result.duration_original.toFixed(1)}s`,
              duration_final: `${result.duration_final.toFixed(1)}s`,
              compression_ratio: result.duration_original > 0
                ? `${((1 - result.duration_final / result.duration_original) * 100).toFixed(0)}% cut`
                : "N/A",

              segments_kept: result.segments_kept,
              segments_cut: result.segments_cut,
              hook_score: result.hook_score,

              // Cut plan summary
              hormone_arc: result.cut_plan.segments
                .map((s) => `${s.label}(${s.hormone})`)
                .join(" -> "),
              hook_text: result.cut_plan.hook_text?.slice(0, 80) || "",

              // Transcript preview
              transcript_preview: result.transcript.full_text.slice(0, 200) + "...",
              transcript_segments: result.transcript.segments.length,

              production_time_sec: elapsedSec,
            },
            null,
            2,
          ),
        },
      ],
      isError: false,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);

    // Determine actionable guidance based on error type
    let guidance = "";
    if (message.includes("ffprobe") || message.includes("FFmpeg")) {
      guidance =
        "FFmpeg is required for video processing. " +
        "Install: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)";
    } else if (message.includes("Whisper") || message.includes("faster_whisper")) {
      guidance =
        "Whisper is required for transcription. " +
        "Install: pip install faster-whisper (recommended) or pip install openai-whisper";
    } else if (message.includes("not found")) {
      guidance = "Video file not found. Check the file path and try again.";
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: "error",
              error: message,
              guidance: guidance || "Check the error message above for details.",
              elapsed_sec: elapsedSec,
              input: {
                video_path,
                topic: topic || "(auto-detect)",
                vibe,
                target_duration,
                platform,
              },
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
}
