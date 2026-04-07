/**
 * whispercut_memory_status     — Shared memory bank stats + top patterns
 * whispercut_track_performance — Log TikTok video metrics + feed back to memory
 * whispercut_sync_tiktok       — Auto-sync TikTok video performance from account
 * whispercut_tiktok_setup      — Guide user to set up TikTok credentials
 */

import { createClient } from "@supabase/supabase-js";
import { logPerformance, runMemoryUpdate } from "../../p2p/memory-updater.js";
import { retrieveMemories } from "../../p2p/memory-retriever.js";
import { syncTikTokPerformance, hasTikTokCredentials, getTikTokSetupInstructions } from "../../p2p/tiktok-tracker.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
);

const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";

// ── whispercut_memory_status ─────────────────────────────────────

export const memoryStatusTool = {
  name: "whispercut_memory_status",
  description:
    "Show shared memory network stats: total memories by type, top patterns by confidence, " +
    "your contribution count, and recent video performance data. " +
    "The memory network learns what works across all creators.",
  inputSchema: {
    type: "object" as const,
    properties: {
      topic: {
        type: "string",
        description: "Optional: retrieve memories relevant to this topic",
      },
    },
  },
};

export async function handleMemoryStatus(args: { topic?: string }) {
  // Memory counts by type
  const { data: byType } = await supabase
    .from("shared_memories")
    .select("memory_type, status")
    .eq("status", "active");

  const typeCounts: Record<string, number> = {};
  byType?.forEach(m => {
    typeCounts[m.memory_type] = (typeCounts[m.memory_type] || 0) + 1;
  });

  // Top 10 highest-confidence patterns
  const { data: top10 } = await supabase
    .from("shared_memories")
    .select("id, memory_type, category, pattern, score, confidence, times_confirmed, contributed_by")
    .eq("status", "active")
    .order("confidence", { ascending: false })
    .limit(10);

  // My contribution
  const { count: myCount } = await supabase
    .from("shared_memories")
    .select("*", { count: "exact", head: true })
    .eq("contributed_by", USER_EMAIL);

  // Total contributors
  const { data: allContributors } = await supabase
    .from("shared_memories")
    .select("contributed_by")
    .eq("status", "active");
  const uniqueContributors = new Set(allContributors?.map(c => c.contributed_by)).size;

  // Recent performance data
  const { data: recentPerf } = await supabase
    .from("video_performance")
    .select("topic, views, likes, shares, engagement_rate, viral_score, tracked_at")
    .order("tracked_at", { ascending: false })
    .limit(5);

  // Optional: retrieve topic-relevant memories
  let topicMemories = null;
  if (args.topic) {
    const retrieved = await retrieveMemories({ topic: args.topic });
    topicMemories = retrieved.memories;
  }

  return {
    network: {
      total_active: byType?.length ?? 0,
      by_type: typeCounts,
      contributors: uniqueContributors,
    },
    you: {
      email: USER_EMAIL,
      memories_contributed: myCount ?? 0,
    },
    top_patterns: (top10 || []).map(m => ({
      category: m.category,
      pattern: m.pattern,
      confidence: `${(m.confidence * 100).toFixed(0)}%`,
      confirmed: m.times_confirmed,
      score: m.score,
    })),
    recent_performance: recentPerf || [],
    ...(topicMemories ? { topic_memories: topicMemories } : {}),
  };
}

// ── whispercut_track_performance ──────────────────────────────────

export const trackPerformanceTool = {
  name: "whispercut_track_performance",
  description:
    "Log TikTok video performance metrics (views, likes, shares, comments, completion rate). " +
    "This feeds real engagement data back into the shared memory network to confirm or deny patterns. " +
    "Use after posting a video to track how it performs. Channel: @doctorwaleerat",
  inputSchema: {
    type: "object" as const,
    required: ["views", "likes", "comments", "shares"],
    properties: {
      tiktok_url: { type: "string", description: "TikTok video URL" },
      topic: { type: "string", description: "Video topic" },
      hook_text: { type: "string", description: "The hook used (first 3 sec)" },
      vibe: { type: "string", description: "Vibe used (educational_warm, etc.)" },
      views: { type: "number", description: "Total views" },
      likes: { type: "number", description: "Total likes" },
      comments: { type: "number", description: "Total comments" },
      shares: { type: "number", description: "Total shares" },
      saves: { type: "number", description: "Total saves/bookmarks" },
      completion_rate: { type: "number", description: "Completion rate 0-1 (e.g. 0.65 = 65%)" },
      avg_watch_sec: { type: "number", description: "Average watch time in seconds" },
      posted_at: { type: "string", description: "When the video was posted (ISO date)" },
      memory_ids: {
        type: "array",
        items: { type: "number" },
        description: "IDs of shared memories used in this video's production",
      },
    },
  },
};

