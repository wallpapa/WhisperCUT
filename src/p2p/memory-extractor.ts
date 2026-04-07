/**
 * Memory Extractor — Auto-extract patterns from production results
 *
 * Called after: vibe_edit, feedback, study
 * Creates 2-3 shared_memories per production event
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
);

const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";

interface MemoryEntry {
  memory_type: "content_pattern" | "audience_insight" | "production_technique";
  category: string;
  pattern: string;
  context: Record<string, unknown>;
  score: number;
  tags: string[];
}

/** Extract memories from vibe_edit result */
export async function extractFromVibeEdit(result: {
  script: {
    topic: string;
    vibe: string;
    platform: string;
    duration_sec: number;
    segments: Array<{
      label: string;
      hormone: string;
      cut_rate: number;
      transition_in: string;
    }>;
    hook_text: string;
    cta_primary: string;
  };
  hook_score: { taxonomy: string; overall: number };
  cta_recommendation: { type: string; conversion_rate: number };
  quality_passed: boolean;
}): Promise<number> {
  const memories: MemoryEntry[] = [];
  const { script, hook_score, cta_recommendation } = result;

  // Extract topic keywords as tags
  const tags = extractTags(script.topic, script.platform, script.vibe);

  // 1. Hook pattern
  if (hook_score.overall >= 6) {
    memories.push({
      memory_type: "content_pattern",
      category: "hook",
      pattern: `${hook_score.taxonomy} hook scored ${hook_score.overall}/10: "${script.hook_text.slice(0, 80)}"`,
      context: {
        topic: script.topic,
        platform: script.platform,
        vibe: script.vibe,
        taxonomy: hook_score.taxonomy,
      },
      score: hook_score.overall,
      tags: [...tags, "hook", hook_score.taxonomy.toLowerCase()],
    });
  }

  // 2. CTA pattern
  memories.push({
    memory_type: "content_pattern",
    category: "cta",
    pattern: `${cta_recommendation.type} CTA (${(cta_recommendation.conversion_rate * 100).toFixed(1)}%): "${script.cta_primary.slice(0, 60)}"`,
    context: {
      platform: script.platform,
      vibe: script.vibe,
      cta_type: cta_recommendation.type,
    },
    score: cta_recommendation.conversion_rate * 10,
    tags: [...tags, "cta", cta_recommendation.type.toLowerCase()],
  });

  // 3. Production technique (pacing + transitions)
  const pacingPattern = script.segments
    .map(s => `${s.label}(${s.cut_rate}/s)`)
    .join(" → ");

  memories.push({
    memory_type: "production_technique",
    category: "pacing",
    pattern: `${script.vibe} ${script.duration_sec}s pacing: ${pacingPattern}`,
    context: {
      vibe: script.vibe,
      duration_sec: script.duration_sec,
      platform: script.platform,
      transitions: script.segments.map(s => s.transition_in),
    },
    score: result.quality_passed ? 8 : 5,
    tags: [...tags, "pacing", `${script.duration_sec}s`],
  });

  return insertMemories(memories);
}

/** Extract memories from feedback/scoring result */
export async function extractFromFeedback(result: {
  final_score: { hook_score: number; cta_score: number; pacing_score: number; engagement_score: number };
  improved: boolean;
  iterations: Array<{ changes?: string[] }>;
}, topic: string, platform: string): Promise<number> {
  const memories: MemoryEntry[] = [];
  const tags = extractTags(topic, platform);
  const { final_score } = result;

  // Extract what improvements worked
  if (result.improved) {
    const allChanges = result.iterations
      .flatMap(i => i.changes || [])
      .slice(0, 5);

    if (allChanges.length > 0) {
      memories.push({
        memory_type: "content_pattern",
        category: "improvement",
        pattern: `Improvements that raised score: ${allChanges.join("; ")}`,
        context: { topic, platform, final_scores: final_score },
        score: (final_score.hook_score + final_score.engagement_score) / 2,
        tags: [...tags, "improvement", "feedback"],
      });
    }
  }

  return insertMemories(memories);
}

/** Extract memories from study (channel analysis) result */
export async function extractFromStudy(result: {
  channel: string;
  template: Record<string, unknown>;
  video_count: number;
}): Promise<number> {
  const memories: MemoryEntry[] = [];
  const tags = [result.channel.replace("@", ""), "study", "channel"];
  const template = result.template as Record<string, unknown>;

  // Audience insight from channel study
  memories.push({
    memory_type: "audience_insight",
    category: "timing",
    pattern: `Channel ${result.channel} (${result.video_count} videos analyzed) — style template extracted`,
    context: {
      channel: result.channel,
      video_count: result.video_count,
      hook_patterns: template.hook_patterns,
      cta_patterns: template.cta_patterns,
    },
    score: Math.min(result.video_count / 10, 10),
    tags,
  });

  return insertMemories(memories);
}

/** Extract memories from research/topic discovery */
export async function extractFromResearch(params: {
  topic: string;
  research_doi: string;
  research_title: string;
  research_year: number;
  research_journal: string;
  hook: string;
  content_type: string;
  angle: string;
}): Promise<number> {
  const tags = extractTags(params.topic, "tiktok");

  return insertMemories([{
    memory_type: "content_pattern",
    category: "research",
    pattern: `Research: "${params.research_title}" (${params.research_year}) → Hook: "${params.hook.slice(0, 80)}" — ${params.angle.slice(0, 100)}`,
    context: {
      topic: params.topic,
      doi: params.research_doi,
      journal: params.research_journal,
      year: params.research_year,
      content_type: params.content_type,
      hook: params.hook,
      angle: params.angle,
    },
    score: 7,
    tags: [...tags, "research", params.content_type.toLowerCase()],
  }]);
}

// ── Helpers ──────────────────────────────────────────────────────

function extractTags(topic: string, platform?: string, vibe?: string): string[] {
  const tags: string[] = [];
  if (platform) tags.push(platform);
  if (vibe) tags.push(vibe);

  // Simple Thai/English keyword extraction
  const keywords = topic
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7Fก-๙ ]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2);
  tags.push(...keywords.slice(0, 5));

  return [...new Set(tags)];
}

async function insertMemories(memories: MemoryEntry[]): Promise<number> {
  if (memories.length === 0) return 0;

  const rows = memories.map(m => ({
    ...m,
    contributed_by: USER_EMAIL,
    confidence: 0.3,
    status: "active",
  }));

  const { error } = await supabase.from("shared_memories").insert(rows);
  if (error) {
    console.error(`[memory-extractor] Insert failed: ${error.message}`);
    return 0;
  }

  console.error(`[memory-extractor] Extracted ${memories.length} memories`);
  return memories.length;
}
