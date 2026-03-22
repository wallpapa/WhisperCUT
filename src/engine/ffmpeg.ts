/**
 * FFmpeg wrapper — hardcoded 1080x1920 vertical (9:16) only
 * All operations produce TikTok/Reels/Shorts format
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = "ffprobe";

// Hardcoded vertical video specs
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const ASPECT = "9:16";

export interface VideoInfo {
  duration_sec: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  size_bytes: number;
}

export interface SceneChange {
  timestamp_sec: number;
  score: number;
}

/** Get video metadata */
export async function probe(videoPath: string): Promise<VideoInfo> {
  const { stdout } = await exec(FFPROBE, [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    videoPath,
  ]);
  const data = JSON.parse(stdout);
  const videoStream = data.streams?.find((s: any) => s.codec_type === "video");
  const fps = videoStream?.r_frame_rate
    ? eval(videoStream.r_frame_rate)
    : FPS;
  return {
    duration_sec: parseFloat(data.format?.duration || "0"),
    width: videoStream?.width || 0,
    height: videoStream?.height || 0,
    fps: Math.round(fps),
    codec: videoStream?.codec_name || "unknown",
    size_bytes: parseInt(data.format?.size || "0"),
  };
}

/** Extract audio as 16kHz mono WAV (optimal for Whisper) */
export async function extractAudio(
  videoPath: string,
  outputPath: string
): Promise<string> {
  await exec(FFMPEG, [
    "-i", videoPath,
    "-vn",
    "-ar", "16000",
    "-ac", "1",
    "-af", "afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11",
    "-c:a", "pcm_s16le",
    "-y",
    outputPath,
  ]);
  return outputPath;
}

/** Detect scene changes (for roughcut analysis) */
export async function detectScenes(
  videoPath: string,
  threshold = 0.3
): Promise<SceneChange[]> {
  const { stderr } = await exec(FFMPEG, [
    "-i", videoPath,
    "-vf", `select='gt(scene,${threshold})',showinfo`,
    "-f", "null",
    "-",
  ]);
  const scenes: SceneChange[] = [];
  const regex = /pts_time:(\d+\.?\d*)/g;
  let match;
  while ((match = regex.exec(stderr)) !== null) {
    scenes.push({
      timestamp_sec: parseFloat(match[1]),
      score: threshold,
    });
  }
  return scenes;
}

/** Extract keyframes as thumbnails */
export async function extractKeyframes(
  videoPath: string,
  outputDir: string,
  maxFrames = 10
): Promise<string[]> {
  const pattern = path.join(outputDir, "frame_%03d.jpg");
  await exec(FFMPEG, [
    "-i", videoPath,
    "-vf", `select='eq(pict_type,I)',scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:-1:-1`,
    "-vsync", "vfr",
    "-frames:v", String(maxFrames),
    "-q:v", "2",
    "-y",
    pattern,
  ]);
  const frames: string[] = [];
  for (let i = 1; i <= maxFrames; i++) {
    const f = path.join(outputDir, `frame_${String(i).padStart(3, "0")}.jpg`);
    if (existsSync(f)) frames.push(f);
  }
  return frames;
}

/** Trim video segment */
export async function trim(
  videoPath: string,
  outputPath: string,
  startSec: number,
  durationSec: number
): Promise<string> {
  await exec(FFMPEG, [
    "-i", videoPath,
    "-ss", String(startSec),
    "-t", String(durationSec),
    "-c", "copy",
    "-y",
    outputPath,
  ]);
  return outputPath;
}

/** Concat multiple clips into one vertical video */
export async function concat(
  clipPaths: string[],
  outputPath: string
): Promise<string> {
  // Create concat file
  const concatFile = outputPath.replace(/\.\w+$/, "_concat.txt");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    concatFile,
    clipPaths.map((p) => `file '${p}'`).join("\n")
  );
  await exec(FFMPEG, [
    "-f", "concat",
    "-safe", "0",
    "-i", concatFile,
    "-vf", `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:-1:-1,setsar=1`,
    "-c:v", "libx264",
    "-crf", "23",
    "-preset", "fast",
    "-c:a", "aac",
    "-b:a", "192k",
    "-r", String(FPS),
    "-y",
    outputPath,
  ]);
  return outputPath;
}

/** Burn SRT subtitles into video (vertical format) */
export async function burnSubtitles(
  videoPath: string,
  srtPath: string,
  outputPath: string,
  style = "FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,MarginV=80"
): Promise<string> {
  await exec(FFMPEG, [
    "-i", videoPath,
    "-vf", `subtitles=${srtPath}:force_style='${style}',scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:-1:-1`,
    "-c:v", "libx264",
    "-crf", "23",
    "-preset", "fast",
    "-c:a", "copy",
    "-y",
    outputPath,
  ]);
  return outputPath;
}

