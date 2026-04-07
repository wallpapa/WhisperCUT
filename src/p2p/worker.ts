/**
 * P2P Worker Daemon — Processes network jobs with local AI
 *
 * Each MCP instance runs a worker that:
 *   1. Registers in p2p_workers (presence tracking)
 *   2. Subscribes to p2p_jobs via Supabase Realtime
 *   3. Picks up pending jobs matching capabilities
 *   4. Processes with own AI key (BYOK)
 *   5. Returns result + earns weighted credits
 *
 * 20% duty cycle: 1 network job per 4 own jobs
 */

import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { aiGenerateJSON } from "../ai/provider.js";
import { getProviderInfo } from "../ai/provider.js";
import { detectCapabilities, formatCapabilities, type NodeCapabilities } from "./resource-detector.js";
import { earnCredits, CREDIT_WEIGHTS } from "./credits.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
);

const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";
const HEARTBEAT_INTERVAL = 30_000; // 30s
const JOB_TIMEOUT_SEC = 60;

let channel: RealtimeChannel | null = null;
let presenceChannel: RealtimeChannel | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let ownJobCount = 0;
let networkJobCount = 0;
let workerStatus: "idle" | "busy" = "idle";

// ── Job Processors ───────────────────────────────────────────────

type JobProcessor = (payload: Record<string, unknown>) => Promise<unknown>;

const PROCESSORS: Record<string, JobProcessor> = {
  hook_score: async (payload) => {
    const prompt = payload.prompt as string;
    return aiGenerateJSON(prompt);
  },
  qa_gate: async (payload) => {
    const prompt = payload.prompt as string;
    return aiGenerateJSON(prompt);
  },
  vibe_script: async (payload) => {
    const prompt = payload.prompt as string;
    return aiGenerateJSON(prompt);
  },
  weekly_plan: async (payload) => {
    const prompt = payload.prompt as string;
    return aiGenerateJSON(prompt);
  },
};

// ── Worker Lifecycle ─────────────────────────────────────────────

/** Start the P2P worker daemon */
export async function startWorker(): Promise<void> {
  const info = getProviderInfo();

  // Auto-detect ALL local resources
  console.error(`[p2p] Detecting local resources...`);
  const caps = await detectCapabilities();
  console.error(`[p2p] Resources detected:\n${formatCapabilities(caps)}`);

  const tier = process.env.RESOURCE_TIER || "free";
  console.error(`[p2p] Starting worker: ${USER_EMAIL} (${info.provider}/${info.model}) tier=${tier}`);

  // Register with full capability profile
  await supabase.from("p2p_workers").upsert({
    user_email: USER_EMAIL,
    provider: info.provider,
    model: info.model,
    status: "idle",
    capabilities: caps as unknown as Record<string, unknown>,
    last_heartbeat: new Date().toISOString(),
  }, { onConflict: "user_email" });

  // Subscribe to new jobs via Realtime
  channel = supabase
    .channel("p2p_jobs_feed")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "p2p_jobs",
      },
      (payload) => {
        const job = payload.new as Record<string, unknown>;
        if (job.status === "pending" && shouldPickUpJob()) {
          claimAndProcess(job);
        }
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.error("[p2p] Subscribed to job feed");
      }
    });

  // Presence tracking
  presenceChannel = supabase
    .channel("p2p_presence")
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        presenceChannel!.track({
          email: USER_EMAIL,
          provider: info.provider,
          model: info.model,
          joined_at: new Date().toISOString(),
        });
        console.error("[p2p] Presence tracked");
      }
    });

  // Heartbeat
  heartbeatTimer = setInterval(async () => {
    await supabase
      .from("p2p_workers")
      .update({ last_heartbeat: new Date().toISOString(), status: workerStatus })
      .eq("user_email", USER_EMAIL);

    // Cleanup stale jobs (timeout)
    await supabase
      .from("p2p_jobs")
      .update({ status: "failed", error_message: "timeout" })
      .in("status", ["claimed", "processing"])
      .lt("timeout_at", new Date().toISOString());
  }, HEARTBEAT_INTERVAL);

  // Also check for any pending jobs on startup
  await pickUpPendingJobs();
}

