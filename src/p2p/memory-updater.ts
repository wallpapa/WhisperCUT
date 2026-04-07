/**
 * Memory Updater — Weekly prune/decay + performance feedback loop
 *
 * GRPO-inspired: real TikTok engagement confirms or denies memory patterns
 *
 * Schedule: Weekly (Sunday 03:00) via scheduler or manual invoke
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
);

export interface UpdaterResult {
  decayed: number;
  pruned: number;
  confirmed: number;
  total_active: number;
}

/**
 * Run the weekly memory update cycle.
 * 1. Confirm memories via video performance data
 * 2. Decay unused memories
 * 3. Prune deprecated memories
 */
export async function runMemoryUpdate(): Promise<UpdaterResult> {
  console.error("[memory-updater] Starting weekly update...");

  // Step 1: Confirm memories using video_performance data
  const confirmed = await confirmFromPerformance();

  // Step 2: Decay — reduce confidence of unused memories
  const { data: stale } = await supabase
    .from("shared_memories")
    .select("id, confidence")
    .eq("status", "active")
    .lt("updated_at", new Date(Date.now() - 7 * 86400_000).toISOString());

  let decayCount = 0;
  if (stale) {
    for (const m of stale) {
      const newConf = Math.max(0, m.confidence - 0.1);
      await supabase
        .from("shared_memories")
        .update({
          confidence: newConf,
          status: newConf < 0.1 ? "deprecated" : "active",
        })
        .eq("id", m.id);
      decayCount++;
    }
  }

  // Step 3: Prune — delete deprecated memories
  const { data: toPrune } = await supabase
    .from("shared_memories")
    .select("id")
    .eq("status", "deprecated")
    .lt("confidence", 0.1);

  const pruned = toPrune?.length ?? 0;
  if (toPrune && toPrune.length > 0) {
    for (const m of toPrune) {
      await supabase.from("shared_memories").delete().eq("id", m.id);
    }
  }

  // Stats
  const { count: total_active } = await supabase
    .from("shared_memories")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  const result: UpdaterResult = {
    decayed: decayCount,
    pruned,
    confirmed,
    total_active: total_active ?? 0,
  };

  console.error(
    `[memory-updater] Done: ${result.confirmed} confirmed, ${result.decayed} decayed, ${result.pruned} pruned, ${result.total_active} active`
  );

  return result;
}

/**
 * Confirm memories using actual video performance data.
 * If a video that used memory X got high engagement → boost X's confidence.
 */
async function confirmFromPerformance(): Promise<number> {
  // Get recent videos with performance data + linked memory_ids
  const { data: videos } = await supabase
    .from("video_performance")
    .select("id, memory_ids, engagement_rate, viral_score, completion_rate")
    .not("memory_ids", "eq", "{}")
    .gte("tracked_at", new Date(Date.now() - 7 * 86400_000).toISOString());

  if (!videos || videos.length === 0) return 0;

  let confirmed = 0;

  for (const video of videos) {
    if (!video.memory_ids || video.memory_ids.length === 0) continue;

    // High engagement = confirm memories
    const isGood = (video.engagement_rate ?? 0) > 0.05 || (video.viral_score ?? 0) > 6;

    for (const memoryId of video.memory_ids) {
      if (isGood) {
        // Boost confidence
        const { data: mem } = await supabase
          .from("shared_memories")
          .select("confidence, times_confirmed")
          .eq("id", memoryId)
          .single();

        if (mem) {
          await supabase
            .from("shared_memories")
            .update({
              confidence: Math.min(1.0, mem.confidence + 0.2),
              times_confirmed: mem.times_confirmed + 1,
            })
            .eq("id", memoryId);
          confirmed++;
        }
      }
    }
  }

  return confirmed;
}

/**
 * Log performance data and link to memories used.
 * Called after tracking a TikTok video's metrics.
 */
export async function logPerformance(params: {
  tiktok_url?: string;
  platform?: string;
  channel?: string;
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
  memory_ids?: number[];
  posted_at?: string;
}): Promise<{ id: number; engagement_rate: number; viral_score: number }> {
  const views = Math.max(params.views, 1);
  const engagement_rate = (params.likes + params.comments + params.shares) / views;

  // Viral score composite (0-10)
  const viral_score = Math.min(10,
    (params.completion_rate ?? 0.5) * 3 +
    engagement_rate * 20 +
    Math.log10(views + 1) * 0.5 +
    (params.shares / views) * 10
  );

  const { data, error } = await supabase
    .from("video_performance")
    .insert({
      ...params,
      engagement_rate,
      viral_score,
      tracked_by: process.env.WHISPERCUT_USER_EMAIL || "anonymous",
      tracked_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to log performance: ${error.message}`);

  console.error(
    `[performance] Logged: ${views} views, ${engagement_rate.toFixed(3)} ER, ${viral_score.toFixed(1)} viral score`
  );

  return { id: data.id, engagement_rate, viral_score };
}
