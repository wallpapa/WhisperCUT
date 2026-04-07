/**
 * Canva Cover Image Generator with Reinforcement Learning
 *
 * Generates 3 cover image variants using Canva Autofill API,
 * then learns user preferences via epsilon-greedy RL from selections.
 *
 * Variants:
 *   A — Top RL-preferred style (exploitation)
 *   B — Second-best style (exploitation)
 *   C — Random/underexplored style (exploration, epsilon=0.20)
 *
 * If Canva API is not configured, returns text-only variant descriptions
 * so the RL loop still learns from user selections.
 *
 * Environment:
 *   CANVA_ACCESS_TOKEN  — OAuth token for Canva Connect API
 *   CANVA_TEMPLATE_ID   — Brand template ID with autofill fields
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!,
);

const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";

const CANVA_API_BASE = "https://api.canva.com/rest/v1";
const CANVA_POLL_INTERVAL_MS = 2_000;
const CANVA_POLL_TIMEOUT_MS = 60_000;

// ── RL Dimensions ───────────────────────────────────────────────

export type RLDimension =
  | "hook_style"
  | "color"
  | "emoji_use"
  | "text_density"
  | "layout";

const RL_DIMENSIONS: RLDimension[] = [
  "hook_style",
  "color",
  "emoji_use",
  "text_density",
  "layout",
];

/** Value pools per RL dimension — exploration draws from these */
const DIMENSION_VALUES: Record<RLDimension, string[]> = {
  hook_style: [
    "question",
    "bold_claim",
    "statistic",
    "curiosity_gap",
    "how_to",
    "listicle",
    "shock",
    "relatable",
  ],
  color: [
    "#FF4444",
    "#FF8C00",
    "#FFD700",
    "#4CAF50",
    "#2196F3",
    "#9C27B0",
    "#000000",
    "#FFFFFF",
    "#FF69B4",
    "#00CED1",
  ],
  emoji_use: ["none", "minimal", "moderate", "heavy"],
  text_density: ["minimal", "medium", "dense"],
  layout: [
    "center_text",
    "top_hook",
    "bottom_hook",
    "split_left",
    "split_right",
    "overlay",
  ],
};

const EPSILON = 0.20; // 20% exploration

// ── Types ───────────────────────────────────────────────────────

export interface CoverVariant {
  id: "a" | "b" | "c";
  style: Record<RLDimension, string>;
  hook_text: string;
  bg_color: string;
  emoji: string;
  description: string;
  canva_url?: string;
  image_url?: string;
}

export interface GenerateCoverResult {
  generation_id?: number;
  canva_configured: boolean;
  variants: CoverVariant[];
}

export interface SelectionResult {
  updated_preferences: number;
}

export interface StylePreference {
  dimension: RLDimension;
  value: string;
  win_count: number;
  loss_count: number;
  win_rate: number;
}

interface RLPreferenceRow {
  dimension: string;
  value: string;
  win_count: number;
  loss_count: number;
  win_rate: number;
  context_category: string | null;
  context_platform: string | null;
}