/** Stop the worker daemon */
export async function stopWorker(): Promise<void> {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (channel) await supabase.removeChannel(channel);
  if (presenceChannel) {
    await presenceChannel.untrack();
    await supabase.removeChannel(presenceChannel);
  }

  await supabase
    .from("p2p_workers")
    .update({ status: "offline" })
    .eq("user_email", USER_EMAIL);

  console.error("[p2p] Worker stopped");
}

// ── 20% Duty Cycle ───────────────────────────────────────────────

/** Track own job execution (called by local tools) */
export function trackOwnJob(): void {
  ownJobCount++;
}

/** Should we pick up a network job? (20% duty cycle) */
function shouldPickUpJob(): boolean {
  if (workerStatus === "busy") return false;
  // 1 network job per 4 own jobs (20% contribution)
  const ratio = ownJobCount > 0 ? networkJobCount / ownJobCount : 0;
  return ratio < 0.25; // 20% = 1/5 = 0.2, allow up to 0.25 for margin
}

// ── Job Processing ───────────────────────────────────────────────

async function pickUpPendingJobs(): Promise<void> {
  if (!shouldPickUpJob()) return;

  const { data: jobs } = await supabase
    .from("p2p_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at")
    .limit(1);

  if (jobs && jobs.length > 0) {
    await claimAndProcess(jobs[0] as Record<string, unknown>);
  }
}

async function claimAndProcess(job: Record<string, unknown>): Promise<void> {
  const jobId = job.id as string;
  const jobType = job.type as string;
  const submittedBy = job.submitted_by as string;

  // Don't process own jobs
  if (submittedBy === USER_EMAIL) return;

  // Don't process if no processor
  if (!PROCESSORS[jobType]) return;

  // Atomic claim: only succeeds if still pending
  const { data: claimed, error } = await supabase
    .from("p2p_jobs")
    .update({
      status: "claimed",
      claimed_by: USER_EMAIL,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "pending")
    .select()
    .single();

  if (error || !claimed) return; // Someone else claimed it

  workerStatus = "busy";
  await supabase
    .from("p2p_workers")
    .update({ status: "busy" })
    .eq("user_email", USER_EMAIL);

  console.error(`[p2p] Processing ${jobType} job ${jobId.slice(0, 8)}...`);

  try {
    // Update status to processing
    await supabase
      .from("p2p_jobs")
      .update({ status: "processing" })
      .eq("id", jobId);

    // Process with local AI
    const processor = PROCESSORS[jobType];
    const result = await processor(job.payload as Record<string, unknown>);

    // Mark completed + store result
    await supabase
      .from("p2p_jobs")
      .update({
        status: "completed",
        result,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // Earn credits
    const weight = CREDIT_WEIGHTS[jobType] || 1;
    await earnCredits(USER_EMAIL, weight, jobId, jobType);
    networkJobCount++;

    // Update worker stats
    await supabase
      .from("p2p_workers")
      .update({
        status: "idle",
        jobs_completed: networkJobCount,
      })
      .eq("user_email", USER_EMAIL);

    console.error(`[p2p] ✅ Completed ${jobType} — earned ${weight} credits`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("p2p_jobs")
      .update({ status: "failed", error_message: message })
      .eq("id", jobId);

    console.error(`[p2p] ❌ Failed ${jobType}: ${message}`);
  } finally {
    workerStatus = "idle";
    await supabase
      .from("p2p_workers")
      .update({ status: "idle" })
      .eq("user_email", USER_EMAIL);
  }
}

/** Get count of online workers */
export async function getOnlineWorkers(): Promise<number> {
  const cutoff = new Date(Date.now() - 90_000).toISOString(); // 90s ago
  const { count } = await supabase
    .from("p2p_workers")
    .select("*", { count: "exact", head: true })
    .neq("status", "offline")
    .gte("last_heartbeat", cutoff);
  return count ?? 0;
}
