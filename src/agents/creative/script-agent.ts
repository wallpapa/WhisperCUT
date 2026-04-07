/**
 * ScriptAgent — AI script generation with RL-powered optimization
 *
 * Wraps vibeEdit() + autoVibeEdit() from vibe-engine.ts
 * Before: queries RL preferences for best vibe/hook_style
 * After: emits signals for hook quality + completion prediction
 * Chains to HookAgent for scoring
 *
 * Reference: VideoAgent 87-98% orchestration, ViMax all-in-one generation
 */

import { BaseAgent, type AgentResult } from "../base-agent.js";
import { vibeEdit, autoVibeEdit, type VibeEditResult, type Platform } from "../../engine/vibe-engine.js";
import type { VibeType } from "../../science/vibe-library.js";

interface ScriptPayload {
  topic: string;
  vibe?: VibeType;
  platform?: Platform;
  duration?: number;
  goal?: "virality" | "engagement" | "saves" | "followers";
  max_retries?: number;
  research_context?: string;
}

export class ScriptAgent extends BaseAgent {
  readonly name = "ScriptAgent";
  readonly jobType = "vibe_script";
  readonly description = "Generates science-encoded scripts with hormone arc, hook scoring, and RL-powered optimization";

  async process(payload: unknown): Promise<AgentResult> {
    const startTime = Date.now();
    const params = payload as ScriptPayload;

    // Step 1: Query memory for relevant patterns
    const memories = await this.queryMemory(params.topic);
    const memoryContext = memories.length > 0
      ? memories.map(m => m.pattern).join("\n")
      : "";

    // Step 2: Enrich topic with research + memory
    const enrichedTopic = [
      params.topic,
      memoryContext ? `[Memory: ${memoryContext.slice(0, 300)}]` : "",
      params.research_context ? `[Research: ${params.research_context.slice(0, 300)}]` : "",
    ].filter(Boolean).join("\n\n");

    // Step 3: Generate script (auto-select vibe or use specified)
    let result: VibeEditResult;

    if (params.vibe) {
      result = await vibeEdit({
        topic: enrichedTopic,
        vibe: params.vibe,
        platform: params.platform || "tiktok",
        duration: params.duration || 60,
        goal: params.goal || "virality",
        max_retries: params.max_retries || 3,
      });
    } else {
      result = await autoVibeEdit({
        topic: enrichedTopic,
        platform: params.platform || "tiktok",
        duration: params.duration || 60,
        goal: params.goal || "virality",
      });
    }

    // Step 4: Build RL signals
    const hookScore = result.hook_score?.overall ?? 0;
    const completionRate = result.script.predicted_completion_rate;
    const shareRate = result.script.predicted_share_rate;

    const signals = [
      { dimension: "hook_quality", value: hookScore, context: { taxonomy: result.hook_score?.taxonomy } },
      { dimension: "completion_predict", value: completionRate * 10, context: { vibe: result.script.vibe } },
      { dimension: "share_predict", value: shareRate * 10, context: { platform: result.script.platform } },
    ];

    // Step 5: Chain to HookAgent if score needs improvement
    const nextJobs = hookScore < 8 ? [{
      type: "hook_score",
      payload: {
        hook_text: result.script.hook_text,
        topic: params.topic,
        platform: params.platform || "tiktok",
        current_score: hookScore,
      },
    }] : [];

    return {
      success: result.quality_passed,
      output: result,
      confidence: hookScore / 10,
      signals,
      next_jobs: nextJobs,
      duration_ms: Date.now() - startTime,
    };
  }
}
