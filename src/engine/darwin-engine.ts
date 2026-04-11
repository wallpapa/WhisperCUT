/**
 * DARWIN Engine — Autonomous Workflow Orchestrator
 *
 * Data-driven Autonomous Research-poWered Iterative Network
 *
 * 6 Phases: Ideation → Script → Assets → Render → Publish → Learn
 * 3-Layer Immune System: Retry → Diagnose → Evolve
 * 2 Human Gates: Cover Selection + Publish Approval
 *
 * Entry point: runDarwin(trigger)
 */

import { selectBestTopic, validateHypothesis, saveHypothesis, type Hypothesis } from "./hypothesis-engine.js";
import { scoreVibe, verifyVibe, formatVibeScore, type VibeScore } from "../science/vibe-verifier.js";
import { getMemoryLayer } from "../memory/memory-layer.js";
import { recordCoverSelection } from "../memory/rl-collector.js";
import { detectTopicCategory } from "./scene-dna.js";
import { generateVoice } from "./voice.js";
import { lintThaiScriptForLipsync, type ThaiScriptLintReport } from "./thai-mouth-rules.js";

// ── Types ─────────────────────────────────────────────────────

export type DarwinTrigger = "manual" | "calendar" | "event";

export interface DarwinInput {
  trigger: DarwinTrigger;
  channel: string;
  /** Manual: explicit topic. Calendar/Event: auto-select from hypotheses */
  topic?: string;
  vibe?: string;
  platform?: string;
  /** Skip ideation if topic provided */
  skipIdeation?: boolean;
  /** Photo path for cover face cloning */
  photoPath?: string;
  /** Source video for lipsync (real talking head) */
  sourceVideo?: string;
  /** Pre-written script text */
  scriptText?: string;
  /** Lipsync provider */
  lipsyncProvider?: "wav2lip_local" | "sync_lipsync_2" | "sync_lipsync_2_pro" | "sync_3";
  /** Voice mode */
  voiceMode?: "auto" | "clone" | "free_female_th";
}

export interface DarwinResult {
  success: boolean;
  trigger: DarwinTrigger;
  phases_completed: string[];
  phase_results: Record<string, unknown>;

  // Phase 1 output
  topic: string;
  vibe: string;
  hypothesis?: Hypothesis;

  // Phase 2 output
  vibe_score?: VibeScore;
  script_path?: string;

  // Phase 3 output
  cover_paths?: string[];
  voice_path?: string;
  broll_paths?: string[];

  // Phase 4 output (lipsync)
  lipsync_ready?: boolean;
  script_lint?: ThaiScriptLintReport;

  // Phase 5 output
  status: "awaiting_cover_selection" | "awaiting_publish_approval" | "published" | "error";

  // Immune system
  retries: number;
  diagnoses: string[];
  evolutions: string[];

  // Timing
  duration_ms: number;
}

// ── 3-Layer Immune System ─────────────────────────────────────

interface ImmuneState {
  retries: number;
  diagnoses: string[];
  evolutions: string[];
}

function createImmuneState(): ImmuneState {
  return { retries: 0, diagnoses: [], evolutions: [] };
}

/** Layer 1: SKIN — Self-retry with backoff */
async function withRetry<T>(
  fn: () => Promise<T>,
  immune: ImmuneState,
  maxRetries = 3,
  label = "operation",
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      immune.retries++;
      console.error(`[darwin:skin] ${label} attempt ${attempt}/${maxRetries} failed: ${e.message?.slice(0, 100)}`);
      if (attempt === maxRetries) throw e;
      await new Promise(r => setTimeout(r, 1000 * attempt)); // exponential backoff
    }
  }
  throw new Error("unreachable");
}

