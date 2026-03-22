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
// Thai font (Sarabun) — bundled path on macOS, fallback to system default
const THAI_FONT = (() => {
  const candidates = [
    "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/cf0dc8d3b09f9ba379660e591e82566e2b557949.asset/AssetData/Sarabun.ttc",
    "/System/Library/PrivateFrameworks/FontServices.framework/Versions/A/Resources/Fonts/Subsets/Sarabun.ttc",
    "/usr/share/fonts/truetype/thai/Sarabun-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return ""; // empty = ffmpeg uses system default (Latin only)
})();

// Hormone → background color mapping (TikTok-style per-beat visual identity)
const HORMONE_COLORS: Record<string, string> = {
  cortisol:   "0x1a0a2e",  // deep purple — tension
  dopamine:   "0x0a1628",  // dark navy — anticipation
  oxytocin:   "0x0d1f1a",  // dark teal-green — warmth/trust
  adrenaline: "0x1f0a0a",  // dark crimson — excitement
  serotonin:  "0x0a1a10",  // deep green — calm resolution
};

// Accent colors per hormone (for line/box decorations)
const HORMONE_ACCENT: Record<string, string> = {
  cortisol:   "0xFF6B6B",  // coral red
  dopamine:   "0x4ECDC4",  // teal
  oxytocin:   "0xFFE66D",  // warm yellow
  adrenaline: "0xFF8C42",  // orange
  serotonin:  "0x95E1D3",  // mint green
};

export interface VibeSegment {
  label: string;
  start_sec: number;
  end_sec: number;
  on_screen_text: string;
  hormone: string;
}

export interface RenderHQOptions {
  audioPath?: string;
  outputPath: string;
  durationSec: number;
  segments?: VibeSegment[];          // full segment data for per-hormone styling
  textOverlays?: Array<{ text: string; startSec: number; endSec: number }>;
  bgColor?: string;
}

/**
 * Render 1080p HQ — production-grade TikTok/Reels/Shorts output
 *
 * Visual design:
 *   - Per-hormone background color (changes with emotional beats)
 *   - Large hook text at top with drop shadow
 *   - Kinetic typography captions (center-screen, word-chunked)
 *   - Accent bar at bottom (color matches hormone)
 *   - CTA text at bottom-center
 *   - Thai font (Sarabun) for proper Thai rendering
 */
export async function renderHQ(
  audioPathOrOpts: string | RenderHQOptions,
  outputPath?: string,
  durationSec?: number,
  textOverlays?: Array<{ text: string; startSec: number; endSec: number }>,
  _bgColor = "0x0D0D0D",
): Promise<string> {
  // Support both legacy (positional) and new (options object) call signatures
  let opts: RenderHQOptions;
  if (typeof audioPathOrOpts === "object") {
    opts = audioPathOrOpts;
  } else {
    opts = {
      audioPath: audioPathOrOpts,
      outputPath: outputPath!,
      durationSec: durationSec!,
      textOverlays,
    };
  }

  const FPS_HQ = 60;
  const fontArgs = THAI_FONT ? `:fontfile='${THAI_FONT}'` : "";

  // Strip emojis — Sarabun/default fonts don't have emoji glyphs → crash
  const stripEmoji = (s: string) =>
    s.replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
     .replace(/[\u2600-\u27FF]/g, "")
     .replace(/'/g, "").replace(/:/g, " ").trim().slice(0, 60);

  // ── Build drawtext filters ────────────────────────────────────────────────
  const drawtextFilters: string[] = [];

  // NOTE: use fixed px values in drawbox (FFmpeg 8 doesn't eval w/h in drawbox)
  const W = WIDTH;   // 1080
  const H = HEIGHT;  // 1920

  if (opts.segments && opts.segments.length > 0) {
    for (const seg of opts.segments) {
      if (!seg.on_screen_text) continue;
      const t0   = seg.start_sec.toFixed(2);
      const t1   = seg.end_sec.toFixed(2);
      const safe = stripEmoji(seg.on_screen_text);

      const isHook = seg.label === "hook";
      const isCTA  = seg.label === "cta";

      const fontsize  = isHook ? 72 : isCTA ? 56 : 52;
      const fontcolor = isCTA ? "0xFFE66D" : "white";
      const yExpr     = isHook ? `${Math.round(H * 0.12)}` : isCTA ? `${Math.round(H * 0.78)}` : `(h-text_h)/2`;
      const borderw   = isHook ? 5 : 3;

      // Main text
      drawtextFilters.push(
        `drawtext=text='${safe}'${fontArgs}` +
        `:fontsize=${fontsize}:fontcolor=${fontcolor}` +
        `:x=(w-text_w)/2:y=${yExpr}` +
        `:borderw=${borderw}:bordercolor=black@0.9` +
        `:shadowx=2:shadowy=2:shadowcolor=black@0.7` +
        `:enable='between(t,${t0},${t1})'`
      );

      // Accent bar bottom — fixed px, hormone color
      const accent = HORMONE_ACCENT[seg.hormone] ?? "0x4ECDC4";
      drawtextFilters.push(
        `drawbox=x=0:y=${H - 12}:w=${W}:h=12:color=${accent}@0.9:t=fill` +
        `:enable='between(t,${t0},${t1})'`
      );

      // Hook badge (top-left)
      if (isHook) {
        drawtextFilters.push(
          `drawbox=x=40:y=60:w=240:h=52:color=0xFF6B6B@0.85:t=fill` +
          `:enable='between(t,${t0},${t1})'`,
          `drawtext=text='MUST WATCH'${fontArgs}` +
          `:fontsize=28:fontcolor=white:x=55:y=72:borderw=0` +
          `:enable='between(t,${t0},${t1})'`
        );
      }

      // CTA highlight box
      if (isCTA) {
        const bx = Math.round((W - 420) / 2);
        const by = Math.round(H * 0.72);
        drawtextFilters.push(
          `drawbox=x=${bx}:y=${by}:w=420:h=58:color=0xFFE66D@0.12:t=fill` +
          `:enable='between(t,${t0},${t1})'`
        );
      }
    }
  } else if (opts.textOverlays && opts.textOverlays.length > 0) {
    for (let i = 0; i < opts.textOverlays.length; i++) {
      const ov   = opts.textOverlays[i];
      const safe = stripEmoji(ov.text);
      const yExpr = i === 0 ? `${Math.round(H * 0.12)}` : `(h-text_h)/2`;
      drawtextFilters.push(
        `drawtext=text='${safe}'${fontArgs}` +
        `:fontsize=54:fontcolor=white` +
        `:x=(w-text_w)/2:y=${yExpr}` +
        `:borderw=4:bordercolor=black@0.9` +
        `:shadowx=2:shadowy=2:shadowcolor=black@0.6` +
        `:enable='between(t,${ov.startSec.toFixed(2)},${ov.endSec.toFixed(2)})'`
      );
    }
  }

  // ── Per-hormone background (fixed px drawbox) ─────────────────────────────
  const bgSegments: string[] = [];
  if (opts.segments && opts.segments.length > 0) {
    for (const seg of opts.segments) {
      const bg = HORMONE_COLORS[seg.hormone] ?? "0x0D1117";
      bgSegments.push(
        `drawbox=x=0:y=0:w=${W}:h=${H}:color=${bg}@1:t=fill` +
        `:enable='between(t,${seg.start_sec.toFixed(2)},${seg.end_sec.toFixed(2)})'`
      );
    }
  }

  // ── Compose filter chain ──────────────────────────────────────────────────
  const colorGrade = "eq=contrast=1.10:saturation=1.15:brightness=0.03";
  const vfParts = [
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${WIDTH}:${HEIGHT}:-1:-1:color=0x0D1117`,
    `setsar=1`,
    ...bgSegments,
    colorGrade,
    ...drawtextFilters,
  ];
  const vf = vfParts.join(",");

  // ── Audio ────────────────────────────────────────────────────────────────
  const audioArgs: string[] = opts.audioPath && existsSync(opts.audioPath)
    ? ["-i", opts.audioPath, "-c:a", "aac", "-b:a", "320k", "-ar", "44100", "-ac", "2"]
    : ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-c:a", "aac", "-b:a", "128k"];

  await exec(FFMPEG, [
    "-f", "lavfi", "-i",
    `color=c=0x0D1117:s=${WIDTH}x${HEIGHT}:r=${FPS_HQ}:d=${opts.durationSec}`,
    ...audioArgs,
    "-vf", vf,
    "-c:v", "libx264",
    "-profile:v", "high",
    "-level:v", "5.1",
    "-crf", "18",
    "-preset", "fast",
    "-r", String(FPS_HQ),
    "-pix_fmt", "yuv420p",
    "-shortest",
    "-movflags", "+faststart",
    "-y",
    opts.outputPath,
  ]);

  return opts.outputPath;
}
