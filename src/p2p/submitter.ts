/**
 * P2P Job Submitter — Submit AI jobs to the network
 *
 * Flow:
 *   1. Check credits (must have enough)
 *   2. Insert job into p2p_jobs (triggers Realtime broadcast)
 *   3. Wait for result (subscribe to UPDATE on job row)
 *   4. If no worker picks up in 30s → fallback to local processing
 *   5. Deduct credits from submitter
 */

import { createClient } from "@supabase/supabase-js";
import { aiGenerateJSON } from "../ai/provider.js";
import { getBalance, spendCredits, CREDIT_WEIGHTS } from "./credits.js";
import { getOnlineWorkers } from "./worker.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
);

const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";
const NETWORK_TIMEOUT_MS = 30_000; // 30s before fallback

export type P2PJobType = "hook_score" | "qa_gate" | "vibe_script" | "weekly_plan";

export interface P2PJobResult {
  result: unknown;
  source: "network" | "local";
  worker?: string;
  duration_ms: number;
}

/**
 * Submit a job to the P2P network.
 * Falls back to local processing if no worker is available.
 */
export async function submitP2PJob(
  type: P2PJobType,
  payload: Record<string, unknown>
): Promise<P2PJobResult> {
  const weight = CREDIT_WEIGHTS[type] || 1;
  const startTime = Date.now();

  // Check if network has workers
  const onlineWorkers = await getOnlineWorkers();

  // Check credits
  const balance = await getBalance(USER_EMAIL);

  // If no workers or no credits → process locally
  if (onlineWorkers <= 1 || balance < weight) {
    if (onlineWorkers <= 1) console.error(`[p2p] No other workers online — processing locally`);
    else console.error(`[p2p] Insufficient credits (${balance} < ${weight}) — processing locally`);
    return processLocally(type, payload, startTime);
  }

  console.error(`[p2p] Submitting ${type} to network (${onlineWorkers} workers online, ${balance} credits)`);

  // Insert job
  const { data: job, error } = await supabase
    .from("p2p_jobs")
    .insert({
      type,
      payload,
      submitted_by: USER_EMAIL,
      credit_weight: weight,
      timeout_at: new Date(Date.now() + 60_000).toISOString(),
    })
    .select()
    .single();

  if (error || !job) {
    console.error(`[p2p] Failed to submit job: ${error?.message}`);
    return processLocally(type, payload, startTime);
  }

  // Wait for result
  const result = await waitForResult(job.id, NETWORK_TIMEOUT_MS);

  if (result) {
    // Deduct credits
    await spendCredits(USER_EMAIL, weight, job.id, type);
    console.error(`[p2p] ✅ Network result from ${result.worker} — spent ${weight} credits`);
    return {
      result: result.data,
      source: "network",
      worker: result.worker,
      duration_ms: Date.now() - startTime,
    };
  }

  // Timeout — fallback to local
  console.error(`[p2p] Timeout waiting for network — fallback to local`);
  await supabase
    .from("p2p_jobs")
    .update({ status: "failed", error_message: "timeout:fallback_local" })
    .eq("id", job.id)
    .eq("status", "pending");

  return processLocally(type, payload, startTime);
}

/** Wait for a job result via polling */
async function waitForResult(
  jobId: string,
  timeoutMs: number
): Promise<{ data: unknown; worker: string } | null> {
  const deadline = Date.now() + timeoutMs;
  const pollInterval = 2000; // 2s

  while (Date.now() < deadline) {
    const { data: job } = await supabase
      .from("p2p_jobs")
      .select("status, result, claimed_by")
      .eq("id", jobId)
      .single();

    if (job?.status === "completed" && job.result) {
      return { data: job.result, worker: job.claimed_by || "unknown" };
    }

    if (job?.status === "failed") {
      return null;
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  return null;
}

/** Process job locally (fallback) */
async function processLocally(
  type: P2PJobType,
  payload: Record<string, unknown>,
  startTime: number
): Promise<P2PJobResult> {
  const prompt = payload.prompt as string;
  const result = await aiGenerateJSON(prompt);
  return {
    result,
    source: "local",
    duration_ms: Date.now() - startTime,
  };
}

/**
 * Check if P2P offload makes sense for this job.
 * Returns true if network has capacity and user has credits.
 */
export async function shouldOffload(type: P2PJobType): Promise<boolean> {
  const workers = await getOnlineWorkers();
  if (workers <= 1) return false;

  const balance = await getBalance(USER_EMAIL);
  const weight = CREDIT_WEIGHTS[type] || 1;
  return balance >= weight;
}
