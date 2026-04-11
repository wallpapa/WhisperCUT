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

// ── Tavily Research ─────────────────────────────────────────────
import {
  handleResearchTopic, researchTopicTool,
  handleFindResearch, findResearchTool,
} from "./tools/research.js";

// ── Canva Image Generation + RL ─────────────────────────────────
import {
  handleGenerateCovers, generateCoversTool,
  handleSelectCover, selectCoverTool,
  handleCoverPreferences, coverPreferencesTool,
} from "./tools/canva.js";

// ── AI Cover Design Agent (Nano Banana Pro + Scene DNA + RL) ────
import {
  handleGenerateCover, generateCoverTool,
  handleSelectCoverAI, selectCoverAITool,
  handleCoverPrefsAI, coverPrefsAITool,
} from "./tools/cover-design.js";

// ── Video Studio (Analysis + B-Roll) ────────────────────────────
import {
  handleAnalyzeVideo, analyzeVideoTool,
  handleGenerateBRoll, generateBRollTool,
  handleKlingImageToVideo, klingImageToVideoTool,
} from "./tools/video-studio.js";
import {
  handleGenerateAvatarPortraits, generateAvatarPortraitsTool,
} from "./tools/avatar-studio.js";

// ── Unified Lipsync (multi-provider fallback) ───────────────────
import { handleLipsync, lipsyncTool } from "./tools/lipsync.js";

// ── LivePortrait (Mac M-series Local Lipsync) ───────────────────
import {
  handleLivePortrait, livePortraitTool,
  handleLivePortraitStatus, livePortraitStatusTool,
} from "./tools/liveportrait.js";

// ── DARWIN Engine ───────────────────────────────────────────────
import {
  handleDarwin, darwinTool,
  handleHypotheses, hypothesesTool,
  handleVibeScore, vibeScoreTool,
} from "./tools/darwin.js";

// ── Memory Layer ────────────────────────────────────────────────
import { getMemoryLayer } from "../memory/memory-layer.js";

// ── Content Workflow ────────────────────────────────────────────
import {
  handleClaimTopic, claimTopicTool,
  handleUpdateTopicStatus, updateTopicStatusTool,
  handleProductionBoard, productionBoardTool,
  handleAddTopic, addTopicTool,
} from "./tools/content-workflow.js";

// ── Auto Edit Pipeline ──────────────────────────────────────────
import { handleAutoEdit, autoEditTool } from "./tools/auto-edit.js";

// ── Resource Mesh ───────────────────────────────────────────────
import { handleNodeInfo, nodeInfoTool } from "./tools/node-info.js";

// ── CapCut Learning ─────────────────────────────────────────────
import { handleLearnFromCapCut, learnFromCapCutTool } from "./tools/capcut-learn.js";

// ── CapCut Bridge + MiniMax TTS ─────────────────────────────────
import {
  handleCapcutBridge, capcutBridgeTool,
  handleTtsDrGwang, ttsDrGwangTool,
} from "./tools/capcut-bridge.js";

// ── E2E Unified Pipeline ────────────────────────────────────────
import { handleE2E, e2eTool } from "./tools/e2e.js";
import { handleRealTalkingHeadRelipsync, realTalkingHeadRelipsyncTool } from "./tools/real-talking-head.js";