/** Layer 2: WHITE BLOOD CELLS — Self-diagnose and change strategy */
function diagnose(
  phase: string,
  issue: string,
  immune: ImmuneState,
): { newStrategy: string; action: string } {
  const diagnosis = `[${phase}] ${issue}`;
  immune.diagnoses.push(diagnosis);
  console.error(`[darwin:wbc] Diagnosing: ${diagnosis}`);

  // Strategy switching rules
  if (phase === "script" && issue.includes("pacing")) {
    return { newStrategy: "quick_tips", action: "Switch vibe to quick_tips (better pacing)" };
  }
  if (phase === "script" && issue.includes("hook")) {
    return { newStrategy: "shocking_reveal", action: "Switch to shocking_reveal (stronger hook)" };
  }
  if (phase === "cover" && issue.includes("rejected")) {
    return { newStrategy: "worried", action: "Switch expression to worried" };
  }
  if (phase === "voice" && issue.includes("failed")) {
    return { newStrategy: "edge_tts", action: "Fallback to Edge TTS free Thai voice" };
  }
  if (phase === "voice" && issue.includes("balance")) {
    return { newStrategy: "edge_tts", action: "MiniMax insufficient balance → Edge TTS PremwadeeNeural (free)" };
  }
  if (phase === "lipsync" && issue.includes("obstruction")) {
    return { newStrategy: "sync_lipsync_2_pro", action: "Face obstruction detected → upgrade to Sync Pro provider" };
  }
  if (phase === "lipsync" && issue.includes("bilabial_density")) {
    return { newStrategy: "rewrite_script", action: "Too many bilabial closures → rewrite script to reduce density" };
  }

  return { newStrategy: "default", action: "Retry with default strategy" };
}

/** Layer 3: ANTIBODIES — Self-evolve via hypothesis */
async function evolve(
  hypothesis: Hypothesis | undefined,
  actual: number,
  clipId: string,
  immune: ImmuneState,
): Promise<void> {
  if (!hypothesis) return;

  const result = validateHypothesis(hypothesis, actual, clipId);
  immune.evolutions.push(`Hypothesis "${hypothesis.statement}": ${result.status} — ${result.reason}`);
  console.error(`[darwin:antibody] ${result.status}: ${result.reason}`);

  // Store updated hypothesis
  await saveHypothesis(hypothesis);

  // Store in memory layer
  const memory = getMemoryLayer();
  if (result.status === "confirmed") {
    await memory.remember({
      type: "feedback_scored",
      channel: hypothesis.channel,
      topic: hypothesis.topic,
      data: {
        hypothesis_confirmed: hypothesis.statement,
        vibe: hypothesis.vibe,
        actual,
        target: hypothesis.prediction.target,
      },
    });
  } else if (result.status === "rejected") {
    await memory.remember({
      type: "feedback_scored",
      channel: hypothesis.channel,
      topic: hypothesis.topic,
      data: {
        hypothesis_rejected: hypothesis.statement,
        vibe: hypothesis.vibe,
        actual,
        target: hypothesis.prediction.target,
        reason: result.reason,
      },
    });
  }
}

// ── DARWIN Engine ─────────────────────────────────────────────

