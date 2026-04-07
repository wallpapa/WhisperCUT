/**
 * whispercut_p2p_status  — Network stats, credits, leaderboard
 * whispercut_p2p_submit  — Submit any AI job to the P2P network
 */

import { getBalance, getLeaderboard } from "../../p2p/credits.js";
import { getOnlineWorkers } from "../../p2p/worker.js";
import { submitP2PJob, type P2PJobType } from "../../p2p/submitter.js";
import { getProviderInfo } from "../../ai/provider.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
);

const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";

// ── whispercut_p2p_status ─────────────────────────────────────────

export const p2pStatusTool = {
  name: "whispercut_p2p_status",
  description:
    "Show P2P network stats: online workers, credit balance, job queue, and contributor leaderboard. " +
    "The P2P network lets users share 20% of their AI processing power for a network effect.",
  inputSchema: { type: "object" as const, properties: {} },
};

export async function handleP2PStatus() {
  const [onlineWorkers, balance, leaderboard, providerInfo] = await Promise.all([
    getOnlineWorkers(),
    getBalance(USER_EMAIL),
    getLeaderboard(5),
    Promise.resolve(getProviderInfo()),
  ]);

  // Active workers details
  const cutoff = new Date(Date.now() - 90_000).toISOString();
  const { data: workers } = await supabase
    .from("p2p_workers")
    .select("user_email, provider, model, status, jobs_completed, last_heartbeat")
    .neq("status", "offline")
    .gte("last_heartbeat", cutoff)
    .order("jobs_completed", { ascending: false });

  // Job queue stats
  const { count: pendingJobs } = await supabase
    .from("p2p_jobs")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  const { count: completedToday } = await supabase
    .from("p2p_jobs")
    .select("*", { count: "exact", head: true })
    .eq("status", "completed")
    .gte("created_at", new Date().toISOString().split("T")[0] + "T00:00:00Z");

  return {
    network: {
      online_workers: onlineWorkers,
      pending_jobs: pendingJobs ?? 0,
      completed_today: completedToday ?? 0,
    },
    you: {
      email: USER_EMAIL,
      provider: providerInfo.provider,
      model: providerInfo.model,
      credit_balance: balance,
    },
    workers: (workers || []).map((w) => ({
      email: w.user_email,
      provider: w.provider,
      model: w.model,
      status: w.status,
      jobs_completed: w.jobs_completed,
    })),
    leaderboard: leaderboard.map((l, i) => ({
      rank: i + 1,
      email: l.email,
      earned: l.earned,
      spent: l.spent,
      balance: l.balance,
    })),
  };
}

// ── whispercut_p2p_submit ─────────────────────────────────────────

export const p2pSubmitTool = {
  name: "whispercut_p2p_submit",
  description:
    "Submit an AI processing job to the P2P network. " +
    "Other online workers will process it with their own AI and return the result. " +
    "If no workers are available, falls back to local processing. " +
    "Job types: hook_score (1 credit), weekly_plan (2), qa_gate (3), vibe_script (5).",
  inputSchema: {
    type: "object" as const,
    required: ["type", "prompt"],
    properties: {
      type: {
        type: "string",
        enum: ["hook_score", "qa_gate", "vibe_script", "weekly_plan"],
        description: "Type of AI job to submit",
      },
      prompt: {
        type: "string",
        description: "The AI prompt to process",
      },
    },
  },
};

export async function handleP2PSubmit(args: { type: string; prompt: string }) {
  const { type, prompt } = args;

  const result = await submitP2PJob(type as P2PJobType, { prompt });

  return {
    source: result.source,
    worker: result.worker ?? "self",
    duration_ms: result.duration_ms,
    result: result.result,
  };
}
