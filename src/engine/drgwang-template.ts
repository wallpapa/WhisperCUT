/**
 * Dr.Gwang Editing Template — Keyframe-based clone of real editing style
 *
 * Learned from real TikTok clips analysis:
 *   - "ทำไมลูกหน้าเหมือนพ่อ" (1.9M views, 63.6K likes, 4952 saves)
 *   - "อยากให้ลูกฉลาด" (2M views)
 *   - "สัญญาณเด็กอัจฉริยะ" (1.4M views)
 *   - 15 CapCut Desktop projects analyzed
 *   - BullyNurse_Dr.Gwang_2k.mp4 (quality passed)
 *
 * Style signature:
 *   - Talking head center, no b-roll
 *   - Bold white Thai keyword + English subtitle
 *   - Numbered structure (1,2,3) for theories
 *   - No background music — voice original only
 *   - Hard cuts, no transitions, no effects
 *   - Duration 60-130s sweet spot
 *   - Props on desk (books, phone)
 *   - Professional clinic background
 *
 * Comment reply: emoji 😊 for humor, 2-4 words for questions
 * Audience: parents 25-45, informal Thai + emoji, folk wisdom debates
 */

import { generateCapCutDraft, type DraftBridgeInput } from "./capcut-draft-bridge.js";

// ── Keyframe Templates ──────────────────────────────────────────

export interface KeyframeTemplate {
  name: string;
  style: "drgwang_educational" | "drgwang_story" | "drgwang_myth_bust";

  // Canvas
  canvas: { width: number; height: number; fps: number };

  // Segment structure (keyframes)
  segments: Array<{
    label: string;                // "hook" | "point_1" | "point_2" | "point_3" | "summary" | "cta"
    pct_start: number;            // % of total duration (0-1)
    pct_end: number;
    text_overlay: {
      position: "center" | "top" | "bottom";
      style: "bold_thai_keyword" | "number_large" | "english_subtitle" | "cta_yellow";
      template: string;           // e.g., "{keyword}" or "{number}" — filled at runtime
    };
    cut_rate: number;             // cuts per second in this segment
    transition: "hard_cut" | "none";
  }>;

  // Audio
  audio: {
    type: "voice_original" | "voice_clone" | "voice_plus_bgm";
    bgm_volume: number;          // 0 = no music (Dr.Gwang style)
    voice_volume: number;
  };

  // Post metadata
  hashtag_template: string[];    // base hashtags always used
  comment_reply_style: "emoji_only" | "short_thai" | "mixed";
  optimal_post_time: string;     // "19:00-21:00"
}

// ── Dr.Gwang Educational Template (1.9M-2M viral pattern) ──────

export const DRGWANG_EDUCATIONAL: KeyframeTemplate = {
  name: "Dr.Gwang Educational",
  style: "drgwang_educational",

  canvas: { width: 1080, height: 1920, fps: 30 },

  segments: [
    {
      label: "hook",
      pct_start: 0,
      pct_end: 0.05,              // First 5% = ~3-6s
      text_overlay: {
        position: "center",
        style: "bold_thai_keyword",
        template: "{hook_keyword}",  // e.g., "ทำไม...!?"
      },
      cut_rate: 0.5,
      transition: "hard_cut",
    },
    {
      label: "point_1",
      pct_start: 0.05,
      pct_end: 0.30,              // 5-30% = theory/point 1
      text_overlay: {
        position: "center",
        style: "number_large",
        template: "1",
      },
      cut_rate: 0.2,
      transition: "hard_cut",
    },
    {
      label: "point_1_detail",
      pct_start: 0.10,
      pct_end: 0.30,
      text_overlay: {
        position: "center",
        style: "bold_thai_keyword",
        template: "{point_1_keyword}",
      },
      cut_rate: 0.2,
      transition: "none",
    },
    {
      label: "point_1_english",
      pct_start: 0.10,
      pct_end: 0.30,
      text_overlay: {
        position: "bottom",
        style: "english_subtitle",
        template: "{point_1_english}",  // e.g., "Paternal Investment Theory"
      },
      cut_rate: 0,
      transition: "none",
    },
    {
      label: "point_2",
      pct_start: 0.30,
      pct_end: 0.55,
      text_overlay: {
        position: "center",
        style: "number_large",
        template: "2",
      },
      cut_rate: 0.2,
      transition: "hard_cut",
    },
    {
      label: "point_2_detail",
      pct_start: 0.35,
      pct_end: 0.55,
      text_overlay: {
        position: "center",
        style: "bold_thai_keyword",
        template: "{point_2_keyword}",
      },
      cut_rate: 0.2,
      transition: "none",
    },
    {
      label: "point_3",
      pct_start: 0.55,
      pct_end: 0.80,
      text_overlay: {
        position: "center",
        style: "number_large",
        template: "3",
      },
      cut_rate: 0.3,
      transition: "hard_cut",
    },
    {
      label: "point_3_detail",
      pct_start: 0.60,
      pct_end: 0.80,
      text_overlay: {
        position: "center",
        style: "bold_thai_keyword",
        template: "{point_3_keyword}",
      },
      cut_rate: 0.3,
      transition: "none",
    },
    {
      label: "summary",
      pct_start: 0.80,
      pct_end: 0.92,
      text_overlay: {
        position: "center",
        style: "bold_thai_keyword",
        template: "{summary_keyword}",
      },
      cut_rate: 0.4,
      transition: "hard_cut",
    },
    {
      label: "cta",
      pct_start: 0.92,
      pct_end: 1.0,
      text_overlay: {
        position: "center",
        style: "cta_yellow",
        template: "กดเซฟ + กดติดตาม",
      },
      cut_rate: 0.2,
      transition: "hard_cut",
    },
  ],

  audio: {
    type: "voice_original",
    bgm_volume: 0,              // No background music!
    voice_volume: 1.0,
  },

  hashtag_template: [
    "#หมอกวาง", "#เลี้ยงลูก", "#พ่อแม่", "#หมอ",
    "#สุขภาพ", "#ความรู้", "#tiktok", "#viral",
  ],

  comment_reply_style: "emoji_only",
  optimal_post_time: "19:00-21:00",
};

