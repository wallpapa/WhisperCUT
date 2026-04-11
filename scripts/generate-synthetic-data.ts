/**
 * Synthetic Training Data Generator for Gemma Army
 *
 * Generates training pairs using Claude/Gemini API (one-time cost ~$3):
 *   1. Cover Judge: 200 cover descriptions + scores
 *   2. Vibe Analyst: 500 scripts + 6-dim VibeScore
 *   3. Script Writer: 100 topic+vibe → script pairs
 *
 * Output: JSONL files in data/gemma-training/
 * Upload to HuggingFace for Kaggle access
 *
 * Usage:
 *   npx tsx scripts/generate-synthetic-data.ts --soldier cover-judge --count 50
 *   npx tsx scripts/generate-synthetic-data.ts --soldier vibe-analyst --count 100
 *   npx tsx scripts/generate-synthetic-data.ts --soldier script-writer --count 25
 *   npx tsx scripts/generate-synthetic-data.ts --all
 */

import { aiGenerateJSON } from "../src/ai/provider.js";
import { appendFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import "dotenv/config";

const OUT_DIR = "./data/gemma-training";

// ── Cover Judge Training Data ─────────────────────────────────

const COVER_RULES_PROMPT = `You are an expert TikTok cover analyst. Score a hypothetical medical TikTok cover.

Generate a training example with:
1. A detailed description of a TikTok cover image (what it looks like)
2. Scores for each of these 15 research-backed rules (0-100):
   - face_ratio (40-60% of frame ideal)
   - eye_contact (direct = 100, none = 0)
   - face_position (left/center = 100, right = 30)
   - color_contrast (RED accent on dark = 100)
   - contrast_ratio (4.5:1 = 100)
   - hook_type (question = 100, statement = 60)
   - text_lines (2-4 lines = 100, >4 = 40)
   - keyword_diff (one keyword highlighted = 100)
   - emotion_number (has number/emotion word = 100)
   - layer_count (3 layers = 100, >3 = 50)
   - authority_signal (white coat visible = 80)
   - template_consistency (matches series = 100)
   - glance_test (5s readable = 100)
   - grid_safe (works at 110x195 = 100)
   - ab_variant (has variant = 100)
3. Overall score (weighted average)
4. List of failing rules (score < 60)
5. One fix suggestion

Vary the quality: some covers should score 90+, some 50-70, some 20-40.
Make it realistic for Thai medical TikTok content.
Include Thai text in the description.

Return JSON:
{
  "description": "...",
  "scores": { "face_ratio": 85, ... },
  "overall_score": 78,
  "failing_rules": ["grid_safe"],
  "fix_suggestion": "..."
}`;

async function generateCoverJudgeData(count: number) {
  const file = join(OUT_DIR, "cover-judge.jsonl");
  console.log(`Generating ${count} cover judge examples → ${file}`);

  for (let i = 0; i < count; i++) {
    try {
      const quality = i % 3 === 0 ? "excellent (score 85-100)" : i % 3 === 1 ? "mediocre (score 50-70)" : "poor (score 20-45)";

      const example = await aiGenerateJSON<any>(
        `${COVER_RULES_PROMPT}\n\nGenerate a ${quality} cover example. Example ${i + 1}/${count}.`,
        { maxTokens: 2048 },
      );

      const line = JSON.stringify({
        instruction: "Score this TikTok cover image based on 15 research-backed viral cover rules.",
        input: example.description,
        output: JSON.stringify({
          overall_score: example.overall_score,
          scores: example.scores,
          failing_rules: example.failing_rules,
          fix_suggestion: example.fix_suggestion,
        }),
      });

      appendFileSync(file, line + "\n");
      console.log(`  [${i + 1}/${count}] score=${example.overall_score}`);

      // Rate limit
      if (i > 0 && i % 10 === 0) {
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (e: any) {
      console.error(`  [${i + 1}] failed: ${e.message?.slice(0, 80)}`);
    }
  }
}

// ── Vibe Analyst Training Data ────────────────────────────────

const VIBE_SCORE_PROMPT = `You are a viral video analyst. Generate a Thai TikTok script and score it.

Generate:
1. A short Thai medical/educational TikTok script (60-90 seconds worth)
   - Include English medical terms naturally (code-switching)
   - Follow one of these vibes: educational_warm, shocking_reveal, story_driven, quick_tips, myth_bust
2. Score each hormone dimension 0-100:
   - cortisol_spike: Hook tension in first 3 seconds
   - dopamine_gap: Curiosity sustained through middle
   - oxytocin_trust: Middle builds rapport/trust
   - adrenaline_peak: Revelation/key insight impact
   - serotonin_close: CTA emotional satisfaction
   - rhythm_score: Pacing matches vibe energy
3. vibe_fidelity: Overall vibe match 0-100
4. predicted_completion: Estimated watch-through %
5. weakest_dimension and improvement_suggestion

Return JSON:
{
  "script": "...",
  "vibe": "shocking_reveal",
  "scores": {
    "cortisol_spike": 85,
    "dopamine_gap": 72,
    "oxytocin_trust": 65,
    "adrenaline_peak": 90,
    "serotonin_close": 58,
    "rhythm_score": 80
  },
  "vibe_fidelity": 82,
  "predicted_completion": 75,
  "weakest_dimension": "serotonin_close",
  "improvement_suggestion": "..."
}`;

async function generateVibeAnalystData(count: number) {
  const file = join(OUT_DIR, "vibe-analyst.jsonl");
  console.log(`Generating ${count} vibe analyst examples → ${file}`);

  const vibes = ["educational_warm", "shocking_reveal", "story_driven", "quick_tips", "myth_bust"];

  for (let i = 0; i < count; i++) {
    try {
      const vibe = vibes[i % vibes.length];
      const quality = i % 4 === 0 ? "excellent (vibe_fidelity 85-100)" : i % 4 === 1 ? "good (70-84)" : i % 4 === 2 ? "mediocre (55-69)" : "poor (30-54)";

      const example = await aiGenerateJSON<any>(
        `${VIBE_SCORE_PROMPT}\n\nUse vibe: ${vibe}. Quality level: ${quality}. Example ${i + 1}/${count}.`,
        { maxTokens: 3000 },
      );

      const line = JSON.stringify({
        instruction: `Score this ${vibe} TikTok script with 6-dimension VibeScore.`,
        input: example.script,
        output: JSON.stringify({
          scores: example.scores,
          vibe_fidelity: example.vibe_fidelity,
          predicted_completion: example.predicted_completion,
          weakest_dimension: example.weakest_dimension,
          improvement_suggestion: example.improvement_suggestion,
        }),
      });

      appendFileSync(file, line + "\n");
      console.log(`  [${i + 1}/${count}] vibe=${vibe} fidelity=${example.vibe_fidelity}`);

      if (i > 0 && i % 10 === 0) await new Promise(r => setTimeout(r, 2000));
    } catch (e: any) {
      console.error(`  [${i + 1}] failed: ${e.message?.slice(0, 80)}`);
    }
  }
}

// ── Script Writer Training Data ───────────────────────────────

const SCRIPT_WRITER_PROMPT = `You are a Thai medical TikTok script writer.

Generate a complete Thai TikTok script for the given topic and vibe.

Requirements:
- 60-90 seconds duration (Thai speaking pace: 4-5 chars/sec)
- 5 hormone segments: hook (cortisol) → curiosity (dopamine) → trust (oxytocin) → reveal (adrenaline) → CTA (serotonin)
- Naturally embed 3-5 English medical terms (code-switching)
- End with specific, time-bound CTA (not generic "กดติดตาม")
- Include [on_screen_text] suggestions per segment

Return JSON:
{
  "topic": "...",
  "vibe": "...",
  "script": "full Thai script text with natural EN terms",
  "segments": [
    {"label": "hook", "hormone": "cortisol", "text": "...", "on_screen_text": "...", "duration_sec": 3},
    ...
  ],
  "hook_text": "first line for cover",
  "cta_text": "specific CTA",
  "english_terms": ["prefrontal cortex", "executive function", ...],
  "estimated_duration_sec": 75
}`;

const TOPICS = [
  "ลูกดูจอ 35 ชม./สัปดาห์ สมองเสียหายถาวรจริงมั้ย",
  "ทำไมลูกหน้าเหมือนพ่อมากกว่าแม่",
  "เด็กฉลาด รอยหยักสมอง เยอะจริงมั้ย",
  "ลูกเกิดปลายปี ควรเข้า ป.1 ช้า 1 ปีมั้ย",
  "นมแม่ vs นมผง สมองลูกต่างกันจริงมั้ย",
  "วัคซีนทำให้ลูกเป็น Autism จริงมั้ย",
  "Sleep Training ลูกร้องไห้จนหลับ ทำลายสมองมั้ย",
  "โหงวเฮ้งบอกอะไรได้บ้าง วิทยาศาสตร์พิสูจน์แล้ว",
  "Filler ฉีดแล้วหน้าเปลี่ยนถาวรมั้ย",
  "ลูก 2 ขวบยังไม่พูด ต้องพาไปหาหมอเมื่อไหร่",
  "Screen Time กับ ADHD เกี่ยวข้องกันจริงมั้ย",
  "อาหารอะไรบำรุงสมองลูกได้จริง",
  "Montessori vs Traditional แบบไหนดีกว่า",
  "ลูกชอบกัดเล็บ สัญญาณอะไร",
  "IQ กับ EQ อะไรสำคัญกว่ากัน",
  "Botox ฉีดบ่อยๆ หน้าเหี่ยวจริงมั้ย",
  "Thread Lifting ดึงหน้าแล้วหน้าตกมั้ย",
  "PRP ฉีดหน้า ช่วยอะไรได้บ้าง",
  "Laser หน้า ทำบ่อยผิวบางจริงมั้ย",
  "คอลลาเจนกินแล้วช่วยผิวจริงมั้ย",
];

async function generateScriptWriterData(count: number) {
  const file = join(OUT_DIR, "script-writer.jsonl");
  console.log(`Generating ${count} script writer examples → ${file}`);

  const vibes = ["educational_warm", "shocking_reveal", "story_driven", "quick_tips", "myth_bust"];

  for (let i = 0; i < count; i++) {
    try {
      const topic = TOPICS[i % TOPICS.length];
      const vibe = vibes[i % vibes.length];

      const example = await aiGenerateJSON<any>(
        `${SCRIPT_WRITER_PROMPT}\n\nTopic: "${topic}"\nVibe: ${vibe}\nExample ${i + 1}/${count}.`,
        { maxTokens: 4096 },
      );

      const line = JSON.stringify({
        instruction: `Write a ${vibe} TikTok script for this topic.`,
        input: `Topic: ${topic}\nVibe: ${vibe}`,
        output: JSON.stringify(example),
      });

      appendFileSync(file, line + "\n");
      console.log(`  [${i + 1}/${count}] topic="${topic.slice(0, 30)}..." vibe=${vibe}`);

      if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 3000));
    } catch (e: any) {
      console.error(`  [${i + 1}] failed: ${e.message?.slice(0, 80)}`);
    }
  }
}

// ── CLI ───────────────────────────────────────────────────────

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const args = process.argv.slice(2);
  const soldier = args.find((_, i) => args[i - 1] === "--soldier") || "all";
  const count = parseInt(args.find((_, i) => args[i - 1] === "--count") || "10");
  const all = args.includes("--all") || soldier === "all";

  console.log(`\n=== Gemma Army Synthetic Data Generator ===`);
  console.log(`Soldier: ${soldier} | Count: ${count}\n`);

  if (all || soldier === "cover-judge") {
    await generateCoverJudgeData(all ? 50 : count);
  }
  if (all || soldier === "vibe-analyst") {
    await generateVibeAnalystData(all ? 100 : count);
  }
  if (all || soldier === "script-writer") {
    await generateScriptWriterData(all ? 25 : count);
  }

  console.log(`\n=== Done ===`);
  console.log(`Files: ${OUT_DIR}/`);
  console.log(`Next: upload to HuggingFace → train on Kaggle`);
}

main().catch(console.error);
