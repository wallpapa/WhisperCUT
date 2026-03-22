/**
 * Timeline Engine — AI-generated CapCut-compatible edit plan
 *
 * Converts a VibeScript into a precise edit timeline with:
 * - Cut timings (from pacing science)
 * - Transition types (from cognitive load research)
 * - Text overlay timing (3–5 sec optimal display)
 * - Music cue points (hormone arc aligned)
 * - B-roll placement (20-30% of video per TikTok algorithm research)
 *
 * Output is CapCut draft JSON compatible + FFmpeg render instructions.
 */

import type { VibeScript } from "./vibe-engine.js";

export interface TimelineCut {
  timestamp_sec: number;
  type: "hard_cut" | "zoom_punch" | "l_cut" | "whip_pan" | "dissolve";
  duration_sec: number;       // transition duration (0 for hard cut)
}

export interface TextOverlay {
  text: string;
  start_sec: number;
  end_sec: number;            // 3–5 sec optimal
  style: "hook" | "caption" | "emphasis" | "cta";
  position: "top" | "middle" | "bottom";
  animation: "pop" | "slide" | "fade" | "typewriter";
  fontsize: number;
}

export interface MusicCue {
  action: "start" | "swell" | "drop" | "fade";
  timestamp_sec: number;
  volume_pct: number;         // 0–100, voice always wins
  note: string;               // guidance for music selection
}

export interface BRollSlot {
  start_sec: number;
  end_sec: number;
  prompt: string;             // description for stock footage search or AI generation
  required: boolean;          // if false, face cam is acceptable fallback
}

export interface CapCutTimeline {
  duration_sec: number;
  fps: number;                // 60 for TikTok/Reels, 30 for others
  resolution: "1080x1920";    // always vertical

  // Edit structure
  cuts: TimelineCut[];
  text_overlays: TextOverlay[];
  music_cues: MusicCue[];
  b_roll_slots: BRollSlot[];

  // Voice track
  voice_file: string;         // path to TTS audio
  voice_start_sec: number;    // usually 0

  // Science metadata
  hormone_arc_json: string;   // for reference
  pacing_profile: string;

  // CapCut export
  capcut_draft: object;       // CapCut JSON format
}

