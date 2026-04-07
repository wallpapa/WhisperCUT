/**
 * Cover Template — Clone หน้าปก @doctorwaleerat แบบเป๊ะ
 *
 * ถอดจาก 18 คลิปจริง (April 2026):
 *
 * ── องค์ประกอบหน้าปก (7 layers) ──────────────────────────
 *
 * Layer 1: BACKGROUND = talking head photo (หมอกวางจริง หรือ AI avatar)
 * Layer 2: HEADLINE TEXT = Thai bold text (2-3 lines) — hook/title
 * Layer 3: KEYWORD HIGHLIGHT = key phrase in quotes, colored differently
 * Layer 4: BADGE = "ปักหมุดแล้ว" (red badge top-left, for pinned videos)
 * Layer 5: VIEW COUNT = "▶ 1.9M" bottom-left
 * Layer 6: ACCENT COLOR = varies by topic (red/orange/green/blue)
 * Layer 7: LOWER THIRD = subtitle text or topic context
 *
 * ── สไตล์หน้าปก 4 แบบ ────────────────────────────────────
 *
 * Style A: "Question Hook" (ทำไม...!?) — top 3 viral
 *   - Large Thai question text center
 *   - Talking head left/right, looking at camera
 *   - Red/orange accent
 *   - Example: "ทำไม ลูกหน้าเหมือนพ่อ มากกว่าแม่!?"
 *
 * Style B: "Bold Claim" (ความจริงที่...) — educational
 *   - Statement text with keyword in quotes
 *   - Talking head center
 *   - Blue/green accent for trust
 *   - Example: 'อยากให้ ลูกฉลาด..'
 *
 * Style C: "List/Number" (5 สิ่งที่...) — tips format
 *   - Number large + list title
 *   - Multiple small images or icons
 *   - Purple/teal accent
 *   - Example: "สัญญาณ เด็กอัจฉริยะ ลูกมี 4 พฤติกรรมนี้"
 *
 * Style D: "Drama/Story" (เรื่องจริง...) — story-driven
 *   - Emotional expression on face
 *   - Dark/serious text
 *   - Red accent for urgency
 *   - Example: "ศิลปแพทย์บูลลี่ พยาบาล!"
 */

// ── Cover Component Types ──────────────────────────────────────

export interface CoverTemplate {
  style: "question_hook" | "bold_claim" | "list_number" | "drama_story";

  // Layout
  layout: {
    aspect_ratio: "9:16";           // TikTok cover ratio
    width: 1080;
    height: 1920;
  };

  // Layer 1: Background (talking head)
  background: {
    type: "photo" | "ai_avatar" | "solid_color";
    position: "left" | "center" | "right";
    expression: "smile" | "serious" | "surprised" | "explaining";
    outfit: string;                 // e.g., "เสื้อลายสก็อต", "ชุดหมอขาว"
  };

  // Layer 2: Headline (Thai bold text)
  headline: {
    text: string;                   // e.g., "ทำไม\nลูกหน้าเหมือนพ่อ\nมากกว่าแม่!?"
    font_size: number;              // 48-72
    font_weight: "bold" | "extra_bold";
    color: string;                  // "#FFFFFF" or "#000000"
    stroke: boolean;                // text stroke/outline
    stroke_color?: string;          // "#000000"
    position: "top_center" | "center" | "bottom_center";
    line_spacing: number;           // 1.2-1.5
    max_lines: number;              // 2-4
  };

  // Layer 3: Keyword highlight
  keyword: {
    text: string;                   // The emphasized word/phrase in quotes
    color: string;                  // Accent color (red/orange/yellow/green)
    background?: string;            // Optional background color
    style: "quotes" | "underline" | "highlight" | "box";
  };

  // Layer 4: Badge (optional)
  badge?: {
    text: string;                   // "ปักหมุดแล้ว"
    color: string;                  // "#FF0000"
    position: "top_left" | "top_right";
  };

  // Layer 5: Accent color scheme
  accent: {
    primary: string;                // Main accent color
    usage: "text" | "background" | "border" | "gradient";
  };

  // Layer 6: Lower third (optional context text)
  lower_third?: {
    text: string;
    font_size: number;              // 20-28
    color: string;
    background: string;             // semi-transparent
  };
}

// ── Real Covers Analyzed (18 clips) ─────────────────────────────

