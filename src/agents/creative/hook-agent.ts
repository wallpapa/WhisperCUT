/**
 * HookAgent — Hook scoring + taxonomy learning
 *
 * Wraps scoreHook() from hook-scorer.ts
 * Learns which hook taxonomies work per topic category
 * Emits signal(hook_taxonomy, effectiveness) to RL
 * If score < threshold: submits rewrite job back to ScriptAgent
 *
 * Real data: CuriosityGap=9.2/10, DirectAddress=8.7/10, BoldClaim=8.0/10
 */

import { BaseAgent, type AgentResult } from "../base-agent.js";
import { scoreHook, type HookScoreResult } from "../../science/hook-scorer.js";

interface HookPayload {
  hook_text: string;
  topic: string;
  platform?: string;
  current_score?: number;
}

export class HookAgent extends BaseAgent {
  readonly name = "HookAgent";
  readonly jobType = "hook_score";
  readonly description = "Evaluates hook text quality, taxonomy classification, and suggests rewrites for improvement";

  async process(payload: unknown): Promise<AgentResult> {
    const startTime = Date.now();
    const params = payload as HookPayload;

    // Step 1: Query memory for best hook patterns in this category
    const memories = await this.queryMemory(`hook ${params.topic}`);
    const bestPatterns = memories
      .filter(m => m.category === "hook")
      .slice(0, 3);

    // Step 2: Score the hook
    const platform = (params.platform || "tiktok") as "tiktok" | "instagram" | "youtube" | "facebook";
    const hookResult: HookScoreResult = await scoreHook(
      params.hook_text,
      params.topic,
      platform
    );

    // Step 3: Build RL signals
    const signals = [
      {
        dimension: "hook_taxonomy",
        value: hookResult.overall,
        context: {
          taxonomy: hookResult.taxonomy,
          topic: params.topic,
          platform: params.platform,
        },
      },
      {
        dimension: "hook_dopamine",
        value: hookResult.dopamine_trigger ? 8 : 3,
        context: { text: params.hook_text.slice(0, 50) },
      },
    ];

    // Step 4: If hook is weak, chain back to ScriptAgent with rewrite
    const threshold = this.config.thresholds?.hook_min || 7.0;
    const nextJobs = hookResult.overall < threshold && hookResult.rewrite
      ? [{
          type: "vibe_script",
          payload: {
            topic: params.topic,
            platform: params.platform,
            research_context: `Previous hook scored ${hookResult.overall}/10. Rewrite suggestion: ${hookResult.rewrite}. Best patterns from memory: ${bestPatterns.map(m => m.pattern).join("; ")}`,
          },
        }]
      : [];

    return {
      success: hookResult.overall >= threshold,
      output: {
        score: hookResult.overall,
        taxonomy: hookResult.taxonomy,
        dopamine_trigger: hookResult.dopamine_trigger,
        rewrite: hookResult.rewrite,
        passed_threshold: hookResult.overall >= threshold,
        best_patterns: bestPatterns.map(m => m.pattern),
      },
      confidence: hookResult.overall / 10,
      signals,
      next_jobs: nextJobs,
      duration_ms: Date.now() - startTime,
    };
  }
}