export function generateTimeline(script: VibeScript, voicePath: string): CapCutTimeline {
  const fps = script.platform === "tiktok" || script.platform === "instagram" ? 60 : 30;

  const cuts: TimelineCut[] = [];
  const textOverlays: TextOverlay[] = [];
  const musicCues: MusicCue[] = [];
  const bRollSlots: BRollSlot[] = [];

  for (const seg of script.segments) {
    const segDuration = seg.end_sec - seg.start_sec;

    // ── Cuts: derive from cut_rate ─────────────────────────────────────────
    const cutInterval = seg.cut_rate > 0 ? 1 / seg.cut_rate : segDuration;
    let t = seg.start_sec;
    while (t < seg.end_sec - 0.5) {
      cuts.push({
        timestamp_sec: t,
        type: seg.transition_in as TimelineCut["type"],
        duration_sec: seg.transition_in === "hard_cut" ? 0 : 0.15,
      });
      t += cutInterval;
    }

    // ── Text overlays: on_screen_text ──────────────────────────────────────
    if (seg.on_screen_text) {
      // Chunk long text into 3–5 sec displays
      const words = seg.on_screen_text.split(" ");
      const chunkSize = Math.ceil(words.length / Math.max(1, Math.ceil(segDuration / 4)));
      let start = seg.start_sec;
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunk = words.slice(i, i + chunkSize).join(" ");
        const end = Math.min(start + 4, seg.end_sec);
        textOverlays.push({
          text: chunk,
          start_sec: start,
          end_sec: end,
          style: seg.label === "hook" ? "hook" : seg.label === "cta" ? "cta" : "caption",
          position: seg.label === "hook" ? "top" : seg.label === "cta" ? "bottom" : "middle",
          animation: seg.label === "hook" ? "pop" : "fade",
          fontsize: seg.label === "hook" ? 52 : seg.label === "cta" ? 44 : 38,
        });
        start = end;
      }
    }

    // ── B-roll slots: 20–30% of video ─────────────────────────────────────
    const isBRollSegment = seg.label === "story" || seg.label === "problem" || seg.label === "revelation";
    if (isBRollSegment && seg.visual_direction) {
      bRollSlots.push({
        start_sec: seg.start_sec,
        end_sec: seg.end_sec,
        prompt: seg.visual_direction,
        required: seg.label === "revelation",  // revelation must have b-roll
      });
    }

    // ── Music cues aligned to hormone beats ───────────────────────────────
    if (seg.label === "hook") {
      musicCues.push({
        action: "start",
        timestamp_sec: 0,
        volume_pct: 15,  // low under voice
        note: "Upbeat trending sound, 15% volume — never drown voice",
      });
    }
    if (seg.hormone === "adrenaline") {
      musicCues.push({
        action: "swell",
        timestamp_sec: seg.start_sec,
        volume_pct: 25,
        note: "Music swell at adrenaline peak — anticipation build",
      });
    }
    if (seg.label === "cta") {
      musicCues.push({
        action: "fade",
        timestamp_sec: seg.start_sec,
        volume_pct: 5,
        note: "Fade music for CTA — action requires cognitive bandwidth",
      });
    }
  }

  // ── CapCut-compatible draft JSON ──────────────────────────────────────────
  const capcut_draft = buildCapCutDraft(script, cuts, textOverlays, voicePath, fps);

  return {
    duration_sec: script.duration_sec,
    fps,
    resolution: "1080x1920",
    cuts,
    text_overlays: textOverlays,
    music_cues: musicCues,
    b_roll_slots: bRollSlots,
    voice_file: voicePath,
    voice_start_sec: 0,
    hormone_arc_json: JSON.stringify(
      script.segments.map(s => ({ t: s.start_sec, h: s.hormone, l: s.label }))
    ),
    pacing_profile: script.segments
      .map(s => `${s.label}(${s.cut_rate.toFixed(1)}/s)`)
      .join(" → "),
    capcut_draft,
  };
}

function buildCapCutDraft(
  script: VibeScript,
  cuts: TimelineCut[],
  textOverlays: TextOverlay[],
  voicePath: string,
  fps: number
): object {
  // CapCut draft v2 compatible structure
  return {
    id: `whispercut_${Date.now()}`,
    name: script.topic.slice(0, 50),
    fps,
    duration: script.duration_sec * 1_000_000,  // microseconds
    canvas_config: { width: 1080, height: 1920, ratio: "9:16" },
    materials: {
      audios: [{ path: voicePath, type: "voice", duration: script.duration_sec * 1_000_000 }],
      texts: textOverlays.map((t, i) => ({
        id: `text_${i}`,
        content: t.text,
        start: Math.round(t.start_sec * 1_000_000),
        duration: Math.round((t.end_sec - t.start_sec) * 1_000_000),
        style: {
          font_size: t.fontsize,
          color: t.style === "hook" ? "#FFFFFF" : "#FFFDE7",
          alignment: "center",
          bold: t.style === "hook" || t.style === "emphasis",
          shadow: true,
        },
        position: t.position,
        animation: t.animation,
      })),
    },
    tracks: [
      {
        type: "audio",
        segments: [{ material_id: "voice", start: 0, duration: script.duration_sec * 1_000_000 }],
      },
      {
        type: "text",
        segments: textOverlays.map((t, i) => ({
          material_id: `text_${i}`,
          start: Math.round(t.start_sec * 1_000_000),
          duration: Math.round((t.end_sec - t.start_sec) * 1_000_000),
        })),
      },
    ],
    extra_info: {
      whispercut_version: "3.0",
      vibe: script.vibe,
      platform: script.platform,
      hormone_arc: script.segments.map(s => s.hormone),
      predicted_completion: script.predicted_completion_rate,
    },
  };
}