// ── Dr.Gwang Myth Bust Template ────────────────────────────────

export const DRGWANG_MYTH_BUST: KeyframeTemplate = {
  name: "Dr.Gwang Myth Bust",
  style: "drgwang_myth_bust",

  canvas: { width: 1080, height: 1920, fps: 30 },

  segments: [
    {
      label: "hook",
      pct_start: 0,
      pct_end: 0.06,
      text_overlay: {
        position: "center",
        style: "bold_thai_keyword",
        template: "{myth_statement}",  // "จริงมั้ย...?"
      },
      cut_rate: 0.6,
      transition: "hard_cut",
    },
    {
      label: "myth_explain",
      pct_start: 0.06,
      pct_end: 0.30,
      text_overlay: {
        position: "center",
        style: "bold_thai_keyword",
        template: "{common_belief}",
      },
      cut_rate: 0.3,
      transition: "hard_cut",
    },
    {
      label: "truth_reveal",
      pct_start: 0.30,
      pct_end: 0.70,
      text_overlay: {
        position: "center",
        style: "bold_thai_keyword",
        template: "ความจริงคือ...",
      },
      cut_rate: 0.2,
      transition: "hard_cut",
    },
    {
      label: "evidence",
      pct_start: 0.45,
      pct_end: 0.70,
      text_overlay: {
        position: "bottom",
        style: "english_subtitle",
        template: "{research_reference}",
      },
      cut_rate: 0.2,
      transition: "none",
    },
    {
      label: "takeaway",
      pct_start: 0.70,
      pct_end: 0.90,
      text_overlay: {
        position: "center",
        style: "bold_thai_keyword",
        template: "{actionable_tip}",
      },
      cut_rate: 0.4,
      transition: "hard_cut",
    },
    {
      label: "cta",
      pct_start: 0.90,
      pct_end: 1.0,
      text_overlay: {
        position: "center",
        style: "cta_yellow",
        template: "กดเซฟก่อนลืม + กดติดตาม",
      },
      cut_rate: 0.2,
      transition: "hard_cut",
    },
  ],

  audio: {
    type: "voice_original",
    bgm_volume: 0,
    voice_volume: 1.0,
  },

  hashtag_template: [
    "#หมอกวาง", "#ความจริง", "#mythbust", "#สุขภาพ",
    "#หมอ", "#เลี้ยงลูก", "#tiktok",
  ],

  comment_reply_style: "emoji_only",
  optimal_post_time: "19:00-21:00",
};

// ── Apply Template → CapCut Draft ───────────────────────────────

export interface TemplateInput {
  template: KeyframeTemplate;
  duration_sec: number;          // Target total duration
  keywords: Record<string, string>;  // Fill template placeholders
  video_path?: string;           // Source video (talking head)
  voice_path?: string;           // TTS audio
  narration_segments?: Array<{   // Per-segment narration for captions
    text: string;
    start_sec: number;
    end_sec: number;
  }>;
}

