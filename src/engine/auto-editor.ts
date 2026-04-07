/**
 * Auto Editor -- Full pipeline: raw footage -> production-ready TikTok
 *
 * 7 stages:
 *   1. INGEST   -- detect video info (duration, resolution, codec)
 *   2. TRANSCRIBE -- Whisper -> Thai text + timestamps
 *   3. ANALYZE  -- AI score segments + retrieve network knowledge
 *   4. CUT      -- Smart cutter reorder into hormone arc
 *   5. ENHANCE  -- Subtitles + overlays + color grade
 *   6. RENDER   -- FFmpeg 1080x1920 @60fps
 *   7. QA + EXPORT -- Hook score + CapCut draft + Supabase upload
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, basename, extname } from "path";
import { scoreSegments, findBestHook, type ScoredSegment } from "./segment-scorer.js";
import { generateCutPlan, type CutPlan } from "./smart-cutter.js";
import { transcribe, generateSRT, type TranscriptResult } from "./whisper.js";
import { renderHQ, probe, trim, concat, type VibeSegment } from "./ffmpeg.js";
import { scoreHook, type HookScoreResult } from "../science/hook-scorer.js";
import { retrieveMemories } from "../p2p/memory-retriever.js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface AutoEditResult {
  rendered_video: string;
  capcut_draft?: string;
  transcript: {
    segments: Array<{ start: number; end: number; text: string }>;
    full_text: string;
  };
  cut_plan: CutPlan;
  hook_score: number;
  segments_kept: number;
  segments_cut: number;
  duration_original: number;
  duration_final: number;
  supabase_url?: string;
}

export interface AutoEditParams {
  video_path: string;
  topic?: string;
  vibe?: string;
  target_duration?: number;
  platform?: string;
}

interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  codec: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const OUTPUT_DIR = process.env.OUTPUT_DIR || "./output";
const FFPROBE_PATH = process.env.FFMPEG_PATH?.replace("ffmpeg", "ffprobe") || "ffprobe";
const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";

// ── Logging ─────────────────────────────────────────────────────────────────

function log(stage: string, msg: string): void {
  console.error(`[auto-editor] [${stage}] ${msg}`);
}

// ── Stage 1: INGEST ─────────────────────────────────────────────────────────

function ingest(videoPath: string): ProbeResult {
  log("1/7 INGEST", `Probing: ${videoPath}`);

  if (!existsSync(videoPath)) {
    throw new Error(`[auto-editor] Video file not found: ${videoPath}`);
  }

  try {
    const probeOut = execSync(
      `${FFPROBE_PATH} -v quiet -print_format json -show_streams -show_format "${videoPath}"`,
      { timeout: 30_000 },
    ).toString();

    const probeData = JSON.parse(probeOut);
    const videoStream = probeData.streams?.find(
      (s: Record<string, unknown>) => s.codec_type === "video",
    );

    const duration = parseFloat(probeData.format?.duration || "0");
    const width = videoStream?.width ?? 0;
    const height = videoStream?.height ?? 0;
    const codec = videoStream?.codec_name ?? "unknown";

    log("1/7 INGEST", `Duration: ${duration.toFixed(1)}s | ${width}x${height} | ${codec}`);

    return { duration, width, height, codec };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[auto-editor] ffprobe failed. Is FFmpeg installed?\n` +
      `  Install: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)\n` +
      `  Error: ${message}`,
    );
  }
}

// ── Stage 2: TRANSCRIBE ─────────────────────────────────────────────────────

async function transcribeStage(
  videoPath: string,
  outputDir: string,
): Promise<TranscriptResult> {
  log("2/7 TRANSCRIBE", "Running Whisper transcription...");

  try {
    const result = await transcribe(videoPath, {
      language: "th",
      outputDir,
    });

    log(
      "2/7 TRANSCRIBE",
      `Got ${result.segments.length} segments, ${result.duration_sec.toFixed(1)}s, language: ${result.language}`,
    );

    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[auto-editor] Whisper transcription failed.\n` +
      `  Install: pip install faster-whisper (recommended) or pip install openai-whisper\n` +
      `  Error: ${message}`,
    );
  }
}

// ── Stage 3: ANALYZE ────────────────────────────────────────────────────────

interface AnalyzeResult {
  scored: ScoredSegment[];
  bestHook: ScoredSegment;
  networkKnowledge: string;
}

async function analyzeStage(
  transcript: TranscriptResult,
  topic: string,
  platform: string,
  vibe: string,
): Promise<AnalyzeResult> {
  log("3/7 ANALYZE", "Scoring segments + retrieving network knowledge...");

  // Run segment scoring and memory retrieval in parallel
  const [scored, networkResult] = await Promise.all([
    scoreSegments(
      transcript.segments.map((s) => ({ start: s.start, end: s.end, text: s.text })),
      topic,
      5, // 5-second chunks
    ),
    retrieveMemories({ topic, platform, vibe }).catch(() => ({
      memories: [],
      promptText: "",
    })),
  ]);

  const kept = scored.filter((s) => s.verdict === "keep" || s.verdict === "trim");
  const cut = scored.filter((s) => s.verdict === "cut");
  const bestHook = findBestHook(scored);

  log(
    "3/7 ANALYZE",
    `${scored.length} segments scored: ${kept.length} keep, ${cut.length} cut`,
  );

  if (networkResult.memories.length > 0) {
    log("3/7 ANALYZE", `Retrieved ${networkResult.memories.length} network memories`);
  }

  return {
    scored,
    bestHook,
    networkKnowledge: networkResult.promptText,
  };
}

// ── Stage 4: CUT ────────────────────────────────────────────────────────────

function cutStage(
  scored: ScoredSegment[],
  targetDuration: number,
): CutPlan {
  log("4/7 CUT", `Generating cut plan (target: ${targetDuration}s)...`);

  const cutPlan = generateCutPlan(scored, targetDuration);

  log(
    "4/7 CUT",
    `Cut plan: ${cutPlan.segments_kept} kept, ${cutPlan.segments_cut} cut, ` +
    `${cutPlan.total_duration.toFixed(1)}s total`,
  );

  const arcLabels = cutPlan.segments.map((s) => `${s.label}(${s.hormone})`).join(" -> ");
  log("4/7 CUT", `Arc: ${arcLabels}`);

  return cutPlan;
}

// ── Stage 5: ENHANCE ────────────────────────────────────────────────────────

interface EnhanceResult {
  vibeSegments: VibeSegment[];
  srtPath: string;
}

function enhanceStage(
  cutPlan: CutPlan,
  transcript: TranscriptResult,
  outputDir: string,
): EnhanceResult {
  log("5/7 ENHANCE", "Building subtitle overlays + color grade...");

  // Generate SRT from transcript segments
  const srtContent = generateSRT(transcript.segments);
  const srtPath = join(outputDir, "subtitles.srt");
  writeFileSync(srtPath, srtContent, "utf-8");

  // Convert cut plan segments to VibeSegment format for renderHQ
  const vibeSegments: VibeSegment[] = cutPlan.segments.map((seg) => ({
    label: seg.label,
    start_sec: seg.new_start,
    end_sec: seg.new_end,
    on_screen_text: seg.text.slice(0, 60), // Truncate for on-screen display
    hormone: seg.hormone,
  }));

  log("5/7 ENHANCE", `${vibeSegments.length} overlay segments, SRT saved`);

  return { vibeSegments, srtPath };
}

// ── Stage 6: RENDER ─────────────────────────────────────────────────────────

async function renderStage(
  videoPath: string,
  cutPlan: CutPlan,
  vibeSegments: VibeSegment[],
  outputDir: string,
  projectSlug: string,
): Promise<string> {
  log("6/7 RENDER", "Rendering 1080x1920 @60fps...");

  const finalVideoPath = join(outputDir, `${projectSlug}_final.mp4`);
  const clipsDir = join(outputDir, "clips");
  mkdirSync(clipsDir, { recursive: true });

  try {
    // Step 1: Trim each segment from the source video
    const clipPaths: string[] = [];
    for (let i = 0; i < cutPlan.segments.length; i++) {
      const seg = cutPlan.segments[i];
      const clipPath = join(clipsDir, `clip_${String(i).padStart(3, "0")}.mp4`);
      const duration = seg.original_end - seg.original_start;

      await trim(videoPath, clipPath, seg.original_start, duration);
      clipPaths.push(clipPath);
    }

    if (clipPaths.length === 0) {
      throw new Error("No clips to concatenate");
    }

    // Step 2: Concatenate clips
    const concatPath = join(outputDir, `${projectSlug}_concat.mp4`);
    await concat(clipPaths, concatPath);

    // Step 3: Render with overlays + color grading using renderHQ
    await renderHQ({
      audioPath: concatPath, // Use concatenated video as audio source
      outputPath: finalVideoPath,
      durationSec: cutPlan.total_duration,
      segments: vibeSegments,
    });

    log("6/7 RENDER", `Rendered: ${finalVideoPath}`);
    return finalVideoPath;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log("6/7 RENDER", `FFmpeg render failed: ${message}`);

    // Attempt simpler fallback render: just concat without overlays
    try {
      log("6/7 RENDER", "Attempting fallback render (concat only)...");
      const clipPaths: string[] = [];
      for (let i = 0; i < cutPlan.segments.length; i++) {
        const seg = cutPlan.segments[i];
        const clipPath = join(clipsDir, `clip_${String(i).padStart(3, "0")}.mp4`);

        if (existsSync(clipPath)) {
          clipPaths.push(clipPath);
        } else {
          const duration = seg.original_end - seg.original_start;
          await trim(videoPath, clipPath, seg.original_start, duration);
          clipPaths.push(clipPath);
        }
      }

      if (clipPaths.length > 0) {
        await concat(clipPaths, finalVideoPath);
        log("6/7 RENDER", `Fallback render complete: ${finalVideoPath}`);
        return finalVideoPath;
      }
    } catch {
      // Fallback also failed
    }

    throw new Error(
      `[auto-editor] FFmpeg render failed.\n` +
      `  Install: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)\n` +
      `  Error: ${message}`,
    );
  }
}

// ── Stage 7: QA + EXPORT ────────────────────────────────────────────────────

interface QAResult {
  hookScoreValue: number;
  hookScoreResult: HookScoreResult | null;
  capcutDraftPath: string;
}

async function qaStage(
  cutPlan: CutPlan,
  transcript: TranscriptResult,
  topic: string,
  platform: string,
  outputDir: string,
  projectSlug: string,
): Promise<QAResult> {
  log("7/7 QA", "Scoring hook + exporting artifacts...");

  // Score the hook
  let hookScoreValue = 0;
  let hookScoreResult: HookScoreResult | null = null;

  if (cutPlan.hook_text) {
    try {
      hookScoreResult = await scoreHook(
        cutPlan.hook_text,
        topic,
        platform as "tiktok" | "instagram" | "youtube" | "facebook",
      );
      hookScoreValue = hookScoreResult.overall;
      log("7/7 QA", `Hook score: ${hookScoreValue}/10 (${hookScoreResult.taxonomy})`);
    } catch (err: unknown) {
      log("7/7 QA", `Hook scoring failed, continuing without score`);
    }
  }

  // Write cut plan
  const cutPlanPath = join(outputDir, `${projectSlug}_cut_plan.json`);
  writeFileSync(cutPlanPath, JSON.stringify(cutPlan, null, 2), "utf-8");

  // Write transcript
  const transcriptPath = join(outputDir, `${projectSlug}_transcript.json`);
  writeFileSync(
    transcriptPath,
    JSON.stringify(
      {
        segments: transcript.segments.map((s) => ({
          start: s.start,
          end: s.end,
          text: s.text,
        })),
        full_text: transcript.full_text,
      },
      null,
      2,
    ),
    "utf-8",
  );

  // Write CapCut-compatible draft
  const capcutDraftPath = join(outputDir, `${projectSlug}_capcut_draft.json`);
  const capcutDraft = buildCapCutDraftFromCutPlan(cutPlan, projectSlug);
  writeFileSync(capcutDraftPath, JSON.stringify(capcutDraft, null, 2), "utf-8");

  log("7/7 QA", `Artifacts saved to: ${outputDir}`);

  return {
    hookScoreValue,
    hookScoreResult,
    capcutDraftPath,
  };
}

// ── CapCut Draft from Cut Plan ──────────────────────────────────────────────

function buildCapCutDraftFromCutPlan(
  cutPlan: CutPlan,
  projectSlug: string,
): Record<string, unknown> {
  const MICROSECOND = 1_000_000;

  return {
    id: `whispercut_auto_${Date.now()}`,
    name: projectSlug,
    fps: 60,
    duration: Math.round(cutPlan.total_duration * MICROSECOND),
    canvas_config: { width: 1080, height: 1920, ratio: "9:16" },
    materials: {
      texts: cutPlan.segments.map((seg, i) => ({
        id: `text_${i}`,
        content: seg.text.slice(0, 60),
        start: Math.round(seg.new_start * MICROSECOND),
        duration: Math.round((seg.new_end - seg.new_start) * MICROSECOND),
        style: {
          font_size: seg.label === "hook" ? 72 : seg.label === "cta" ? 56 : 52,
          color: seg.label === "cta" ? "#FFE66D" : "#FFFFFF",
          alignment: "center",
          bold: seg.label === "hook",
          shadow: true,
        },
        position: seg.label === "hook" ? "top" : seg.label === "cta" ? "bottom" : "middle",
      })),
    },
    tracks: [
      {
        type: "video",
        segments: cutPlan.segments.map((seg, i) => ({
          material_id: `clip_${i}`,
          source_start: Math.round(seg.original_start * MICROSECOND),
          source_duration: Math.round((seg.original_end - seg.original_start) * MICROSECOND),
          target_start: Math.round(seg.new_start * MICROSECOND),
          target_duration: Math.round((seg.new_end - seg.new_start) * MICROSECOND),
          label: seg.label,
          hormone: seg.hormone,
          transition: seg.transition,
        })),
      },
      {
        type: "text",
        segments: cutPlan.segments.map((seg, i) => ({
          material_id: `text_${i}`,
          start: Math.round(seg.new_start * MICROSECOND),
          duration: Math.round((seg.new_end - seg.new_start) * MICROSECOND),
        })),
      },
    ],
    extra_info: {
      whispercut_version: "3.0",
      type: "auto_edit",
      hook_text: cutPlan.hook_text,
      hormone_arc: cutPlan.segments.map((s) => s.hormone),
    },
  };
}

// ── Main Pipeline ───────────────────────────────────────────────────────────

/**
 * Auto-edit pipeline: raw footage -> production-ready TikTok video.
 *
 * Runs 7 stages sequentially. If FFmpeg fails at render, returns partial
 * result with cut_plan + transcript so user can still use the analysis.
 */
