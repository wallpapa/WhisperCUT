/**
 * MCP Tool — LivePortrait (Mac M-series Local Lipsync)
 *
 * whispercut_liveportrait       — Run LivePortrait animation
 * whispercut_liveportrait_status — Check installation status
 */

import {
  runLivePortrait,
  runDrGwangLivePortrait,
  getLivePortraitStatus,
  isLivePortraitAvailable,
  type LivePortraitConfig,
} from "../../engine/liveportrait-provider.js";

// ══════════════════════════════════════════════════════════════
//  Tool 1: whispercut_liveportrait
// ══════════════════════════════════════════════════════════════

export const livePortraitTool = {
  name: "whispercut_liveportrait",
  description:
    "Run LivePortrait portrait animation on Mac M-series (MPS). " +
    "Transfers motion from a driving video to a clean source image. " +
    "For Dr.Gwang: provide driving_video only — auto-uses avatar reference. " +
    "Recommended for: real footage + clean avatar = studio-quality talking head. " +
    "Requires: LivePortrait installed locally (see whispercut_liveportrait_status).",
  inputSchema: {
    type: "object" as const,
    required: ["driving_video"],
    properties: {
      driving_video: {
        type: "string",
        description: "Path to driving video (real footage with speech/motion to transfer)",
      },
      source_image: {
        type: "string",
        description: "Path to source image (clean avatar). Default: Dr.Gwang front-face portrait from clone-master-set-v3",
      },
      output_dir: {
        type: "string",
        description: "Output directory. Default: ./output/liveportrait/",
      },
      crop_driving: {
        type: "boolean",
        description: "Auto-crop driving video to face. Default: true",
      },
      lip_retargeting: {
        type: "boolean",
        description: "Enable lip retargeting for better lipsync. Default: true",
      },
      normalize_lip: {
        type: "boolean",
        description: "Normalize lip movements. Default: true",
      },
    },
  },
};

export async function handleLivePortrait(args: {
  driving_video: string;
  source_image?: string;
  output_dir?: string;
  crop_driving?: boolean;
  lip_retargeting?: boolean;
  normalize_lip?: boolean;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  if (args.source_image) {
    const result = await runLivePortrait({
      sourceImage: args.source_image,
      drivingVideo: args.driving_video,
      outputDir: args.output_dir,
      cropDriving: args.crop_driving,
      lipRetargeting: args.lip_retargeting,
      normalizeLip: args.normalize_lip,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  // Default: Dr.Gwang pipeline
  const result = await runDrGwangLivePortrait({
    drivingVideo: args.driving_video,
    outputDir: args.output_dir,
  });
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

// ══════════════════════════════════════════════════════════════
//  Tool 2: whispercut_liveportrait_status
// ══════════════════════════════════════════════════════════════

export const livePortraitStatusTool = {
  name: "whispercut_liveportrait_status",
  description:
    "Check LivePortrait installation status and Mac MPS availability. " +
    "Shows setup instructions if not installed.",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
};

export async function handleLivePortraitStatus(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const status = getLivePortraitStatus();
  const available = isLivePortraitAvailable();

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        ...status,
        ready: available,
        fallback_chain: [
          { provider: "liveportrait", status: available ? "ready" : "not_installed", type: "local_mac_mps" },
          { provider: "sync_lipsync_2", status: "ready", type: "cloud_api" },
          { provider: "sync_lipsync_2_pro", status: "ready", type: "cloud_api" },
          { provider: "wav2lip_local", status: "available", type: "local" },
        ],
      }, null, 2),
    }],
  };
}
