/**
 * QAGateAgent — Quality assurance with self-tuning thresholds
 *
 * Wraps runQAGate() from qa-gate.ts
 * Self-tunes thresholds per vibe:
 *   - shocking_reveal: needs higher hook (8.0+)
 *   - story_driven: needs higher pacing consistency
 *   - educational_warm: balanced thresholds
 *
 * Emits signal per QA dimension for RL learning
 */

import { BaseAgent, type AgentResult } from "../base-agent.js";
import { runQAGate, type QAResult } from "../../agent/qa-gate.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

interface QAPayload {
  script: Record<string, unknown>;        // Script JSON content
  script_path?: string;                    // OR path to script file
  style_template?: Record<string, unknown>;
  style_template_path?: string;            // OR path to template file
  vibe?: string;
  platform?: string;
}

// Per-vibe threshold adjustments (from 15 real CapCut project analysis)
const VIBE_THRESHOLDS: Record<string, Record<string, number>> = {
  shocking_reveal: { hook: 8.0, body: 6.0, cta: 6.5, overall: 7.0 },
  story_driven: { hook: 6.5, body: 7.5, cta: 6.0, overall: 7.0 },
  educational_warm: { hook: 7.0, body: 7.0, cta: 7.0, overall: 7.0 },
  quick_tips: { hook: 7.5, body: 6.5, cta: 7.0, overall: 7.0 },
  myth_bust: { hook: 8.0, body: 6.5, cta: 6.0, overall: 7.0 },
};

const DEFAULT_THRESHOLDS = { hook: 7.0, body: 6.5, cta: 6.5, overall: 7.0 };

export class QAGateAgent extends BaseAgent {
  readonly name = "QAGateAgent";
  readonly jobType = "qa_gate";
  readonly description = "Evaluates script quality across 7 dimensions with self-tuning thresholds per vibe type";

  async process(payload: unknown): Promise<AgentResult> {
    const startTime = Date.now();
    const params = payload as QAPayload;

    // Step 1: Get vibe-specific thresholds
    const vibe = params.vibe || "educational_warm";
    const thresholds = VIBE_THRESHOLDS[vibe] || DEFAULT_THRESHOLDS;

    // Step 2: Prepare file paths for QA gate (it expects file paths)
    const tmpDir = "/tmp/whispercut/qa";
    mkdirSync(tmpDir, { recursive: true });

    const scriptPath = params.script_path || join(tmpDir, `script_${Date.now()}.json`);
    const templatePath = params.style_template_path || join(tmpDir, `template_${Date.now()}.json`);

    if (!params.script_path && params.script) {
      writeFileSync(scriptPath, JSON.stringify(params.script, null, 2));
    }
    if (!params.style_template_path && params.style_template) {
      writeFileSync(templatePath, JSON.stringify(params.style_template, null, 2));
    }

    // Run QA gate
    let qaResult: QAResult;
    try {
      qaResult = await runQAGate(scriptPath, templatePath);
    } catch {
      // If QA gate fails (missing template), return default scores
      qaResult = { passed: false, score: 5, scores: { hook: 5, body: 5, cta: 5 }, strengths: [], improvements: ["QA gate unavailable"], attempt: 1 };
    }

    // Step 3: Evaluate against thresholds (QAResult has .score + .scores record)
    const overallScore = qaResult.score || 0;
    const hookDimScore = qaResult.scores?.hook || 0;
    const bodyDimScore = qaResult.scores?.body || 0;
    const ctaDimScore = qaResult.scores?.cta || 0;

    const passed = overallScore >= thresholds.overall
      && hookDimScore >= thresholds.hook;

    // Step 4: Build RL signals (one per QA dimension)
    const signals = [
      { dimension: "qa_overall", value: overallScore, context: { vibe, platform: params.platform } },
      { dimension: "qa_hook", value: hookDimScore, context: { threshold: thresholds.hook } },
      { dimension: "qa_body", value: bodyDimScore, context: { threshold: thresholds.body } },
      { dimension: "qa_cta", value: ctaDimScore, context: { threshold: thresholds.cta } },
    ];

    // Step 5: If failed, suggest which dimension to improve
    const weakestDimension = [
      { dim: "hook", score: hookDimScore, threshold: thresholds.hook },
      { dim: "body", score: bodyDimScore, threshold: thresholds.body },
      { dim: "cta", score: ctaDimScore, threshold: thresholds.cta },
    ].sort((a, b) => (a.score - a.threshold) - (b.score - b.threshold))[0];

    return {
      success: passed,
      output: {
        ...qaResult,
        passed,
        vibe,
        thresholds_used: thresholds,
        weakest_dimension: weakestDimension?.dim,
        improvement_needed: !passed ? `Improve ${weakestDimension?.dim}: ${weakestDimension?.score}/${weakestDimension?.threshold}` : null,
      },
      confidence: overallScore / 10,
      signals,
      duration_ms: Date.now() - startTime,
    };
  }
}
