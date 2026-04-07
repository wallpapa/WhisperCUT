/**
 * Agent Registry — Discovery, routing, and lifecycle management
 *
 * Pattern: Agent registers by jobType → worker.ts PROCESSORS delegates here
 * Backward compatible: if no agent registered, falls back to existing handler
 */

import { BaseAgent, type AgentResult } from "./base-agent.js";

// ── Registry ────────────────────────────────────────────────────

const agents = new Map<string, BaseAgent>();

/** Register an agent for a specific job type */
export function registerAgent(agent: BaseAgent): void {
  if (agents.has(agent.jobType)) {
    console.error(`[registry] Warning: overwriting agent for ${agent.jobType}`);
  }
  agents.set(agent.jobType, agent);
  console.error(`[registry] Agent registered: ${agent.name} → ${agent.jobType}`);
}

/** Get an agent by job type (returns undefined if none registered) */
export function getAgent(jobType: string): BaseAgent | undefined {
  return agents.get(jobType);
}

/** Check if an agent is registered for a job type */
export function hasAgent(jobType: string): boolean {
  return agents.has(jobType);
}

/** List all registered agents */
export function listAgents(): Array<{
  name: string;
  jobType: string;
  description: string;
}> {
  return Array.from(agents.values()).map(a => ({
    name: a.name,
    jobType: a.jobType,
    description: a.description,
  }));
}

/** Process a job through the agent registry (with fallback) */
export async function processViaAgent(
  jobType: string,
  payload: unknown,
  fallback?: (payload: unknown) => Promise<unknown>
): Promise<AgentResult> {
  const agent = agents.get(jobType);

  if (agent) {
    return agent.processWithRetry(payload);
  }

  // Fallback to direct handler
  if (fallback) {
    const startTime = Date.now();
    try {
      const output = await fallback(payload);
      return {
        success: true,
        output,
        confidence: 0.5, // Lower confidence for non-agent processing
        signals: [],
        duration_ms: Date.now() - startTime,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        output: { error: msg },
        confidence: 0,
        signals: [],
        duration_ms: Date.now() - startTime,
      };
    }
  }

  return {
    success: false,
    output: { error: `No agent or fallback for job type: ${jobType}` },
    confidence: 0,
    signals: [],
    duration_ms: 0,
  };
}

/** Get network stats for all agents */
export function getAgentStats(): {
  total_agents: number;
  agent_list: Array<{ name: string; jobType: string; description: string }>;
} {
  return {
    total_agents: agents.size,
    agent_list: listAgents(),
  };
}
