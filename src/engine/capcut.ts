/**
 * CapCut draft_content.json generator
 * Ports patterns from pyCapCut/pyJianYingDraft to TypeScript
 * Time values in MICROSECONDS (1 sec = 1,000,000 μs)
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Timeline, TimelineClip } from "./timeline.js";

const MICROSECOND = 1_000_000;

interface CapCutMaterial {
  id: string;
  type: string;
  [key: string]: any;
}

interface CapCutSegment {
  material_id: string;
  target_timerange: {
    start: number; // microseconds
    duration: number; // microseconds
  };
  source_timerange?: {
    start: number;
    duration: number;
  };
  [key: string]: any;
}

interface CapCutTrack {
  type: string;
  segments: CapCutSegment[];
  attribute: { is_default_name: boolean; name: string };
}

interface CapCutDraft {
  id: string;
  name: string;
  canvas_config: {
    width: number;
    height: number;
    ratio: string;
  };
  fps: number;
  duration: number; // microseconds
  materials: {
    videos: CapCutMaterial[];
    audios: CapCutMaterial[];
    texts: CapCutMaterial[];
    images: CapCutMaterial[];
    stickers: CapCutMaterial[];
  };
  tracks: CapCutTrack[];
  version: string;
}

/** Convert Timeline to CapCut draft_content.json */
export function timelineToCapCut(timeline: Timeline): CapCutDraft {
  const draft: CapCutDraft = {
    id: timeline.id,
    name: timeline.name,
    canvas_config: {
      width: 1080,
      height: 1920,
      ratio: "9:16",
    },
    fps: 30,
    duration: Math.round(timeline.duration_sec * MICROSECOND),
    materials: {
      videos: [],
      audios: [],
      texts: [],
      images: [],
      stickers: [],
    },
    tracks: [],
    version: "3.0.0",
  };

  // Group clips by track
  const trackMap = new Map<number, TimelineClip[]>();
  for (const clip of timeline.clips) {
    const existing = trackMap.get(clip.track) || [];
    existing.push(clip);
    trackMap.set(clip.track, existing);
  }

  // Process each track
  for (const [trackNum, clips] of trackMap.entries()) {
    const trackType = clips[0]?.type === "text" ? "text" : "video";
    const track: CapCutTrack = {
      type: trackType,
      segments: [],
      attribute: {
        is_default_name: true,
        name: `Track ${trackNum + 1}`,
      },
    };

    for (const clip of clips) {
      const materialId = clip.id;

      // Add material
      if (clip.type === "video") {
        draft.materials.videos.push({
          id: materialId,
          type: "video",
          path: clip.source_path,
          duration: Math.round((clip.source_duration_sec || clip.duration_sec) * MICROSECOND),
          width: 1080,
          height: 1920,
        });
      } else if (clip.type === "text") {
        draft.materials.texts.push({
          id: materialId,
          type: "text",
          content: JSON.stringify({
            text: clip.properties?.text || "",
            styles: [{
              font: { id: "", path: "" },
              size: clip.properties?.font_size || 22,
              color: hexToCapCutColor(clip.properties?.font_color || "#FFFFFF"),
              bold: false,
              italic: false,
            }],
          }),
        });
      } else if (clip.type === "audio") {
        draft.materials.audios.push({
          id: materialId,
          type: "audio",
          path: clip.source_path,
          duration: Math.round(clip.duration_sec * MICROSECOND),
        });
      }

      // Add segment to track
      const segment: CapCutSegment = {
        material_id: materialId,
        target_timerange: {
          start: Math.round(clip.start_sec * MICROSECOND),
          duration: Math.round(clip.duration_sec * MICROSECOND),
        },
      };

      if (clip.source_start_sec !== undefined) {
        segment.source_timerange = {
          start: Math.round(clip.source_start_sec * MICROSECOND),
          duration: Math.round((clip.source_duration_sec || clip.duration_sec) * MICROSECOND),
        };
      }

      track.segments.push(segment);
    }

    draft.tracks.push(track);
  }

  return draft;
}

/** Export CapCut draft to filesystem */
export async function exportCapCutDraft(
  timeline: Timeline,
  outputDir: string
): Promise<{ draftPath: string; instructions: string }> {
  const draft = timelineToCapCut(timeline);

  // Create CapCut draft folder structure
  const draftDir = path.join(outputDir, `whispercut_${timeline.id}`);
  await mkdir(draftDir, { recursive: true });

  const draftPath = path.join(draftDir, "draft_content.json");
  await writeFile(draftPath, JSON.stringify(draft, null, 2), "utf-8");

  // Also save draft_info.json (CapCut metadata)
  const draftInfo = {
    draft_id: timeline.id,
    draft_name: timeline.name,
    draft_resolution: "1080x1920",
    draft_ratio: "9:16",
    tm_draft_create: Date.now(),
    tm_draft_modified: Date.now(),
  };
  await writeFile(
    path.join(draftDir, "draft_info.json"),
    JSON.stringify(draftInfo, null, 2),
    "utf-8"
  );

  const instructions = [
    "To import into CapCut:",
    `1. Copy the folder "${path.basename(draftDir)}" to your CapCut Drafts directory:`,
    "   - macOS: ~/Movies/CapCut/User Data/Projects/com.lveditor.draft/",
    "   - Windows: %LOCALAPPDATA%/CapCut/User Data/Projects/com.lveditor.draft/",
    "2. Open CapCut — the draft should appear in your projects",
    "3. Open the draft and adjust as needed",
    "",
    "Note: Video files must be accessible at their original paths",
  ].join("\n");

  return { draftPath, instructions };
}

/** Convert hex color to CapCut ABGR format */
function hexToCapCutColor(hex: string): string {
  const clean = hex.replace("#", "");
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  return `#FF${b}${g}${r}`; // ABGR format
}