/** Add text overlay (for hooks, CTA, titles) */
export async function addTextOverlay(
  videoPath: string,
  outputPath: string,
  text: string,
  options: {
    x?: string;
    y?: string;
    fontsize?: number;
    fontcolor?: string;
    startSec?: number;
    durationSec?: number;
  } = {}
): Promise<string> {
  const {
    x = "(w-text_w)/2",
    y = "h*0.15",
    fontsize = 48,
    fontcolor = "white",
    startSec = 0,
    durationSec,
  } = options;
  const escapedText = text.replace(/'/g, "\\'").replace(/:/g, "\\:");
  let drawtext = `drawtext=text='${escapedText}':x=${x}:y=${y}:fontsize=${fontsize}:fontcolor=${fontcolor}:borderw=3:bordercolor=black`;
  if (durationSec !== undefined) {
    drawtext += `:enable='between(t,${startSec},${startSec + durationSec})'`;
  }
  await exec(FFMPEG, [
    "-i", videoPath,
    "-vf", drawtext,
    "-c:v", "libx264",
    "-crf", "23",
    "-preset", "fast",
    "-c:a", "copy",
    "-y",
    outputPath,
  ]);
  return outputPath;
}

/** Generate cover thumbnail from video */
export async function generateCover(
  videoPath: string,
  outputPath: string,
  timestampSec = 1
): Promise<string> {
  await exec(FFMPEG, [
    "-i", videoPath,
    "-ss", String(timestampSec),
    "-frames:v", "1",
    "-vf", `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:-1:-1`,
    "-q:v", "2",
    "-y",
    outputPath,
  ]);
  return outputPath;
}

/** Render final vertical video with all effects applied */
export async function renderFinal(
  videoPath: string,
  outputPath: string,
  quality: "draft" | "final" = "final"
): Promise<string> {
  const crf = quality === "draft" ? "28" : "20";
  const preset = quality === "draft" ? "ultrafast" : "medium";
  await exec(FFMPEG, [
    "-i", videoPath,
    "-vf", `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:-1:-1,setsar=1`,
    "-c:v", "libx264",
    "-crf", crf,
    "-preset", preset,
    "-c:a", "aac",
    "-b:a", "192k",
    "-r", String(FPS),
    "-movflags", "+faststart",
    "-y",
    outputPath,
  ]);
  return outputPath;
}

/**
 * Render 1080p HQ — production-grade output for TikTok / Reels / Shorts
 *
 * Settings:
 *   - 1080×1920 @ 60fps (smooth motion for fast cuts)
 *   - H.264 High Profile, CRF 18 (near-lossless visual quality)
 *   - preset slow (best compression/quality ratio without GPU)
 *   - 320kbps AAC stereo (broadcast audio quality)
 *   - Color grading: contrast + saturation boost (TikTok house style)
 *   - faststart: enables streaming before full download
 */
export async function renderHQ(
  audioPath: string,
  outputPath: string,
  durationSec: number,
  textOverlays: Array<{ text: string; startSec: number; endSec: number }> = [],
  bgColor = "0x0D0D0D",             // near-black (TikTok standard bg)
): Promise<string> {
  const FPS_HQ = 60;

  // Build drawtext filters for each overlay
  const drawtextFilters = textOverlays.map((ov, i) => {
    const safe = ov.text.replace(/'/g, "").replace(/:/g, " ").slice(0, 55);
    const y = i % 2 === 0 ? "h*0.72" : "h*0.80";   // alternate rows
    return (
      `drawtext=text='${safe}'` +
      `:fontcolor=white:fontsize=52` +
      `:x=(w-text_w)/2:y=${y}` +
      `:borderw=3:bordercolor=black` +
      `:enable='between(t,${ov.startSec.toFixed(2)},${ov.endSec.toFixed(2)})'`
    );
  });

  // Base video filter: scale + color grade + overlays
  const colorGrade = "eq=contrast=1.08:saturation=1.12:brightness=0.02";
  const vfParts = [
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${WIDTH}:${HEIGHT}:-1:-1:color=${bgColor}`,
    `setsar=1`,
    colorGrade,
    ...drawtextFilters,
  ];
  const vf = vfParts.join(",");

  const audioArgs = audioPath
    ? ["-i", audioPath, "-c:a", "aac", "-b:a", "320k", "-ar", "44100", "-ac", "2"]
    : ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-c:a", "aac", "-b:a", "128k"];

  await exec(FFMPEG, [
    // Black background source
    "-f", "lavfi", "-i", `color=c=${bgColor}:s=${WIDTH}x${HEIGHT}:r=${FPS_HQ}:d=${durationSec}`,
    // Audio
    ...audioArgs,
    // Video encoding — H.264 High Profile, CRF 18
    "-vf", vf,
    "-c:v", "libx264",
    "-profile:v", "high",
    "-level:v", "5.1",
    "-crf", "18",
    "-preset", "slow",
    "-r", String(FPS_HQ),
    "-pix_fmt", "yuv420p",
    // Audio mux
    "-shortest",
    // Container
    "-movflags", "+faststart",
    "-y",
    outputPath,
  ]);

  return outputPath;
}
