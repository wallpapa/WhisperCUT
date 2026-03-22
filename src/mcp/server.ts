#!/usr/bin/env node
/**
 * WhisperCUT MCP Server — unified v1 + v2 + Agent
 *
 * 13 tools for AI-native vertical video factory:
 *
 * ── Video Factory (v1) ──────────────────────────────────────────
 *   whispercut_analyze        — Transcribe & analyze a video file
 *   whispercut_cut            — Generate cut list from analysis
 *   whispercut_caption        — Burn animated subtitles with FFmpeg
 *   whispercut_render         — Full 9:16 render (talking-head + captions)
 *   whispercut_export_capcut  — Export timeline as CapCut draft
 *   whispercut_publish        — Upload to TikTok via session cookie
 *   whispercut_feedback       — AI quality score + improvement loop
 *
 * ── Style Cloner (v2, Gemini-powered) ───────────────────────────
 *   whispercut_study          — Batch analyze a TikTok channel → style template
 *   whispercut_clone          — Generate clone script from template + topic
 *   whispercut_capcut_clone   — Export clone script as CapCut draft
 *
 * ── Autonomous Agent ────────────────────────────────────────────
 *   whispercut_run_pipeline   — Full autonomous pipeline: study→script→QA→render→publish
 *   whispercut_schedule       — Add topic to content_calendar for scheduled run
 *   whispercut_status         — Today's quota + upcoming jobs + recent pipeline results
 *
 * Primary users: Claude Cowork / OpenClaw / AI agents via MCP or HTTP API
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ── v1 tools ────────────────────────────────────────────────────
import { handleAnalyze, analyzeTool } from "./tools/analyze.js";
import { handleCut, cutTool } from "./tools/cut.js";
import { handleCaption, captionTool } from "./tools/caption.js";
import { handleRender, renderTool } from "./tools/render.js";
import { handleExport, exportTool } from "./tools/export.js";
import { handlePublish, publishTool } from "./tools/publish.js";
import { handleFeedback, feedbackTool } from "./tools/feedback.js";

// ── v2 tools (Gemini style cloner) ──────────────────────────────
import { handleStudy, studyTool } from "./tools/study.js";
import { handleClone, cloneTool, handleCapcutClone, capcutCloneTool } from "./tools/clone.js";

// ── Agent tools (autonomous pipeline) ───────────────────────────
import {
  handleRunPipeline, runPipelineTool,
  handleSchedule,    scheduleTool,
  handleStatus,      statusTool,
} from "./tools/run-pipeline.js";

const server = new Server(
  { name: "whispercut", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

// ── All 13 tools ─────────────────────────────────────────────────
const tools = [
  // v1 — Video Factory
  analyzeTool,
  cutTool,
  captionTool,
  renderTool,
  exportTool,
  publishTool,
  feedbackTool,
  // v2 — Style Cloner
  studyTool,
  cloneTool,
  capcutCloneTool,
  // Agent — Autonomous Pipeline
  runPipelineTool,
  scheduleTool,
  statusTool,
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      // v1
      case "whispercut_analyze":        return await handleAnalyze(args);
      case "whispercut_cut":            return await handleCut(args);
      case "whispercut_caption":        return await handleCaption(args);
      case "whispercut_render":         return await handleRender(args);
      case "whispercut_export_capcut":  return await handleExport(args);
      case "whispercut_publish":        return await handlePublish(args);
      case "whispercut_feedback":       return await handleFeedback(args);
      // v2
      case "whispercut_study":          return await handleStudy(args);
      case "whispercut_clone":          return await handleClone(args);
      case "whispercut_capcut_clone":   return await handleCapcutClone(args);
      // Agent
      case "whispercut_run_pipeline":   return await handleRunPipeline(args);
      case "whispercut_schedule":       return await handleSchedule(args);
      case "whispercut_status":         return await handleStatus(args);

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("WhisperCUT MCP server v2.0.0 running — 13 tools ready");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
