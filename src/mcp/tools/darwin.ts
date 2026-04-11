/**
 * MCP Tool — DARWIN Engine
 *
 * whispercut_darwin       — Run autonomous production pipeline
 * whispercut_darwin_resume — Resume after human gate approval
 * whispercut_hypotheses    — View/manage content hypotheses
 * whispercut_vibe_score    — Score a script with 6-dim VibeScore
 */

import { runDarwin, resumeDarwin, type DarwinInput } from "../../engine/darwin-engine.js";
import { generateHypotheses, loadHypotheses, rankHypotheses, saveHypothesis } from "../../engine/hypothesis-engine.js";
import { scoreVibe, verifyVibe, formatVibeScore } from "../../science/vibe-verifier.js";

// ══════════════════════════════════════════════════════════════
//  Tool 1: whispercut_darwin
// ══════════════════════════════════════════════════════════════

export const darwinTool = {
  name: "whispercut_darwin",
  description:
    "DARWIN Engine — Autonomous content production pipeline. " +
    "Runs 6 phases: Ideation → Script → Assets → Render → Publish → Learn. " +
    "Auto-selects topic from hypothesis engine if not provided. " +
    "3-Layer Immune System: self-retry → self-diagnose → self-evolve. " +
    "Pauses at Gate 1 (cover selection) and Gate 2 (publish approval).",
  inputSchema: {
    type: "object" as const,
    required: ["channel"],
    properties: {
      channel: { type: "string", description: "Channel name (e.g. 'doctorwaleerat')" },
      topic: { type: "string", description: "Topic in Thai. If omitted, auto-selected from hypotheses." },
      vibe: { type: "string", enum: ["educational_warm", "shocking_reveal", "story_driven", "quick_tips", "myth_bust", "auto"], description: "Content vibe. Default: auto-selected." },
      trigger: { type: "string", enum: ["manual", "calendar", "event"], description: "Trigger type. Default: manual." },
      platform: { type: "string", enum: ["tiktok", "instagram", "youtube"], description: "Target platform. Default: tiktok." },
      photo_path: { type: "string", description: "Photo path for cover face cloning." },
    },
  },
};

export async function handleDarwin(args: {
  channel: string;
  topic?: string;
  vibe?: string;
  trigger?: "manual" | "calendar" | "event";
  platform?: string;
  photo_path?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const input: DarwinInput = {
    trigger: args.trigger || "manual",
    channel: args.channel,
    topic: args.topic,
    vibe: args.vibe,
    platform: args.platform || "tiktok",
    skipIdeation: !!args.topic,
    photoPath: args.photo_path,
  };

  const result = await runDarwin(input);

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

// ══════════════════════════════════════════════════════════════
//  Tool 2: whispercut_hypotheses
// ══════════════════════════════════════════════════════════════

export const hypothesesTool = {
  name: "whispercut_hypotheses",
  description:
    "View and manage content hypotheses for a channel. " +
    "Actions: list (default), generate (create new), rank (sort by evidence score).",
  inputSchema: {
    type: "object" as const,
    required: ["channel"],
    properties: {
      channel: { type: "string", description: "Channel name" },
      action: { type: "string", enum: ["list", "generate", "rank"], description: "Action. Default: list." },
      count: { type: "number", description: "Number of hypotheses to generate. Default: 3." },
    },
  },
};

export async function handleHypotheses(args: {
  channel: string;
  action?: "list" | "generate" | "rank";
  count?: number;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { channel, action = "list", count = 3 } = args;

  if (action === "generate") {
    const hypotheses = await generateHypotheses({ channel, count });
    for (const h of hypotheses) await saveHypothesis(h);
    return { content: [{ type: "text", text: JSON.stringify({ action: "generated", count: hypotheses.length, hypotheses }, null, 2) }] };
  }

  const hypotheses = await loadHypotheses(channel);

  if (action === "rank") {
    const ranked = rankHypotheses(hypotheses);
    return { content: [{ type: "text", text: JSON.stringify({ action: "ranked", count: ranked.length, hypotheses: ranked }, null, 2) }] };
  }

  return { content: [{ type: "text", text: JSON.stringify({ action: "list", count: hypotheses.length, hypotheses }, null, 2) }] };
}

// ══════════════════════════════════════════════════════════════
//  Tool 3: whispercut_vibe_score
// ══════════════════════════════════════════════════════════════

export const vibeScoreTool = {
  name: "whispercut_vibe_score",
  description:
    "Score a script with 6-dimension VibeScore (hormone-mapped). " +
    "Returns: cortisol, dopamine, oxytocin, adrenaline, serotonin, rhythm " +
    "+ vibe_fidelity + predicted_completion. Threshold: >= 75 to ship.",
  inputSchema: {
    type: "object" as const,
    required: ["script", "vibe"],
    properties: {
      script: { type: "string", description: "Full script text to score" },
      vibe: { type: "string", enum: ["educational_warm", "shocking_reveal", "story_driven", "quick_tips", "myth_bust"], description: "Target vibe" },
      channel: { type: "string", description: "Channel for memory context. Default: doctorwaleerat" },
      topic: { type: "string", description: "Topic for memory recall" },
    },
  },
};

export async function handleVibeScore(args: {
  script: string;
  vibe: string;
  channel?: string;
  topic?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const score = await scoreVibe({
    script: args.script,
    targetVibe: args.vibe,
    channel: args.channel,
    topic: args.topic,
  });

  const verification = verifyVibe(score, 1);
  const display = formatVibeScore(score);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        score,
        verification: {
          passed: verification.passed,
          action: verification.action,
          failing_dimensions: verification.failing_dimensions,
        },
        display,
      }, null, 2),
    }],
  };
}