// ── Multi-Agent Architecture ────────────────────────────────────
import { registerAgent, getAgentStats } from "../agents/registry.js";
import { ScriptAgent } from "../agents/creative/script-agent.js";
import { HookAgent } from "../agents/creative/hook-agent.js";
import { QAGateAgent } from "../agents/quality/qa-gate-agent.js";
import { ContentPlannerAgent } from "../agents/planning/planner-agent.js";

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
  // Tavily Research
  researchTopicTool,
  findResearchTool,
  // Canva Image Generation + RL
  generateCoversTool,
  selectCoverTool,
  coverPreferencesTool,
  // Content Workflow
  claimTopicTool,
  updateTopicStatusTool,
  productionBoardTool,
  addTopicTool,
  // Auto Edit
  autoEditTool,
  // Resource Mesh
  nodeInfoTool,
  // CapCut Learning
  learnFromCapCutTool,
  // CapCut Bridge + MiniMax TTS
  capcutBridgeTool,
  ttsDrGwangTool,
  // E2E Unified Pipeline (PRIMARY — the "one tool" for full production)
  e2eTool,
  realTalkingHeadRelipsyncTool,
  // AI Cover Design Agent (Nano Banana Pro + Scene DNA + Per-Channel RL)
  generateCoverTool,
  selectCoverAITool,
  coverPrefsAITool,
  // Video Studio (Gemini Video Analysis + Veo 3.1 B-Roll)
  analyzeVideoTool,
  generateBRollTool,
  // Unified Lipsync (multi-provider fallback)
  lipsyncTool,
  // LivePortrait (Mac M-series Local Lipsync)
  livePortraitTool,
  livePortraitStatusTool,
  // DARWIN Engine (Autonomous Workflow + Hypothesis + VibeScore)
  darwinTool,
  hypothesesTool,
  vibeScoreTool,
  klingImageToVideoTool,
  // Avatar Studio (Nano Banana Pro / Gemini 3 Pro Image)
  generateAvatarPortraitsTool,
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
      // Tavily Research
      case "whispercut_research_topic":    return await handleResearchTopic(args as any);
      case "whispercut_find_research":     return await handleFindResearch(args as any);
      // Canva + RL
      case "whispercut_generate_covers":   return { content: [{ type: "text", text: JSON.stringify(await handleGenerateCovers(args as any), null, 2) }] };
      case "whispercut_select_cover":      return { content: [{ type: "text", text: JSON.stringify(await handleSelectCover(args as any), null, 2) }] };
      case "whispercut_cover_preferences": return { content: [{ type: "text", text: JSON.stringify(await handleCoverPreferences(), null, 2) }] };
      // Content Workflow
      case "whispercut_claim_topic":       return { content: [{ type: "text", text: JSON.stringify(await handleClaimTopic(args as any), null, 2) }] };
      case "whispercut_update_topic_status": return { content: [{ type: "text", text: JSON.stringify(await handleUpdateTopicStatus(args as any), null, 2) }] };
      case "whispercut_production_board":  return { content: [{ type: "text", text: JSON.stringify(await handleProductionBoard(args as any), null, 2) }] };
      case "whispercut_add_topic":         return { content: [{ type: "text", text: JSON.stringify(await handleAddTopic(args as any), null, 2) }] };
      // Auto Edit
      case "whispercut_auto_edit":         return await handleAutoEdit(args as any);
      // Resource Mesh
      case "whispercut_node_info":         return { content: [{ type: "text", text: JSON.stringify(await handleNodeInfo(), null, 2) }] };
      case "whispercut_learn_from_capcut": return await handleLearnFromCapCut(args as any);
      // CapCut Bridge + MiniMax TTS
      case "whispercut_create_capcut_project": return await handleCapcutBridge(args as any);
      case "whispercut_tts_dr_gwang":          return await handleTtsDrGwang(args as any);
      // E2E Unified Pipeline
      case "whispercut_e2e":                  return await handleE2E(args as any);
      case "whispercut_real_talking_head_relipsync": return await handleRealTalkingHeadRelipsync(args as any);
      // AI Cover Design Agent
      case "whispercut_generate_cover":       return await handleGenerateCover(args as any);
      case "whispercut_select_cover_ai":      return await handleSelectCoverAI(args as any);
      case "whispercut_cover_preferences_ai": return await handleCoverPrefsAI(args as any);
      // Video Studio
      case "whispercut_analyze_video":       return await handleAnalyzeVideo(args as any);
      case "whispercut_generate_broll":      return await handleGenerateBRoll(args as any);
      case "whispercut_kling_image_to_video": return await handleKlingImageToVideo(args as any);
      // Avatar Studio
      case "whispercut_generate_avatar_portraits": return await handleGenerateAvatarPortraits(args as any);
      // Unified Lipsync
      case "whispercut_lipsync":             return await handleLipsync(args as any);
      // LivePortrait
      case "whispercut_liveportrait":        return await handleLivePortrait(args as any);
      case "whispercut_liveportrait_status": return await handleLivePortraitStatus();
      // DARWIN Engine
      case "whispercut_darwin":              return await handleDarwin(args as any);
      case "whispercut_hypotheses":          return await handleHypotheses(args as any);
      case "whispercut_vibe_score":          return await handleVibeScore(args as any);

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
  // Register multi-agent swarm
  registerAgent(new ScriptAgent());
  registerAgent(new HookAgent());
  registerAgent(new QAGateAgent());
  registerAgent(new ContentPlannerAgent());
  const agentStats = getAgentStats();

  // Init memory layer
  const memoryLayer = getMemoryLayer();
  console.error(`[memory] Layer ready: ${memoryLayer.providerNames.join(", ")} (${memoryLayer.providerCount} providers)`);

  console.error(`WhisperCUT MCP server v5.2.0 running — 39 tools + ${agentStats.total_agents} agents + memory layer ready`);

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
