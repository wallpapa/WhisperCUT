/**
 * whispercut_analyze — Transcribe + scene detect + AI analysis
 */
import { probe, extractAudio, detectScenes } from "../../engine/ffmpeg.js";
import { transcribe } from "../../engine/whisper.js";
import { aiStructured } from "../../ai/provider.js";
import { analyzeFootagePrompt, SYSTEM_PROMPT } from "../../ai/prompts.js";
import { z } from "zod";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const AnalysisSchema = z.object({
  hook_candidates: z.array(z.object({
    text: z.string(),
    start_sec: z.number(),
    end_sec: z.number(),
    score: z.number(),
  })),
  key_moments: z.array(z.object({
    text: z.string(),
    start_sec: z.number(),
    end_sec: z.number(),
    type: z.string(),
  })),
  suggested_cuts: z.array(z.object({
    start_sec: z.number(),
    end_sec: z.number(),
    reason: z.string(),
  })),
  pacing: z.enum(["fast", "medium", "slow"]),
  recommended_duration: z.number(),
  content_type: z.string(),
  hashtag_suggestions: z.array(z.string()),
});

export const analyzeTool = {
  name: "whispercut_analyze",
  description:
    "Analyze video footage: transcribe audio (Whisper), detect scene changes, and use AI to identify hooks, key moments, and suggested cuts for vertical short-form video.",
  inputSchema: {
    type: "object" as const,
    properties: {
      video_path: {
        type: "string",
        description: "Absolute path to the video file",
      },
      language: {
        type: "string",
        description: "Language code: th, en, zh, ja, ar",
        default: "th",
      },
      output_dir: {
        type: "string",
        description: "Output directory for analysis files (default: ./output)",
        default: "./output",
      },
    },
    required: ["video_path"],
  },
};

export async function handleAnalyze(args: any) {
  const videoPath: string = args.video_path;
  const language: string = args.language || "th";
  const outputDir: string = args.output_dir || "./output";

  await mkdir(outputDir, { recursive: true });

  // Step 1: Probe video metadata
  const info = await probe(videoPath);

  // Step 2: Extract audio for Whisper
  const wavPath = path.join(outputDir, "audio_16k.wav");
  await extractAudio(videoPath, wavPath);

  // Step 3: Transcribe with Whisper
  const transcript = await transcribe(wavPath, {
    language,
    model: process.env.WHISPER_MODEL || "large-v3",
  });

  // Step 4: Detect scene changes
  const scenes = await detectScenes(videoPath, 0.3);

  // Step 5: AI analysis
  const scenesStr = scenes.map((s) => `${s.timestamp_sec.toFixed(2)}s (score: ${s.score})`).join(", ");
  const analysis = await aiStructured(
    analyzeFootagePrompt(transcript.full_text, scenesStr, language),
    AnalysisSchema,
    { system: SYSTEM_PROMPT, role: "text" }
  );

  const result = {
    video_info: info,
    transcript: {
      language: transcript.language,
      segments: transcript.segments,
      full_text: transcript.full_text,
      duration_sec: transcript.duration_sec,
    },
    scenes,
    analysis,
    wav_path: wavPath,
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