export const COVER_PATTERNS: Array<{
  title: string;
  views: string;
  style: CoverTemplate["style"];
  headline_text: string;
  keyword_text: string;
  keyword_color: string;
  expression: string;
  pinned: boolean;
}> = [
  // Row 1 — Top performers (pinned)
  {
    title: "ทำไมลูกหน้าเหมือนพ่อ",
    views: "1.9M",
    style: "question_hook",
    headline_text: "ทำไม\nลูกหน้าเหมือนพ่อ\nมากกว่าแม่!?",
    keyword_text: "ทำไม",
    keyword_color: "#FF4444",       // Red
    expression: "explaining",
    pinned: true,
  },
  {
    title: "อยากให้ลูกฉลาด",
    views: "2M",
    style: "bold_claim",
    headline_text: "อยากให้\nลูกฉลาด..",
    keyword_text: "ลูกฉลาด",
    keyword_color: "#FF6B35",       // Orange
    expression: "smile",
    pinned: true,
  },
  {
    title: "สัญญาณเด็กอัจฉริยะ",
    views: "1.4M",
    style: "list_number",
    headline_text: "สัญญาณ \"เด็กอัจฉริยะ\"\nลูกมี 4 พฤติกรรมนี้\nอย่าเพิ่งดุ!",
    keyword_text: "เด็กอัจฉริยะ",
    keyword_color: "#FF4444",       // Red
    expression: "serious",
    pinned: true,
  },

  // Row 1 — More clips
  {
    title: "ทำยังไงเมื่อหมอเกลียดคนไข้",
    views: "44.1K",
    style: "question_hook",
    headline_text: "ทำยังไงเมื่อ\nหมอเกลียดคนไข้",
    keyword_text: "หมอเกลียดคนไข้",
    keyword_color: "#FFFFFF",
    expression: "serious",
    pinned: false,
  },
  {
    title: "Introvert Otrovert",
    views: "136.3K",
    style: "bold_claim",
    headline_text: "จิตวิทยา\n\"คนวงนอก\"\nOtrovert",
    keyword_text: "คนวงนอก",
    keyword_color: "#FF6B35",
    expression: "explaining",
    pinned: false,
  },
  {
    title: "ศิลปแพทย์บูลลี่พยาบาล",
    views: "21.8K",
    style: "drama_story",
    headline_text: "ศิลปแพทย์บูลลี่ พยาบาล!\nบูลลี่!\nในวงการแพทย์",
    keyword_text: "บูลลี่!",
    keyword_color: "#FF0000",       // Bright red
    expression: "serious",
    pinned: false,
  },

  // Row 2
  {
    title: "นักศึกษาแพทย์รมควัน",
    views: "13.3K",
    style: "drama_story",
    headline_text: "นักศึกษาแพทย์รมควัน\nจบชีวิตหลังเครียดเรื่องการเรียน",
    keyword_text: "เด็กเรียนเก่ง",
    keyword_color: "#FFFFFF",
    expression: "serious",
    pinned: false,
  },
  {
    title: "วงการหมอ",
    views: "152.4K",
    style: "bold_claim",
    headline_text: "สิ่งที่จะเกิดขึ้น\n\"วงการหมอ\"\nน่ากลัวมาก!",
    keyword_text: "วงการหมอ",
    keyword_color: "#FF4444",
    expression: "surprised",
    pinned: false,
  },
  {
    title: "แพทย์หญิงทำงานหนัก",
    views: "35.2K",
    style: "bold_claim",
    headline_text: "แพทย์หญิง\nทำงานหนัก\nแต่รายได้น้อยกว่า\nแพทย์ชาย!",
    keyword_text: "แพทย์หญิง",
    keyword_color: "#FFFFFF",
    expression: "serious",
    pinned: false,
  },
  {
    title: "เพื่อให้แม่กลับไปทำงานต่อ",
    views: "3,431",
    style: "drama_story",
    headline_text: "เพื่อให้แม่\nกลับไปทำงานต่อ",
    keyword_text: "แม่",
    keyword_color: "#FFFFFF",
    expression: "serious",
    pinned: false,
  },
  {
    title: "ติด HIV",
    views: "4,795",
    style: "drama_story",
    headline_text: "ติด HIV\n1 ปีเปลี่ยนคู่นอน\n15 คน!!",
    keyword_text: "HIV",
    keyword_color: "#FF0000",
    expression: "serious",
    pinned: false,
  },
  {
    title: "เด็กมือซ้าย",
    views: "118.2K",
    style: "list_number",
    headline_text: "เรื่องที่คุณไม่รู้\n\"เด็กถนัดมือซ้าย\"",
    keyword_text: "เด็กถนัดมือซ้าย",
    keyword_color: "#4CAF50",       // Green
    expression: "smile",
    pinned: false,
  },

  // Row 3
  {
    title: "สอบเข้าเตรียมอุดมไม่ได้",
    views: "46.6K",
    style: "question_hook",
    headline_text: "สอบเข้าเตรียมอุดมไม่ได้\nหมดสิทธิ์เรียนหมอ?",
    keyword_text: "หมดสิทธิ์เรียนหมอ?",
    keyword_color: "#FF4444",
    expression: "explaining",
    pinned: false,
  },
  {
    title: "ระบบการศึกษา",
    views: "72.3K",
    style: "bold_claim",
    headline_text: "ระบบการศึกษา\nตอน.2",
    keyword_text: "ระบบการศึกษา",
    keyword_color: "#FF6B35",
    expression: "explaining",
    pinned: false,
  },
  {
    title: "บ้านไม่รวยแต่ส่งลูกเรียนอินเตอร์",
    views: "24K",
    style: "question_hook",
    headline_text: "บ้านไม่รวยแต่\nส่งลูกเรียนอินเตอร์\nลูกจะมีปมมั้ย?",
    keyword_text: "ลูกจะมีปมมั้ย?",
    keyword_color: "#4CAF50",
    expression: "explaining",
    pinned: false,
  },
  {
    title: "โรงเรียนอินเตอร์ ภาษาจีน",
    views: "19.2K",
    style: "list_number",
    headline_text: "5 โรงเรียนอินเตอร์\nที่เน้น ภาษาจีน\nงบไม่เกิน 500,000",
    keyword_text: "5",
    keyword_color: "#FF0000",
    expression: "smile",
    pinned: false,
  },
  {
    title: "ลูกสาวติด HIV",
    views: "11.5K",
    style: "drama_story",
    headline_text: "ลูกสาวติด HIV-หมอจีน\nแม่แกร่งดูแลลูกจนหน้าตาเดิม",
    keyword_text: "HIV",
    keyword_color: "#FF0000",
    expression: "serious",
    pinned: false,
  },
  {
    title: "เด็กฉลาด รอยยักสมอง",
    views: "2.2M",
    style: "question_hook",
    headline_text: "เด็กฉลาด\nรอยยักสมอง\nเยอะ!?",
    keyword_text: "รอยยักสมอง",
    keyword_color: "#FF4444",
    expression: "explaining",
    pinned: false,
  },
];

