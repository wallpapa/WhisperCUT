/**
 * whispercut_render — Render final 9:16 MP4 from timeline
 */
import { trim, concat, burnSubtitles, renderFinal } from "../../engine/ffmpeg.js";
import { toFFmpegCommands } from "../../engine/timeline.js";
import type { Timeline } from "../../engine/timeline.js";
import { mkdir } from "node:fs/promises";
import { statSync } from "node:fs";
import path from "node:path";

export const renderTool = {
  name: "whispercut_render",
  description:
    "Render a timeline into a final 9:16 vertical MP4 video. Trims clips, concatenates, optionally burns subtitles. Returns path to rendered video.",
  inputSchema: {
    type: "object" as const,
    properties: {
      timeline: {
        type: "object",
        description: "Timeline object from whispercut_cut",
      },
      output_dir: {
        type: "string",
        description: "Output directory",
        default: "./output",
      },
      quality: {
        type: "string",
        enum: ["draft", "final"],
        description: "Render quality: draft (fast, lower quality) or final (slow, high quality)",
        default: "final",
      },
      srt_path: {
        type: "string",
        description: "Optional SRT file path to burn subtitles into the video",
      },
    },
    required: ["timeline"],
  },
};

export async function handleRender(args: any) {
  const {
    timeline,
    output_dir = "./output",
    quality = "final",
    srt_path,
  } = args;

  await mkdir(output_dir, { recursive: true });
  const tl: Timeline = timeline;

  // Step 1: Generate FFmpeg commands from timeline
  const commands = toFFmpegCommands(tl, output_dir);

  // Step 2: Execute trim commands
  const trimmedPaths: string[] = [];
  for (const cmd of commands) {
    if (cmd.type === "trim") {
      await trim(cmd.input, cmd.output, cmd.startSec, cmd.durationSec);
      trimmedPaths.push(cmd.output);
    }
  }

  // Step 3: Concat if multiple clips
  let outputPath: string;
  if (trimmedPaths.length > 1) {
    const concatPath = path.join(output_dir, `${tl.id}_concat.mp4`);
    await concat(trimmedPaths, concatPath);
    outputPath = concatPath;
  } else if (trimmedPaths.length === 1) {
    outputPath = trimmedPaths[0];
  } else {
    return {
      content: [{ type: "text", text: "Error: No clips to render" }],
      isError: true,
    };
  }

  // Step 4: Burn subtitles if provided
  if (srt_path) {
    const subtitledPath = path.join(output_dir, `${tl.id}_subtitled.mp4`);
    await burnSubtitles(outputPath, srt_path, subtitledPath);
    outputPath = subtitledPath;
  }

  // Step 5: Final render pass (ensure 1080x1920, proper encoding)
  const finalPath = path.join(output_dir, `${tl.id}_final.mp4`);
  await renderFinal(outputPath, finalPath, quality);

  const stats = statSync(finalPath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          video_path: finalPath,
          size_mb: parseFloat(sizeMb),
          duration_sec: tl.duration_sec,
          quality,
          resolution: "1080x1920",
        }, null, 2),
      },
    ],
  };
}
