/**
 * WhisperCUT Scheduler
 *
 * Reads content_calendar from Supabase and runs the autonomous pipeline.
 * Designed to be invoked by OpenClaw cron — no human in the loop.
 *
 * OpenClaw cron config example:
 *   name: "whispercut-daily"
 *   schedule: "0 6 * * *"   (6AM every day)
 *   instruction: "Run the WhisperCUT pipeline for today's scheduled content"
 *
 * Or run directly:
 *   npx tsx src/agent/scheduler.ts
 */

import { createClient } from "@supabase/supabase-js";
import { runPipeline, type PipelineJob, type Platform } from "./pipeline.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Default account IDs from env
const DEFAULT_ACCOUNTS: Record<Platform, string> = {
  tiktok:    process.env.TIKTOK_ACCOUNT_ID    || "default",
  instagram: process.env.IG_ACCOUNT_ID        || "default",
  facebook:  process.env.FB_PAGE_ID           || "default",
  youtube:   process.env.YT_CHANNEL_ID        || "default",
};

// ── Fetch today's jobs from Supabase ──────────────────────────────────────

async function getTodaysJobs(): Promise<PipelineJob[]> {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("content_calendar")
    .select("*")
    .eq("scheduled_date", today)
    .eq("status", "pending")
    .order("priority", { ascending: false });

  if (error) throw new Error(`Supabase error: ${error.message}`);
  if (!data || data.length === 0) {
    console.error("[scheduler] No jobs scheduled for today");
    return [];
  }

  return data.map((row: any): PipelineJob => ({
    topic:      row.topic,
    duration:   row.duration_sec ?? 90,
    platforms:  row.platforms ?? ["tiktok", "instagram"],
    accountIds: row.account_ids ?? DEFAULT_ACCOUNTS,
    channel:    row.study_channel ?? process.env.STUDY_CHANNEL ?? "@doctorwaleerat",
  }));
}

// ── Mark job done in Supabase ──────────────────────────────────────────────

async function markJobDone(topic: string, status: "done" | "failed"): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  await supabase
    .from("content_calendar")
    .update({ status, processed_at: new Date().toISOString() })
    .eq("scheduled_date", today)
    .eq("topic", topic);
}

// ── AI-generated content plan (when calendar is empty) ────────────────────

async function generateWeeklyPlan(): Promise<void> {
  console.error("[scheduler] content_calendar empty — generating weekly plan with AI...");

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const channel = process.env.STUDY_CHANNEL ?? "@doctorwaleerat";
  const prompt = `คุณคือ AI content strategist สำหรับช่อง TikTok ของ ${channel}

สร้างแผนเนื้อหา 7 วัน สำหรับสัปดาห์ถัดไป ในสาย parenting / education / child development
ตอบเป็น JSON array เท่านั้น:

[
  {
    "scheduled_date": "YYYY-MM-DD",
    "topic": "หัวข้อวิดีโอเป็นภาษาไทย (ไม่เกิน 50 ตัวอักษร)",
    "duration_sec": 90,
    "platforms": ["tiktok", "instagram"],
    "priority": 1
  }
]

วันที่เริ่มต้น: ${new Date(Date.now() + 86400000).toISOString().split("T")[0]}
สร้าง 7 รายการ หัวข้อต้องน่าสนใจ มีคุณค่าทางการศึกษา เหมาะกับผู้ปกครองไทย`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  let raw = (response.text ?? "").trim();
  if (raw.startsWith("```")) {
    raw = raw.split("\n").slice(1).join("\n");
    if (raw.endsWith("```")) raw = raw.slice(0, -3).trim();
  }

  const plan = JSON.parse(raw);
  await supabase.from("content_calendar").insert(
    plan.map((item: any) => ({ ...item, status: "pending" }))
  );

  console.error(`[scheduler] Generated ${plan.length} topics for next week`);
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.error(`\n${"═".repeat(60)}`);
  console.error(`[scheduler] WhisperCUT Autonomous Scheduler`);
  console.error(`[scheduler] ${new Date().toISOString()}`);
  console.error(`${"═".repeat(60)}\n`);

  let jobs = await getTodaysJobs();

  // If no jobs today → generate AI content plan for next week
  if (jobs.length === 0) {
    await generateWeeklyPlan();
    console.error("[scheduler] Weekly plan generated — nothing to run today");
    return;
  }

  console.error(`[scheduler] ${jobs.length} job(s) queued for today\n`);

  // Run jobs sequentially (avoid rate limit collisions)
  for (const job of jobs) {
    const result = await runPipeline(job);
    await markJobDone(job.topic, result.success ? "done" : "failed");

    console.error(
      `[scheduler] "${job.topic}" → ` +
      (result.success
        ? `✅ published: [${result.published.join(", ")}]`
        : `❌ failed: ${result.error}`)
    );
  }

  console.error("\n[scheduler] All jobs complete\n");
}

main().catch(err => {
  console.error("[scheduler] FATAL:", err.message);
  process.exit(1);
});
