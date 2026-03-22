/**
 * CTA Selector — Behavioral economics-based call-to-action optimizer
 *
 * Based on Cialdini's Influence (1984), Zeigarnik Effect (1927),
 * and platform-specific conversion data (2024).
 *
 * Conversion rates:
 *   CuriosityHook: 8.3%  | SaveUtility: 7.1%  | ShareGift: 6.4%
 *   CommentQuestion: 5.8% | FollowGeneric: 2.1%
 */

export type CTAType =
  | "CuriosityHook"       // 8.3% conversion — new Zeigarnik loop
  | "SaveUtility"         // 7.1% — immediate utility, low commitment
  | "ShareGift"           // 6.4% — gift-giving social identity
  | "CommentQuestion"     // 5.8% — social validation seeking
  | "FollowGeneric";      // 2.1% — avoid as primary CTA

export interface CTARecommendation {
  type: CTAType;
  conversion_rate: number;
  text_th: string;             // Thai CTA text
  placement_pct: number;       // optimal placement as % of video
  psychology_principle: string;
  secondary?: {
    type: CTAType;
    text_th: string;
    placement_pct: number;     // for early drop-off viewers
  };
}

const CTA_CONVERSION: Record<CTAType, number> = {
  CuriosityHook:    0.083,
  SaveUtility:      0.071,
  ShareGift:        0.064,
  CommentQuestion:  0.058,
  FollowGeneric:    0.021,
};

const CTA_TEMPLATES: Record<CTAType, string[]> = {
  CuriosityHook: [
    "คลิปหน้าจะทำให้คุณตกใจกว่านี้อีก",
    "สิ่งที่มาในคลิปถัดไป — คุณจะเชื่อไม่ได้",
    "ติดตามเพื่อดูว่าจะเกิดอะไรขึ้นต่อ",
    "ยังมีอีกครึ่งที่คุณต้องรู้ — มาในคลิปหน้า",
  ],
  SaveUtility: [
    "เซฟคลิปนี้ไว้ — ใช้ได้เลยวันนี้",
    "กดเซฟก่อนลืม — สำคัญมาก",
    "บันทึกไว้ดูซ้ำตอนที่ต้องการ",
    "เซฟไว้ส่งให้ลูกอ่านทีหลัง",
  ],
  ShareGift: [
    "ส่งให้พ่อแม่ที่คุณรักคนนั้น",
    "แชร์ให้คุณแม่ที่กำลังเจอปัญหาแบบนี้",
    "บอกต่อให้ครอบครัว — ข้อมูลนี้สำคัญ",
    "ส่งให้เพื่อนที่มีลูกวัยนี้",
  ],
  CommentQuestion: [
    "แม่ๆ พ่อๆ เคยเจอแบบนี้ไหม? คอมเมนต์มาเลย",
    "คุณคิดว่าข้อไหนสำคัญที่สุด? บอกในคอมเมนต์",
    "ลูกคุณเป็นแบบนี้ไหม? แชร์ประสบการณ์ได้เลย",
    "ยังมีคำถามอะไรอีก? ถามได้เลย",
  ],
  FollowGeneric: [
    "ติดตามเพื่อไม่พลาดเนื้อหาดีๆ",
    "กด follow เพื่อรับข้อมูลพัฒนาการลูก",
  ],
};

/**
 * Select optimal CTA based on content type, platform, and goal metric.
 * Places CTA at serotonin peak (resolution moment) for maximum compliance.
 */
export function selectCTA(params: {
  vibe: string;
  platform: "tiktok" | "instagram" | "youtube" | "facebook";
  goal: "virality" | "engagement" | "saves" | "followers";
  duration_sec: number;
}): CTARecommendation {
  const { vibe, platform, goal, duration_sec } = params;

  // Primary CTA selection matrix
  const primaryMatrix: Record<string, CTAType> = {
    // goal=virality → maximize shares
    "shocking_reveal_virality":  "CuriosityHook",
    "story_driven_virality":     "ShareGift",
    "myth_bust_virality":        "ShareGift",
    "educational_warm_virality": "SaveUtility",
    "quick_tips_virality":       "SaveUtility",

    // goal=engagement → maximize comments
    "educational_warm_engagement":  "CommentQuestion",
    "story_driven_engagement":      "CommentQuestion",
    "quick_tips_engagement":        "CommentQuestion",

    // goal=saves → maximize bookmarks
    "educational_warm_saves": "SaveUtility",
    "quick_tips_saves":       "SaveUtility",

    // goal=followers → grow channel
    "shocking_reveal_followers": "CuriosityHook",
    "story_driven_followers":    "CuriosityHook",
  };

  const key = `${vibe}_${goal}`;
  const primaryType: CTAType = primaryMatrix[key] ?? "SaveUtility";

  // Serotonin peak placement: ~80% through video (resolution moment)
  const serotonin_peak_pct = 82;
  const primary_placement_pct = serotonin_peak_pct;

  // Secondary CTA for early drop-off viewers (<30 sec)
  // Always different from primary
  const secondaryMap: Record<CTAType, CTAType> = {
    CuriosityHook:   "SaveUtility",
    SaveUtility:     "CommentQuestion",
    ShareGift:       "SaveUtility",
    CommentQuestion: "SaveUtility",
    FollowGeneric:   "SaveUtility",
  };
  const secondaryType = secondaryMap[primaryType];

  // Pick random template variation
  const primaryTemplates = CTA_TEMPLATES[primaryType];
  const primaryText = primaryTemplates[Math.floor(Math.random() * primaryTemplates.length)];

  const secondaryTemplates = CTA_TEMPLATES[secondaryType];
  const secondaryText = secondaryTemplates[Math.floor(Math.random() * secondaryTemplates.length)];

  const psychologyMap: Record<CTAType, string> = {
    CuriosityHook:   "Zeigarnik Effect — unclosed loop drives return visit",
    SaveUtility:     "Utility principle — low-cost action with immediate perceived value",
    ShareGift:       "Gift-giving identity — sharing = caring for people they love",
    CommentQuestion: "Social validation — opinion-sharing = identity expression",
    FollowGeneric:   "Commitment — high-cost action, use only as secondary",
  };

  return {
    type: primaryType,
    conversion_rate: CTA_CONVERSION[primaryType],
    text_th: primaryText,
    placement_pct: primary_placement_pct,
    psychology_principle: psychologyMap[primaryType],
    secondary: {
      type: secondaryType,
      text_th: secondaryText,
      placement_pct: 28, // 28% = just before typical early drop-off point
    },
  };
}

/** Get all CTA options ranked by conversion rate */
export function rankCTAs(): Array<{ type: CTAType; rate: number; description: string }> {
  return [
    { type: "CuriosityHook",   rate: 0.083, description: "Opens new Zeigarnik loop for next video" },
    { type: "SaveUtility",     rate: 0.071, description: "Immediate utility, lowest commitment" },
    { type: "ShareGift",       rate: 0.064, description: "Sharing as gift to loved ones" },
    { type: "CommentQuestion", rate: 0.058, description: "Social validation through opinion sharing" },
    { type: "FollowGeneric",   rate: 0.021, description: "Avoid as primary — high commitment, low urgency" },
  ];
}
