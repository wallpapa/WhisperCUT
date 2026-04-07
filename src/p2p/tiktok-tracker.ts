/**
 * TikTok Performance Tracker — Auto-detect & sync post metrics
 *
 * Flow:
 *   1. User logs into TikTok in Chrome → copies session_id
 *   2. Saves TIKTOK_SESSION_ID + TIKTOK_USERNAME in .env
 *   3. This module fetches video list + metrics via TikTok web API
 *   4. Saves to video_performance → feeds shared_memories
 *
 * .env:
 *   TIKTOK_USERNAME=doctorwaleerat
 *   TIKTOK_SESSION_ID=abc123...  (from Chrome DevTools → Application → Cookies → sessionid)
 */

import { createClient } from "@supabase/supabase-js";
import { logPerformance } from "./memory-updater.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
);

const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || "doctorwaleerat";
const TIKTOK_SESSION_ID = process.env.TIKTOK_SESSION_ID || "";

interface TikTokVideo {
  id: string;
  desc: string;
  createTime: number;
  stats: {
    diggCount: number;    // likes
    shareCount: number;
    commentCount: number;
    playCount: number;    // views
    collectCount: number; // saves/bookmarks
  };
  video: {
    duration: number;     // seconds
  };
}

/**
 * Fetch recent videos from TikTok user profile.
 * Uses TikTok web API with session cookie.
 */
export async function fetchTikTokVideos(
  username?: string,
  count = 10
): Promise<TikTokVideo[]> {
  const user = username || TIKTOK_USERNAME;

  if (!TIKTOK_SESSION_ID) {
    throw new Error(
      "TIKTOK_SESSION_ID not set. How to get it:\n" +
      "1. Open Chrome → go to tiktok.com → login\n" +
      "2. F12 → Application → Cookies → tiktok.com\n" +
      "3. Copy 'sessionid' value\n" +
      "4. Add to .env: TIKTOK_SESSION_ID=your-session-id"
    );
  }

  // TikTok web API endpoint for user videos
  const url = `https://www.tiktok.com/api/post/item_list/?WebIdLastTime=1&aid=1988&count=${count}&secUid=&cursor=0&from_page=user`;

  try {
    // Try fetching user page to get secUid first
    const profileRes = await fetch(`https://www.tiktok.com/api/user/detail/?WebIdLastTime=1&aid=1988&uniqueId=${user}`, {
      headers: {
        "Cookie": `sessionid=${TIKTOK_SESSION_ID}`,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Referer": `https://www.tiktok.com/@${user}`,
      },
    });

    if (!profileRes.ok) {
      throw new Error(`TikTok API returned ${profileRes.status} — session may be expired`);
    }

    const profileData = await profileRes.json() as Record<string, any>;
    const secUid = profileData?.userInfo?.user?.secUid;

    if (!secUid) {
      console.error("[tiktok-tracker] Could not get secUid — trying direct video list");
      return [];
    }

    // Fetch video list
    const videosRes = await fetch(
      `https://www.tiktok.com/api/post/item_list/?WebIdLastTime=1&aid=1988&count=${count}&secUid=${encodeURIComponent(secUid)}&cursor=0`,
      {
        headers: {
          "Cookie": `sessionid=${TIKTOK_SESSION_ID}`,
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Referer": `https://www.tiktok.com/@${user}`,
        },
      }
    );

    if (!videosRes.ok) {
      throw new Error(`Video list API returned ${videosRes.status}`);
    }

    const videosData = await videosRes.json() as Record<string, any>;
    return (videosData?.itemList || []) as TikTokVideo[];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tiktok-tracker] Fetch failed: ${msg}`);
    throw err;
  }
}

/**
 * Sync latest TikTok videos to video_performance table.
 * Skips videos already tracked.
 */
export async function syncTikTokPerformance(
  username?: string,
  count = 10
): Promise<{
  synced: number;
  skipped: number;
  videos: Array<{
    id: string;
    topic: string;
    views: number;
    likes: number;
    shares: number;
    engagement_rate: string;
    viral_score: string;
  }>;
}> {
  const user = username || TIKTOK_USERNAME;
  const channel = `@${user}`;

  let videos: TikTokVideo[];
  try {
    videos = await fetchTikTokVideos(user, count);
  } catch {
    // If API fails, return empty
    return { synced: 0, skipped: 0, videos: [] };
  }

  if (videos.length === 0) {
    return { synced: 0, skipped: 0, videos: [] };
  }

  let synced = 0;
  let skipped = 0;
  const results: Array<{
    id: string;
    topic: string;
    views: number;
    likes: number;
    shares: number;
    engagement_rate: string;
    viral_score: string;
  }> = [];

  for (const video of videos) {
    const tiktokUrl = `https://www.tiktok.com/@${user}/video/${video.id}`;

    // Check if already tracked
    const { data: existing } = await supabase
      .from("video_performance")
      .select("id")
      .eq("tiktok_url", tiktokUrl)
      .limit(1);

    if (existing && existing.length > 0) {
      // Update existing with latest metrics
      const views = video.stats.playCount || 1;
      const engagement_rate = (video.stats.diggCount + video.stats.commentCount + video.stats.shareCount) / views;
      const viral_score = Math.min(10, engagement_rate * 20 + Math.log10(views + 1) * 0.5 + (video.stats.shareCount / views) * 10);

      await supabase
        .from("video_performance")
        .update({
          views: video.stats.playCount,
          likes: video.stats.diggCount,
          comments: video.stats.commentCount,
          shares: video.stats.shareCount,
          saves: video.stats.collectCount,
          engagement_rate,
          viral_score,
          tracked_at: new Date().toISOString(),
        })
        .eq("id", existing[0].id);

      skipped++;
      continue;
    }

    // New video — log performance
    const result = await logPerformance({
      tiktok_url: tiktokUrl,
      platform: "tiktok",
      channel,
      topic: video.desc.slice(0, 100),
      hook_text: video.desc.split(/[.!?。！？\n]/)[0]?.slice(0, 80),
      views: video.stats.playCount,
      likes: video.stats.diggCount,
      comments: video.stats.commentCount,
      shares: video.stats.shareCount,
      saves: video.stats.collectCount,
      avg_watch_sec: video.video.duration * 0.65, // estimate 65% avg completion
      posted_at: new Date(video.createTime * 1000).toISOString(),
    });

    results.push({
      id: video.id,
      topic: video.desc.slice(0, 60),
      views: video.stats.playCount,
      likes: video.stats.diggCount,
      shares: video.stats.shareCount,
      engagement_rate: `${(result.engagement_rate * 100).toFixed(2)}%`,
      viral_score: `${result.viral_score.toFixed(1)}/10`,
    });
    synced++;
  }

  console.error(`[tiktok-tracker] Synced ${synced} new, updated ${skipped} existing from @${user}`);
  return { synced, skipped, videos: results };
}

/** Check if TikTok credentials are configured */
export function hasTikTokCredentials(): boolean {
  return !!TIKTOK_SESSION_ID && TIKTOK_SESSION_ID.length > 10;
}

/** Get setup instructions for the user */
export function getTikTokSetupInstructions(): string {
  return `
How to set up TikTok auto-tracking:

1. Open Chrome → go to https://www.tiktok.com → Login to your account

2. Open DevTools (F12) → Application tab → Cookies → tiktok.com

3. Find "sessionid" → Copy its Value

4. Add to your .env file:
   TIKTOK_USERNAME=doctorwaleerat
   TIKTOK_SESSION_ID=paste-your-session-id-here

5. Restart WhisperCUT MCP server

Note: Session expires every ~30 days. Re-copy when expired.
`.trim();
}
