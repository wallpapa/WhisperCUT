/**
 * MCP Tool Handlers — Canva Cover Image Generation with RL
 *
 * whispercut_generate_covers   — Generate 3 cover variants (RL-weighted)
 * whispercut_select_cover      — Record user selection, update RL preferences
 * whispercut_cover_preferences — View current learned style preferences
 */

import { createClient } from "@supabase/supabase-js";
import {
  generateCoverVariants,
  recordSelection,
  getStylePreferences,
  hasCanva,
  type CoverVariant,
  type RLDimension,
  type StylePreference,
} from "../../p2p/canva-generator.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!,
);

const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";

// ── whispercut_generate_covers ──────────────────────────────────

export const generateCoversTool = {
  name: "whispercut_generate_covers",
  description:
    "Generate 3 cover image variants for a topic using RL-learned style preferences. " +
    "Variant A = top preferred style, B = second-best, C = exploration (new styles). " +
    "If Canva API is configured, generates actual images. Otherwise returns text descriptions. " +
    "After reviewing, use whispercut_select_cover to record your choice — this trains the RL model.",
  inputSchema: {
    type: "object" as const,
    required: ["topic"],
    properties: {
      topic: {
        type: "string",
        description: "The topic or title of the cover image",
      },
      hook_text: {
        type: "string",
        description:
          "Custom hook text to use on the cover. If omitted, auto-generated based on RL-preferred hook style.",
      },
      vibe: {
        type: "string",
        description:
          "Vibe/mood for the cover (e.g. 'playful', 'professional', 'urgent', 'educational')",
      },
    },
  },
};

export async function handleGenerateCovers(args: {
  topic: string;
  hook_text?: string;
  vibe?: string;
}): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const { topic, hook_text, vibe } = args;

  const result = await generateCoverVariants({ topic, hook_text, vibe });

  // Save generation to image_generations table
  const { data: row, error: insertErr } = await supabase
    .from("image_generations")
    .insert({
      user_email: USER_EMAIL,
      topic,
      hook_text: hook_text ?? null,
      vibe: vibe ?? null,
      variants: result.variants,
      canva_configured: result.canva_configured,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error(
      `[canva-tool] Failed to save generation: ${insertErr.message}`,
    );
  }

  const generationId = row?.id as number | undefined;

  // Format output for the user
  const variantSummaries = result.variants.map((v: CoverVariant) => {
    const lines: string[] = [
      `--- Variant ${v.id.toUpperCase()} ---`,
      v.description,
    ];

    if (v.canva_url) {
      lines.push(`Canva design: ${v.canva_url}`);
    }
    if (v.image_url) {
      lines.push(`Image: ${v.image_url}`);
    }

    return lines.join("\n");
  });

  const output = {
    generation_id: generationId,
    canva_configured: result.canva_configured,
    instruction: result.canva_configured
      ? "Review the 3 variants above. Use whispercut_select_cover with the generation_id and your chosen variant (a/b/c) to train the RL model."
      : "Canva API not configured — showing text descriptions only. You can still select a preferred style to train the RL model.",
    variants: variantSummaries,
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(output, null, 2),
      },
    ],
  };
}

// ── whispercut_select_cover ─────────────────────────────────────

export const selectCoverTool = {
  name: "whispercut_select_cover",
  description:
    "Record which cover variant the user selected. " +
    "This updates the RL preference model: the selected style WINS against rejected styles " +
    "across 5 dimensions (hook_style, color, emoji_use, text_density, layout). " +
    "Over time, future generations will favor the user's preferred styles.",
  inputSchema: {
    type: "object" as const,
    required: ["generation_id", "selected"],
    properties: {
      generation_id: {
        type: "number",
        description: "The generation_id returned by whispercut_generate_covers",
      },
      selected: {
        type: "string",
        enum: ["a", "b", "c"],
        description:
          "Which variant was selected: 'a' (top preferred), 'b' (second-best), 'c' (exploration)",
      },
      reason: {
        type: "string",
        description:
          "Optional reason why this variant was preferred or why others were rejected",
      },
    },
  },
};

export async function handleSelectCover(args: {
  generation_id: number;
  selected: "a" | "b" | "c";
  reason?: string;
}): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const { generation_id, selected, reason } = args;

  const result = await recordSelection({
    generation_id,
    selected,
    rejection_reasons: reason,
  });

  const explorationSelected = selected === "c";
  const rlMessage = explorationSelected
    ? "Interesting! You selected the exploration variant. The RL model will incorporate this new style preference."
    : `Selection recorded. The RL model updated ${result.updated_preferences} preference signals.`;

  const output = {
    selected: selected.toUpperCase(),
    preferences_updated: result.updated_preferences,
    exploration_selected: explorationSelected,
    message: rlMessage,
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(output, null, 2),
      },
    ],
  };
}

// ── whispercut_cover_preferences ────────────────────────────────

export const coverPreferencesTool = {
  name: "whispercut_cover_preferences",
  description:
    "Show current RL-learned style preferences for cover image generation. " +
    "Displays what the system has learned about the user's preferred hook style, " +
    "color palette, emoji usage, text density, and layout — ranked by win rate.",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
};

export async function handleCoverPreferences(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const preferences = await getStylePreferences();
  const canvaStatus = hasCanva();

  // Format preferences per dimension
  const dimensions: RLDimension[] = [
    "hook_style",
    "color",
    "emoji_use",
    "text_density",
    "layout",
  ];

  const formatted: Record<
    string,
    Array<{
      value: string;
      win_rate: string;
      wins: number;
      losses: number;
      total: number;
    }>
  > = {};

  let totalSelections = 0;

  for (const dim of dimensions) {
    const prefs = preferences[dim];
    formatted[dim] = prefs.map((p: StylePreference) => {
      const total = p.win_count + p.loss_count;
      totalSelections += total;
      return {
        value: p.value,
        win_rate: `${(p.win_rate * 100).toFixed(0)}%`,
        wins: p.win_count,
        losses: p.loss_count,
        total,
      };
    });
  }

  // Deduplicate total count (each selection touches all 5 dimensions)
  const estimatedSelections = Math.round(totalSelections / (dimensions.length * 2));

  const output = {
    canva_configured: canvaStatus,
    total_estimated_selections: estimatedSelections,
    preferences: formatted,
    explanation:
      "Each dimension shows values ranked by win_rate. " +
      "When you select a cover variant, the chosen style wins against rejected styles. " +
      "Variant A uses top preferences (exploitation), Variant C explores new styles (20% epsilon-greedy).",
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(output, null, 2),
      },
    ],
  };
}
