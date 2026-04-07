/**
 * whispercut_run_pipeline — trigger the full autonomous pipeline from MCP
 * whispercut_schedule     — add a topic to content_calendar
 * whispercut_status       — show today's quota + pipeline status
 */

import { createClient } from "@supabase/supabase-js";
import { runPipeline } from "../../agent/pipeline.js";
import { DAILY_LIMITS, type Platform } from "../../agent/rate-limiter.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ── whispercut_run_pipeline ────────────────────────────────────────────────

export const runPipelineTool = {
  name: "whispercut_run_pipeline",
  description:
    "Run the full autonomous pipeline for one topic: study → script → QA → render → publish. No human intervention. Returns result after completion.",
  inputSchema: {
    type: "object" as const,
    properties: {
      topic:     { type: "string",  description: "Video topic in Thai" },
      duration:  { type: "number",  description: "Duration in seconds (default 90)" },
      platforms: {
        type: "array",
        items: { type: "string", enum: ["tiktok", "instagram", "facebook", "youtube"] },
        description: "Platforms to publish to (default: tiktok + instagram)",
      },
    },
    required: ["topic"],
  },
};

export async function handleRunPipeline(args: any) {
  const {
    topic,
    duration  = 90,
    platforms = ["tiktok", "instagram"],
  } = args;

  const defaultAccounts: Record<Platform, string> = {
    tiktok:    process.env.TIKTOK_ACCOUNT_ID    || "default",
    instagram: process.env.IG_ACCOUNT_ID        || "default",
    facebook:  process.env.FB_PAGE_ID           || "default",
    youtube:   process.env.YT_CHANNEL_ID        || "default",
  };

  const result = await runPipeline({
    topic,
    duration,
    platforms: platforms as Platform[],
    accountIds: defaultAccounts,
    channel: process.env.STUDY_CHANNEL ?? "@doctorwaleerat",
  });

  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    isError: !result.success,
  };
}

// ── whispercut_schedule ────────────────────────────────────────────────────

export const scheduleTool = {
  name: "whispercut_schedule",
  description:
    "Add a topic to the content calendar in Supabase. The autonomous scheduler will pick it up on the scheduled date and run the full pipeline.",
  inputSchema: {
    type: "object" as const,
    properties: {
      topic:          { type: "string", description: "Video topic in Thai" },
      scheduled_date: { type: "string", description: "Date to publish (YYYY-MM-DD, default: tomorrow)" },
      duration_sec:   { type: "number", description: "Duration in seconds (default 90)" },
      platforms: {
        type: "array",
        items: { type: "string" },
        description: "Platforms (default: tiktok + instagram)",
      },
      priority: { type: "number", description: "Priority 1-10, higher runs first (default 5)" },
    },
    required: ["topic"],
  },
};

export async function handleSchedule(args: any) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const {
    topic,
    scheduled_date = tomorrow,
    duration_sec   = 90,
    platforms      = ["tiktok", "instagram"],
    priority       = 5,
  } = args;

  const { error } = await supabase.from("content_calendar").insert({
    topic, scheduled_date, duration_sec, platforms, priority, status: "pending",
  });

  if (error) {
    return {
      content: [{ type: "text" as const, text: `Error: ${error.message}` }],
      isError: true,
    };
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        status: "scheduled",
        topic,
        scheduled_date,
        platforms,
        message: `"${topic}" scheduled for ${scheduled_date} on [${platforms.join(", ")}]`,
      }, null, 2),
    }],
  };
}

// ── whispercut_status ──────────────────────────────────────────────────────

export const statusTool = {
  name: "whispercut_status",
  description:
    "Show today's quota usage per platform, upcoming scheduled jobs, and recent pipeline results.",
  inputSchema: { type: "object" as const, properties: {} },
};

export async function handleStatus(_args: any) {
  const today = new Date().toISOString().split("T")[0];

  // Quota usage today
  const platforms: Platform[] = ["tiktok", "instagram", "facebook", "youtube"];
  const quotaUsed: Record<string, any> = {};

  for (const platform of platforms) {
    const { count } = await supabase
      .from("publish_log")
      .select("*", { count: "exact", head: true })
      .eq("platform", platform)
      .gte("published_at", `${today}T00:00:00Z`);
    quotaUsed[platform] = { used: count ?? 0, limit: DAILY_LIMITS[platform] };
  }

  // Upcoming jobs
  const { data: upcoming } = await supabase
    .from("content_calendar")
    .select("topic, scheduled_date, platforms, status")
    .eq("status", "pending")
    .gte("scheduled_date", today)
    .order("scheduled_date")
    .limit(7);

  // Recent results
  const { data: recent } = await supabase
    .from("pipeline_runs")
    .select("topic, qa_score, published, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({ quota_today: quotaUsed, upcoming, recent_runs: recent }, null, 2),
    }],
  };
}