export function applyTemplate(input: TemplateInput): DraftBridgeInput {
  const { template, duration_sec, keywords, video_path, voice_path, narration_segments } = input;

  // Calculate real time from percentages
  const textOverlays: DraftBridgeInput["textOverlays"] = [];
  const captions: DraftBridgeInput["captions"] = [];

  for (const seg of template.segments) {
    const startSec = Math.round(seg.pct_start * duration_sec * 10) / 10;
    const endSec = Math.round(seg.pct_end * duration_sec * 10) / 10;
    const durSec = endSec - startSec;

    if (durSec <= 0) continue;

    // Fill template with keywords
    let text = seg.text_overlay.template;
    for (const [key, value] of Object.entries(keywords)) {
      text = text.replace(`{${key}}`, value);
    }

    // Skip unfilled templates
    if (text.includes("{")) continue;

    // Map style to CapCut properties
    const fontSize = seg.text_overlay.style === "number_large" ? 72
      : seg.text_overlay.style === "bold_thai_keyword" ? 36
      : seg.text_overlay.style === "cta_yellow" ? 32
      : 24; // english_subtitle

    const color = seg.text_overlay.style === "cta_yellow" ? "#FFD700"
      : seg.text_overlay.style === "english_subtitle" ? "#CCCCCC"
      : "#FFFFFF";

    textOverlays.push({
      text,
      startOnTimeline: startSec,
      duration: durSec,
      fontSize,
      color,
    });
  }

  // Add narration as captions
  if (narration_segments) {
    for (const nar of narration_segments) {
      captions.push({
        text: nar.text,
        startOnTimeline: nar.start_sec,
        duration: nar.end_sec - nar.start_sec,
      });
    }
  }

  // Build clips
  const clips: DraftBridgeInput["clips"] = [];
  if (video_path) {
    clips.push({
      filePath: video_path,
      type: "video",
      width: template.canvas.width,
      height: template.canvas.height,
      startOnTimeline: 0,
      duration: duration_sec,
    });
  }

  // Build audio
  const audio: DraftBridgeInput["audio"] = [];
  if (voice_path) {
    audio.push({
      filePath: voice_path,
      startOnTimeline: 0,
      duration: duration_sec,
      volume: template.audio.voice_volume,
      name: "Dr.Gwang Voiceover",
    });
  }

  // Generate project name
  const topicSlug = (keywords.hook_keyword || keywords.myth_statement || "DrGwang")
    .replace(/[^a-zA-Z0-9\u0E00-\u0E7F]/g, "_").slice(0, 25);

  return {
    projectName: `WC_${topicSlug}_${Date.now()}`,
    clips,
    audio,
    textOverlays,
    captions,
    width: template.canvas.width,
    height: template.canvas.height,
    fps: template.canvas.fps,
  };
}

// ── Generate hashtags + comment replies ──────────────────────────

export function generateHashtags(template: KeyframeTemplate, topicKeywords: string[]): string[] {
  return [...template.hashtag_template, ...topicKeywords.map(k => `#${k}`)];
}

export function generateCommentReplies(comment: string, _style: KeyframeTemplate["comment_reply_style"]): string[] {
  // Dr.Gwang style: mostly emoji, sometimes short Thai
  return [
    "😊",
    "เห็นภาพเลยค่ะ",
    "ขอบคุณค่ะ 😊",
  ];
}

// ── Next topic suggestions from audience patterns ───────────────

export function suggestNextTopics(): Array<{
  topic: string;
  hook: string;
  vibe: string;
  why: string;
}> {
  // Based on comment analysis: audiences want science + personal experience + folk wisdom
  return [
    {
      topic: "ทำไมลูกคนแรกหน้าเหมือนพ่อ แต่คนที่สองเหมือนแม่?",
      hook: "ลูกคนแรก vs คนที่สอง — พันธุกรรมเปลี่ยนจริงมั้ย?",
      vibe: "educational_warm",
      why: "ต่อยอดจากคลิป 1.9M — ผู้ชมถามเรื่องนี้ใน comments",
    },
    {
      topic: "ลูกนอนดึก สมองจะเสียหายถาวรมั้ย?",
      hook: "ลูกคุณนอนกี่ทุ่ม? ถ้าหลัง 3 ทุ่ม สมองอาจเปลี่ยน",
      vibe: "shocking_reveal",
      why: "Parenting + สมอง = proven viral (1.4M-2M views)",
    },
    {
      topic: "ภูมิปัญญาโบราณ vs วิทยาศาสตร์ — เรื่องไหนจริง?",
      hook: "คนโบราณบอก 'ลูกสาวหน้าเหมือนพ่อ' จริงมั้ย? วิทย์ตอบ!",
      vibe: "myth_bust",
      why: "Comments เต็มไปด้วย folk wisdom debate — audience wants this",
    },
    {
      topic: "เด็กที่เล่นกลางแจ้ง สมองต่างจากเด็กดูจอ ยังไง?",
      hook: "เด็ก 2 กลุ่ม — กลุ่มเล่นข้างนอก vs กลุ่มดูจอ สมองต่างกัน 37%",
      vibe: "educational_warm",
      why: "ต่อยอดจาก screen time topic + outdoor play trend",
    },
    {
      topic: "IQ พ่อแม่ส่งผลต่อลูกกี่ %? คำตอบที่ไม่มีใครบอก",
      hook: "IQ ลูกมาจากพ่อหรือแม่? งานวิจัยบอกว่า... ไม่ใช่ทั้งคู่!",
      vibe: "shocking_reveal",
      why: "DNA/genetics = #1 viral topic (1.9M+2M views)",
    },
  ];
}
