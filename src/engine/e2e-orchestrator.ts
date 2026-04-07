/**
 * E2E Orchestrator — Unified pipeline for end-to-end video production
 *
 * Debate Winner: 87% AI / 13% Human
 * - AI handles: research, script, voice, edit, render, QA, export
 * - Human handles: hook review (if score < 8) + publish confirmation
 *
 * Routes to the right engine:
 *   video_path → autoEdit (footage-based)
 *   topic      → vibeEdit (script-based)
 *   topic_id   → content_workflow → vibeEdit
 *
 * Architecture:
 *   INPUT → ROUTER → ENGINE → VOICE → RENDER → QA → EXPORT → PUBLISH
 */

import { autoEdit, type AutoEditResult, type AutoEditParams } from "./auto-editor.js";
import { vibeEdit, autoVibeEdit, type VibeEditResult, type VibeScript, type Platform } from "./vibe-engine.js";
import type { VibeType } from "../science/vibe-library.js";
import { generateCapCutDraft, type DraftBridgeInput } from "./capcut-draft-bridge.js";
import { extractFromVibeEdit } from "../p2p/memory-extractor.js";
import { retrieveMemories } from "../p2p/memory-retriever.js";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ""
);

const OUTPUT_DIR = process.env.OUTPUT_DIR || "/tmp/whispercut";
const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";

// ── Types ────────────────────────────────────────────────────────

export interface E2EParams {
  // Input: provide ONE of these
  video_path?: string;
  topic?: string;
  topic_id?: number;

  // Configuration
  engine?: "auto_edit" | "vibe_edit" | "auto";
  vibe?: VibeType;
  platform?: Platform;
  target_duration?: number;

  // Quality gates
  hook_score_min?: number;
  max_retries?: number;

  // Outputs
  render?: boolean;
  export_capcut?: boolean;
  publish?: boolean;
  save_to_memory?: boolean;
}

export interface E2EResult {
  success: boolean;
  engine_used: string;
  status: "ready_to_publish" | "review_recommended" | "published" | "error";

  // Files
  video_path?: string;
  capcut_project_path?: string;
  voice_path?: string;

  // Metrics
  hook_score: number;
  hook_taxonomy?: string;
  predicted_completion?: number;
  hormone_arc: string;
  qa_passed: boolean;
  retries_used: number;

  // Execution
  stages: string[];
  duration_ms: number;
  memories_saved: number;

  // Human checkpoints
  needs_human_review: boolean;
  review_reason?: string;

  // Error
  error?: string;
}

// ── Stage Runners ───────────────────────────────────────────────

/**
 * Stage 1: ROUTE — determine which engine to use
 */
function routeEngine(params: E2EParams): "auto_edit" | "vibe_edit" {
  if (params.engine && params.engine !== "auto") return params.engine;
  if (params.video_path) return "auto_edit";
  return "vibe_edit";
}

/**
 * Stage 2: RESEARCH — get topic context from Tavily + memory network
 */
async function researchStage(topic: string, _tags: string[]): Promise<string> {
  let context = "";

  // Retrieve from shared memory network
  try {
    const result = await retrieveMemories({ topic, limit: 5 });
    if (result.memories.length > 0) {
      context += "Network Knowledge:\n";
      for (const m of result.memories) {
        context += `- ${m.pattern} (confidence: ${m.confidence})\n`;
      }
    }
  } catch {
    // Memory network optional
  }

  // Tavily research (if API key available)
  if (process.env.TAVILY_API_KEY) {
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: `${topic} health research Thailand 2026`,
          max_results: 3,
          search_depth: "basic",
        }),
      });
      if (response.ok) {
        const data = await response.json() as { answer?: string };
        if (data.answer) {
          context += `\nResearch Findings:\n${data.answer}\n`;
        }
      }
    } catch {
      // Tavily optional
    }
  }

  return context;
}

/**
 * Stage 3A: VIBE EDIT PATH — topic → script → voice → render
 */
