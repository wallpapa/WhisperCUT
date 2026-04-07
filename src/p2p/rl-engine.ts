/**
 * Reinforcement Learning Engine — Learn from 3 signals
 *
 * Signal 1: User selection (immediate — binary win/lose)
 * Signal 2: AI QA score (minutes — continuous 0-10)
 * Signal 3: Real TikTok metrics (hours/days — ground truth)
 *
 * Combined reward: R = 0.2×user + 0.3×ai + 0.5×tiktok
 *
 * Updates: rl_preferences, shared_memories confidence
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
);

const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";

// ── 12 RL Dimensions ─────────────────────────────────────────────

export const RL_DIMENSIONS = [
  "hook_style", "hook_length", "cover_color", "text_density",
  "vibe", "pacing", "cta_type", "post_time",
  "duration", "emoji_use", "topic_category", "segment_order",
] as const;

export type RLDimension = typeof RL_DIMENSIONS[number];

// ── Signal 1: User Selection (Immediate) ─────────────────────────

export async function rewardFromUserSelection(params: {
  dimension: RLDimension;
  winner: string;
  losers: string[];
  context?: Record<string, unknown>;
}): Promise<number> {
  const { dimension, winner, losers, context } = params;

  // Upsert winner — increment win
  await upsertPreference(dimension, winner, 1, 1, context);

  // Upsert losers — increment total but not win
  for (const loser of losers) {
    await upsertPreference(dimension, loser, 0, 1, context);
  }

  return losers.length + 1; // number of preferences updated
}

// ── Signal 2: AI QA Score (Minutes) ──────────────────────────────

export async function rewardFromAIScore(params: {
  memory_ids: number[];
  score: number;    // 0-10 from hook_scorer or qa_gate
  source: string;   // "hook_score" | "qa_gate" | "vibe_edit"
}): Promise<number> {
  const { memory_ids, score, source } = params;
  if (memory_ids.length === 0) return 0;

  // Normalize score to confidence delta: 7+ is good, below 5 is bad
  const delta = score >= 7 ? 0.1 : score >= 5 ? 0 : -0.05;
  let updated = 0;

  for (const memId of memory_ids) {
    const { data: mem } = await supabase
      .from("shared_memories")
      .select("confidence, times_confirmed, times_used")
      .eq("id", memId)
      .single();

    if (mem) {
      const newConfidence = Math.max(0, Math.min(1.0, mem.confidence + delta));
      await supabase
        .from("shared_memories")
        .update({
          confidence: newConfidence,
          times_confirmed: delta > 0 ? mem.times_confirmed + 1 : mem.times_confirmed,
        })
        .eq("id", memId);
      updated++;
    }
  }

  console.error(`[rl-engine] AI score ${score}/10 (${source}) → updated ${updated} memories (delta=${delta})`);
  return updated;
}

// ── Signal 3: Real TikTok Metrics (Ground Truth) ─────────────────

export async function rewardFromTikTokMetrics(params: {
  video_id: number;         // video_performance.id
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  completion_rate?: number; // 0-1, from TikTok Business API
}): Promise<{
  reward_score: number;
  memories_updated: number;
  preferences_updated: number;
}> {
  const { video_id, views, likes, comments, shares, saves, completion_rate } = params;

  // Compute reward score (0-10)
  const er = (likes + comments + shares) / Math.max(views, 1);
  const save_rate = saves / Math.max(views, 1);
  const reward_score = Math.min(10,
    (completion_rate ?? 0.5) * 3 +      // completion is king (30%)
    er * 20 +                            // engagement rate (scaled)
    save_rate * 30 +                     // saves = deep value
    Math.log10(views + 1) * 0.3          // views (log scale)
  );

  // Update video_performance with reward
  await supabase
    .from("video_performance")
    .update({ viral_score: reward_score })
    .eq("id", video_id);

  // Get linked memory_ids from this video
  const { data: video } = await supabase
    .from("video_performance")
    .select("memory_ids, topic, vibe, hook_text")
    .eq("id", video_id)
    .single();

  let memoriesUpdated = 0;
  let preferencesUpdated = 0;

  // Update linked memories with ground truth
  if (video?.memory_ids && video.memory_ids.length > 0) {
    const isGood = reward_score >= 6;
    const delta = isGood ? 0.2 : -0.1;

    for (const memId of video.memory_ids) {
      const { data: mem } = await supabase
        .from("shared_memories")
        .select("confidence, times_confirmed")
        .eq("id", memId)
        .single();

      if (mem) {
        await supabase
          .from("shared_memories")
          .update({
            confidence: Math.max(0, Math.min(1.0, mem.confidence + delta)),
            times_confirmed: isGood ? mem.times_confirmed + 1 : mem.times_confirmed,
          })
          .eq("id", memId);
        memoriesUpdated++;
      }
    }
  }

  // Update rl_preferences based on what this video used
  if (video) {
    // Topic category preference
    if (video.topic) {
      const category = extractTopicCategory(video.topic);
      if (category) {
        await upsertPreference("topic_category", category,
          reward_score >= 6 ? 1 : 0, 1);
        preferencesUpdated++;
      }
    }

    // Vibe preference
    if (video.vibe) {
      await upsertPreference("vibe", video.vibe,
        reward_score >= 6 ? 1 : 0, 1);
      preferencesUpdated++;
    }

    // Hook style preference (from hook text analysis)
    if (video.hook_text) {
      const hookStyle = detectHookStyle(video.hook_text);
      await upsertPreference("hook_style", hookStyle,
        reward_score >= 6 ? 1 : 0, 1);
      preferencesUpdated++;
    }

    // Duration preference
    const { data: perfData } = await supabase
      .from("video_performance")
      .select("avg_watch_sec")
      .eq("id", video_id)
      .single();

    if (perfData?.avg_watch_sec) {
      const durBucket = perfData.avg_watch_sec < 30 ? "short" :
        perfData.avg_watch_sec < 60 ? "medium" : "long";
      await upsertPreference("duration", durBucket,
        reward_score >= 6 ? 1 : 0, 1);
      preferencesUpdated++;
    }
  }

  console.error(
    `[rl-engine] TikTok reward: ${reward_score.toFixed(1)}/10 ` +
    `(views=${views}, ER=${(er*100).toFixed(1)}%, saves=${saves}) ` +
    `→ ${memoriesUpdated} memories, ${preferencesUpdated} preferences updated`
  );

  return { reward_score, memories_updated: memoriesUpdated, preferences_updated: preferencesUpdated };
}

// ── Combined Reward ──────────────────────────────────────────────

export async function computeCombinedReward(params: {
  user_selection_score?: number;  // 0 or 1
  ai_qa_score?: number;           // 0-10
  tiktok_reward?: number;         // 0-10
}): Promise<number> {
  const {
    user_selection_score = 0,
    ai_qa_score = 5,
    tiktok_reward = 5,
  } = params;

  // R = 0.2×user + 0.3×ai + 0.5×tiktok
  return (
    0.2 * (user_selection_score * 10) +
    0.3 * ai_qa_score +
    0.5 * tiktok_reward
  );
}

// ── Get Best Practices (for generation) ──────────────────────────

export async function getBestPractices(): Promise<Record<RLDimension, {
  best: string;
  win_rate: number;
  sample_size: number;
} | null>> {
  const result: Record<string, { best: string; win_rate: number; sample_size: number } | null> = {};

  for (const dim of RL_DIMENSIONS) {
    const { data } = await supabase
      .from("rl_preferences")
      .select("preferred_value, win_rate, total_comparisons")
      .eq("dimension", dim)
      .gte("total_comparisons", 3) // minimum sample size
      .order("win_rate", { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      result[dim] = {
        best: data[0].preferred_value,
        win_rate: data[0].win_rate,
        sample_size: data[0].total_comparisons,
      };
    } else {
      result[dim] = null;
    }
  }

  return result as Record<RLDimension, { best: string; win_rate: number; sample_size: number } | null>;
}

// ── Helpers ──────────────────────────────────────────────────────

async function upsertPreference(
  dimension: string,
  value: string,
  winIncrement: number,
  totalIncrement: number,
  context?: Record<string, unknown>
): Promise<void> {
  // Check if exists
  const { data: existing } = await supabase
    .from("rl_preferences")
    .select("id, win_count, total_comparisons")
    .eq("dimension", dimension)
    .eq("preferred_value", value)
    .limit(1);

  if (existing && existing.length > 0) {
    const row = existing[0];
    const newWin = row.win_count + winIncrement;
    const newTotal = row.total_comparisons + totalIncrement;
    await supabase
      .from("rl_preferences")
      .update({
        win_count: newWin,
        total_comparisons: newTotal,
        win_rate: newTotal > 0 ? newWin / newTotal : 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  } else {
    await supabase
      .from("rl_preferences")
      .insert({
        dimension,
        preferred_value: value,
        rejected_value: "_baseline",
        win_count: winIncrement,
        total_comparisons: totalIncrement,
        win_rate: totalIncrement > 0 ? winIncrement / totalIncrement : 0,
        context: context || {},
        contributed_by: USER_EMAIL,
      });
  }
}

function extractTopicCategory(topic: string): string {
  const lower = topic.toLowerCase();
  if (lower.includes("ลูก") || lower.includes("เด็ก") || lower.includes("เลี้ยง") || lower.includes("พัฒนาการ")) return "parenting";
  if (lower.includes("หมอ") || lower.includes("แพทย์") || lower.includes("โรงพยาบาล")) return "medical";
  if (lower.includes("จิตวิทยา") || lower.includes("ซึมเศร้า") || lower.includes("mental")) return "psychology";
  if (lower.includes("ai") || lower.includes("เทคโนโลยี") || lower.includes("อนาคต")) return "tech";
  if (lower.includes("เงิน") || lower.includes("รายได้") || lower.includes("ค่า")) return "finance";
  if (lower.includes("ความสัมพันธ์") || lower.includes("ผัว") || lower.includes("เมีย")) return "relationship";
  return "general";
}

function detectHookStyle(hookText: string): string {
  if (hookText.includes("?") || hookText.includes("มั้ย") || hookText.includes("ยังไง")) return "CuriosityGap";
  if (hookText.includes("คุณ") || hookText.includes("ถ้าคุณ")) return "DirectAddress";
  if (hookText.includes("!") || hookText.includes("จริง") || hookText.includes("ต้อง")) return "BoldClaim";
  if (/\d/.test(hookText)) return "SocialProofShock";
  return "Unknown";
}
