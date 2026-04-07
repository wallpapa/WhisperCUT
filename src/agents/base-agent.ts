/**
 * BaseAgent — Abstract foundation for all WhisperCUT agents
 *
 * Architecture: Layered agents wrap existing MCP tools.
 * Communication: Supabase Realtime via P2P job queue.
 * Learning: RL signals emitted after every process().
 *
 * Pattern from debate v2: Agent-native architecture for World #1.
 * Reference: VideoAgent (87-98% orchestration), OpenMontage (400+ skills)
 */

import { createClient } from "@supabase/supabase-js";
import { retrieveMemories, type RetrievedMemory } from "../p2p/memory-retriever.js";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ""
);

const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";

// ── Types ────────────────────────────────────────────────────────

export interface AgentSignal {
  dimension: string;        // RL dimension: "hook_quality", "pacing", "completion_predict"
  value: number;            // 0-10 score
  context?: Record<string, unknown>;
}

export interface AgentResult {
  success: boolean;
  output: unknown;
  confidence: number;       // 0-1, how confident the agent is
  signals: AgentSignal[];   // RL signals to emit
  next_jobs?: Array<{       // Chain to other agents
    type: string;
    payload: unknown;
  }>;
  duration_ms: number;
}

export interface AgentConfig {
  /** Override RL thresholds per-vibe */
  thresholds?: Record<string, number>;
  /** Max retries on failure */
  maxRetries?: number;
  /** Enable memory querying before process */
  useMemory?: boolean;
}

// ── Base Agent ──────────────────────────────────────────────────

export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly jobType: string;
  abstract readonly description: string;

  protected config: AgentConfig;

  constructor(config?: AgentConfig) {
    this.config = {
      maxRetries: 3,
      useMemory: true,
      ...config,
    };
  }

  /** Main processing method — implemented by each agent */
  abstract process(payload: unknown): Promise<AgentResult>;

  // ── Shared Capabilities ──────────────────────────────────────

  /** Emit RL signal for learning */
  async emitSignal(signal: AgentSignal): Promise<void> {
    if (!process.env.SUPABASE_URL) return;

    try {
      await supabase.from("agent_signals").insert({
        agent_name: this.name,
        job_type: this.jobType,
        dimension: signal.dimension,
        value: signal.value,
        context: signal.context || {},
        user_email: USER_EMAIL,
        created_at: new Date().toISOString(),
      });
    } catch {
      // Signal emission is non-blocking
      console.error(`[${this.name}] Signal emit failed: ${signal.dimension}=${signal.value}`);
    }
  }

  /** Emit multiple RL signals */
  async emitSignals(signals: AgentSignal[]): Promise<void> {
    await Promise.all(signals.map(s => this.emitSignal(s)));
  }

  /** Query shared memory network for relevant patterns */
  async queryMemory(topic: string, limit = 5): Promise<RetrievedMemory[]> {
    if (!this.config.useMemory) return [];
    try {
      const result = await retrieveMemories({ topic, limit });
      return result.memories;
    } catch {
      return [];
    }
  }

  /** Submit a follow-up job to the P2P queue (for agent chaining) */
  async submitJob(type: string, payload: unknown): Promise<string | null> {
    if (!process.env.SUPABASE_URL) return null;

    try {
      const { data, error } = await supabase.from("p2p_jobs").insert({
        type,
        status: "pending",
        payload,
        submitted_by: USER_EMAIL,
        credit_weight: 1,
        created_at: new Date().toISOString(),
        timeout_at: new Date(Date.now() + 60_000).toISOString(),
      }).select("id").single();

      return error ? null : data?.id;
    } catch {
      return null;
    }
  }

  /** Log agent activity to Supabase */
  async log(stage: string, data: Record<string, unknown>): Promise<void> {
    if (!process.env.SUPABASE_URL) return;

    try {
      await supabase.from("agent_logs").insert({
        agent_name: this.name,
        stage,
        data,
        user_email: USER_EMAIL,
        created_at: new Date().toISOString(),
      });
    } catch {
      // Logging is non-blocking
    }
  }

  /** Process with retry logic */
  async processWithRetry(payload: unknown): Promise<AgentResult> {
    const maxRetries = this.config.maxRetries || 3;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const result = await this.process(payload);

        // Emit RL signals
        if (result.signals.length > 0) {
          await this.emitSignals(result.signals);
        }

        // Log success
        await this.log("process_complete", {
          attempt,
          success: result.success,
          confidence: result.confidence,
          signals_emitted: result.signals.length,
          duration_ms: Date.now() - startTime,
        });

        return result;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[${this.name}] Attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);

        if (attempt < maxRetries) {
          // Brief backoff
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    // All retries failed
    return {
      success: false,
      output: { error: lastError?.message || "Unknown error" },
      confidence: 0,
      signals: [{ dimension: "agent_failure", value: 0, context: { agent: this.name } }],
      duration_ms: 0,
    };
  }
}