export async function autoEdit(params: AutoEditParams): Promise<AutoEditResult> {
  const {
    video_path,
    topic = "auto-detected",
    vibe = "auto",
    target_duration = 60,
    platform = "tiktok",
  } = params;

  const t0 = Date.now();

  // Set up output directory
  const baseName = basename(video_path, extname(video_path));
  const projectSlug = baseName
    .slice(0, 30)
    .replace(/\s+/g, "_")
    .replace(/[^\w\u0E00-\u0E7F_-]/g, "");
  const projectDir = join(OUTPUT_DIR, `auto_${projectSlug}_${Date.now()}`);
  mkdirSync(projectDir, { recursive: true });

  log("START", `Video: ${video_path} | Topic: ${topic} | Target: ${target_duration}s`);

  // ── Stage 1: INGEST ───────────────────────────────────────────────────
  const probeResult = ingest(video_path);

  // ── Stage 2: TRANSCRIBE ───────────────────────────────────────────────
  let transcript: TranscriptResult;
  try {
    transcript = await transcribeStage(video_path, projectDir);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Transcription failed -- Whisper is required for auto-edit.\n${message}`,
    );
  }

  // Use AI-detected topic if none provided
  const effectiveTopic = topic === "auto-detected"
    ? transcript.full_text.slice(0, 100)
    : topic;

  // ── Stage 3: ANALYZE ──────────────────────────────────────────────────
  const analysis = await analyzeStage(transcript, effectiveTopic, platform, vibe);

  // ── Stage 4: CUT ─────────────────────────────────────────────────────
  const cutPlan = cutStage(analysis.scored, target_duration);

  if (cutPlan.segments.length === 0) {
    log("CUT", "WARNING: No segments survived scoring. Returning analysis-only result.");
    return {
      rendered_video: "",
      transcript: {
        segments: transcript.segments.map((s) => ({
          start: s.start,
          end: s.end,
          text: s.text,
        })),
        full_text: transcript.full_text,
      },
      cut_plan: cutPlan,
      hook_score: 0,
      segments_kept: 0,
      segments_cut: analysis.scored.length,
      duration_original: probeResult.duration,
      duration_final: 0,
    };
  }

  // ── Stage 5: ENHANCE ─────────────────────────────────────────────────
  const enhanced = enhanceStage(cutPlan, transcript, projectDir);

  // ── Stage 6: RENDER ──────────────────────────────────────────────────
  let renderedVideo = "";
  try {
    renderedVideo = await renderStage(
      video_path,
      cutPlan,
      enhanced.vibeSegments,
      projectDir,
      projectSlug,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log("RENDER", `Render failed -- returning partial result with analysis.`);
    log("RENDER", message);

    // Return partial result: transcript + cut_plan without rendered video
    const qaPartial = await qaStage(
      cutPlan,
      transcript,
      effectiveTopic,
      platform,
      projectDir,
      projectSlug,
    ).catch(() => ({
      hookScoreValue: 0,
      hookScoreResult: null,
      capcutDraftPath: "",
    }));

    return {
      rendered_video: "",
      capcut_draft: qaPartial.capcutDraftPath || undefined,
      transcript: {
        segments: transcript.segments.map((s) => ({
          start: s.start,
          end: s.end,
          text: s.text,
        })),
        full_text: transcript.full_text,
      },
      cut_plan: cutPlan,
      hook_score: qaPartial.hookScoreValue,
      segments_kept: cutPlan.segments_kept,
      segments_cut: cutPlan.segments_cut,
      duration_original: probeResult.duration,
      duration_final: cutPlan.total_duration,
    };
  }

  // ── Stage 7: QA + EXPORT ─────────────────────────────────────────────
  const qa = await qaStage(
    cutPlan,
    transcript,
    effectiveTopic,
    platform,
    projectDir,
    projectSlug,
  );

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  log("DONE", `Completed in ${elapsed}s | ${renderedVideo}`);

  return {
    rendered_video: renderedVideo,
    capcut_draft: qa.capcutDraftPath,
    transcript: {
      segments: transcript.segments.map((s) => ({
        start: s.start,
        end: s.end,
        text: s.text,
      })),
      full_text: transcript.full_text,
    },
    cut_plan: cutPlan,
    hook_score: qa.hookScoreValue,
    segments_kept: cutPlan.segments_kept,
    segments_cut: cutPlan.segments_cut,
    duration_original: probeResult.duration,
    duration_final: cutPlan.total_duration,
    supabase_url: undefined, // Future: Supabase upload integration
  };
}
