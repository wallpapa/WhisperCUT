/**
 * MCP Tool — Cover Design Agent
 *
 * 3-Tap Cover Flow:
 *   TAP 1: whispercut_generate_cover → topic → 4 variants (RL-optimized)
 *   TAP 2: whispercut_select_cover → user picks → RL signal logged
 *   TAP 3: whispercut_cover_preferences → show learned per-channel prefs
 *
 * Uses: Nano Banana Pro (gemini-3-pro-image-preview) + Scene DNA + Per-Channel RL
 */

import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import {
  type SceneDNA,
  type CoverRLDimension,
  COVER_RL_DIMENSIONS,
  COVER_DIMENSION_VALUES,
  getSceneDNAPreset,
  generateSceneDNA,
  buildCoverPrompt,
  detectTopicCategory,
} from "../../engine/scene-dna.js";
import { getMemoryLayer } from "../../memory/memory-layer.js";
import { recordCoverSelection } from "../../memory/rl-collector.js";

// ── Config ────────────────────────────────────────────────────

const MODELS = {
  pro: "gemini-3-pro-image-preview",
  flash: "gemini-2.5-flash-image",
} as const;

const OUT_DIR = "./output/cover-ai";
const EPSILON = 0.20; // 20% exploration
const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";

// ── Supabase ──────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!,
  );
}

// ── RL Engine (Per-Channel) ───────────────────────────────────

interface CoverPreference {
  dimension: CoverRLDimension;
  value: string;
  win_count: number;
  loss_count: number;
  win_rate: number;
}

async function getChannelPreferences(
  channel: string,
): Promise<Record<CoverRLDimension, CoverPreference[]>> {
  const result = {} as Record<CoverRLDimension, CoverPreference[]>;
  for (const dim of COVER_RL_DIMENSIONS) result[dim] = [];

  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("cover_preferences")
      .select("dimension, value, win_count, loss_count, win_rate")
      .eq("channel", channel)
      .eq("user_email", USER_EMAIL);

    if (data) {
      for (const row of data) {
        const dim = row.dimension as CoverRLDimension;
        if (result[dim]) {
          result[dim].push(row as CoverPreference);
        }
      }
    }
  } catch {
    // No Supabase or table doesn't exist yet — use defaults
  }

  return result;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Build style for a variant using epsilon-greedy RL */
function buildVariantStyle(
  prefs: Record<CoverRLDimension, CoverPreference[]>,
  strategy: "exploit_top" | "exploit_second" | "explore" | "wild",
): Record<CoverRLDimension, string> {
  const style = {} as Record<CoverRLDimension, string>;

  for (const dim of COVER_RL_DIMENSIONS) {
    const dimPrefs = prefs[dim];

    if (strategy === "wild" || dimPrefs.length === 0) {
      // Pure random
      style[dim] = randomChoice(COVER_DIMENSION_VALUES[dim]);
    } else if (strategy === "explore") {
      // Epsilon-greedy: 20% random, 80% least-explored
      if (Math.random() < EPSILON) {
        style[dim] = randomChoice(COVER_DIMENSION_VALUES[dim]);
      } else {
        const explored = new Set(dimPrefs.map(p => p.value));
        const unexplored = COVER_DIMENSION_VALUES[dim].filter(v => !explored.has(v));
        style[dim] = unexplored.length > 0
          ? randomChoice(unexplored)
          : dimPrefs.sort((a, b) => (a.win_count + a.loss_count) - (b.win_count + b.loss_count))[0].value;
      }
    } else {
      // Exploitation — sort by win_rate
      const sorted = [...dimPrefs].sort((a, b) => b.win_rate - a.win_rate);
      const rank = strategy === "exploit_top" ? 0 : Math.min(1, sorted.length - 1);
      style[dim] = sorted[rank]?.value || randomChoice(COVER_DIMENSION_VALUES[dim]);
    }
  }

  return style;
}

/** Apply RL style to Scene DNA */
function applyRLToScene(scene: SceneDNA, style: Record<CoverRLDimension, string>): SceneDNA {
  return {
    ...scene,
    expression: `${style.expression} expression — ${scene.mood}`,
    lighting: style.lighting_mood.replace(/_/g, " ") + " lighting",
    background: style.background_type.replace(/_/g, " ") + " — " + scene.background,
  };
}

// ── Gemini Image Generation ───────────────────────────────────

