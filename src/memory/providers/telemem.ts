/**
 * TeleMem Provider — HTTP client calling Python sidecar
 *
 * Phase 2: Video multimodal memory for WhisperCUT.
 *
 * Auto-detects sidecar availability:
 *   1. Check TELEMEM_URL env var (cloud mode)
 *   2. Check localhost:8100 (local sidecar)
 *   3. If neither available, silently disable
 *
 * Video capabilities:
 *   addVideo(path) → extract frames + captions → vector DB
 *   searchVideo(query) → ReAct reasoning over video memory
 */

import type { MemoryProvider, MemoryEvent, RecallQuery, MemoryInsight } from "../types.js";

// ── Config ────────────────────────────────────────────────────

const DEFAULT_URL = "http://localhost:8100";
let sidecarUrl: string | null = null;
let sidecarChecked = false;

async function getSidecarUrl(): Promise<string | null> {
  if (sidecarChecked) return sidecarUrl;
  sidecarChecked = true;

  // 1. Explicit URL from env
  const envUrl = process.env.TELEMEM_URL;
  if (envUrl) {
    try {
      const res = await fetch(`${envUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        sidecarUrl = envUrl;
        console.error(`[telemem] Connected to ${envUrl}`);
        return sidecarUrl;
      }
    } catch {}
  }

  // 2. Try localhost default
  try {
    const res = await fetch(`${DEFAULT_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      sidecarUrl = DEFAULT_URL;
      console.error(`[telemem] Connected to local sidecar at ${DEFAULT_URL}`);
      return sidecarUrl;
    }
  } catch {}

  console.error("[telemem] Sidecar not available — video memory disabled");
  return null;
}

// ── HTTP Helpers ──────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T | null> {
  const url = await getSidecarUrl();
  if (!url) return null;

  try {
    const res = await fetch(`${url}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "unknown");
      console.error(`[telemem] ${path} HTTP ${res.status}: ${err.slice(0, 100)}`);
      return null;
    }

    return await res.json() as T;
  } catch (e: any) {
    console.error(`[telemem] ${path} failed: ${e.message?.slice(0, 100)}`);
    return null;
  }
}

// ── Event → TeleMem Messages ──────────────────────────────────

function eventToMessages(event: MemoryEvent): Array<{ role: string; content: string }> {
  const { type, channel, topic, data } = event;

  switch (type) {
    case "cover_selected":
      return [
        { role: "user", content: `Generate cover for "${channel}", topic "${topic}"` },
        { role: "assistant", content: `Selected: ${JSON.stringify(data).slice(0, 300)}` },
      ];
    case "feedback_scored":
      return [
        { role: "user", content: `Evaluate video for "${channel}", topic "${topic}"` },
        { role: "assistant", content: `Scores: ${JSON.stringify(data).slice(0, 300)}` },
      ];
    case "style_studied":
      return [
        { role: "user", content: `Study style for "${channel}"` },
        { role: "assistant", content: `Style: ${JSON.stringify(data).slice(0, 300)}` },
      ];
    default:
      return [
        { role: "user", content: `${type}: ${channel} / ${topic}` },
        { role: "assistant", content: JSON.stringify(data).slice(0, 300) },
      ];
  }
}

// ── Provider Implementation ───────────────────────────────────

export const teleMemProvider: MemoryProvider = {
  name: "telemem",

  async remember(event: MemoryEvent): Promise<void> {
    const messages = eventToMessages(event);
    await post("/add", {
      messages,
      user_id: `channel:${event.channel}`,
      metadata: {
        topic: event.topic,
        channel: event.channel,
        event_type: event.type,
        timestamp: new Date().toISOString(),
      },
    });
  },

  async recall(query: RecallQuery): Promise<MemoryInsight[]> {
    const insights: MemoryInsight[] = [];

    // Text-based search
    const textResult = await post<{
      results: Array<{ memory?: string; text?: string; score?: number }>;
    }>("/search", {
      query: query.topic
        ? `${query.intent} for topic "${query.topic}"`
        : query.intent,
      user_id: `channel:${query.channel}`,
      limit: query.limit || 5,
    });

    if (textResult?.results) {
      for (const r of textResult.results) {
        insights.push({
          text: r.memory || r.text || JSON.stringify(r),
          confidence: r.score ?? 0.7,
          source: "telemem",
          scope: query.topic ? "per_topic" : "per_channel",
        });
      }
    }

    // Video-based search (if available)
    const videoResult = await post<{
      results: Array<{ memory?: string; text?: string; score?: number }>;
    }>("/search_mm", {
      query: query.intent,
      user_id: `channel:${query.channel}`,
      limit: 3,
    });

    if (videoResult?.results) {
      for (const r of videoResult.results) {
        const text = r.memory || r.text || JSON.stringify(r);
        if (!insights.some(i => i.text === text)) {
          insights.push({
            text: `[VIDEO] ${text}`,
            confidence: r.score ?? 0.75,
            source: "telemem",
            scope: "per_channel",
          });
        }
      }
    }

    return insights;
  },
};

// ── Video-Specific API (not in MemoryProvider interface) ──────

/** Add a video to TeleMem's multimodal memory */
export async function addVideoMemory(
  videoPath: string,
  userId = "default",
  clipSecs = 5,
): Promise<boolean> {
  const result = await post<{ status: string }>("/add_mm", {
    video_path: videoPath,
    user_id: userId,
    clip_secs: clipSecs,
  });
  return result?.status === "ok";
}

/** Search video memories with ReAct reasoning */
export async function searchVideoMemory(
  query: string,
  userId = "default",
  limit = 5,
): Promise<Array<{ memory: string; score?: number }>> {
  const result = await post<{
    results: Array<{ memory?: string; text?: string; score?: number }>;
  }>("/search_mm", { query, user_id: userId, limit });

  return (result?.results || []).map(r => ({
    memory: r.memory || r.text || JSON.stringify(r),
    score: r.score,
  }));
}

/** Check if TeleMem sidecar is available */
export async function isTeleMemAvailable(): Promise<boolean> {
  return (await getSidecarUrl()) !== null;
}
