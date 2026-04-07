/**
 * Rate Limiter — Multi-platform quota tracker
 *
 * Hard limits (as of March 2026):
 *   TikTok:    15 videos/day/account
 *   Instagram: 50 posts/day/account
 *   Facebook:  50 posts/day/page
 *   YouTube:   6 videos/day/project (1,600 units/upload, 10K units/day)
 *   Gemini:    250 RPD free tier, 10 RPM
 *
 * YouTube strategy: rotate across multiple Google Cloud projects
 * (each project has its own 10K units/day quota)
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export type Platform = "tiktok" | "instagram" | "facebook" | "youtube";

// Hard daily limits per account/project
export const DAILY_LIMITS: Record<Platform, number> = {
  tiktok:    15,
  instagram: 50,
  facebook:  50,
  youtube:    6, // per Google Cloud project — rotate projects for more
};

// YouTube project pool (each gets 10K units/day = 6 uploads)
const YT_PROJECTS = (process.env.YT_PROJECT_IDS || "default").split(",").map(s => s.trim());

// ── Quota check ───────────────────────────────────────────────────────────

export async function canPublish(platform: Platform, accountId: string): Promise<boolean> {
  const today = new Date().toISOString().split("T")[0];

  const { count } = await supabase
    .from("publish_log")
    .select("*", { count: "exact", head: true })
    .eq("platform", platform)
    .eq("account_id", accountId)
    .gte("published_at", `${today}T00:00:00Z`);

  const used = count ?? 0;
  const limit = DAILY_LIMITS[platform];

  console.error(`[rate-limiter] ${platform}/${accountId}: ${used}/${limit} used today`);
  return used < limit;
}

// ── YouTube project rotator ───────────────────────────────────────────────

export async function getAvailableYTProject(): Promise<string | null> {
  const today = new Date().toISOString().split("T")[0];

  for (const projectId of YT_PROJECTS) {
    const { count } = await supabase
      .from("publish_log")
      .select("*", { count: "exact", head: true })
      .eq("platform", "youtube")
      .eq("yt_project_id", projectId)
      .gte("published_at", `${today}T00:00:00Z`);

    const used = count ?? 0;
    if (used < DAILY_LIMITS.youtube) {
      console.error(`[rate-limiter] YouTube project ${projectId}: ${used}/6 — available`);
      return projectId;
    }
    console.error(`[rate-limiter] YouTube project ${projectId}: ${used}/6 — full`);
  }

  console.error(`[rate-limiter] All YouTube projects exhausted for today`);
  return null;
}

// ── Gemini RPM throttle ───────────────────────────────────────────────────

const geminiCallTimestamps: number[] = [];
const GEMINI_RPM = 10;
const GEMINI_RPD = 250;

export async function waitForGeminiSlot(): Promise<void> {
  // Skip throttle for non-Gemini providers (Ollama, OpenRouter, custom)
  const provider = process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? "gemini" : "ollama");
  if (provider !== "gemini") return;

  const now = Date.now();
  const oneMinuteAgo = now - 60_000;

  // Remove timestamps older than 1 minute
  while (geminiCallTimestamps.length > 0 && geminiCallTimestamps[0] < oneMinuteAgo) {
    geminiCallTimestamps.shift();
  }

  if (geminiCallTimestamps.length >= GEMINI_RPM) {
    const waitMs = geminiCallTimestamps[0] - oneMinuteAgo + 100;
    console.error(`[rate-limiter] Gemini RPM limit — waiting ${waitMs}ms`);
    await new Promise(r => setTimeout(r, waitMs));
  }

  geminiCallTimestamps.push(Date.now());
}

// ── Log published video ────────────────────────────────────────────────────

export async function logPublish(params: {
  platform: Platform;
  accountId: string;
  videoPath: string;
  topic: string;
  ytProjectId?: string;
}): Promise<void> {
  await supabase.from("publish_log").insert({
    platform: params.platform,
    account_id: params.accountId,
    video_path: params.videoPath,
    topic: params.topic,
    yt_project_id: params.ytProjectId ?? null,
    published_at: new Date().toISOString(),
  });
}
