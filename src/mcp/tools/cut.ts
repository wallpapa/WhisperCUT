/**
 * whispercut_cut — Create roughcut timeline from analysis
 */
import { createTimeline, createRoughcut, addClip } from "../../engine/timeline.js";
import type { TranscriptSegment } from "../../engine/whisper.js";

export const cutTool = {
  name: "whispercut_cut",
  description:
    "Create a roughcut timeline from video analysis. Supports highlight (best moments), summary (condensed), and full styles. Returns a timeline that can be rendered or exported to CapCut.",
  inputSchema: {
    type: "object" as const,
    properties: {
      project_name: {
        type: "string",
        description: "Name for this project/cut",
      },
      video_path: {
        type: "string",
        description: "Absolute path to the source video",
      },
      segments: {
        type: "array",
        description: "Transcript segments from whispercut_analyze",
        items: {
          type: "object",
          properties: {
            start: { type: "number" },
            end: { type: "number" },
            text: { type: "string" },
          },
        },
      },
      style: {
        type: "string",
        enum: ["highlight", "summary", "full"],
        description: "Cut style: highlight (hook + best moments), summary (every Nth), full (all segments)",
        default: "highlight",
      },
      max_duration: {
        type: "number",
        description: "Maximum duration in seconds (default: 60)",
        default: 60,
      },
      custom_cuts: {
        type: "array",
        description: "Optional custom cut points [{ start_sec, end_sec, reason }]",
        items: {
          type: "object",
          properties: {
            start_sec: { type: "number" },
            end_sec: { type: "number" },
          },
        },
      },
    },
    required: ["project_name", "video_path", "segments"],
  },
};

export async function handleCut(args: any) {
  const {
    project_name,
    video_path,
    segments,
    style = "highlight",
    max_duration = 60,
    custom_cuts,
  } = args;

  let timeline;

  if (custom_cuts && custom_cuts.length > 0) {
    // Use custom cut points
    timeline = createTimeline(project_name);
    for (const cut of custom_cuts) {
      addClip(timeline, {
        type: "video",
        start_sec: cut.start_sec,
        duration_sec: cut.end_sec - cut.start_sec,
        source_path: video_path,
        source_start_sec: cut.start_sec,
        source_duration_sec: cut.end_sec - cut.start_sec,
        track: 0,
      });
    }
  } else {
    // Auto roughcut from transcript segments
    const typedSegments: TranscriptSegment[] = segments.map((s: any) => ({
      start: s.start,
      end: s.end,
      text: s.text || "",
      words: s.words || [],
    }));

    timeline = createRoughcut(
      project_name,
      video_path,
      typedSegments,
      style,
      max_duration
    );
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          timeline,
          clip_count: timeline.clips.length,
          estimated_duration: timeline.duration_sec,
          style,
        }, null, 2),
      },
    ],
  };
}
