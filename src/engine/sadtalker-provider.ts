/**
 * SadTalker Provider — Local Mac Audio-Driven Lipsync
 *
 * Single image + audio → talking head video.
 * Runs on MacBook Pro M5 via MPS (with fast face render).
 * CVPR 2023. 15K+ GitHub stars.
 *
 * Setup:
 *   git clone https://github.com/OpenTalker/SadTalker ~/SadTalker
 *   cd ~/SadTalker && pip install -r requirements.txt
 *   # Models download automatically on first run
 *
 * Env vars:
 *   SADTALKER_PATH — path to SadTalker repo (default: ~/SadTalker)
 *   SADTALKER_PYTHON — Python binary (default: python3)
 */

import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, resolve, dirname } from "path";

// ── Config ────────────────────────────────────────────────────

const SADTALKER_PATH = process.env.SADTALKER_PATH || resolve(process.env.HOME || "~", "SadTalker");
const SADTALKER_PYTHON = process.env.SADTALKER_PYTHON || "python3";

// ── Types ─────────────────────────────────────────────────────

export interface SadTalkerConfig {
  /** Source image — portrait photo */
  sourceImage: string;
  /** Audio file — speech to sync */
  audioFile: string;
  /** Output directory */
  outputDir?: string;
  /** Expression scale (0.0-2.0, default 1.0) */
  expressionScale?: number;
  /** Face enhancer: 'gfpgan' | 'RestoreFormer' | none */
  enhancer?: "gfpgan" | "RestoreFormer";
  /** Still mode — less head motion, focus on lips */
  still?: boolean;
  /** Preprocess: 'crop' | 'resize' | 'full' */
  preprocess?: "crop" | "resize" | "full";
  /** Batch size */
  batchSize?: number;
}

export interface SadTalkerResult {
  provider: "sadtalker";
  success: boolean;
  sourceImage: string;
  audioFile: string;
  outputVideo?: string;
  outputDir: string;
  durationMs: number;
  error?: string;
}

// ── Availability ──────────────────────────────────────────────

export function isSadTalkerAvailable(): boolean {
  return existsSync(join(SADTALKER_PATH, "inference.py"));
}

export function getSadTalkerStatus(): {
  installed: boolean;
  path: string;
  python: string;
  setupInstructions?: string;
} {
  const installed = existsSync(join(SADTALKER_PATH, "inference.py"));
  return {
    installed,
    path: SADTALKER_PATH,
    python: SADTALKER_PYTHON,
    setupInstructions: installed ? undefined : [
      "# Install SadTalker for Mac:",
      `git clone https://github.com/OpenTalker/SadTalker ${SADTALKER_PATH}`,
      `cd ${SADTALKER_PATH}`,
      "conda create -n sadtalker python=3.8 && conda activate sadtalker",
      "pip install -r requirements.txt",
      "# Models download automatically on first run (~1.5GB)",
    ].join("\n"),
  };
}

// ── Inference ─────────────────────────────────────────────────

export async function runSadTalker(config: SadTalkerConfig): Promise<SadTalkerResult> {
  const {
    sourceImage,
    audioFile,
    outputDir = "./output/sadtalker",
    expressionScale = 1.0,
    enhancer,
    still = true,
    preprocess = "crop",
    batchSize = 2,
  } = config;

  if (!existsSync(sourceImage)) throw new Error(`Source image not found: ${sourceImage}`);
  if (!existsSync(audioFile)) throw new Error(`Audio file not found: ${audioFile}`);

  if (!isSadTalkerAvailable()) {
    const status = getSadTalkerStatus();
    throw new Error(`SadTalker not installed.\n${status.setupInstructions}`);
  }

  mkdirSync(outputDir, { recursive: true });

  const t0 = Date.now();
  console.error(`[sadtalker] Image: ${sourceImage}`);
  console.error(`[sadtalker] Audio: ${audioFile}`);

  const args = [
    "inference.py",
    "--driven_audio", resolve(audioFile),
    "--source_image", resolve(sourceImage),
    "--result_dir", resolve(outputDir),
    "--expression_scale", String(expressionScale),
    "--preprocess", preprocess,
    "--batch_size", String(batchSize),
  ];

  if (still) args.push("--still");
  if (enhancer) args.push("--enhancer", enhancer);

  try {
    execFileSync(SADTALKER_PYTHON, args, {
      cwd: SADTALKER_PATH,
      encoding: "utf-8",
      timeout: 600_000,
      env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: "1" },
      maxBuffer: 10 * 1024 * 1024,
    });

    // Find newest mp4 in output dir
    const outputVideo = findNewestFile(outputDir, ".mp4");
    const durationMs = Date.now() - t0;

    if (outputVideo) {
      console.error(`[sadtalker] ✅ Done in ${(durationMs / 1000).toFixed(1)}s → ${outputVideo}`);
    }

    return {
      provider: "sadtalker",
      success: !!outputVideo,
      sourceImage,
      audioFile,
      outputVideo: outputVideo || undefined,
      outputDir,
      durationMs,
    };
  } catch (e: any) {
    return {
      provider: "sadtalker",
      success: false,
      sourceImage,
      audioFile,
      outputDir,
      durationMs: Date.now() - t0,
      error: e.message?.slice(0, 300),
    };
  }
}

function findNewestFile(dir: string, ext: string): string | null {
  if (!existsSync(dir)) return null;

  // Search recursively (SadTalker creates timestamped subdirs)
  const files: { path: string; mtime: number }[] = [];

  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(ext)) {
        files.push({ path: full, mtime: statSync(full).mtimeMs });
      }
    }
  }

  walk(dir);
  if (files.length === 0) return null;
  files.sort((a, b) => b.mtime - a.mtime);
  return files[0].path;
}

/** Dr.Gwang convenience: single image + audio → talking head */
export async function runDrGwangSadTalker(params: {
  audioFile: string;
  sourceImage?: string;
  outputDir?: string;
}): Promise<SadTalkerResult> {
  return runSadTalker({
    sourceImage: params.sourceImage || resolve(process.cwd(), "output/digital-twins/drgwang/clone-master-set-v3/front-face-portrait.png"),
    audioFile: params.audioFile,
    outputDir: params.outputDir || `./output/sadtalker/drgwang-${Date.now()}`,
    still: true,
    enhancer: "gfpgan",
    expressionScale: 1.2,
  });
}