// ── Cover Style Statistics ──────────────────────────────────────

export function analyzeCoverPatterns(): {
  total: number;
  by_style: Record<string, { count: number; avg_views: string }>;
  color_frequency: Record<string, number>;
  pinned_formula: string;
  top_performing_style: string;
} {
  const patterns = COVER_PATTERNS;
  const byStyle: Record<string, string[]> = {};
  const colorFreq: Record<string, number> = {};

  for (const p of patterns) {
    if (!byStyle[p.style]) byStyle[p.style] = [];
    byStyle[p.style].push(p.views);
    colorFreq[p.keyword_color] = (colorFreq[p.keyword_color] || 0) + 1;
  }

  return {
    total: patterns.length,
    by_style: Object.fromEntries(
      Object.entries(byStyle).map(([k, v]) => [k, { count: v.length, avg_views: v.join(", ") }])
    ),
    color_frequency: colorFreq,
    pinned_formula: "question_hook OR list_number + parenting topic + red accent = 1.4M-2M",
    top_performing_style: "question_hook (1.9M, 2.2M) + list_number (1.4M)",
  };
}

// ── Generate Cover for Canva ────────────────────────────────────

export interface CanvaCoverSpec {
  style: CoverTemplate["style"];
  headline_lines: string[];       // 2-4 lines of Thai text
  keyword: string;                // Highlighted word
  keyword_color: string;          // Accent color hex
  expression: string;             // Avatar expression
  has_badge: boolean;             // "ปักหมุดแล้ว" badge
  dimensions: { width: number; height: number };
}

export function generateCoverSpec(
  topic: string,
  hook: string,
  style: CoverTemplate["style"] = "question_hook"
): CanvaCoverSpec {
  // Split hook into 2-4 lines (max 12 chars per line for Thai)
  const words = hook.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length > 14) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = (currentLine + " " + word).trim();
    }
  }
  if (currentLine) lines.push(currentLine.trim());

  // Pick keyword (first important word)
  const keyword = topic.split(/\s+/).find(w => w.length > 3) || topic.slice(0, 10);

  // Pick accent color based on style
  const colorMap: Record<string, string> = {
    question_hook: "#FF4444",     // Red for questions
    bold_claim: "#FF6B35",        // Orange for claims
    list_number: "#FF0000",       // Red for numbers
    drama_story: "#FF0000",       // Red for drama
  };

  // Pick expression
  const exprMap: Record<string, string> = {
    question_hook: "explaining",
    bold_claim: "smile",
    list_number: "serious",
    drama_story: "serious",
  };

  return {
    style,
    headline_lines: lines.slice(0, 4),
    keyword,
    keyword_color: colorMap[style] || "#FF4444",
    expression: exprMap[style] || "explaining",
    has_badge: false,
    dimensions: { width: 1080, height: 1920 },
  };
}
