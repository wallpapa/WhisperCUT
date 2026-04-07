/**
 * CapCut Analyzer — Import draft_content.json → extract editing patterns
 *
 * Learns from real CapCut projects:
 *   - Cut frequency (cuts per minute)
 *   - Average clip duration
 *   - Text overlay count + density
 *   - Transition types used
 *   - Audio/music usage
 *   - Pacing rhythm (fast/slow segments)
 *
 * Saves patterns to shared_memories for network learning.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const MICROSECOND = 1_000_000;

// ── Types ────────────────────────────────────────────────────────

interface CapCutSegment {
  material_id: string;
  target_timerange: { start: number; duration: number };
  source_timerange?: { start: number; duration: number };
  extra_material_refs?: string[];
  [key: string]: unknown;
}

interface CapCutTrack {
  type: string;
  segments: CapCutSegment[];
  attribute?: { is_default_name?: boolean; name?: string };
}

interface CapCutDraft {
  id?: string;
  name?: string;
  canvas_config?: { width: number; height: number; ratio?: string };
  fps?: number;
  duration?: number;
  materials?: {
    videos?: Array<Record<string, unknown>>;
    audios?: Array<Record<string, unknown>>;
    texts?: Array<Record<string, unknown>>;
    images?: Array<Record<string, unknown>>;
    stickers?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  tracks?: CapCutTrack[];
  [key: string]: unknown;
}

export interface EditingPattern {
  // Project info
  project_name: string;
  total_duration_sec: number;
  resolution: string;
  fps: number;

  // Cut analysis
  total_cuts: number;
  cuts_per_minute: number;
  avg_clip_duration_sec: number;
  shortest_clip_sec: number;
  longest_clip_sec: number;

  // Text overlays
  text_overlay_count: number;
  text_density_per_min: number;
  avg_text_duration_sec: number;

  // Audio/Music
  audio_track_count: number;
  has_background_music: boolean;
  has_voiceover: boolean;

  // Pacing
  pacing_segments: Array<{
    start_sec: number;
    end_sec: number;
    cuts_per_sec: number;
    pace: "fast" | "medium" | "slow";
  }>;
  pacing_profile: string; // e.g. "fast→slow→fast"

  // Materials count
  video_clips: number;
  image_clips: number;
  sticker_count: number;

  // Transitions
  transition_count: number;
}

// ── Main Analyzer ────────────────────────────────────────────────

/**
 * Analyze a CapCut draft_content.json file.
 * Accepts either a file path or a parsed JSON object.
 */
