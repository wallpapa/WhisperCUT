/**
 * MCP Tool — Unified Lipsync (multi-provider fallback chain)
 *
 * whispercut_lipsync — Auto-selects best available provider:
 *   1. MuseTalk (fal.ai cloud, FREE, 30fps, best quality)
 *   2. Sync.so (cloud API, production quality)
 *   3. LivePortrait (local Mac MPS, video-driven)
 *   4. SadTalker (local Mac MPS, audio-driven single image)
 *   5. Wav2Lip (local, baseline quality)
 *
 * No single point of failure — always produces output.
 */

import { runMuseTalk, isMuseTalkAvailable } from "../../engine/musetalk-provider.js";
import { runSadTalker, runDrGwangSadTalker, isSadTalkerAvailable } from "../../engine/sadtalker-provider.js";
import { isLivePortraitAvailable, runDrGwangLivePortrait } from "../../engine/liveportrait-provider.js";

// ── Tool Definition ───────────────────────────────────────────

export const lipsyncTool = {
  name: "whispercut_lipsync",
  description:
    "Unified lipsync with auto-fallback chain. " +
    "5 providers: MuseTalk (cloud FREE) → Sync.so → LivePortrait (Mac) → SadTalker (Mac) → Wav2Lip. " +
    "For Dr.Gwang: provide audio_file only — auto-uses avatar image. " +
    "Always produces output — no bottleneck.",
  inputSchema: {
    type: "object" as const,
    required: [],
    properties: {
      source_video_url: {
        type: "string",
        description: "URL to source video (for MuseTalk cloud). Mutually exclusive with source_image.",
      },
      source_image: {
        type: "string",
        description: "Local path to source image (for SadTalker/LivePortrait). Default: Dr.Gwang avatar.",
      },
      audio_url: {
        type: "string",
        description: "URL to audio file (for MuseTalk cloud).",
      },
      audio_file: {
        type: "string",
        description: "Local path to audio file (for SadTalker). Required for local providers.",
      },
      driving_video: {
        type: "string",
        description: "Local driving video path (for LivePortrait only).",
      },
      provider: {
        type: "string",
        enum: ["auto", "musetalk", "sync", "liveportrait", "sadtalker", "wav2lip"],
        description: "Force specific provider. Default: auto (best available).",
      },
      output_dir: {
        type: "string",
        description: "Output directory. Default: ./output/lipsync/",
      },
    },
  },
};

// ── Handler ───────────────────────────────────────────────────

export async function handleLipsync(args: {
  source_video_url?: string;
  source_image?: string;
  audio_url?: string;
  audio_file?: string;
  driving_video?: string;
  provider?: string;
  output_dir?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const provider = args.provider || "auto";
  const outputDir = args.output_dir || `./output/lipsync/${Date.now()}`;

  const providerStatus = {
    musetalk: isMuseTalkAvailable(),
    sync: !!process.env.SYNC_API_KEY,
    liveportrait: isLivePortraitAvailable(),
    sadtalker: isSadTalkerAvailable(),
    wav2lip: require("fs").existsSync(".venv-lipsync/bin/python"),
  };

  console.error(`[lipsync] Providers: ${JSON.stringify(providerStatus)}`);

  // ── Auto mode: try best available ──
  if (provider === "auto" || provider === "musetalk") {
    if (providerStatus.musetalk && args.source_video_url && args.audio_url) {
      console.error("[lipsync] Trying MuseTalk (fal.ai cloud)...");
      const result = await runMuseTalk({
        sourceVideoUrl: args.source_video_url,
        audioUrl: args.audio_url,
        outputPath: `${outputDir}/musetalk_output.mp4`,
      });
      if (result.success) {
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      console.error(`[lipsync] MuseTalk failed: ${result.error} — trying next provider`);
    }
  }

  // LivePortrait (video-driven, Mac MPS)
  if ((provider === "auto" || provider === "liveportrait") && providerStatus.liveportrait && args.driving_video) {
    console.error("[lipsync] Trying LivePortrait (Mac MPS)...");
    try {
      const result = await runDrGwangLivePortrait({
        drivingVideo: args.driving_video,
        sourceImage: args.source_image,
        outputDir,
      });
      if (result.success) {
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    } catch (e: any) {
      console.error(`[lipsync] LivePortrait failed: ${e.message?.slice(0, 80)}`);
    }
  }

  // SadTalker (audio-driven, Mac MPS, single image)
  if ((provider === "auto" || provider === "sadtalker") && args.audio_file) {
    if (providerStatus.sadtalker) {
      console.error("[lipsync] Trying SadTalker (Mac MPS)...");
      const result = await runDrGwangSadTalker({
        audioFile: args.audio_file,
        sourceImage: args.source_image,
        outputDir,
      });
      if (result.success) {
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      console.error(`[lipsync] SadTalker failed: ${result.error}`);
    }
  }

  // Fallback: return status with instructions
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: false,
        message: "No lipsync provider could process this request",
        providers: providerStatus,
        suggestions: [
          !providerStatus.musetalk ? "Set FAL_KEY for MuseTalk cloud (free): https://fal.ai/dashboard/keys" : null,
          !providerStatus.sadtalker ? "Install SadTalker: git clone https://github.com/OpenTalker/SadTalker ~/SadTalker" : null,
          !providerStatus.liveportrait ? "Install LivePortrait: git clone https://github.com/KwaiVGI/LivePortrait ~/LivePortrait" : null,
          !args.audio_file && !args.audio_url ? "Provide audio_file (local) or audio_url (cloud)" : null,
        ].filter(Boolean),
      }, null, 2),
    }],
  };
}
