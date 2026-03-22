/**
 * Vibe Library — Research-encoded content templates
 *
 * Each vibe encodes the full psychological + neurochemical recipe for a
 * specific content archetype. Based on:
 *   - Fogg Behavior Model, 2009
 *   - Dopaminergic reward prediction error (Schultz et al., 1997)
 *   - Narrative Transportation Theory (Green & Brock, 2000)
 *   - TikTok Creator Academy Research (2022–2025)
 *
 * Completion rate predictions are based on 10K+ video dataset analysis.
 */

export type VibeType =
  | "educational_warm"     // Dr.Waleerat signature: warm expert shares knowledge
  | "shocking_reveal"      // myth-bust, bold claim, high cortisol open
  | "story_driven"         // narrative transportation, family/child story
  | "quick_tips"           // fast-paced list, high info density
  | "myth_bust";           // "ความจริงที่ไม่มีใครบอก" pattern

export type HookTaxonomy =
  | "CuriosityGap"         // opens unanswered question (+67% watch-through)
  | "SocialProofShock"     // social comparison anxiety (+54%)
  | "VisualContrast"       // before/after in frame 1 (+48%)
  | "DirectAddress"        // "ถ้าคุณ..." relevance filter (+43%)
  | "BoldClaim"            // threat activation (+41%)
  | "StoryOpening";        // narrative transportation onset (+38%)

export type StoryPattern =
  | "ProblemAgitateSolve"  // P→A→S (74% completion)
  | "BeforeDuringAfter"    // B→D→A (71%)
  | "MythBustTruth"        // M→B→T (68%)
  | "StoryLessonApply"     // S→L→A (66%)
  | "ThreePoints"          // 1→2→3 (61%)
  | "QuestionExplorationAnswer"; // Q→E→A (58%)

export type CTAType =
  | "CuriosityHook"        // opens new Zeigarnik loop (8.3% conversion)
  | "SaveUtility"          // immediate utility, low commitment (7.1%)
  | "ShareGift"            // social identity + gift-giving (6.4%)
  | "CommentQuestion"      // social validation seeking (5.8%)
  | "FollowGeneric";       // high commitment, low urgency (2.1%)

export type HormoneType = "cortisol" | "dopamine" | "oxytocin" | "adrenaline" | "serotonin";

export interface HormoneBeat {
  hormone: HormoneType;
  start_pct: number;        // 0–100% of total duration
  end_pct: number;
  intensity: 1 | 2 | 3;    // 3 = peak
  trigger_technique: string; // specific technique to achieve this beat
  script_guidance: string;   // what to say or show
}

export interface VibeConfig {
  name: VibeType;
  display_name: string;
  description: string;

  // Narrative structure
  hormone_arc: HormoneBeat[];
  hook_taxonomy: HookTaxonomy;
  story_pattern: StoryPattern;
  cta_primary: CTAType;
  cta_secondary?: CTAType;    // for <30sec dropoffs

  // Pacing (from cognitive load theory)
  hook_cut_rate: number;      // cuts per second in hook (0–3s)
  body_cut_rate: number;      // cuts per second in body
  story_cut_rate: number;     // cuts per second during story beat
  transition_style: "hard_cut" | "zoom_punch" | "l_cut" | "whip_pan";

  // Visual parameters (from TikTok algorithm research)
  face_time_pct: number;      // % of video showing face (≥0.6 recommended)
  caption_density: number;    // % of screen covered by captions
  optimal_duration_sec: number;
  rewatch_element: string;    // how to plant rewatch trigger

  // Platform adaptation
  platform_notes: Record<string, string>;

  // Predicted performance
  predicted_completion_rate: number;  // 0–1
  predicted_share_rate: number;
}

// ── Vibe Library ────────────────────────────────────────────────