export async function handleTrackPerformance(args: {
  tiktok_url?: string;
  topic?: string;
  hook_text?: string;
  vibe?: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  completion_rate?: number;
  avg_watch_sec?: number;
  posted_at?: string;
  memory_ids?: number[];
}) {
  const result = await logPerformance({
    ...args,
    channel: "@doctorwaleerat",
    platform: "tiktok",
  });

  // If we have linked memories + good engagement → confirm them immediately
  if (args.memory_ids && args.memory_ids.length > 0 && result.viral_score > 6) {
    for (const memId of args.memory_ids) {
      const { data: mem } = await supabase
        .from("shared_memories")
        .select("confidence, times_confirmed")
        .eq("id", memId)
        .single();

      if (mem) {
        await supabase
          .from("shared_memories")
          .update({
            confidence: Math.min(1.0, mem.confidence + 0.2),
            times_confirmed: mem.times_confirmed + 1,
          })
          .eq("id", memId);
      }
    }
  }

  return {
    tracked: true,
    engagement_rate: `${(result.engagement_rate * 100).toFixed(2)}%`,
    viral_score: `${result.viral_score.toFixed(1)}/10`,
    memories_confirmed: (args.memory_ids?.length ?? 0) > 0 && result.viral_score > 6
      ? args.memory_ids!.length
      : 0,
    verdict: result.viral_score >= 7 ? "VIRAL" : result.viral_score >= 4 ? "GOOD" : "NEEDS IMPROVEMENT",
  };
}

// ── whispercut_sync_tiktok ────────────────────────────────────────

export const syncTikTokTool = {
  name: "whispercut_sync_tiktok",
  description:
    "Auto-sync TikTok video performance from your account. " +
    "Fetches latest videos' views, likes, shares, comments, saves " +
    "and saves to video_performance table → feeds into shared memory network. " +
    "Requires TIKTOK_SESSION_ID in .env (get from Chrome DevTools). " +
    "Use whispercut_tiktok_setup if not configured.",
  inputSchema: {
    type: "object" as const,
    properties: {
      username: { type: "string", description: "TikTok username (without @). Default: from .env" },
      count: { type: "number", description: "Number of recent videos to sync (default: 10)" },
    },
  },
};

export async function handleSyncTikTok(args: { username?: string; count?: number }) {
  if (!hasTikTokCredentials()) {
    return {
      error: "TikTok not configured",
      setup: getTikTokSetupInstructions(),
    };
  }

  const result = await syncTikTokPerformance(args.username, args.count || 10);
  return {
    synced: result.synced,
    updated: result.skipped,
    total: result.synced + result.skipped,
    videos: result.videos,
    message: result.synced > 0
      ? `Synced ${result.synced} new videos, updated ${result.skipped} existing → feeding into memory network`
      : result.skipped > 0
        ? `All ${result.skipped} videos already tracked — metrics updated`
        : "No videos found. Check TIKTOK_SESSION_ID — may be expired.",
  };
}

// ── whispercut_tiktok_setup ───────────────────────────────────────

export const tiktokSetupTool = {
  name: "whispercut_tiktok_setup",
  description:
    "Guide user to set up TikTok auto-tracking. " +
    "Shows step-by-step instructions to get session_id from Chrome " +
    "and configure .env for automatic performance tracking.",
  inputSchema: { type: "object" as const, properties: {} },
};

export async function handleTikTokSetup() {
  const hasCredentials = hasTikTokCredentials();
  const username = process.env.TIKTOK_USERNAME || "(not set)";

  if (hasCredentials) {
    // Already configured — show status
    const { count: tracked } = await supabase
      .from("video_performance")
      .select("*", { count: "exact", head: true })
      .eq("channel", `@${username}`);

    return {
      status: "configured",
      username: `@${username}`,
      session_active: true,
      videos_tracked: tracked ?? 0,
      message: `TikTok auto-tracking active for @${username}. Use whispercut_sync_tiktok to fetch latest metrics.`,
    };
  }

  return {
    status: "not_configured",
    instructions: getTikTokSetupInstructions(),
    env_template: {
      TIKTOK_USERNAME: "doctorwaleerat",
      TIKTOK_SESSION_ID: "(paste from Chrome DevTools)",
    },
  };
}