async function vibeEditPath(params: E2EParams, researchContext: string): Promise<{
  vibeResult: VibeEditResult;
  voicePath?: string;
  videoPath?: string;
  capcutPath?: string;
}> {
  const topic = params.topic!;
  const platform = params.platform || "tiktok";
  const vibe = params.vibe;
  const duration = params.target_duration || 60;
  const maxRetries = params.max_retries || 3;

  // Inject research context into topic
  const enrichedTopic = researchContext
    ? `${topic}\n\n[Research Context: ${researchContext.slice(0, 500)}]`
    : topic;

  // Generate script — use autoVibeEdit (auto-select vibe) or vibeEdit (specific vibe)
  let vibeResult: VibeEditResult;
  if (vibe) {
    vibeResult = await vibeEdit({
      topic: enrichedTopic,
      vibe,
      platform,
      duration,
      goal: "virality",
      max_retries: maxRetries,
    });
  } else {
    vibeResult = await autoVibeEdit({
      topic: enrichedTopic,
      platform,
      duration,
      goal: "virality",
    });
  }

  let voicePath: string | undefined;
  let videoPath: string | undefined;
  let capcutPath: string | undefined;

  // Generate voice (MiniMax Dr.Gwang)
  if (params.render !== false) {
    voicePath = await generateVoice(vibeResult.script.full_narration);
  }

  // Generate CapCut draft
  if (params.export_capcut !== false) {
    capcutPath = exportVibeToCapCut(vibeResult.script, voicePath);
  }

  return { vibeResult, voicePath, videoPath, capcutPath };
}

/**
 * Stage 3B: AUTO EDIT PATH — video → transcribe → cut → render
 */
async function autoEditPath(params: E2EParams): Promise<{
  autoResult: AutoEditResult;
  capcutPath?: string;
}> {
  const autoResult = await autoEdit({
    video_path: params.video_path!,
    topic: params.topic,
    vibe: params.vibe,
    target_duration: params.target_duration,
    platform: params.platform,
  });

  let capcutPath: string | undefined;

  // Generate enhanced CapCut draft with hormone arc labels
  if (params.export_capcut !== false && autoResult.rendered_video) {
    try {
      const draftResult = generateCapCutDraft({
        projectName: `WhisperCUT_${Date.now()}`,
        clips: [{
          filePath: autoResult.rendered_video,
          type: "video",
          width: 1080,
          height: 1920,
          startOnTimeline: 0,
          duration: autoResult.duration_final,
        }],
        audio: [],
        textOverlays: autoResult.cut_plan.segments.slice(0, 5).map((seg, i) => ({
          text: seg.text?.slice(0, 40) || `Segment ${i + 1}`,
          startOnTimeline: seg.new_start,
          duration: Math.min(seg.new_end - seg.new_start, 3),
          fontSize: 30,
          color: "#FFFFFF",
        })),
      });
      capcutPath = draftResult.projectPath;
    } catch {
      // CapCut export optional
    }
  }

  return { autoResult, capcutPath };
}

/**
 * Voice Generation — MiniMax TTS with Dr.Gwang voice
 */
async function generateVoice(text: string): Promise<string | undefined> {
  const apiKey = process.env.MINIMAX_API_KEY;
  const voiceId = process.env.MINIMAX_VOICE_ID || "moss_audio_39a5b671-1e08-11f1-be4b-de7d2e195ee6";

  if (!apiKey) return undefined;

  const outputPath = join(OUTPUT_DIR, `tts_e2e_${Date.now()}.mp3`);
  mkdirSync(OUTPUT_DIR, { recursive: true });

  try {
    const groupId = process.env.MINIMAX_GROUP_ID || "";
    const apiUrl = groupId
      ? `https://api.minimax.chat/v1/t2a_v2?GroupId=${groupId}`
      : "https://api.minimax.chat/v1/t2a_v2";

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "speech-02-hd",
        text,
        voice_setting: {
          voice_id: voiceId,
          speed: 1.0,
          vol: 1.0,
          pitch: 0,
          emotion: "neutral",
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: "mp3",
          channel: 1,
        },
      }),
    });

    if (!response.ok) return undefined;

    const result = await response.json() as Record<string, unknown>;
    const audioData = result.data as Record<string, unknown> | undefined;

    if (audioData?.audio) {
      writeFileSync(outputPath, Buffer.from(audioData.audio as string, "hex"));
      return outputPath;
    }
  } catch {
    // Voice generation is optional — pipeline continues without it
  }

  return undefined;
}

/**
 * Export vibe script to CapCut Desktop project
 */