async function generateImage(
  prompt: string,
  photoPath: string | null,
  model: keyof typeof MODELS = "pro",
): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.startsWith("AIza")) return null;

  const ai = new GoogleGenAI({ apiKey });
  const modelId = MODELS[model];

  // Build contents with optional reference photo
  let contents: any;
  if (photoPath && existsSync(photoPath)) {
    const photoData = readFileSync(photoPath);
    const ext = photoPath.endsWith(".jpg") ? "jpeg" : "png";
    contents = [{
      role: "user",
      parts: [
        { inlineData: { mimeType: `image/${ext}`, data: photoData.toString("base64") } },
        { text: `Using this EXACT person (same face, same features), ${prompt}` },
      ],
    }];
  } else {
    contents = prompt;
  }

  const res = await ai.models.generateContent({
    model: modelId,
    contents,
    config: { responseModalities: ["IMAGE"] },
  });

  const parts = (res as any).candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return Buffer.from(part.inlineData.data, "base64");
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════
//  MCP Tool 1: whispercut_generate_cover
// ══════════════════════════════════════════════════════════════

export const generateCoverTool = {
  name: "whispercut_generate_cover",
  description:
    "Generate 4 AI TikTok cover variants using Nano Banana Pro. " +
    "Auto-selects Scene DNA (background, outfit, props) from topic. " +
    "RL-optimized per channel: A=top exploit, B=2nd exploit, C=explore, D=wild. " +
    "Returns 4 PNG file paths for inline selection. Quiet Luxury style by default.",
  inputSchema: {
    type: "object" as const,
    required: ["topic", "hook_lines"],
    properties: {
      topic: {
        type: "string",
        description: "Video topic (e.g. 'ลูกดูจอ 35 ชม./สัปดาห์ สมองเสียหาย')",
      },
      hook_lines: {
        type: "array",
        description: "Array of text lines: [{text, color, size}]. Colors: 'RED #CC3333', 'GOLD #D4A843', 'WHITE #F5F0E8'",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            color: { type: "string" },
            size: { type: "string" },
          },
        },
      },
      channel: {
        type: "string",
        description: "Channel name for per-channel RL (default: 'doctorwaleerat')",
      },
      photo_path: {
        type: "string",
        description: "Path to reference photo for face cloning",
      },
      model: {
        type: "string",
        description: "'pro' (Nano Banana Pro, $0.134) or 'flash' (Nano Banana, $0.039)",
        enum: ["pro", "flash"],
      },
      quiet_luxury: {
        type: "boolean",
        description: "Quiet Luxury style (default: true). False = Bold Viral style.",
      },
      lower_third: {
        type: "string",
        description: "Lower third text (e.g. '@doctorwaleerat')",
      },
    },
  },
};

