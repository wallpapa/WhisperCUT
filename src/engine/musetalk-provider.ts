/**
 * MuseTalk Provider — Cloud Lipsync via fal.ai (FREE tier)
 *
 * Real-time 30fps lip sync using Tencent MuseTalk 1.5.
 * Cloud-based: NO GPU needed. Works on any device.
 *
 * Input: source video URL + audio URL → Output: lipsynced video
 * Multi-language: Thai, Chinese, English, Japanese
 *
 * Setup: FAL_KEY env var (get from fal.ai/dashboard/keys)
 * Pricing: Free preview tier available
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";

// ── Config ────────────────────────────────────────────────────

const FAL_ENDPOINT = "https://fal.run/fal-ai/musetalk";
const FAL_QUEUE_ENDPOINT = "https://queue.fal.run/fal-ai/musetalk";

// ── Types ─────────────────────────────────────────────────────

export interface MuseTalkConfig {
  /** URL to source video (face to animate) */
  sourceVideoUrl: string;
  /** URL to audio file (voice to sync) */
  audioUrl: string;
  /** Output path for downloaded result */
  outputPath?: string;
  /** Use queue mode for long videos (recommended) */
  useQueue?: boolean;
  /** Timeout in ms */
  timeoutMs?: number;
}

export interface MuseTalkResult {
  provider: "musetalk";
  success: boolean;
  videoUrl?: string;
  videoPath?: string;
  contentType?: string;
  fileSize?: number;
  durationMs: number;
  error?: string;
}

// ── Provider ──────────────────────────────────────────────────

export async function runMuseTalk(config: MuseTalkConfig): Promise<MuseTalkResult> {
  const {
    sourceVideoUrl,
    audioUrl,
    outputPath,
    useQueue = true,
    timeoutMs = 300_000,
  } = config;

  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    return {
      provider: "musetalk",
      success: false,
      durationMs: 0,
      error: "FAL_KEY not set. Get one at https://fal.ai/dashboard/keys",
    };
  }

  const t0 = Date.now();
  console.error(`[musetalk] Source: ${sourceVideoUrl.slice(0, 60)}...`);
  console.error(`[musetalk] Audio: ${audioUrl.slice(0, 60)}...`);

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Key ${falKey}`,
  };

  const body = JSON.stringify({
    source_video_url: sourceVideoUrl,
    audio_url: audioUrl,
  });

  try {
    let resultData: any;

    if (useQueue) {
      // Queue mode: submit → poll → get result
      console.error("[musetalk] Submitting to queue...");
      const submitRes = await fetch(FAL_QUEUE_ENDPOINT, {
        method: "POST",
        headers,
        body,
      });

      if (!submitRes.ok) {
        const err = await submitRes.text();
        throw new Error(`Submit failed ${submitRes.status}: ${err.slice(0, 200)}`);
      }

      const submitData = await submitRes.json() as any;
      const requestId = submitData.request_id;
      console.error(`[musetalk] Queued: ${requestId}`);

      // Poll for completion
      const pollUrl = `https://queue.fal.run/fal-ai/musetalk/requests/${requestId}/status`;
      const resultUrl = `https://queue.fal.run/fal-ai/musetalk/requests/${requestId}`;
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 5000)); // 5s poll interval

        const statusRes = await fetch(pollUrl, { headers });
        const statusData = await statusRes.json() as any;

        if (statusData.status === "COMPLETED") {
          const resRes = await fetch(resultUrl, { headers });
          resultData = await resRes.json();
          break;
        } else if (statusData.status === "FAILED") {
          throw new Error(`Job failed: ${JSON.stringify(statusData).slice(0, 200)}`);
        }

        console.error(`[musetalk] Polling... (${statusData.status})`);
      }

      if (!resultData) {
        throw new Error("Timeout waiting for MuseTalk result");
      }
    } else {
      // Sync mode: direct call
      const res = await fetch(FAL_ENDPOINT, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`API error ${res.status}: ${err.slice(0, 200)}`);
      }

      resultData = await res.json();
    }

    // Extract video URL
    const videoUrl = resultData?.video?.url;
    if (!videoUrl) {
      throw new Error("No video URL in response");
    }

    const durationMs = Date.now() - t0;
    console.error(`[musetalk] ✅ Done in ${(durationMs / 1000).toFixed(1)}s`);

    // Download if output path specified
    let videoPath: string | undefined;
    if (outputPath) {
      mkdirSync(dirname(outputPath), { recursive: true });
      const dlRes = await fetch(videoUrl);
      const buf = Buffer.from(await dlRes.arrayBuffer());
      writeFileSync(outputPath, buf);
      videoPath = outputPath;
      console.error(`[musetalk] Downloaded: ${outputPath} (${(buf.length / 1024).toFixed(0)} KB)`);
    }

    return {
      provider: "musetalk",
      success: true,
      videoUrl,
      videoPath,
      contentType: resultData?.video?.content_type,
      fileSize: resultData?.video?.file_size,
      durationMs,
    };

  } catch (e: any) {
    return {
      provider: "musetalk",
      success: false,
      durationMs: Date.now() - t0,
      error: e.message?.slice(0, 300),
    };
  }
}

/** Check if MuseTalk (fal.ai) is available */
export function isMuseTalkAvailable(): boolean {
  return !!process.env.FAL_KEY;
}
