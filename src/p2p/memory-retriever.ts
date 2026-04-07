/**
 * Memory Retriever — Fetch collective knowledge before generation
 *
 * Called before vibe_engine generates a script.
 * Returns top memories as formatted prompt injection text.
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
);

export interface RetrievedMemory {
  id: number;
  memory_type: string;
  category: string;
  pattern: string;
  score: number;
  confidence: number;
  times_confirmed: number;
}

/**
 * Retrieve top memories matching topic/platform/vibe.
 * Returns formatted text ready for prompt injection.
 */
export async function retrieveMemories(params: {
  topic: string;
  platform?: string;
  vibe?: string;
  types?: string[];
  limit?: number;
}): Promise<{ memories: RetrievedMemory[]; promptText: string }> {
  const { topic, platform, vibe, types, limit = 5 } = params;

  // Build tags from topic keywords
  const tags = topic
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7Fก-๙ ]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 5);

  if (platform) tags.push(platform);
  if (vibe) tags.push(vibe);

  // Query with tag overlap + confidence filter
  let query = supabase
    .from("shared_memories")
    .select("id, memory_type, category, pattern, score, confidence, times_confirmed, times_used")
    .eq("status", "active")
    .gt("confidence", 0.3)
    .overlaps("tags", tags)
    .order("confidence", { ascending: false })
    .limit(limit);

  if (types && types.length > 0) {
    query = query.in("memory_type", types);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return { memories: [], promptText: "" };
  }

  // Sort by composite score: confidence * score * log(confirmed + 1)
  const sorted = data
    .map(m => ({
      ...m,
      composite: m.confidence * m.score * Math.log(m.times_confirmed + 2),
    }))
    .sort((a, b) => b.composite - a.composite)
    .slice(0, limit);

  // Mark as used (update one by one)
  for (const m of sorted) {
    await supabase
      .from("shared_memories")
      .update({ times_used: (m.times_used ?? 0) + 1 })
      .eq("id", m.id);
  }

  // Format for prompt injection
  const lines = sorted.map((m, i) => {
    const conf = (m.confidence * 100).toFixed(0);
    return `${i + 1}. [${m.category}] ${m.pattern} (confidence: ${conf}%, confirmed ${m.times_confirmed}x)`;
  });

  const networkStats = await getNetworkStats();

  const promptText = sorted.length > 0
    ? `NETWORK KNOWLEDGE (from ${networkStats.contributors} creators, ${networkStats.total_memories} memories):\n${lines.join("\n")}\n\nUse these insights to inform your script. Prioritize higher-confidence patterns.`
    : "";

  return {
    memories: sorted.map(m => ({
      id: m.id,
      memory_type: m.memory_type,
      category: m.category,
      pattern: m.pattern,
      score: m.score,
      confidence: m.confidence,
      times_confirmed: m.times_confirmed,
    })),
    promptText,
  };
}

/** Get network-level stats */
async function getNetworkStats(): Promise<{
  contributors: number;
  total_memories: number;
}> {
  const { count: total } = await supabase
    .from("shared_memories")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  const { data: contributors } = await supabase
    .from("shared_memories")
    .select("contributed_by")
    .eq("status", "active");

  const uniqueContributors = new Set(contributors?.map(c => c.contributed_by)).size;

  return {
    contributors: uniqueContributors,
    total_memories: total ?? 0,
  };
}