export async function handleGenerateCover(args: {
  topic: string;
  hook_lines: Array<{ text: string; color: string; size: string }>;
  channel?: string;
  photo_path?: string;
  model?: "pro" | "flash";
  quiet_luxury?: boolean;
  lower_third?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const {
    topic,
    hook_lines,
    channel = "doctorwaleerat",
    photo_path,
    model = "pro",
    quiet_luxury = true,
    lower_third = "@doctorwaleerat",
  } = args;

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  // 1. Generate Scene DNA from topic
  const scene = await generateSceneDNA(topic);
  const category = detectTopicCategory(topic);

  // 1.5 Recall memory insights
  const memory = getMemoryLayer();
  const insights = await memory.recall({
    channel,
    topic,
    intent: `best cover style for ${category} topic`,
    limit: 5,
  });

  const memoryContext = memory.formatForPrompt(insights);
  if (memoryContext) {
    console.error(`[cover-design] Memory recalled ${insights.length} insights`);
  }

  // 2. Get per-channel RL preferences
  const prefs = await getChannelPreferences(channel);

  // 3. Build 4 variant styles (A=exploit, B=2nd, C=explore, D=wild)
  const strategies = ["exploit_top", "exploit_second", "explore", "wild"] as const;
  const labels = ["A-exploit", "B-second", "C-explore", "D-wild"];

  // 4. Generate all 4 covers
  const variants: Array<{
    label: string;
    strategy: string;
    style: Record<CoverRLDimension, string>;
    path: string | null;
    size_kb: number;
  }> = [];

  const genTimestamp = Date.now();

  for (let i = 0; i < 4; i++) {
    const strategy = strategies[i];
    const style = buildVariantStyle(prefs, strategy);
    const styledScene = applyRLToScene(scene, style);

    const prompt = buildCoverPrompt({
      topic,
      lines: hook_lines,
      scene: styledScene,
      channel,
      quietLuxury: quiet_luxury,
      lowerThird: lower_third,
      memoryContext,
    });

    try {
      const buf = await generateImage(prompt, photo_path || null, model);
      if (buf) {
        const path = join(OUT_DIR, `cover-${genTimestamp}-${labels[i]}.png`);
        writeFileSync(path, buf);
        variants.push({
          label: labels[i],
          strategy,
          style,
          path,
          size_kb: Math.round(buf.length / 1024),
        });
      } else {
        variants.push({ label: labels[i], strategy, style, path: null, size_kb: 0 });
      }
    } catch (e: any) {
      variants.push({ label: labels[i], strategy, style, path: null, size_kb: 0 });
    }
  }

  // 5. Save generation record to Supabase
  let generationId: number | null = null;
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("cover_generations")
      .insert({
        user_email: USER_EMAIL,
        channel,
        topic,
        category,
        hook_lines: JSON.stringify(hook_lines),
        scene_dna: JSON.stringify(scene),
        variants: JSON.stringify(variants),
        model,
        quiet_luxury,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    generationId = data?.id || null;
  } catch {
    // Supabase optional
  }

  const successful = variants.filter(v => v.path);
  const output = {
    generation_id: generationId,
    channel,
    topic,
    category,
    scene_dna: scene,
    model: MODELS[model],
    cost_per_image: model === "pro" ? "$0.134 (~4.50 THB)" : "$0.039 (~1.30 THB)",
    total_cost: model === "pro"
      ? `$${(successful.length * 0.134).toFixed(2)} (~${(successful.length * 4.5).toFixed(0)} THB)`
      : `$${(successful.length * 0.039).toFixed(2)} (~${(successful.length * 1.3).toFixed(0)} THB)`,
    variants: variants.map(v => ({
      label: v.label,
      strategy: v.strategy,
      expression: v.style.expression,
      lighting: v.style.lighting_mood,
      path: v.path,
      size_kb: v.size_kb,
    })),
    next_step: `View images inline, then call whispercut_select_cover with generation_id=${generationId} and selected="A-exploit" (or B/C/D)`,
  };

  return {
    content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
  };
}

// ══════════════════════════════════════════════════════════════
//  MCP Tool 2: whispercut_select_cover
// ══════════════════════════════════════════════════════════════

export const selectCoverAITool = {
  name: "whispercut_select_cover_ai",
  description:
    "Record user's cover selection → RL signal. " +
    "Selected variant gets +1, rejected get -0.25. " +
    "Per-channel RL preferences auto-update.",
  inputSchema: {
    type: "object" as const,
    required: ["generation_id", "selected"],
    properties: {
      generation_id: {
        type: "number",
        description: "Generation ID from whispercut_generate_cover",
      },
      selected: {
        type: "string",
        description: "Selected variant label: 'A-exploit', 'B-second', 'C-explore', or 'D-wild'",
      },
      channel: {
        type: "string",
        description: "Channel name (default: 'doctorwaleerat')",
      },
      feedback: {
        type: "string",
        description: "Optional feedback (e.g. 'หน้าเหมือนมาก', 'text เล็กไป')",
      },
    },
  },
};

export async function handleSelectCoverAI(args: {
  generation_id: number;
  selected: string;
  channel?: string;
  feedback?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { generation_id, selected, channel = "doctorwaleerat", feedback } = args;

  let updatedDimensions = 0;

  try {
    const supabase = getSupabase();

    // 1. Get generation record
    const { data: gen } = await supabase
      .from("cover_generations")
      .select("variants, topic")
      .eq("id", generation_id)
      .single();

    if (!gen) {
      return { content: [{ type: "text", text: `Generation ${generation_id} not found` }] };
    }

    const variants = JSON.parse(gen.variants);

    // 2. Update RL preferences for each dimension
    for (const variant of variants) {
      const isSelected = variant.label === selected;
      const delta = isSelected ? { wins: 1, losses: 0 } : { wins: 0, losses: 1 };

      for (const dim of COVER_RL_DIMENSIONS) {
        const value = variant.style?.[dim];
        if (!value) continue;

        await upsertCoverPreference(supabase, channel, dim, value, delta);
        updatedDimensions++;
      }
    }

    // 3.5 Store selection in memory layer
    try {
      const memory = getMemoryLayer();
      const selectedVariant = variants.find((v: any) => v.label === selected);

      if (selectedVariant?.style) {
        await memory.remember({
          type: "cover_selected",
          channel,
          topic: gen.topic || "unknown",
          data: {
            ...selectedVariant.style,
            feedback,
            rejected_count: variants.length - 1,
          },
        });

        for (const v of variants) {
          if (v.label !== selected && v.style) {
            await memory.remember({
              type: "cover_rejected",
              channel,
              topic: gen.topic || "unknown",
              data: { ...v.style, feedback: "not selected" },
            });
          }
        }
      }
    } catch (e: any) {
      console.error(`[cover-design] Memory remember failed: ${e.message}`);
    }

    // 3. Mark generation as selected
    await supabase
      .from("cover_generations")
      .update({
        selected_variant: selected,
        feedback,
        selected_at: new Date().toISOString(),
      })
      .eq("id", generation_id);

    // 4. Record training data for GRPO (Phase 3)
    try {
      await recordCoverSelection({
        channel,
        topic: gen.topic || "unknown",
        category: gen.topic ? "medical" : "unknown",
        variants: variants.map((v: any) => ({
          label: v.label,
          strategy: v.strategy || "unknown",
          style: v.style || {},
        })),
        selectedLabel: selected,
        model: "pro",
        quietLuxury: true,
        generationId: generation_id,
      });
    } catch (e: any) {
      console.error(`[cover-design] RL collector failed: ${e.message}`);
    }
  } catch (e: any) {
    return {
      content: [{ type: "text", text: `RL update error: ${e.message}. Selection noted locally.` }],
    };
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        status: "ok",
        generation_id,
        selected,
        channel,
        feedback,
        rl_dimensions_updated: updatedDimensions,
        message: `Selected ${selected}. RL updated ${updatedDimensions} dimensions for channel "${channel}".`,
      }, null, 2),
    }],
  };
}