function exportVibeToCapCut(script: VibeScript, voicePath?: string): string | undefined {
  try {
    const clips: DraftBridgeInput["clips"] = [];
    const textOverlays: DraftBridgeInput["textOverlays"] = [];
    const captions: DraftBridgeInput["captions"] = [];
    const audio: DraftBridgeInput["audio"] = [];

    // Map script segments to text overlays + captions
    for (const seg of script.segments) {
      // Add keyword overlay (on-screen text)
      if (seg.on_screen_text) {
        textOverlays.push({
          text: seg.on_screen_text.slice(0, 50),
          startOnTimeline: seg.start_sec,
          duration: seg.end_sec - seg.start_sec,
          fontSize: seg.label === "hook" ? 40 : 30,
          color: seg.label === "cta" ? "#FFD700" : "#FFFFFF",
        });
      }

      // Add narration as caption
      if (seg.narration) {
        captions.push({
          text: seg.narration,
          startOnTimeline: seg.start_sec,
          duration: seg.end_sec - seg.start_sec,
        });
      }
    }

    // Add voice track
    if (voicePath) {
      audio.push({
        filePath: voicePath,
        startOnTimeline: 0,
        duration: script.duration_sec,
        volume: 1.0,
        name: "Dr.Gwang Voiceover",
      });
    }

    const safeTopic = script.topic.slice(0, 30).replace(/[^a-zA-Z0-9\u0E00-\u0E7F_-]/g, "_");
    const result = generateCapCutDraft({
      projectName: `WC_${safeTopic}_${Date.now()}`,
      clips,
      audio,
      textOverlays,
      captions,
    });

    return result.projectPath;
  } catch {
    return undefined;
  }
}

/**
 * Save execution to Supabase pipeline_runs
 */
async function logToSupabase(result: E2EResult, params: E2EParams): Promise<void> {
  if (!process.env.SUPABASE_URL) return;

  try {
    await supabase.from("pipeline_runs").insert({
      topic: params.topic || "footage_edit",
      engine: result.engine_used,
      status: result.status,
      hook_score: result.hook_score,
      qa_passed: result.qa_passed,
      duration_ms: result.duration_ms,
      video_path: result.video_path,
      capcut_path: result.capcut_project_path,
      stages: result.stages,
      platform: params.platform || "tiktok",
      created_at: new Date().toISOString(),
      user_email: USER_EMAIL,
    });
  } catch {
    // Logging is non-blocking
  }
}

/**
 * Update content_topics status when using topic_id
 */
async function updateTopicStatus(topicId: number, status: string): Promise<void> {
  if (!process.env.SUPABASE_URL) return;

  try {
    await supabase.from("content_topics")
      .update({ status, claimed_by: USER_EMAIL, claimed_at: new Date().toISOString() })
      .eq("id", topicId);
  } catch {
    // Non-blocking
  }
}

// ── Main E2E Orchestrator ───────────────────────────────────────

