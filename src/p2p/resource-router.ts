/**
 * Resource Router — Smart job routing to optimal node
 *
 * For small networks (2-10 users):
 *   - Lightweight scoring: capability × availability
 *   - No heavy benchmarks, no complex scheduling
 *   - Fallback to local if no suitable worker found
 *
 * Routing formula:
 *   score = has_capability × (1 - current_load) × tier_bonus
 *
 * Resource types: ai_inference, video_render, transcription, research, image_gen
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
);

const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";

export type ResourceType = "ai_inference" | "video_render" | "transcription" | "research" | "image_gen";

interface WorkerNode {
  user_email: string;
  provider: string;
  model: string;
  capabilities: Record<string, unknown>;
  current_load: number;
  resource_tier: string;
  last_heartbeat: string;
}

interface RoutingResult {
  best_worker: string | null;
  score: number;
  reason: string;
  all_scores: Array<{ worker: string; score: number; reason: string }>;
  fallback_local: boolean;
}

const TIER_BONUS: Record<string, number> = {
  free: 1.0,
  power: 1.5,
  full: 2.0,
};

/**
 * Find the best worker for a specific resource type.
 * Returns null if no suitable worker → caller should process locally.
 */
export async function routeJob(
  resourceType: ResourceType,
  excludeSelf = true
): Promise<RoutingResult> {
  const cutoff = new Date(Date.now() - 90_000).toISOString(); // 90s heartbeat window

  const { data: workers } = await supabase
    .from("p2p_workers")
    .select("user_email, provider, model, capabilities, current_load, resource_tier, last_heartbeat")
    .neq("status", "offline")
    .gte("last_heartbeat", cutoff);

  if (!workers || workers.length === 0) {
    return { best_worker: null, score: 0, reason: "no workers online", all_scores: [], fallback_local: true };
  }

  const scores: Array<{ worker: string; score: number; reason: string }> = [];

  for (const w of workers as WorkerNode[]) {
    // Skip self if requested
    if (excludeSelf && w.user_email === USER_EMAIL) continue;

    const caps = w.capabilities || {};
    const hasCapability = checkCapability(caps, resourceType);

    if (!hasCapability) {
      scores.push({ worker: w.user_email, score: 0, reason: `no ${resourceType} capability` });
      continue;
    }

    const availability = 1 - (w.current_load || 0);
    const tierBonus = TIER_BONUS[w.resource_tier || "free"] || 1.0;
    const speedBonus = getSpeedBonus(caps, resourceType);
    const score = availability * tierBonus * speedBonus;

    scores.push({
      worker: w.user_email,
      score: Math.round(score * 100) / 100,
      reason: `avail=${availability.toFixed(1)} tier=${w.resource_tier} speed=${speedBonus.toFixed(1)}`,
    });
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  const best = scores.find(s => s.score > 0);

  if (!best) {
    return {
      best_worker: null,
      score: 0,
      reason: "no capable workers available",
      all_scores: scores,
      fallback_local: true,
    };
  }

  return {
    best_worker: best.worker,
    score: best.score,
    reason: best.reason,
    all_scores: scores,
    fallback_local: false,
  };
}

/**
 * Submit a job with smart routing.
 * Inserts into p2p_jobs with routing metadata.
 */
export async function submitRoutedJob(params: {
  type: string;
  resourceType: ResourceType;
  payload: Record<string, unknown>;
  creditWeight: number;
}): Promise<{
  job_id: string;
  routed_to: string | null;
  fallback_local: boolean;
}> {
  const routing = await routeJob(params.resourceType);

  const { data: job } = await supabase
    .from("p2p_jobs")
    .insert({
      type: params.type,
      resource_type: params.resourceType,
      payload: params.payload,
      submitted_by: USER_EMAIL,
      credit_weight: params.creditWeight,
      routing_scores: { scores: routing.all_scores, best: routing.best_worker },
      status: routing.fallback_local ? "failed" : "pending",
      error_message: routing.fallback_local ? "no_worker:fallback_local" : null,
      timeout_at: new Date(Date.now() + 60_000).toISOString(),
    })
    .select("id")
    .single();

  const jobId = job?.id || "unknown";

  if (!routing.fallback_local && routing.best_worker) {
    console.error(
      `[router] Job ${jobId.slice(0, 8)} (${params.resourceType}) → ${routing.best_worker} (score: ${routing.score})`
    );
  } else {
    console.error(
      `[router] Job ${jobId.slice(0, 8)} (${params.resourceType}) → LOCAL fallback (${routing.reason})`
    );
  }

  return {
    job_id: jobId,
    routed_to: routing.best_worker,
    fallback_local: routing.fallback_local,
  };
}

/**
 * Get network overview: who has what resources.
 */
export async function getNetworkResources(): Promise<{
  total_nodes: number;
  online_nodes: number;
  resources: Record<ResourceType, { count: number; providers: string[] }>;
  nodes: Array<{
    email: string;
    tier: string;
    load: number;
    resources: string[];
  }>;
}> {
  const cutoff = new Date(Date.now() - 90_000).toISOString();

  const { data: allWorkers } = await supabase
    .from("p2p_workers")
    .select("user_email, provider, model, capabilities, current_load, resource_tier, status, last_heartbeat");

  const workers = (allWorkers || []) as WorkerNode[];
  const onlineWorkers = workers.filter(
    w => w.last_heartbeat >= cutoff
  );

  const resourceTypes: ResourceType[] = ["ai_inference", "video_render", "transcription", "research", "image_gen"];
  const resources: Record<string, { count: number; providers: string[] }> = {};

  for (const rt of resourceTypes) {
    const capable = onlineWorkers.filter(w => checkCapability(w.capabilities || {}, rt));
    resources[rt] = {
      count: capable.length,
      providers: capable.map(w => `${w.user_email} (${w.provider})`),
    };
  }

  return {
    total_nodes: workers.length,
    online_nodes: onlineWorkers.length,
    resources: resources as Record<ResourceType, { count: number; providers: string[] }>,
    nodes: onlineWorkers.map(w => ({
      email: w.user_email,
      tier: w.resource_tier || "free",
      load: w.current_load || 0,
      resources: resourceTypes.filter(rt => checkCapability(w.capabilities || {}, rt)),
    })),
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function checkCapability(caps: Record<string, unknown>, resourceType: ResourceType): boolean {
  switch (resourceType) {
    case "ai_inference": {
      const ai = caps.ai as Record<string, unknown> | null;
      return !!(ai && (ai.provider || ai.model));
    }
    case "video_render": {
      const render = caps.render as Record<string, unknown> | null;
      return !!(render && render.ffmpeg);
    }
    case "transcription": {
      const transcribe = caps.transcribe as Record<string, unknown> | null;
      return !!(transcribe && transcribe.whisper);
    }
    case "research": {
      const research = caps.research as Record<string, unknown> | null;
      return !!(research && research.tavily);
    }
    case "image_gen": {
      const image = caps.image as Record<string, unknown> | null;
      return !!(image && (image.canva || image.sdxl_local));
    }
    default:
      return false;
  }
}

function getSpeedBonus(caps: Record<string, unknown>, resourceType: ResourceType): number {
  switch (resourceType) {
    case "ai_inference": {
      const ai = caps.ai as Record<string, unknown> | null;
      const vram = (ai?.vram_gb as number) || 0;
      return vram > 16 ? 1.5 : vram > 8 ? 1.2 : 1.0;
    }
    case "video_render": {
      const render = caps.render as Record<string, unknown> | null;
      const cores = (render?.cores as number) || 4;
      const gpu = render?.gpu_accel as string || "none";
      return (cores > 8 ? 1.3 : 1.0) * (gpu !== "none" ? 1.4 : 1.0);
    }
    case "transcription": {
      const transcribe = caps.transcribe as Record<string, unknown> | null;
      return transcribe?.gpu ? 1.5 : 1.0;
    }
    default:
      return 1.0;
  }
}
