#!/usr/bin/env node
/**
 * WhisperCUT MCP Server — v3 Vibe Engine + v2 Agent + v1 Factory
 *
 * 15 tools for AI-native vertical video factory:
 *
 * ── Vibe Engine (v3) — PRIMARY ──────────────────────────────────
 *   whispercut_vibe_edit      — Research-powered one-call video production
 *   whispercut_list_vibes     — List vibes with predicted performance
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
 *   whispercut_run_pipeline   — Full autonomous pipeline: vibe_edit→QA→render→publish
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

// ── v3 tools (Vibe Engine) ───────────────────────────────────────
import {
  handleVibeEdit,  vibeEditTool,
  handleListVibes, listVibesTool,
} from "./tools/vibe-edit.js";

// ── P2P Network ─────────────────────────────────────────────────
import {
  handleP2PStatus, p2pStatusTool,
  handleP2PSubmit, p2pSubmitTool,
} from "./tools/p2p.js";
import { startWorker, stopWorker } from "../p2p/worker.js";

// ── Shared Memory Network ───────────────────────────────────────
import {
  handleMemoryStatus, memoryStatusTool,
  handleTrackPerformance, trackPerformanceTool,
  handleSyncTikTok, syncTikTokTool,
  handleTikTokSetup, tiktokSetupTool,
} from "./tools/memory.js";

const server = new Server(
  { name: "whispercut", version: "3.2.0" },
  { capabilities: { tools: {} } }
);

// ── All 15 tools ─────────────────────────────────────────────────
const tools = [
  // v3 — Vibe Engine (PRIMARY — use these first)
  vibeEditTool,
  listVibesTool,
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
  // P2P Network
  p2pStatusTool,
  p2pSubmitTool,
  // Shared Memory Network
  memoryStatusTool,
  trackPerformanceTool,
  // TikTok Auto-Tracking
  syncTikTokTool,
  tiktokSetupTool,
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
      // v3 Vibe Engine
      case "whispercut_vibe_edit":      return await handleVibeEdit(args);
      case "whispercut_list_vibes":     return handleListVibes(args);
      // P2P Network
      case "whispercut_p2p_status":     return { content: [{ type: "text", text: JSON.stringify(await handleP2PStatus(), null, 2) }] };
      case "whispercut_p2p_submit":     return { content: [{ type: "text", text: JSON.stringify(await handleP2PSubmit(args as any), null, 2) }] };
      // Shared Memory
      case "whispercut_memory_status":   return { content: [{ type: "text", text: JSON.stringify(await handleMemoryStatus(args as any), null, 2) }] };
      case "whispercut_track_performance": return { content: [{ type: "text", text: JSON.stringify(await handleTrackPerformance(args as any), null, 2) }] };
      case "whispercut_sync_tiktok":       return { content: [{ type: "text", text: JSON.stringify(await handleSyncTikTok(args as any), null, 2) }] };
      case "whispercut_tiktok_setup":      return { content: [{ type: "text", text: JSON.stringify(await handleTikTokSetup(), null, 2) }] };

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
  console.error("WhisperCUT MCP server v3.3.0 running — 21 tools ready (vibe_edit is primary)");

  // Start P2P worker daemon (contributes 20% AI power to network)
  if (process.env.SUPABASE_URL) {
    try {
      await startWorker();
      console.error("[p2p] Worker daemon started — contributing 20% to network");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[p2p] Worker start failed (non-fatal): ${msg}`);
    }
  }

  // Graceful shutdown
  process.on("SIGINT", async () => {
    await stopWorker();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await stopWorker();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