export async function runE2E(params: E2EParams): Promise<E2EResult> {
  const startTime = Date.now();
  const stages: string[] = [];
  let memoriesSaved = 0;

  // ── Stage 1: ROUTE ────────────────────────────────────────────
  const engineChoice = routeEngine(params);
  stages.push("route");
  console.error(`[e2e] Engine: ${engineChoice}`);

  // ── Stage 1.5: Resolve topic_id → topic ────────────────────────
  if (params.topic_id && !params.topic) {
    try {
      const { data } = await supabase
        .from("content_topics")
        .select("topic, hook, vibe, content_type")
        .eq("id", params.topic_id)
        .single();

      if (data) {
        params.topic = data.hook || data.topic;
        params.vibe = params.vibe || (data.vibe as VibeType);
        await updateTopicStatus(params.topic_id, "claimed");
      }
    } catch {
      // Fallback if topic lookup fails
    }
    stages.push("resolve_topic");
  }

  // Validate input
  if (!params.video_path && !params.topic) {
    return {
      success: false,
      engine_used: engineChoice,
      status: "error",
      hook_score: 0,
      hormone_arc: "",
      qa_passed: false,
      retries_used: 0,
      stages,
      duration_ms: Date.now() - startTime,
      memories_saved: 0,
      needs_human_review: false,
      error: "Provide either video_path OR topic (or topic_id)",
    };
  }

  // ── Stage 2: RESEARCH ─────────────────────────────────────────
  let researchContext = "";
  if (params.topic) {
    try {
      const tags = params.topic.split(/\s+/).slice(0, 5);
      researchContext = await researchStage(params.topic, tags);
      stages.push("research");
      console.error(`[e2e] Research: ${researchContext.length} chars context`);
    } catch {
      // Research is optional
    }
  }

  // ── Stage 3-6: ENGINE-SPECIFIC PATH ───────────────────────────
  try {
    if (engineChoice === "vibe_edit") {
      // ── VIBE EDIT PATH ──────────────────────────────────────
      const { vibeResult, voicePath, videoPath, capcutPath } = await vibeEditPath(params, researchContext);
      stages.push("script", "voice", "export");

      const hookScore = vibeResult.hook_score?.overall ?? 0;
      const qaPassed = vibeResult.quality_passed;
      const completionRate = vibeResult.script.predicted_completion_rate;

      // Build hormone arc string
      const hormoneArc = vibeResult.script.segments
        .map(s => s.hormone)
        .reduce((acc: string[], cur) => {
          if (acc.length === 0 || acc[acc.length - 1] !== cur) acc.push(cur);
          return acc;
        }, [])
        .join(" → ");

      // ── Stage 7: MEMORY ───────────────────────────────────
      if (params.save_to_memory !== false) {
        try {
          await extractFromVibeEdit({
            script: vibeResult.script,
            hook_score: vibeResult.hook_score,
            cta_recommendation: vibeResult.cta_recommendation,
            quality_passed: qaPassed,
          });
          memoriesSaved += 2;
          stages.push("memory");
        } catch {
          // Non-blocking
        }
      }

      // Determine human review need
      const needsReview = hookScore < 8 || !qaPassed;
      const reviewReason = !qaPassed
        ? `QA failed (hook: ${hookScore}, completion: ${Math.round(completionRate * 100)}%)`
        : hookScore < 8
          ? `Hook score ${hookScore}/10 — review recommended`
          : undefined;

      // Update topic status if applicable
      if (params.topic_id) {
        await updateTopicStatus(params.topic_id, qaPassed ? "scripted" : "claimed");
      }

      // ── Stage 8: LOG ──────────────────────────────────────
      const result: E2EResult = {
        success: true,
        engine_used: "vibe_edit",
        status: qaPassed ? "ready_to_publish" : "review_recommended",
        video_path: videoPath,
        capcut_project_path: capcutPath,
        voice_path: voicePath,
        hook_score: hookScore,
        hook_taxonomy: vibeResult.hook_score?.taxonomy,
        predicted_completion: completionRate,
        hormone_arc: hormoneArc,
        qa_passed: qaPassed,
        retries_used: vibeResult.iterations - 1,
        stages,
        duration_ms: Date.now() - startTime,
        memories_saved: memoriesSaved,
        needs_human_review: needsReview,
        review_reason: reviewReason,
      };

      await logToSupabase(result, params);
      stages.push("log");

      return result;

    } else {
      // ── AUTO EDIT PATH ──────────────────────────────────────
      const { autoResult, capcutPath } = await autoEditPath(params);
      stages.push("ingest", "transcribe", "analyze", "cut", "enhance", "render");

      const hookScore = autoResult.hook_score || 0;
      const qaPassed = hookScore >= (params.hook_score_min || 7.0);

      // Build hormone arc from cut plan
      const hormoneArc = autoResult.cut_plan.segments
        .map(s => s.label || "unknown")
        .reduce((acc: string[], cur: string) => {
          if (acc.length === 0 || acc[acc.length - 1] !== cur) acc.push(cur);
          return acc;
        }, [])
        .join(" → ");

      // Determine human review
      const needsReview = hookScore < 8;
      const reviewReason = hookScore < 8
        ? `Hook score ${hookScore}/10 — review recommended`
        : undefined;

      // Update topic status
      if (params.topic_id) {
        await updateTopicStatus(params.topic_id, "filmed");
      }

      const result: E2EResult = {
        success: true,
        engine_used: "auto_edit",
        status: qaPassed ? "ready_to_publish" : "review_recommended",
        video_path: autoResult.rendered_video,
        capcut_project_path: capcutPath,
        hook_score: hookScore,
        hormone_arc: hormoneArc,
        qa_passed: qaPassed,
        retries_used: 0,
        stages,
        duration_ms: Date.now() - startTime,
        memories_saved: 0,
        needs_human_review: needsReview,
        review_reason: reviewReason,
      };

      await logToSupabase(result, params);
      stages.push("log");

      return result;
    }

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[e2e] Error: ${msg}`);

    return {
      success: false,
      engine_used: engineChoice,
      status: "error",
      hook_score: 0,
      hormone_arc: "",
      qa_passed: false,
      retries_used: 0,
      stages,
      duration_ms: Date.now() - startTime,
      memories_saved: 0,
      needs_human_review: true,
      review_reason: `Pipeline error: ${msg}`,
      error: msg,
    };
  }
}
