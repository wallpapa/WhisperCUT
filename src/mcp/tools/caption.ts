/**
 * whispercut_caption — Generate animated captions/subtitles
 */
import { generateSRT, generateWordSRT, saveSRT } from "../../engine/whisper.js";
import type { TranscriptResult } from "../../engine/whisper.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export const captionTool = {
  name: "whispercut_caption",
  description:
    "Generate SRT captions for a video. Supports sentence-by-sentence or word-by-word (TikTok animated style). Returns SRT file path ready for FFmpeg burn-in.",
  inputSchema: {
    type: "object" as const,
    properties: {
      transcript: {
        type: "object",
        description: "Transcript result from whispercut_analyze (segments + word_segments)",
      },
      style: {
        type: "string",
        enum: ["sentence", "word-by-word"],
        description: "Caption style: sentence (standard) or word-by-word (TikTok animated)",
        default: "sentence",
      },
      output_dir: {
        type: "string",
        description: "Output directory for SRT file",
        default: "./output",
      },
      max_chars_per_line: {
        type: "number",
        description: "Max characters per subtitle line (default: 40)",
        default: 40,
      },
    },
    required: ["transcript"],
  },
};

export async function handleCaption(args: any) {
  const {
    transcript,
    style = "sentence",
    output_dir = "./output",
    max_chars_per_line = 40,
  } = args;

  await mkdir(output_dir, { recursive: true });

  const tr: TranscriptResult = transcript;
  let srtContent: string;
  let srtFilename: string;

  if (style === "word-by-word" && tr.word_segments && tr.word_segments.length > 0) {
    srtContent = generateWordSRT(tr.word_segments);
    srtFilename = "captions_word.srt";
  } else {
    srtContent = generateSRT(tr.segments, max_chars_per_line);
    srtFilename = "captions.srt";
  }

  const srtPath = path.join(output_dir, srtFilename);
  await saveSRT(srtContent, srtPath);

  // Count entries
  const entryCount = (srtContent.match(/^\d+$/gm) || []).length;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          srt_path: srtPath,
          style,
          caption_count: entryCount,
          language: tr.language,
        }, null, 2),
      },
    ],
  };
}