interface CanvaAutofillJob {
  id: string;
  status: string;
  result?: {
    design?: {
      id: string;
      url: string;
    };
  };
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Check if Canva API credentials are configured.
 */
export function hasCanva(): boolean {
  return !!(process.env.CANVA_ACCESS_TOKEN && process.env.CANVA_TEMPLATE_ID);
}

/**
 * Generate 3 cover image variants using RL-informed styles.
 *
 * Variant A: top RL-preferred style (exploitation)
 * Variant B: second-best style (exploitation)
 * Variant C: random/underexplored style (exploration — epsilon-greedy 20%)
 */
export async function generateCoverVariants(params: {
  topic: string;
  hook_text?: string;
  vibe?: string;
}): Promise<GenerateCoverResult> {
  const { topic, hook_text, vibe } = params;

  // Load RL preferences to weight variant generation
  const preferences = await getStylePreferences();

  // Generate 3 variant style sets
  const styleA = buildExploitStyle(preferences, 0);
  const styleB = buildExploitStyle(preferences, 1);
  const styleC = buildExploreStyle(preferences);

  const hookA = hook_text || buildHookText(topic, styleA.hook_style, vibe);
  const hookB = hook_text || buildHookText(topic, styleB.hook_style, vibe);
  const hookC = hook_text || buildHookText(topic, styleC.hook_style, vibe);

  const emojiA = pickEmoji(styleA.emoji_use, topic);
  const emojiB = pickEmoji(styleB.emoji_use, topic);
  const emojiC = pickEmoji(styleC.emoji_use, topic);

  const variants: CoverVariant[] = [
    {
      id: "a",
      style: styleA,
      hook_text: hookA,
      bg_color: styleA.color,
      emoji: emojiA,
      description: describeVariant("A", styleA, hookA, emojiA),
    },
    {
      id: "b",
      style: styleB,
      hook_text: hookB,
      bg_color: styleB.color,
      emoji: emojiB,
      description: describeVariant("B", styleB, hookB, emojiB),
    },
    {
      id: "c",
      style: styleC,
      hook_text: hookC,
      bg_color: styleC.color,
      emoji: emojiC,
      description: describeVariant("C (exploration)", styleC, hookC, emojiC),
    },
  ];

  // If Canva API is configured, generate actual images in parallel
  if (hasCanva()) {
    const canvaResults = await Promise.allSettled(
      variants.map((v) => createCanvaAutofill(v)),
    );

    for (let i = 0; i < canvaResults.length; i++) {
      const result = canvaResults[i];
      if (result.status === "fulfilled" && result.value) {
        variants[i].canva_url = result.value.designUrl;
        variants[i].image_url = result.value.imageUrl;
      } else if (result.status === "rejected") {
        console.error(
          `[canva] Variant ${variants[i].id} generation failed:`,
          result.reason,
        );
      }
    }
  }

  return {
    canva_configured: hasCanva(),
    variants,
  };
}

/**
 * Record which variant the user selected and update RL preferences.
 *
 * For each RL dimension, the selected variant's value wins against
 * the rejected variants' values. This updates win/loss counts and
 * recalculates win_rate in rl_preferences.
 */
export async function recordSelection(params: {
  generation_id: number;
  selected: "a" | "b" | "c";
  rejection_reasons?: string;
}): Promise<SelectionResult> {
  const { generation_id, selected, rejection_reasons } = params;

  // Fetch the generation row to get variant styles
  const { data: gen, error: fetchErr } = await supabase
    .from("image_generations")
    .select("*")
    .eq("id", generation_id)
    .single();

  if (fetchErr || !gen) {
    throw new Error(
      `Generation ${generation_id} not found: ${fetchErr?.message ?? "no data"}`,
    );
  }

  const variants = gen.variants as CoverVariant[];
  const selectedVariant = variants.find((v) => v.id === selected);
  const rejectedVariants = variants.filter((v) => v.id !== selected);

  if (!selectedVariant) {
    throw new Error(`Variant '${selected}' not found in generation`);
  }

  // Update the generation record
  await supabase
    .from("image_generations")
    .update({
      selected,
      selected_by: USER_EMAIL,
      selected_at: new Date().toISOString(),
      rejection_reasons: rejection_reasons ?? null,
    })
    .eq("id", generation_id);

  // Extract RL preference signals: selected wins vs rejected for each dimension
  let updatedCount = 0;

  for (const dim of RL_DIMENSIONS) {
    const winValue = selectedVariant.style[dim];

    // Collect unique rejected values for this dimension
    const loseSet = new Set<string>();
    for (const rv of rejectedVariants) {
      if (rv.style[dim] !== winValue) {
        loseSet.add(rv.style[dim]);
      }
    }
    const loseValues = Array.from(loseSet);

    // Increment wins for the selected value
    await upsertPreference(dim, winValue, { wins: 1, losses: 0 });
    updatedCount++;

    // Increment losses for each rejected value
    for (const lv of loseValues) {
      await upsertPreference(dim, lv, { wins: 0, losses: 1 });
      updatedCount++;
    }
  }

  return { updated_preferences: updatedCount };
}

/**
 * Get current RL style preferences, ranked by win_rate per dimension.
 * Used internally by generateCoverVariants to weight style generation.
 */
export async function getStylePreferences(context?: {
  topic_category?: string;
  platform?: string;
}): Promise<Record<RLDimension, StylePreference[]>> {
  let query = supabase
    .from("rl_preferences")
    .select("dimension, value, win_count, loss_count, win_rate")
    .order("win_rate", { ascending: false });

  if (context?.topic_category) {
    query = query.or(
      `context_category.eq.${context.topic_category},context_category.is.null`,
    );
  }
  if (context?.platform) {
    query = query.or(
      `context_platform.eq.${context.platform},context_platform.is.null`,
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error(`[canva-rl] Failed to load preferences: ${error.message}`);
  }

  const rows = (data ?? []) as RLPreferenceRow[];

  // Group by dimension
  const result: Record<RLDimension, StylePreference[]> = {
    hook_style: [],
    color: [],
    emoji_use: [],
    text_density: [],
    layout: [],
  };

  for (const row of rows) {
    const dim = row.dimension as RLDimension;
    if (RL_DIMENSIONS.includes(dim)) {
      result[dim].push({
        dimension: dim,
        value: row.value,
        win_count: row.win_count,
        loss_count: row.loss_count,
        win_rate: row.win_rate,
      });
    }
  }

  return result;
}

// ── Style Builders ──────────────────────────────────────────────

/**
 * Build an exploitation style from the top-N ranked preferences.
 * rank=0 → top preferred, rank=1 → second-best, etc.
 */
function buildExploitStyle(
  prefs: Record<RLDimension, StylePreference[]>,
  rank: number,
): Record<RLDimension, string> {
  const style: Partial<Record<RLDimension, string>> = {};

  for (const dim of RL_DIMENSIONS) {
    const ranked = prefs[dim];
    if (ranked.length > rank) {
      style[dim] = ranked[rank].value;
    } else if (ranked.length > 0) {
      // Fall back to best available
      style[dim] = ranked[ranked.length - 1].value;
    } else {
      // No preferences yet — random default
      style[dim] = randomChoice(DIMENSION_VALUES[dim]);
    }
  }

  return style as Record<RLDimension, string>;
}

/**
 * Build an exploration style using epsilon-greedy.
 * Each dimension has EPSILON chance of being purely random,
 * otherwise picks a less-explored value (fewest total appearances).
 */
function buildExploreStyle(
  prefs: Record<RLDimension, StylePreference[]>,
): Record<RLDimension, string> {
  const style: Partial<Record<RLDimension, string>> = {};

  for (const dim of RL_DIMENSIONS) {
    if (Math.random() < EPSILON || prefs[dim].length === 0) {
      // Pure random exploration
      style[dim] = randomChoice(DIMENSION_VALUES[dim]);
    } else {
      // Pick least-explored value from pool that has data
      const exploredValues = new Set(prefs[dim].map((p) => p.value));
      const unexplored = DIMENSION_VALUES[dim].filter(
        (v) => !exploredValues.has(v),
      );

      if (unexplored.length > 0) {
        // Prefer completely unexplored values
        style[dim] = randomChoice(unexplored);
      } else {
        // All explored — pick the one with fewest total comparisons
        const sorted = [...prefs[dim]].sort(
          (a, b) =>
            a.win_count + a.loss_count - (b.win_count + b.loss_count),
        );
        style[dim] = sorted[0].value;
      }
    }
  }

  return style as Record<RLDimension, string>;
}

// ── Canva API Integration ───────────────────────────────────────

interface CanvaDesignResult {
  designUrl: string;
  imageUrl?: string;
}

/**
 * Create a Canva autofill job for one variant and poll until complete.
 */
async function createCanvaAutofill(
  variant: CoverVariant,
): Promise<CanvaDesignResult | null> {
  const token = process.env.CANVA_ACCESS_TOKEN!;
  const templateId = process.env.CANVA_TEMPLATE_ID!;

  // Build autofill data from variant properties
  const autofillData: Record<string, unknown> = {
    hook_text: `${variant.emoji} ${variant.hook_text}`.trim(),
    subtitle: variant.description,
    bg_color: variant.bg_color,
  };

  // Submit autofill job
  const submitRes = await fetch(`${CANVA_API_BASE}/autofills`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      brand_template_id: templateId,
      data: autofillData,
    }),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`Canva autofill submit failed (${submitRes.status}): ${errText}`);
  }

  const submitBody = (await submitRes.json()) as { job: CanvaAutofillJob };
  const jobId = submitBody.job.id;

  // Poll for completion
  const deadline = Date.now() + CANVA_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(CANVA_POLL_INTERVAL_MS);

    const pollRes = await fetch(`${CANVA_API_BASE}/autofills/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!pollRes.ok) {
      console.error(
        `[canva] Poll failed (${pollRes.status}) for job ${jobId}`,
      );
      continue;
    }

    const pollBody = (await pollRes.json()) as { job: CanvaAutofillJob };
    const job = pollBody.job;

    if (job.status === "success" && job.result?.design) {
      return {
        designUrl: job.result.design.url,
        imageUrl: job.result.design.url, // Canva design URL is the image
      };
    }

    if (job.status === "failed") {
      console.error(`[canva] Autofill job ${jobId} failed`);
      return null;
    }
  }

  console.error(`[canva] Autofill job ${jobId} timed out`);
  return null;
}

// ── Supabase RL Helpers ─────────────────────────────────────────

/**
 * Upsert a preference row: increment win/loss counts, recalculate win_rate.
 */
async function upsertPreference(
  dimension: RLDimension,
  value: string,
  delta: { wins: number; losses: number },
): Promise<void> {
  // Try to fetch existing row
  const { data: existing } = await supabase
    .from("rl_preferences")
    .select("id, win_count, loss_count")
    .eq("dimension", dimension)
    .eq("value", value)
    .eq("user_email", USER_EMAIL)
    .maybeSingle();

  if (existing) {
    const newWins = existing.win_count + delta.wins;
    const newLosses = existing.loss_count + delta.losses;
    const total = newWins + newLosses;
    const winRate = total > 0 ? newWins / total : 0;

    await supabase
      .from("rl_preferences")
      .update({
        win_count: newWins,
        loss_count: newLosses,
        win_rate: winRate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    const total = delta.wins + delta.losses;
    const winRate = total > 0 ? delta.wins / total : 0;

    await supabase.from("rl_preferences").insert({
      user_email: USER_EMAIL,
      dimension,
      value,
      win_count: delta.wins,
      loss_count: delta.losses,
      win_rate: winRate,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}

// ── Utility Helpers ─────────────────────────────────────────────

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a hook text variation based on style and topic.
 */
function buildHookText(
  topic: string,
  hookStyle: string,
  vibe?: string,
): string {
  const vibeTag = vibe ? ` [${vibe}]` : "";

  switch (hookStyle) {
    case "question":
      return `${topic} — คุณรู้หรือยัง?${vibeTag}`;
    case "bold_claim":
      return `${topic} เปลี่ยนทุกอย่าง${vibeTag}`;
    case "statistic":
      return `${topic} — ตัวเลขที่คุณต้องรู้${vibeTag}`;
    case "curiosity_gap":
      return `สิ่งที่ไม่มีใครบอกเรื่อง ${topic}${vibeTag}`;
    case "how_to":
      return `วิธีทำ ${topic} ให้สำเร็จ${vibeTag}`;
    case "listicle":
      return `5 เรื่องที่ต้องรู้เกี่ยวกับ ${topic}${vibeTag}`;
    case "shock":
      return `${topic} — ช็อคแน่นอน!${vibeTag}`;
    case "relatable":
      return `ใครเคยเป็นแบบนี้กับ ${topic} บ้าง?${vibeTag}`;
    default:
      return `${topic}${vibeTag}`;
  }
}

/**
 * Pick emoji(s) based on density preference and topic.
 */
function pickEmoji(emojiUse: string, _topic: string): string {
  const emojis = [
    "🔥", "💡", "🚀", "✨", "📌", "🎯", "💪", "⚡", "🏆", "📈",
  ];

  switch (emojiUse) {
    case "none":
      return "";
    case "minimal":
      return randomChoice(emojis);
    case "moderate":
      return `${randomChoice(emojis)}${randomChoice(emojis)}`;
    case "heavy":
      return `${randomChoice(emojis)}${randomChoice(emojis)}${randomChoice(emojis)}`;
    default:
      return randomChoice(emojis);
  }
}

/**
 * Build a human-readable description of a variant's style choices.
 */
function describeVariant(
  label: string,
  style: Record<RLDimension, string>,
  hookText: string,
  emoji: string,
): string {
  return [
    `[Variant ${label}]`,
    `Hook: "${emoji} ${hookText}".trim()`,
    `Style: ${style.hook_style} | Color: ${style.color} | Emoji: ${style.emoji_use}`,
    `Text density: ${style.text_density} | Layout: ${style.layout}`,
  ].join("\n");
}
