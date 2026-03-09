/**
 * Whisper transcription wrapper — calls faster-whisper CLI
 * Optimized for Thai/multilingual, word-level timestamps
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const exec = promisify(execFile);

export interface WordSegment {
  word: string;
  start: number;
  end: number;
  probability: number;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  words: WordSegment[];
}

export interface TranscriptResult {
  language: string;
  segments: TranscriptSegment[];
  word_segments: WordSegment[];
  duration_sec: number;
  full_text: string;
}

/** Transcribe audio using faster-whisper via Python subprocess */
export async function transcribe(
  audioPath: string,
  options: {
    language?: string;
    model?: string;
    outputDir?: string;
  } = {}
): Promise<TranscriptResult> {
  const {
    language = "th",
    model = process.env.WHISPER_MODEL || "large-v3",
    outputDir = path.dirname(audioPath),
  } = options;

  const outputJson = path.join(outputDir, "transcript.json");

  // Python script for faster-whisper with word-level timestamps
  const pythonScript = `
import json, sys
from faster_whisper import WhisperModel

model = WhisperModel("${model}", device="auto", compute_type="auto")
segments, info = model.transcribe(
    "${audioPath}",
    language="${language}",
    word_timestamps=True,
    vad_filter=True,
    vad_parameters=dict(min_silence_duration_ms=500)
)

result = {
    "language": info.language,
    "duration_sec": info.duration,
    "segments": [],
    "word_segments": [],
    "full_text": ""
}

for i, seg in enumerate(segments):
    words = []
    for w in (seg.words or []):
        word_data = {"word": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3), "probability": round(w.probability, 3)}
        words.append(word_data)
        result["word_segments"].append(word_data)
    result["segments"].append({
        "id": i,
        "start": round(seg.start, 3),
        "end": round(seg.end, 3),
        "text": seg.text.strip(),
        "words": words
    })

result["full_text"] = " ".join(s["text"] for s in result["segments"])

with open("${outputJson}", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print("OK")
`;

  try {
    await exec("python3", ["-c", pythonScript], { timeout: 600_000 });
  } catch (error: any) {
    // Fallback: try whisper CLI if faster-whisper not installed
    if (error.message?.includes("ModuleNotFoundError")) {
      return transcribeWithCLI(audioPath, language, model, outputJson);
    }
    throw new Error(`Whisper transcription failed: ${error.message}`);
  }

  const data = JSON.parse(await readFile(outputJson, "utf-8"));
  return data as TranscriptResult;
}

/** Fallback: use whisper CLI */
async function transcribeWithCLI(
  audioPath: string,
  language: string,
  model: string,
  outputJson: string
): Promise<TranscriptResult> {
  // Try whisper.cpp or openai-whisper CLI
  const { stderr } = await exec("whisper", [
    audioPath,
    "--language", language,
    "--model", model,
    "--output_format", "json",
    "--word_timestamps", "True",
    "--output_dir", path.dirname(outputJson),
  ], { timeout: 600_000 });

  const baseName = path.basename(audioPath, path.extname(audioPath));
  const whisperOutput = path.join(path.dirname(outputJson), `${baseName}.json`);

  if (existsSync(whisperOutput)) {
    const raw = JSON.parse(await readFile(whisperOutput, "utf-8"));
    // Convert OpenAI Whisper format to our format
    const segments: TranscriptSegment[] = (raw.segments || []).map((s: any, i: number) => ({
      id: i,
      start: s.start,
      end: s.end,
      text: s.text?.trim() || "",
      words: (s.words || []).map((w: any) => ({
        word: w.word?.trim() || "",
        start: w.start,
        end: w.end,
        probability: w.probability || 0,
      })),
    }));
    return {
      language: raw.language || language,
      segments,
      word_segments: segments.flatMap((s) => s.words),
      duration_sec: segments.at(-1)?.end || 0,
      full_text: segments.map((s) => s.text).join(" "),
    };
  }

  throw new Error("Whisper CLI output not found");
}

/** Generate SRT subtitle file from transcript */
export function generateSRT(segments: TranscriptSegment[]): string {
  return segments
    .map((seg, i) => {
      const start = formatSRTTime(seg.start);
      const end = formatSRTTime(seg.end);
      return `${i + 1}\n${start} --> ${end}\n${seg.text}\n`;
    })
    .join("\n");
}

/** Generate word-level SRT (for animated captions) */
export function generateWordSRT(words: WordSegment[], wordsPerGroup = 3): string {
  const groups: { start: number; end: number; text: string }[] = [];
  for (let i = 0; i < words.length; i += wordsPerGroup) {
    const group = words.slice(i, i + wordsPerGroup);
    groups.push({
      start: group[0].start,
      end: group[group.length - 1].end,
      text: group.map((w) => w.word).join(" "),
    });
  }
  return groups
    .map((g, i) => {
      const start = formatSRTTime(g.start);
      const end = formatSRTTime(g.end);
      return `${i + 1}\n${start} --> ${end}\n${g.text}\n`;
    })
    .join("\n");
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** Save SRT to file */
export async function saveSRT(
  srtContent: string,
  outputPath: string
): Promise<string> {
  await writeFile(outputPath, srtContent, "utf-8");
  return outputPath;
}
