/**
 * LivePortrait Provider — Mac M-series Local Lipsync
 *
 * High-quality portrait animation using video-driven motion transfer.
 * Runs locally on MacBook Pro M5 16GB via MPS (Metal Performance Shaders).
 *
 * Pipeline:
 *   1. Source image (clean Dr.Gwang avatar) +
 *   2. Driving video (real Dr.Gwang footage with speech) →
 *   3. LivePortrait inference (MPS) →
 *   4. Output: animated talking head video
 *   5. Replace audio track with TTS voice
 *
 * Setup:
 *   git clone https://github.com/KwaiVGI/LivePortrait
 *   cd LivePortrait && pip install -r requirements_macOS.txt
 *   # Download pretrained models (automatic on first run)
 *
 * Env vars:
 *   LIVEPORTRAIT_PATH — path to LivePortrait repo (default: ~/LivePortrait)
 *   LIVEPORTRAIT_PYTHON — Python binary with LivePortrait deps (default: python3)
 *
 * Requires: Python 3.10+, PyTorch with MPS, ~4GB memory
 */

import { execFileSync, execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, resolve, dirname } from "path";

// ── Config ────────────────────────────────────────────────────

const LIVEPORTRAIT_PATH = process.env.LIVEPORTRAIT_PATH || resolve(process.env.HOME || "~", "LivePortrait");
const LIVEPORTRAIT_PYTHON = process.env.LIVEPORTRAIT_PYTHON || "python3";

// ── Types ─────────────────────────────────────────────────────

export interface LivePortraitConfig {
  /** Source image — clean avatar/reference image */
  sourceImage: string;
  /** Driving video — real footage with speech/motion to transfer */
  drivingVideo: string;
  /** Output directory */
  outputDir?: string;
  /** Crop driving video to face */
  cropDriving?: boolean;
  /** Crop scale for driving */
  cropScale?: number;
  /** Enable lip retargeting (recommended for lipsync) */
  lipRetargeting?: boolean;
  /** Normalize lip movements */
  normalizeLip?: boolean;
  /** Use relative motion (recommended) */
  relativeMotion?: boolean;
}