export function analyzeCapCutDraft(input: string | CapCutDraft): EditingPattern {
  let draft: CapCutDraft;

  if (typeof input === "string") {
    if (!existsSync(input)) {
      throw new Error(`File not found: ${input}. Export draft_content.json from CapCut Desktop → provide the path.`);
    }
    draft = JSON.parse(readFileSync(input, "utf-8"));
  } else {
    draft = input;
  }

  const tracks = draft.tracks || [];
  const materials = draft.materials || {};
  const totalDurationUs = draft.duration || 0;
  const totalDurationSec = totalDurationUs / MICROSECOND;
  const totalDurationMin = totalDurationSec / 60;
  const fps = draft.fps || 30;
  const resolution = draft.canvas_config
    ? `${draft.canvas_config.width}x${draft.canvas_config.height}`
    : "unknown";

  // ── Analyze video tracks (cuts) ──────────────────────────────
  const videoTracks = tracks.filter(t => t.type === "video");
  const allVideoSegments = videoTracks.flatMap(t => t.segments || []);

  const clipDurations = allVideoSegments.map(
    s => (s.target_timerange?.duration || 0) / MICROSECOND
  ).filter(d => d > 0);

  const totalCuts = Math.max(0, clipDurations.length - 1);
  const avgClipDuration = clipDurations.length > 0
    ? clipDurations.reduce((a, b) => a + b, 0) / clipDurations.length
    : 0;

  // ── Analyze text overlays ────────────────────────────────────
  const textTracks = tracks.filter(t => t.type === "text");
  const allTextSegments = textTracks.flatMap(t => t.segments || []);
  const textDurations = allTextSegments.map(
    s => (s.target_timerange?.duration || 0) / MICROSECOND
  ).filter(d => d > 0);

  // ── Analyze audio tracks ─────────────────────────────────────
  const audioTracks = tracks.filter(t => t.type === "audio");
  const allAudioSegments = audioTracks.flatMap(t => t.segments || []);
  const hasMusic = allAudioSegments.length > 0;

  // Detect voiceover vs music (rough: voiceover = long single audio, music = separate track)
  const audioMaterials = materials.audios || [];
  const hasVoiceover = audioMaterials.some(
    (a: Record<string, unknown>) => (a.type as string)?.includes("voice") || (a.category_name as string)?.includes("voice")
  );

  // ── Pacing analysis (10-second windows) ──────────────────────
  const windowSec = 10;
  const pacingSegments: EditingPattern["pacing_segments"] = [];

  for (let start = 0; start < totalDurationSec; start += windowSec) {
    const end = Math.min(start + windowSec, totalDurationSec);
    const windowStartUs = start * MICROSECOND;
    const windowEndUs = end * MICROSECOND;

    // Count cuts in this window
    const cutsInWindow = allVideoSegments.filter(s => {
      const segStart = s.target_timerange?.start || 0;
      return segStart >= windowStartUs && segStart < windowEndUs;
    }).length;

    const cutsPerSec = cutsInWindow / (end - start);
    const pace = cutsPerSec > 0.4 ? "fast" : cutsPerSec > 0.15 ? "medium" : "slow";

    pacingSegments.push({
      start_sec: Math.round(start),
      end_sec: Math.round(end),
      cuts_per_sec: Math.round(cutsPerSec * 100) / 100,
      pace,
    });
  }

  const pacingProfile = pacingSegments.map(p => p.pace).join("→");

  // ── Transitions ──────────────────────────────────────────────
  const transitionCount = allVideoSegments.filter(
    s => s.extra_material_refs && s.extra_material_refs.length > 0
  ).length;

  return {
    project_name: draft.name || "unnamed",
    total_duration_sec: Math.round(totalDurationSec * 10) / 10,
    resolution,
    fps,
    total_cuts: totalCuts,
    cuts_per_minute: totalDurationMin > 0 ? Math.round(totalCuts / totalDurationMin * 10) / 10 : 0,
    avg_clip_duration_sec: Math.round(avgClipDuration * 10) / 10,
    shortest_clip_sec: clipDurations.length > 0 ? Math.round(Math.min(...clipDurations) * 10) / 10 : 0,
    longest_clip_sec: clipDurations.length > 0 ? Math.round(Math.max(...clipDurations) * 10) / 10 : 0,
    text_overlay_count: allTextSegments.length,
    text_density_per_min: totalDurationMin > 0 ? Math.round(allTextSegments.length / totalDurationMin * 10) / 10 : 0,
    avg_text_duration_sec: textDurations.length > 0
      ? Math.round(textDurations.reduce((a, b) => a + b, 0) / textDurations.length * 10) / 10
      : 0,
    audio_track_count: audioTracks.length,
    has_background_music: hasMusic,
    has_voiceover: hasVoiceover,
    pacing_segments: pacingSegments,
    pacing_profile: pacingProfile,
    video_clips: allVideoSegments.length,
    image_clips: (materials.images || []).length,
    sticker_count: (materials.stickers || []).length,
    transition_count: transitionCount,
  };
}

/**
 * Analyze all CapCut drafts in a directory.
 * Looks for draft_content.json files recursively.
 */
export function analyzeCapCutFolder(folderPath: string): EditingPattern[] {
  const patterns: EditingPattern[] = [];

  function scan(dir: string) {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.name === "draft_content.json") {
        try {
          patterns.push(analyzeCapCutDraft(fullPath));
        } catch {
          // skip invalid drafts
        }
      }
    }
  }

  scan(folderPath);
  return patterns;
}

/**
 * Summarize multiple editing patterns into aggregate stats.
 */
export function summarizePatterns(patterns: EditingPattern[]): {
  total_projects: number;
  avg_duration_sec: number;
  avg_cuts_per_min: number;
  avg_clip_duration_sec: number;
  avg_text_density_per_min: number;
  common_pacing: string;
  music_usage_pct: number;
  avg_transitions: number;
} {
  if (patterns.length === 0) {
    return {
      total_projects: 0,
      avg_duration_sec: 0,
      avg_cuts_per_min: 0,
      avg_clip_duration_sec: 0,
      avg_text_density_per_min: 0,
      common_pacing: "unknown",
      music_usage_pct: 0,
      avg_transitions: 0,
    };
  }

  const n = patterns.length;
  const sum = (fn: (p: EditingPattern) => number) =>
    Math.round(patterns.reduce((a, p) => a + fn(p), 0) / n * 10) / 10;

  // Most common pacing profile
  const pacingCounts = new Map<string, number>();
  for (const p of patterns) {
    const simplified = p.pacing_segments
      .map(s => s.pace)
      .reduce((acc: string[], cur) => {
        if (acc.length === 0 || acc[acc.length - 1] !== cur) acc.push(cur);
        return acc;
      }, [])
      .join("→");
    pacingCounts.set(simplified, (pacingCounts.get(simplified) || 0) + 1);
  }
  const commonPacing = [...pacingCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";

  return {
    total_projects: n,
    avg_duration_sec: sum(p => p.total_duration_sec),
    avg_cuts_per_min: sum(p => p.cuts_per_minute),
    avg_clip_duration_sec: sum(p => p.avg_clip_duration_sec),
    avg_text_density_per_min: sum(p => p.text_density_per_min),
    common_pacing: commonPacing,
    music_usage_pct: Math.round(patterns.filter(p => p.has_background_music).length / n * 100),
    avg_transitions: sum(p => p.transition_count),
  };
}
