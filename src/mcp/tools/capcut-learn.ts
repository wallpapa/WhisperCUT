/**
 * whispercut_learn_from_capcut — Import CapCut draft → analyze editing patterns → save to memory
 */

import { analyzeCapCutDraft, analyzeCapCutFolder, summarizePatterns, type EditingPattern } from "../../engine/capcut-analyzer.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
);

const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";

export const learnFromCapCutTool = {
  name: "whispercut_learn_from_capcut",
  description:
    "Import CapCut draft_content.json files → analyze editing patterns (cuts, pacing, text overlays, transitions, music) " +
    "→ save patterns to shared memory network. " +
    "Provide a file path to a single draft_content.json OR a folder path to analyze all drafts recursively. " +
    "The system learns: cuts/min, clip duration, text density, pacing rhythm, transition style.",
  inputSchema: {
    type: "object" as const,
    required: ["path"],
    properties: {
      path: {
        type: "string",
        description: "Path to draft_content.json file OR folder containing CapCut drafts",
      },
      save_to_memory: {
        type: "boolean",
        description: "Save extracted patterns to shared memory network (default: true)",
      },
    },
  },
};

export async function handleLearnFromCapCut(args: { path: string; save_to_memory?: boolean }) {
  const { path, save_to_memory = true } = args;
  const isFolder = !path.endsWith(".json");

  let patterns: EditingPattern[];

  try {
    if (isFolder) {
      patterns = analyzeCapCutFolder(path);
      if (patterns.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "No draft_content.json files found in folder",
              path,
              hint: "CapCut Desktop stores drafts in ~/Movies/CapCut/User Data/Projects/. Each project has a draft_content.json.",
            }, null, 2),
          }],
        };
      }
    } else {
      patterns = [analyzeCapCutDraft(path)];
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          error: msg,
          hint: "Export from CapCut Desktop: File → Export Project → draft_content.json. Or provide path to CapCut project folder.",
          capcut_paths: {
            mac: "~/Movies/CapCut/User Data/Projects/",
            windows: "C:\\Users\\<user>\\AppData\\Local\\CapCut\\User Data\\Projects\\",
          },
        }, null, 2),
      }],
    };
  }

  const summary = summarizePatterns(patterns);

  // Save to shared memory
  let memoriesSaved = 0;
  if (save_to_memory && patterns.length > 0) {
    const memories = [];

    // Pattern 1: Overall editing style
    memories.push({
      memory_type: "production_technique",
      category: "capcut_editing",
      pattern: `CapCut editing style (${summary.total_projects} projects): ${summary.avg_cuts_per_min} cuts/min, ${summary.avg_clip_duration_sec}s avg clip, ${summary.avg_text_density_per_min} text overlays/min, pacing: ${summary.common_pacing}`,
      context: { summary, source: "capcut_import" },
      score: 8.0,
      confidence: 0.6,
      contributed_by: USER_EMAIL,
      tags: ["capcut", "editing", "pacing", "production"],
      status: "active",
    });

    // Pattern 2: Pacing profile
    if (summary.common_pacing !== "unknown") {
      memories.push({
        memory_type: "production_technique",
        category: "pacing",
        pattern: `Preferred pacing rhythm: ${summary.common_pacing} — from ${summary.total_projects} real CapCut projects`,
        context: { pacing: summary.common_pacing, source: "capcut_import" },
        score: 7.5,
        confidence: 0.5,
        contributed_by: USER_EMAIL,
        tags: ["pacing", "capcut", "rhythm"],
        status: "active",
      });
    }

    // Pattern 3: Text overlay density
    if (summary.avg_text_density_per_min > 0) {
      memories.push({
        memory_type: "production_technique",
        category: "text_overlay",
        pattern: `Text overlay density: ${summary.avg_text_density_per_min}/min — ${summary.music_usage_pct}% of projects use background music`,
        context: { text_density: summary.avg_text_density_per_min, music_pct: summary.music_usage_pct, source: "capcut_import" },
        score: 7.0,
        confidence: 0.5,
        contributed_by: USER_EMAIL,
        tags: ["text", "overlay", "capcut", "density"],
        status: "active",
      });
    }

    // Per-project detailed patterns (top 5)
    for (const p of patterns.slice(0, 5)) {
      memories.push({
        memory_type: "production_technique",
        category: "capcut_project",
        pattern: `"${p.project_name}" (${p.total_duration_sec}s): ${p.total_cuts} cuts, ${p.text_overlay_count} text overlays, ${p.transition_count} transitions, ${p.video_clips} clips`,
        context: {
          project: p.project_name,
          duration: p.total_duration_sec,
          cuts_per_min: p.cuts_per_minute,
          avg_clip: p.avg_clip_duration_sec,
          pacing: p.pacing_profile,
          source: "capcut_import",
        },
        score: 7.0,
        confidence: 0.4,
        contributed_by: USER_EMAIL,
        tags: ["capcut", "project", p.project_name.toLowerCase().replace(/\s+/g, "_").slice(0, 20)],
        status: "active",
      });
    }

    const { error } = await supabase.from("shared_memories").insert(memories);
    memoriesSaved = error ? 0 : memories.length;
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        analyzed: patterns.length,
        summary,
        memories_saved: memoriesSaved,
        projects: patterns.map(p => ({
          name: p.project_name,
          duration: `${p.total_duration_sec}s`,
          cuts_per_min: p.cuts_per_minute,
          avg_clip: `${p.avg_clip_duration_sec}s`,
          text_overlays: p.text_overlay_count,
          pacing: p.pacing_segments.map(s => s.pace).reduce((acc: string[], c) => {
            if (acc.length === 0 || acc[acc.length - 1] !== c) acc.push(c);
            return acc;
          }, []).join("→"),
        })),
      }, null, 2),
    }],
  };
}