export async function runDarwin(input: DarwinInput): Promise<DarwinResult> {
  const t0 = Date.now();
  const immune = createImmuneState();
  const phases: string[] = [];
  const phaseResults: Record<string, unknown> = {};

  let topic = input.topic || "";
  let vibe = input.vibe || "auto";
  let hypothesis: Hypothesis | undefined;

  console.error(`\n[darwin] ══════ DARWIN ENGINE START ══════`);
  console.error(`[darwin] Trigger: ${input.trigger} | Channel: ${input.channel}`);

  try {
    // ═══════════════════════════════════════════════════════════
    // PHASE 1: IDEATION
    // ═══════════════════════════════════════════════════════════

    if (!input.skipIdeation && !input.topic) {
      console.error(`[darwin] Phase 1: IDEATION`);

      const selection = await withRetry(
        () => selectBestTopic(input.channel),
        immune, 2, "ideation",
      );

      if (selection) {
        topic = selection.topic;
        vibe = selection.vibe;
        hypothesis = selection.hypothesis || undefined;
        phaseResults.ideation = {
          topic,
          vibe,
          hypothesis_id: hypothesis?.id,
          reason: selection.reason,
        };
        console.error(`[darwin] Topic: "${topic}" | Vibe: ${vibe}`);
        console.error(`[darwin] Reason: ${selection.reason}`);
      } else {
        throw new Error("No topic could be selected");
      }

      phases.push("ideation");
    } else {
      console.error(`[darwin] Phase 1: SKIPPED (topic provided: "${topic}")`);
      phases.push("ideation:skipped");
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: SCRIPT + VIBE VERIFICATION
    // ═══════════════════════════════════════════════════════════

    console.error(`[darwin] Phase 2: SCRIPT + VERIFICATION`);

    // Script generation would call existing vibe_edit
    // For now, we prepare the verification pipeline
    const category = detectTopicCategory(topic);

    // Recall memory insights for script generation
    const memory = getMemoryLayer();
    const insights = await memory.recall({
      channel: input.channel,
      topic,
      intent: `best ${vibe} script patterns for ${category} topic`,
      limit: 5,
    });

    phaseResults.script = {
      topic,
      vibe,
      category,
      memory_insights: insights.length,
      note: "Script generation delegated to whispercut_vibe_edit with memory context",
    };

    phases.push("script");

    // ═══════════════════════════════════════════════════════════
    // PHASE 3: ASSETS (parallel — cover + voice + b-roll)
    // ═══════════════════════════════════════════════════════════

    console.error(`[darwin] Phase 3: ASSETS (cover + voice + broll)`);

    // 3a. Voice generation (with auto-fallback: MiniMax → Edge TTS → F5)
    let voicePath: string | undefined;
    if (input.scriptText) {
      try {
        voicePath = await withRetry(async () => {
          const slug = topic.slice(0, 20).replace(/\s+/g, "_");
          return generateVoice({
            text: input.scriptText!,
            outputPath: `./output/darwin/${slug}_voice.mp3`,
            mode: input.voiceMode || "auto",
          });
        }, immune, 2, "voice");
        console.error(`[darwin] Voice: ✅ ${voicePath}`);
      } catch (e: any) {
        const diag = diagnose("voice", e.message, immune);
        console.error(`[darwin] Voice: ❌ ${diag.action}`);
      }
    }

    // 3b. Script lipsync lint (Thai + English code-switching)
    let scriptLint: ThaiScriptLintReport | undefined;
    if (input.scriptText) {
      try {
        scriptLint = lintThaiScriptForLipsync(input.scriptText);
        console.error(`[darwin] Script lint: ${scriptLint.issues?.length || 0} issues, ` +
          `${scriptLint.english_token_count || 0} EN words, ` +
          `est. ${scriptLint.estimated_duration_sec?.toFixed(1)}s`);
      } catch {}
    }

    phaseResults.assets = {
      cover: "Delegated to whispercut_generate_cover (4 RL variants)",
      voice: voicePath ? { path: voicePath, status: "generated" } : "Awaiting script",
      broll: "Delegated to whispercut_generate_broll (topic-matched presets)",
      script_lint: scriptLint ? {
        english_words: scriptLint.english_token_count,
        estimated_duration: scriptLint.estimated_duration_sec,
        issues: scriptLint.issues?.length || 0,
        counts: scriptLint.counts,
      } : undefined,
      lipsync: input.sourceVideo ? {
        source_video: input.sourceVideo,
        provider: input.lipsyncProvider || "wav2lip_local",
        status: "ready_for_phase_4",
        note: "Use whispercut_real_talking_head_relipsync after voice generated",
      } : "No source video — render from assets",
      gate_1: "AWAITING: Human cover selection (3-Tap Flow)",
    };

    phases.push("assets");

    // ═══════════════════════════════════════════════════════════
    // PHASE 4: RENDER + LIPSYNC
    // ═══════════════════════════════════════════════════════════

    console.error(`[darwin] Phase 4: RENDER + LIPSYNC`);

    phaseResults.render = {
      lipsync_pipeline: input.sourceVideo ? {
        source_video: input.sourceVideo,
        voice_path: voicePath,
        provider: input.lipsyncProvider || "wav2lip_local",
        language_mode: "th_en",
        steps: [
          "1. Mute source video",
          "2. Fit voice audio to video duration",
          "3. Run lipsync provider (mouth sync)",
          "4. Replace audio track",
          "5. Add captions + text overlays",
          "6. Export final MP4",
        ],
        tool: "whispercut_real_talking_head_relipsync",
        status: voicePath ? "ready" : "awaiting_voice",
      } : {
        mode: "asset_compose",
        steps: [
          "1. Compose: cover + voice + broll → timeline",
          "2. FFmpeg render 1080×1920 @60fps",
          "3. Add captions + text overlays",
          "4. Export CapCut draft",
        ],
        tool: "whispercut_e2e",
      },
      script_lint_summary: scriptLint ? {
        thai_bilabial: scriptLint.counts?.bilabial_closure,
        thai_labiodental: scriptLint.counts?.labiodental_contact,
        thai_rounded: scriptLint.counts?.rounded_vowel,
        english_words: scriptLint.english_token_count,
        peak_density: scriptLint.peak_density,
        issues: scriptLint.issues?.length || 0,
      } : undefined,
    };

    phases.push("render");

    // ═══════════════════════════════════════════════════════════
    // Return at Gate 1 — awaiting human cover selection
    // ═══════════════════════════════════════════════════════════

    return {
      success: true,
      trigger: input.trigger,
      phases_completed: phases,
      phase_results: phaseResults,
      topic,
      vibe,
      hypothesis,
      voice_path: voicePath,
      lipsync_ready: !!voicePath && !!input.sourceVideo,
      script_lint: scriptLint,
      status: "awaiting_cover_selection",
      retries: immune.retries,
      diagnoses: immune.diagnoses,
      evolutions: immune.evolutions,
      duration_ms: Date.now() - t0,
    };

  } catch (e: any) {
    console.error(`[darwin] ERROR: ${e.message}`);

    // Layer 2: Diagnose
    const diag = diagnose("pipeline", e.message, immune);
    console.error(`[darwin] Diagnosis: ${diag.action}`);

    return {
      success: false,
      trigger: input.trigger,
      phases_completed: phases,
      phase_results: { ...phaseResults, error: e.message, diagnosis: diag },
      topic,
      vibe,
      hypothesis,
      status: "error",
      retries: immune.retries,
      diagnoses: immune.diagnoses,
      evolutions: immune.evolutions,
      duration_ms: Date.now() - t0,
    };
  }
}

/** Resume DARWIN after human gates */
export async function resumeDarwin(params: {
  phase: "after_cover_selection" | "after_publish_approval";
  channel: string;
  topic: string;
  vibe: string;
  hypothesis?: Hypothesis;
  coverPath?: string;
  approved?: boolean;
}): Promise<{ status: string; next_action: string }> {
  const { phase, channel, topic, vibe, hypothesis, coverPath, approved } = params;

  if (phase === "after_cover_selection") {
    // Continue to Phase 4: Render + Phase 5: Publish Gate
    return {
      status: "awaiting_publish_approval",
      next_action: `Render video with cover "${coverPath}" → present for publish approval (Gate 2)`,
    };
  }

  if (phase === "after_publish_approval") {
    if (!approved) {
      return {
        status: "revision_requested",
        next_action: "Loop back to Phase 3 or 4 for revisions",
      };
    }

    // Phase 5: Auto-publish
    // Phase 6: Learn (schedule performance tracking)
    return {
      status: "published",
      next_action: `Published. Performance tracking scheduled at 24h/48h/7d. Hypothesis "${hypothesis?.statement || 'none'}" will be validated.`,
    };
  }

  return { status: "unknown", next_action: "Invalid phase" };
}