async function upsertCoverPreference(
  supabase: any,
  channel: string,
  dimension: string,
  value: string,
  delta: { wins: number; losses: number },
) {
  const { data: existing } = await supabase
    .from("cover_preferences")
    .select("id, win_count, loss_count")
    .eq("channel", channel)
    .eq("dimension", dimension)
    .eq("value", value)
    .eq("user_email", USER_EMAIL)
    .maybeSingle();

  if (existing) {
    const newWins = existing.win_count + delta.wins;
    const newLosses = existing.loss_count + delta.losses;
    const total = newWins + newLosses;
    await supabase
      .from("cover_preferences")
      .update({
        win_count: newWins,
        loss_count: newLosses,
        win_rate: total > 0 ? newWins / total : 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    const total = delta.wins + delta.losses;
    await supabase.from("cover_preferences").insert({
      user_email: USER_EMAIL,
      channel,
      dimension,
      value,
      win_count: delta.wins,
      loss_count: delta.losses,
      win_rate: total > 0 ? delta.wins / total : 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}

// ══════════════════════════════════════════════════════════════
//  MCP Tool 3: whispercut_cover_preferences
// ══════════════════════════════════════════════════════════════

export const coverPrefsAITool = {
  name: "whispercut_cover_preferences_ai",
  description:
    "Show RL-learned cover style preferences per channel. " +
    "Shows top values for each dimension with win rates.",
  inputSchema: {
    type: "object" as const,
    required: [],
    properties: {
      channel: {
        type: "string",
        description: "Channel name (default: 'doctorwaleerat')",
      },
    },
  },
};

export async function handleCoverPrefsAI(args: {
  channel?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const channel = args.channel || "doctorwaleerat";
  const prefs = await getChannelPreferences(channel);

  const summary: Record<string, Array<{ value: string; win_rate: number; total: number }>> = {};

  for (const dim of COVER_RL_DIMENSIONS) {
    const sorted = [...prefs[dim]].sort((a, b) => b.win_rate - a.win_rate);
    summary[dim] = sorted.slice(0, 3).map(p => ({
      value: p.value,
      win_rate: Math.round(p.win_rate * 100),
      total: p.win_count + p.loss_count,
    }));
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        channel,
        dimensions: summary,
        total_selections: Object.values(prefs)
          .flat()
          .reduce((sum, p) => sum + p.win_count + p.loss_count, 0),
        message: Object.values(summary).every(s => s.length === 0)
          ? `No preferences learned yet for "${channel}". Generate and select covers to train RL.`
          : `Top preferences for "${channel}" shown. More data = better predictions.`,
      }, null, 2),
    }],
  };
}