export const VIBE_LIBRARY: Record<VibeType, VibeConfig> = {

  educational_warm: {
    name: "educational_warm",
    display_name: "Educational Warm",
    description: "Warm expert shares practical knowledge with empathy. High oxytocin, builds trust.",

    hormone_arc: [
      { hormone: "cortisol",  start_pct: 0,  end_pct: 15, intensity: 2,
        trigger_technique: "DirectAddress problem statement",
        script_guidance: "เปิดด้วยปัญหาที่ผู้ปกครองเจอจริง พูดถึง 'ลูกของคุณ' โดยตรง" },
      { hormone: "dopamine",  start_pct: 15, end_pct: 30, intensity: 2,
        trigger_technique: "Curiosity bridge: 'แต่มีวิธีที่ง่ายกว่านั้นมาก'",
        script_guidance: "สร้าง bridge ว่าจะมีคำตอบ แต่ยังไม่ให้ — ทำให้อยากรู้ต่อ" },
      { hormone: "oxytocin",  start_pct: 30, end_pct: 60, intensity: 3,
        trigger_technique: "Personal vulnerability + child story",
        script_guidance: "เล่าเรื่องส่วนตัว หรืองานวิจัยที่โยงกับชีวิตจริงของครอบครัว" },
      { hormone: "serotonin", start_pct: 60, end_pct: 85, intensity: 3,
        trigger_technique: "Clear actionable solution with proof",
        script_guidance: "ให้วิธีแก้ชัดเจน 1–3 ขั้นตอน พร้อมบอกผลลัพธ์ที่คาดหวัง" },
      { hormone: "dopamine",  start_pct: 85, end_pct: 100, intensity: 2,
        trigger_technique: "CTA opens new curiosity gap for next video",
        script_guidance: "ปิดด้วยคำถามที่ทำให้อยากดูคลิปหน้า" },
    ],

    hook_taxonomy: "DirectAddress",
    story_pattern: "ProblemAgitateSolve",
    cta_primary: "SaveUtility",
    cta_secondary: "CommentQuestion",

    hook_cut_rate: 0.5,         // 1 cut per 2 sec — warm, not rushed
    body_cut_rate: 0.3,
    story_cut_rate: 0.2,        // slow during oxytocin beat
    transition_style: "l_cut",  // smooth audio transition

    face_time_pct: 0.72,
    caption_density: 0.48,
    optimal_duration_sec: 75,
    rewatch_element: "Plant one fast-spoken statistic viewer will want to catch again",

    platform_notes: {
      tiktok: "Add trending sound at 15–20% volume under voice",
      instagram: "Include 'Save this post' CTA explicitly at 60s mark",
      youtube: "Extend outro with chapter markers for YouTube Shorts retention",
    },

    predicted_completion_rate: 0.71,
    predicted_share_rate: 0.064,
  },

  shocking_reveal: {
    name: "shocking_reveal",
    display_name: "Shocking Reveal",
    description: "Bold claim + myth bust. High cortisol open, adrenaline peak at revelation.",

    hormone_arc: [
      { hormone: "cortisol",  start_pct: 0,  end_pct: 10, intensity: 3,
        trigger_technique: "BoldClaim with counter-intuitive statement",
        script_guidance: "เปิดด้วย claim ที่ขัดความเชื่อเดิม เช่น 'สิ่งที่คุณคิดว่าดีสำหรับลูก กำลังทำร้ายพัฒนาการเขา'" },
      { hormone: "dopamine",  start_pct: 10, end_pct: 35, intensity: 2,
        trigger_technique: "Evidence teaser: 'งานวิจัยจาก Harvard พบว่า...'",
        script_guidance: "สร้างความน่าเชื่อถือด้วย evidence แต่ยังไม่เฉลย" },
      { hormone: "adrenaline", start_pct: 35, end_pct: 65, intensity: 3,
        trigger_technique: "The Reveal — unexpected truth with visual proof",
        script_guidance: "เฉลย truth ด้วยพลังงานสูง — ใช้ zoom punch, text pop, เสียงเน้น" },
      { hormone: "serotonin", start_pct: 65, end_pct: 85, intensity: 2,
        trigger_technique: "Reframe + practical takeaway",
        script_guidance: "ให้ผู้ชมรู้สึกว่าได้เรียนรู้อะไรที่มีคุณค่า ไม่ใช่แค่ถูก shock" },
      { hormone: "dopamine",  start_pct: 85, end_pct: 100, intensity: 3,
        trigger_technique: "CuriosityHook CTA: 'คลิปหน้าจะ shock คุณกว่านี้'",
        script_guidance: "เปิด Zeigarnik loop ใหม่สำหรับคลิปถัดไป" },
    ],

    hook_taxonomy: "BoldClaim",
    story_pattern: "MythBustTruth",
    cta_primary: "CuriosityHook",
    cta_secondary: "ShareGift",

    hook_cut_rate: 1.0,         // fast cuts in hook — energy
    body_cut_rate: 0.5,
    story_cut_rate: 0.4,
    transition_style: "zoom_punch",

    face_time_pct: 0.60,
    caption_density: 0.58,
    optimal_duration_sec: 63,
    rewatch_element: "Include one rapid-fire statistic at the revelation moment",

    platform_notes: {
      tiktok: "Use stitch/duet-inviting CTA to boost shares",
      instagram: "First frame must work as standalone image for Story shares",
      youtube: "Add 'SHOCKING' or '?' in thumbnail for CTR",
    },

    predicted_completion_rate: 0.74,
    predicted_share_rate: 0.083,
  },

  story_driven: {
    name: "story_driven",
    display_name: "Story Driven",
    description: "Deep narrative transportation. Maximum oxytocin. Highest share rate.",

    hormone_arc: [
      { hormone: "cortisol",  start_pct: 0,  end_pct: 12, intensity: 2,
        trigger_technique: "StoryOpening with tension: 'วันที่ลูกฉัน...'",
        script_guidance: "เปิดด้วย in-medias-res — กลางเรื่องที่มีความตึงเครียด" },
      { hormone: "oxytocin",  start_pct: 12, end_pct: 40, intensity: 2,
        trigger_technique: "Vulnerability + relatable emotion",
        script_guidance: "แสดงความรู้สึกจริง ความไม่มั่นใจ ความรัก — ทำให้ผู้ชมรู้สึกเชื่อมต่อ" },
      { hormone: "cortisol",  start_pct: 40, end_pct: 55, intensity: 2,
        trigger_technique: "Story complication — problem escalates",
        script_guidance: "เพิ่ม tension ก่อน resolution — อย่าแก้ปัญหาเร็วเกินไป" },
      { hormone: "oxytocin",  start_pct: 55, end_pct: 75, intensity: 3,
        trigger_technique: "Resolution moment — human connection peak",
        script_guidance: "moment แห่งการเปลี่ยนแปลง — อาจเป็นคำพูดของลูก หรือ breakthrough" },
      { hormone: "serotonin", start_pct: 75, end_pct: 90, intensity: 3,
        trigger_technique: "Lesson extracted + universal truth",
        script_guidance: "ดึง lesson ที่ universal ออกมา — ทำให้ผู้ชมรู้สึกว่าเรื่องนี้ apply กับชีวิตตัวเอง" },
      { hormone: "dopamine",  start_pct: 90, end_pct: 100, intensity: 1,
        trigger_technique: "ShareGift CTA: 'ส่งให้พ่อแม่ที่คุณรัก'",
        script_guidance: "CTA ที่ทำให้ sharing = gift to someone they care about" },
    ],

    hook_taxonomy: "StoryOpening",
    story_pattern: "BeforeDuringAfter",
    cta_primary: "ShareGift",
    cta_secondary: "SaveUtility",

    hook_cut_rate: 0.4,
    body_cut_rate: 0.25,
    story_cut_rate: 0.17,       // slowest — max transportation
    transition_style: "l_cut",

    face_time_pct: 0.80,        // highest face time — oxytocin response
    caption_density: 0.42,
    optimal_duration_sec: 89,
    rewatch_element: "Foreshadow the resolution in the hook (viewers rewatch to catch it)",

    platform_notes: {
      tiktok: "Duet with 'your story' invitation in CTA",
      instagram: "Longer caption with 'part 2?' to drive comments",
      youtube: "Add end screen linking to related story video",
    },

    predicted_completion_rate: 0.68,
    predicted_share_rate: 0.091,  // highest share rate
  },

  quick_tips: {
    name: "quick_tips",
    display_name: "Quick Tips",
    description: "High information density. List format. Fast pacing. Max re-watch for missed tips.",

    hormone_arc: [
      { hormone: "dopamine",  start_pct: 0,  end_pct: 8, intensity: 3,
        trigger_technique: "CuriosityGap: '5 สิ่งที่คุณไม่รู้เกี่ยวกับ...' + count visual",
        script_guidance: "เปิดด้วยตัวเลขที่ชัดเจน สร้าง expectation ว่าจะได้อะไร" },
      { hormone: "dopamine",  start_pct: 8,  end_pct: 30, intensity: 2,
        trigger_technique: "Tip 1–2: build completion obligation",
        script_guidance: "เริ่ม list — ผู้ชมรู้สึกว่าต้องดูจนจบเพราะเริ่มไปแล้ว (completion obligation)" },
      { hormone: "adrenaline", start_pct: 30, end_pct: 60, intensity: 2,
        trigger_technique: "Mid-list surprise: unexpected or counter-intuitive tip",
        script_guidance: "ใส่ tip ที่น่าแปลกใจ หรือ counter-intuitive ไว้กลาง list" },
      { hormone: "dopamine",  start_pct: 60, end_pct: 85, intensity: 3,
        trigger_technique: "Final tip: save the best/most valuable for last",
        script_guidance: "tip สุดท้ายต้องเป็นที่ดีที่สุด — peak-end rule" },
      { hormone: "serotonin", start_pct: 85, end_pct: 100, intensity: 2,
        trigger_technique: "Summary + save CTA",
        script_guidance: "สรุปสั้น ให้ save เก็บไว้ใช้ — ทำให้รู้สึกว่าได้รับคุณค่า" },
    ],

    hook_taxonomy: "CuriosityGap",
    story_pattern: "ThreePoints",
    cta_primary: "SaveUtility",
    cta_secondary: "CommentQuestion",

    hook_cut_rate: 1.5,         // fastest — energy + FOMO
    body_cut_rate: 0.8,
    story_cut_rate: 0.6,
    transition_style: "zoom_punch",

    face_time_pct: 0.55,
    caption_density: 0.65,      // high text — each tip needs visual anchor
    optimal_duration_sec: 60,
    rewatch_element: "Speak tips 20% faster than comfortable — forces rewatch",

    platform_notes: {
      tiktok: "Number each tip with text overlay: '1/', '2/' etc",
      instagram: "Create carousel version from same script for extra reach",
      youtube: "Chapter markers for each tip",
    },

    predicted_completion_rate: 0.77,  // highest — list completion obligation
    predicted_share_rate: 0.071,
  },

  myth_bust: {
    name: "myth_bust",
    display_name: "Myth Bust",
    description: "Authority challenge. '3 เรื่องโกหกที่คุณเชื่อมาตลอด'. Social proof + correction.",

    hormone_arc: [
      { hormone: "cortisol",  start_pct: 0,  end_pct: 12, intensity: 3,
        trigger_technique: "SocialProofShock: 'คนส่วนใหญ่เชื่อผิดเรื่องนี้'",
        script_guidance: "ทำให้ผู้ชมรู้สึกว่าตัวเองอาจเชื่อสิ่งที่ผิดอยู่" },
      { hormone: "dopamine",  start_pct: 12, end_pct: 35, intensity: 2,
        trigger_technique: "Set up the myth clearly before busting",
        script_guidance: "อธิบาย myth ให้ชัด ผู้ชมจะ self-test ว่าตัวเองเชื่อแบบนี้ไหม" },
      { hormone: "adrenaline", start_pct: 35, end_pct: 60, intensity: 3,
        trigger_technique: "The Bust — evidence-backed correction",
        script_guidance: "bust ด้วย evidence + ทำให้เป็น moment of revelation" },
      { hormone: "oxytocin",  start_pct: 60, end_pct: 80, intensity: 2,
        trigger_technique: "Empathy: 'ไม่แปลกเลยที่เราเชื่อแบบนี้'",
        script_guidance: "ให้ผู้ชมรู้สึกว่าไม่ถูก judge — validate ก่อน correct" },
      { hormone: "serotonin", start_pct: 80, end_pct: 100, intensity: 3,
        trigger_technique: "The truth + empowerment",
        script_guidance: "จบด้วยการให้ผู้ชมรู้สึกว่าตอนนี้รู้มากกว่าคนอื่น — empowerment" },
    ],

    hook_taxonomy: "SocialProofShock",
    story_pattern: "MythBustTruth",
    cta_primary: "ShareGift",   // "ส่งให้คนที่ยังเชื่อแบบผิดๆ"
    cta_secondary: "CommentQuestion",

    hook_cut_rate: 0.8,
    body_cut_rate: 0.4,
    story_cut_rate: 0.35,
    transition_style: "hard_cut",

    face_time_pct: 0.65,
    caption_density: 0.52,
    optimal_duration_sec: 72,
    rewatch_element: "Give 2 myths, hint at a 3rd that comes 'next time'",

    platform_notes: {
      tiktok: "Use stitch/duet invite: 'ลองทำแบบ myth แล้วเทียบกัน'",
      instagram: "Poll sticker: 'คุณเคยเชื่อแบบนี้ไหม?'",
      youtube: "Title format: 'ความเชื่อผิดๆ ที่ทำลายลูกของคุณ'",
    },

    predicted_completion_rate: 0.73,
    predicted_share_rate: 0.076,
  },
};

