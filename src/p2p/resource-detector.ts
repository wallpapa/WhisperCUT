/**
 * Resource Detector — Auto-detect ALL user resources at startup
 *
 * Detects 6 resource types:
 *   1. AI Inference (Ollama models, VRAM, tokens/sec)
 *   2. Video Render (FFmpeg cores, GPU accel)
 *   3. Transcription (Whisper model, GPU)
 *   4. Research (Tavily API)
 *   5. Image Generation (Canva API, local SDXL)
 *   6. Storage (disk space, cached models)
 */

import { execSync } from "child_process";

export interface NodeCapabilities {
  ai: {
    provider: string;
    model: string;
    models_available: string[];
    vram_gb: number;
  } | null;
  render: {
    ffmpeg: boolean;
    version: string;
    cores: number;
    gpu_accel: string;
  } | null;
  transcribe: {
    whisper: boolean;
    model: string;
    gpu: boolean;
  } | null;
  research: {
    tavily: boolean;
  } | null;
  image: {
    canva: boolean;
    sdxl_local: boolean;
  } | null;
  storage: {
    available_gb: number;
    cached_models: string[];
  } | null;
}

/** Detect all 6 resource types in parallel */
export async function detectCapabilities(): Promise<NodeCapabilities> {
  const [ai, render, transcribe, research, image, storage] = await Promise.all([
    detectOllama(),
    detectFFmpeg(),
    detectWhisper(),
    Promise.resolve(detectTavily()),
    Promise.resolve(detectImageGen()),
    detectStorage(),
  ]);
  return { ai, render, transcribe, research, image, storage };
}

/** Format capabilities as readable summary */
export function formatCapabilities(caps: NodeCapabilities): string {
  const lines: string[] = [];

  if (caps.ai) {
    lines.push(`AI: ${caps.ai.provider}/${caps.ai.model} (${caps.ai.models_available.length} models, ${caps.ai.vram_gb}GB VRAM)`);
  } else {
    lines.push("AI: not detected");
  }

  if (caps.render) {
    lines.push(`Render: FFmpeg ${caps.render.version} (${caps.render.cores} cores, GPU: ${caps.render.gpu_accel})`);
  } else {
    lines.push("Render: FFmpeg not found");
  }

  if (caps.transcribe) {
    lines.push(`Transcribe: Whisper ${caps.transcribe.model} (GPU: ${caps.transcribe.gpu})`);
  } else {
    lines.push("Transcribe: Whisper not found");
  }

  lines.push(`Research: Tavily ${caps.research?.tavily ? "configured" : "not configured"}`);
  lines.push(`Image: Canva ${caps.image?.canva ? "configured" : "no"}, SDXL ${caps.image?.sdxl_local ? "local" : "no"}`);

  if (caps.storage) {
    lines.push(`Storage: ${caps.storage.available_gb}GB free, ${caps.storage.cached_models.length} cached models`);
  }

  return lines.join("\n");
}

// ── Detectors ────────────────────────────────────────────────────

async function detectOllama(): Promise<NodeCapabilities["ai"]> {
  const provider = process.env.AI_PROVIDER || "ollama";
  const model = process.env.AI_MODEL || "gemma3:27b";

  try {
    const base = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;

    const data = await res.json() as { models?: Array<{ name: string; size: number }> };
    const models = data.models || [];
    const modelNames = models.map(m => m.name);
    const totalSize = models.reduce((sum, m) => sum + (m.size || 0), 0);
    const vramGb = Math.round(totalSize / 1024 / 1024 / 1024 * 10) / 10;

    return {
      provider,
      model,
      models_available: modelNames,
      vram_gb: vramGb,
    };
  } catch {
    // Ollama not running — check if cloud API is configured
    if (process.env.AI_API_KEY || process.env.GEMINI_API_KEY) {
      return {
        provider: process.env.AI_PROVIDER || "gemini",
        model,
        models_available: [model],
        vram_gb: 0,
      };
    }
    return null;
  }
}

async function detectFFmpeg(): Promise<NodeCapabilities["render"]> {
  try {
    const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
    const versionOut = execSync(`${ffmpegPath} -version 2>&1`, { timeout: 5000 }).toString();
    const versionMatch = versionOut.match(/ffmpeg version (\S+)/);
    const version = versionMatch?.[1] || "unknown";

    // Detect cores
    let cores = 4;
    try {
      const { cpus } = await import("os");
      cores = cpus().length;
    } catch { /* default */ }

    // Detect GPU acceleration
    let gpuAccel = "none";
    try {
      const encoders = execSync(`${ffmpegPath} -encoders 2>&1`, { timeout: 5000 }).toString();
      if (encoders.includes("h264_videotoolbox")) gpuAccel = "videotoolbox";
      else if (encoders.includes("h264_nvenc")) gpuAccel = "cuda";
      else if (encoders.includes("h264_vaapi")) gpuAccel = "vaapi";
      else if (encoders.includes("h264_qsv")) gpuAccel = "qsv";
    } catch { /* no GPU */ }

    return { ffmpeg: true, version, cores, gpu_accel: gpuAccel };
  } catch {
    return null;
  }
}

async function detectWhisper(): Promise<NodeCapabilities["transcribe"]> {
  const model = process.env.WHISPER_MODEL || "large-v3";

  try {
    // Check if faster-whisper or whisper CLI is available
    execSync("which faster-whisper 2>/dev/null || which whisper 2>/dev/null", { timeout: 3000 });

    // Check GPU (CUDA or MPS)
    let gpu = false;
    try {
      const result = execSync("python3 -c \"import torch; print(torch.cuda.is_available() or torch.backends.mps.is_available())\" 2>/dev/null", { timeout: 5000 }).toString().trim();
      gpu = result === "True";
    } catch { /* no GPU */ }

    return { whisper: true, model, gpu };
  } catch {
    return null;
  }
}

function detectTavily(): NodeCapabilities["research"] {
  return { tavily: !!(process.env.TAVILY_API_KEY) };
}

function detectImageGen(): NodeCapabilities["image"] {
  return {
    canva: !!(process.env.CANVA_ACCESS_TOKEN),
    sdxl_local: false, // TODO: detect local SDXL/ComfyUI
  };
}

async function detectStorage(): Promise<NodeCapabilities["storage"]> {
  try {
    const dfOut = execSync("df -g . 2>/dev/null || df -BG . 2>/dev/null", { timeout: 3000 }).toString();
    const lines = dfOut.trim().split("\n");
    const parts = lines[lines.length - 1].split(/\s+/);
    const availableGb = parseInt(parts[3]) || 0;

    // Check cached Ollama models
    const cachedModels: string[] = [];
    try {
      const base = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
      const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json() as { models?: Array<{ name: string }> };
        cachedModels.push(...(data.models || []).map(m => m.name));
      }
    } catch { /* no ollama */ }

    return { available_gb: availableGb, cached_models: cachedModels };
  } catch {
    return { available_gb: 0, cached_models: [] };
  }
}