export interface LivePortraitResult {
  provider: "liveportrait";
  sourceImage: string;
  drivingVideo: string;
  outputVideo: string;
  outputDir: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

// ── Availability Check ────────────────────────────────────────

/** Check if LivePortrait is installed and ready */
export function isLivePortraitAvailable(): boolean {
  // Check repo exists
  if (!existsSync(join(LIVEPORTRAIT_PATH, "inference.py"))) {
    return false;
  }

  // Check Python has required modules
  try {
    execFileSync(LIVEPORTRAIT_PYTHON, [
      "-c",
      "import torch; assert torch.backends.mps.is_available() or torch.cuda.is_available(), 'No GPU backend'",
    ], { stdio: "ignore", timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

/** Get LivePortrait installation status */
export function getLivePortraitStatus(): {
  installed: boolean;
  path: string;
  python: string;
  mpsAvailable: boolean;
  setupInstructions?: string;
} {
  const installed = existsSync(join(LIVEPORTRAIT_PATH, "inference.py"));

  let mpsAvailable = false;
  try {
    const result = execFileSync(LIVEPORTRAIT_PYTHON, [
      "-c",
      "import torch; print('mps' if torch.backends.mps.is_available() else 'cpu')",
    ], { encoding: "utf-8", timeout: 10000 }).trim();
    mpsAvailable = result === "mps";
  } catch {}

  return {
    installed,
    path: LIVEPORTRAIT_PATH,
    python: LIVEPORTRAIT_PYTHON,
    mpsAvailable,
    setupInstructions: installed ? undefined : [
      "# Install LivePortrait for Mac:",
      `git clone https://github.com/KwaiVGI/LivePortrait ${LIVEPORTRAIT_PATH}`,
      `cd ${LIVEPORTRAIT_PATH}`,
      "conda create -n LivePortrait python=3.10 && conda activate LivePortrait",
      "pip install -r requirements_macOS.txt",
      "# Models download automatically on first run",
    ].join("\n"),
  };
}

// ── Inference ─────────────────────────────────────────────────

/** Run LivePortrait inference */
export async function runLivePortrait(config: LivePortraitConfig): Promise<LivePortraitResult> {
  const {
    sourceImage,
    drivingVideo,
    outputDir = "./output/liveportrait",
    cropDriving = true,
    cropScale = 2.3,
    lipRetargeting = true,
    normalizeLip = true,
    relativeMotion = true,
  } = config;

  if (!existsSync(sourceImage)) {
    throw new Error(`Source image not found: ${sourceImage}`);
  }
  if (!existsSync(drivingVideo)) {
    throw new Error(`Driving video not found: ${drivingVideo}`);
  }

  if (!existsSync(join(LIVEPORTRAIT_PATH, "inference.py"))) {
    const status = getLivePortraitStatus();
    throw new Error(`LivePortrait not installed at ${LIVEPORTRAIT_PATH}.\n${status.setupInstructions}`);
  }

  mkdirSync(outputDir, { recursive: true });

  const t0 = Date.now();
  console.error(`[liveportrait] Source: ${sourceImage}`);
  console.error(`[liveportrait] Driving: ${drivingVideo}`);
  console.error(`[liveportrait] Output: ${outputDir}`);

  // Build command args
  const args = [
    "inference.py",
    "-s", resolve(sourceImage),
    "-d", resolve(drivingVideo),
    "-o", resolve(outputDir),
  ];

  if (cropDriving) {
    args.push("--flag_crop_driving_video");
    args.push("--scale_crop_driving_video", String(cropScale));
  }

  if (lipRetargeting) {
    args.push("--flag_lip_retargeting");
  }

  if (normalizeLip) {
    args.push("--flag_normalize_lip");
  }

  if (relativeMotion) {
    args.push("--flag_relative_motion");
  }

  try {
    // Run inference with MPS fallback enabled
    const env = {
      ...process.env,
      PYTORCH_ENABLE_MPS_FALLBACK: "1",
    };

    console.error(`[liveportrait] Running inference (MPS)...`);
    const stdout = execFileSync(LIVEPORTRAIT_PYTHON, args, {
      cwd: LIVEPORTRAIT_PATH,
      encoding: "utf-8",
      timeout: 600_000, // 10 min timeout
      env,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    // Find output video
    const outputFiles = require("fs").readdirSync(outputDir)
      .filter((f: string) => f.endsWith(".mp4") || f.endsWith("_concat.mp4"))
      .sort((a: string, b: string) => {
        const sa = require("fs").statSync(join(outputDir, a)).mtimeMs;
        const sb = require("fs").statSync(join(outputDir, b)).mtimeMs;
        return sb - sa; // newest first
      });

    const outputVideo = outputFiles[0]
      ? join(outputDir, outputFiles[0])
      : join(outputDir, "output.mp4");

    const durationMs = Date.now() - t0;
    console.error(`[liveportrait] ✅ Done in ${(durationMs / 1000).toFixed(1)}s → ${outputVideo}`);

    return {
      provider: "liveportrait",
      sourceImage,
      drivingVideo,
      outputVideo,
      outputDir,
      durationMs,
      success: true,
    };

  } catch (e: any) {
    const durationMs = Date.now() - t0;
    console.error(`[liveportrait] ❌ Failed: ${e.message?.slice(0, 150)}`);

    return {
      provider: "liveportrait",
      sourceImage,
      drivingVideo,
      outputVideo: "",
      outputDir,
      durationMs,
      success: false,
      error: e.message?.slice(0, 300),
    };
  }
}

// ── Convenience: Dr.Gwang Pipeline ────────────────────────────

/** Run LivePortrait with Dr.Gwang defaults */
export async function runDrGwangLivePortrait(params: {
  drivingVideo: string;
  sourceImage?: string;
  outputDir?: string;
}): Promise<LivePortraitResult> {
  const {
    drivingVideo,
    sourceImage = resolve(process.cwd(), "output/digital-twins/drgwang/clone-master-set-v3/front-face-portrait.png"),
    outputDir = `./output/liveportrait/drgwang-${Date.now()}`,
  } = params;

  return runLivePortrait({
    sourceImage,
    drivingVideo,
    outputDir,
    cropDriving: true,
    lipRetargeting: true,
    normalizeLip: true,
    relativeMotion: true,
  });
}