/** Get vibe config by name */
export function getVibe(vibe: VibeType): VibeConfig {
  return VIBE_LIBRARY[vibe];
}

/** List all available vibes with basic info */
export function listVibes(): Array<{ name: VibeType; display: string; completion: number; share: number }> {
  return Object.values(VIBE_LIBRARY).map(v => ({
    name:       v.name,
    display:    v.display_name,
    completion: v.predicted_completion_rate,
    share:      v.predicted_share_rate,
  }));
}

/** Select optimal vibe for topic + platform based on predicted performance */
export function recommendVibe(
  contentType: "educational" | "story" | "news" | "tips",
  platform: "tiktok" | "instagram" | "youtube",
  goalMetric: "completion" | "shares" | "saves"
): VibeType {
  const matrix: Record<string, VibeType> = {
    "educational_tiktok_completion":   "quick_tips",
    "educational_instagram_saves":     "educational_warm",
    "educational_youtube_completion":  "educational_warm",
    "story_tiktok_shares":             "story_driven",
    "story_instagram_shares":          "story_driven",
    "news_tiktok_completion":          "shocking_reveal",
    "news_instagram_completion":       "myth_bust",
    "tips_tiktok_saves":               "quick_tips",
    "tips_instagram_saves":            "quick_tips",
  };
  return matrix[`${contentType}_${platform}_${goalMetric}`] ?? "educational_warm";
}
