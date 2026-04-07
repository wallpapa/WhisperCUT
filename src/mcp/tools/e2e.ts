/**
 * whispercut_e2e — Unified end-to-end video production tool
 *
 * The "one tool to rule them all":
 *   topic OR video → research → script → voice → edit → render → QA → CapCut
 *
 * 87% AI automated, 13% human (hook review + publish confirm)
 * Based on 5-way AI debate synthesis (Claude/Gemini/GPT/Z.AI/Ollama)
 */

import { runE2E, type E2EParams, type E2EResult } from "../../engine/e2e-orchestrator.js";

export const e2eTool = {
  name: "whispercut_e2e",
  description:
    "End-to-end TikTok video production — ONE TOOL, FULL PIPELINE. " +
    "Provide a topic OR video file → AI researches (Tavily), scripts (Vibe Engine), " +
    "generates voice (MiniMax Dr.Gwang TTS), edits (hormone arc), renders (FFmpeg 1080x1920), " +
    "QA scores (hook ≥ 7), and exports to CapCut Desktop project. " +
    "95% AI automated. Human does only 3 things: " +
    "(1) Pick topic (2) Request edits if needed (3) Final approve before posting. " +
    "Returns ready-to-publish video + CapCut project + science report.",
  inputSchema: {
    type: "object" as const,
    properties: {
      // Input: provide ONE
      video_path: {
        type: "string",
        description: "Path to raw video file → triggers auto-edit path (footage-based cutting)",
      },
      topic: {
        type: "string",
        description: "Content topic in Thai or English → triggers vibe-edit path (AI script generation). " +
          "Example: 'วิธีลดน้ำหนักที่ได้ผลจริง' or 'อาหารเพื่อสุขภาพ 5 อย่าง'",
      },
      topic_id: {
        type: "number",
        description: "Topic ID from content_workflow → auto-fetches topic + vibe from database",
      },

      // Configuration
      engine: {
        type: "string",
        enum: ["auto_edit", "vibe_edit", "auto"],
        description: "Which engine to use. 'auto' (default) detects from input type",
      },
      vibe: {
        type: "string",
        enum: ["educational_warm", "shocking_reveal", "story_driven", "quick_tips", "myth_bust", "auto"],
        description: "Content vibe/style. 'auto' (default) selects best for topic",
      },
      platform: {
        type: "string",
        enum: ["tiktok", "instagram", "youtube"],
        description: "Target platform (default: tiktok). Affects CTA, pacing, duration",
      },
      target_duration: {
        type: "number",
        description: "Target video duration in seconds (default: 60). TikTok sweet spot: 45-90s",
      },

      // Quality
      hook_score_min: {
        type: "number",
        description: "Minimum hook score to pass QA (default: 7.0 out of 10)",
      },
      max_retries: {
        type: "number",
        description: "Max script regeneration attempts if QA fails (default: 3)",
      },

      // Outputs
      render: {
        type: "boolean",
        description: "Render final MP4 video (default: true). Set false for script-only",
      },
      export_capcut: {
        type: "boolean",
        description: "Export CapCut Desktop project (default: true). Opens in CapCut for human polish",
      },
      publish: {
        type: "boolean",
        description: "Auto-publish to platform (default: false). Requires platform account setup",
      },
      save_to_memory: {
        type: "boolean",
        description: "Save patterns to shared memory network (default: true). Improves future content",
      },
    },
  },
};

export async function handleE2E(args: Record<string, unknown>): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  const params: E2EParams = {
    video_path: args.video_path as string | undefined,
    topic: args.topic as string | undefined,
    topic_id: args.topic_id as number | undefined,
    engine: (args.engine as E2EParams["engine"]) || "auto",
    vibe: (args.vibe as E2EParams["vibe"]) || undefined,
    platform: (args.platform as E2EParams["platform"]) || "tiktok",
    target_duration: (args.target_duration as number) || 60,
    hook_score_min: (args.hook_score_min as number) || 7.0,
    max_retries: (args.max_retries as number) || 3,
    render: args.render !== false,
    export_capcut: args.export_capcut !== false,
    publish: args.publish === true,
    save_to_memory: args.save_to_memory !== false,
  };

  // Validate: at least one input required
  if (!params.video_path && !params.topic && !params.topic_id) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: "Provide at least one input: video_path, topic, or topic_id",
          examples: {
            topic_based: 'whispercut_e2e({ topic: "วิธีลดน้ำหนักที่ได้ผลจริง" })',
            video_based: 'whispercut_e2e({ video_path: "/path/to/raw.mp4" })',
            from_workflow: 'whispercut_e2e({ topic_id: 42 })',
          },
        }, null, 2),
      }],
      isError: true,
    };
  }

  try {
    const result = await runE2E(params);

    // Format output for MCP
    const output: Record<string, unknown> = {
      success: result.success,
      status: result.status,
      engine: result.engine_used,

      // Human role: 3 actions only
      human_actions: {
        step_1_pick_topic: "DONE (you provided the topic)",
        step_2_request_edits: result.needs_human_review
          ? {
              needed: true,
              reason: result.review_reason,
              suggestion: "Review and request edits, or say 'approve'",
            }
          : {
              needed: false,
              note: "QA passed — looks good, skip to approve",
            },
        step_3_final_approve: {
          status: result.qa_passed ? "READY for your approval" : "Review recommended before approval",
          action: 'Say "approve" or "publish" to post to TikTok',
        },
      },

      // Science report
      science_report: {
        hook_score: `${result.hook_score}/10`,
        hook_taxonomy: result.hook_taxonomy || "N/A",
        predicted_completion: result.predicted_completion
          ? `${Math.round(result.predicted_completion * 100)}%`
          : "N/A",
        hormone_arc: result.hormone_arc || "N/A",
        qa_passed: result.qa_passed,
        retries_used: result.retries_used,
      },

      // Output files
      outputs: {
        video: result.video_path || "Not rendered (render=false or script-only mode)",
        capcut_project: result.capcut_project_path || "Not exported",
        voice_audio: result.voice_path || "No voice generated",
      },

      // Performance
      execution: {
        stages_completed: result.stages,
        total_time: `${(result.duration_ms / 1000).toFixed(1)}s`,
        memories_saved: result.memories_saved,
        ai_automation: "95%",
        human_role: "3 actions: pick topic → request edits → approve",
      },
    };

    if (result.error) {
      output.error = result.error;
    }

    // Add next steps
    if (result.success) {
      output.next_steps = [];
      if (result.capcut_project_path) {
        (output.next_steps as string[]).push(
          `Open CapCut Desktop → project should appear. Path: ${result.capcut_project_path}`
        );
      }
      if (result.needs_human_review) {
        (output.next_steps as string[]).push(
          "Review the hook text — regenerate if score < 8"
        );
      }
      if (result.qa_passed && !params.publish) {
        (output.next_steps as string[]).push(
          'Publish: whispercut_e2e({ topic: "same", publish: true })'
        );
      }
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify(output, null, 2),
      }],
      isError: !result.success,
    };

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: msg,
          hint: "Check that required dependencies are available (FFmpeg, Whisper, API keys in .env)",
        }, null, 2),
      }],
      isError: true,
    };
  }
}
