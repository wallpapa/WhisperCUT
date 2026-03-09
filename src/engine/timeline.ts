/**
 * Internal timeline format — represents a video edit sequence
 * Converts to FFmpeg commands or CapCut draft_content.json
 */

export interface TimelineClip {
  id: string;
  type: "video" | "audio" | "text" | "image";
  source_path: string;
  start_sec: number;
  duration_sec: number;
  source_start_sec?: number; // trim point in source
  source_duration_sec?: number;
  track: number;
  properties?: {
    text?: string;
    font_size?: number;
    font_color?: string;
    position_x?: number;
    position_y?: number;
    opacity?: number;
    transition_in?: string;
    transition_out?: string;
  };
}

export interface Timeline {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration_sec: number;
  clips: TimelineClip[];
}

/** Create empty 9:16 vertical timeline */
export function createTimeline(name: string, id?: string): Timeline {
  return {
    id: id || crypto.randomUUID(),
    name,
    width: 1080,
    height: 1920,
    fps: 30,
    duration_sec: 0,
    clips: [],
  };
}

/** Add clip to timeline */
export function addClip(timeline: Timeline, clip: Omit<TimelineClip, "id">): Timeline {
  const newClip: TimelineClip = { ...clip, id: crypto.randomUUID() };
  timeline.clips.push(newClip);
  // Update total duration
  const clipEnd = newClip.start_sec + newClip.duration_sec;
  if (clipEnd > timeline.duration_sec) {
    timeline.duration_sec = clipEnd;
  }
  return timeline;
}

/** Create roughcut from transcript segments */
export function createRoughcut(
  timelineName: string,
  videoPath: string,
  segments: { start: number; end: number; text: string }[],
  style: "highlight" | "summary" | "full" = "full",
  maxDuration = 60
): Timeline {
  const tl = createTimeline(timelineName);
  let currentTime = 0;

  // Filter segments based on style
  let selectedSegments = [...segments];
  if (style === "highlight") {
    // Take first segment (hook) + longest segments up to maxDuration
    selectedSegments.sort((a, b) => (b.end - b.start) - (a.end - a.start));
    selectedSegments = selectedSegments.slice(0, Math.ceil(maxDuration / 10));
    selectedSegments.sort((a, b) => a.start - b.start);
  } else if (style === "summary") {
    // Take every Nth segment to fit maxDuration
    const totalDuration = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
    const ratio = Math.ceil(totalDuration / maxDuration);
    selectedSegments = segments.filter((_, i) => i % ratio === 0);
  }

  for (const seg of selectedSegments) {
    const clipDuration = seg.end - seg.start;
    if (currentTime + clipDuration > maxDuration && style !== "full") break;

    addClip(tl, {
      type: "video",
      source_path: videoPath,
      start_sec: currentTime,
      duration_sec: clipDuration,
      source_start_sec: seg.start,
      source_duration_sec: clipDuration,
      track: 0,
    });

    // Add text overlay for each segment
    addClip(tl, {
      type: "text",
      source_path: "",
      start_sec: currentTime,
      duration_sec: clipDuration,
      track: 1,
      properties: {
        text: seg.text,
        font_size: 22,
        font_color: "#FFFFFF",
        position_y: 0.85, // Bottom area for subtitles
      },
    });

    currentTime += clipDuration;
  }

  return tl;
}

export interface FFmpegCommand {
  type: "trim" | "concat";
  input: string;
  output: string;
  startSec: number;
  durationSec: number;
}

/** Generate structured FFmpeg commands from timeline */
export function toFFmpegCommands(timeline: Timeline, outputDir = "/tmp"): FFmpegCommand[] {
  const videoClips = timeline.clips.filter((c) => c.type === "video");
  const commands: FFmpegCommand[] = [];

  for (let i = 0; i < videoClips.length; i++) {
    const clip = videoClips[i];
    commands.push({
      type: "trim",
      input: clip.source_path,
      output: `${outputDir}/whispercut_clip_${i}.mp4`,
      startSec: clip.source_start_sec || 0,
      durationSec: clip.source_duration_sec || clip.duration_sec,
    });
  }

  return commands;
}
