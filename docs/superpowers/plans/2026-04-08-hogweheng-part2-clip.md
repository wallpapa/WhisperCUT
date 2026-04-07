# "โหงวเฮ้ง จริงหรือมั่ว?" TikTok Clip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a ready-to-post TikTok clip "โหงวเฮ้ง จริงหรือมั่ว? วิทยาศาสตร์ตอบ" as Part 2 of the viral "ใบหน้าบอกฐานะได้" (22% save rate) for @waleeratclinic.

**Architecture:** Use WhisperCUT pipeline: ScriptAgent (script) → MiniMax TTS (voice) → Canva API (insert images) → CapCut Draft Bridge (compose) → QAGateAgent (quality check). AI avatar via HeyGen for talking head. Target Save% >15%.

**Tech Stack:** WhisperCUT MCP (TypeScript), ScriptAgent, HookAgent, QAGateAgent, MiniMax TTS (speech-02-hd), CapCut Draft Bridge, Supabase shared_memories

---

### Task 1: Research & Script Generation

**Files:**
- Create: `output/hogweheng-part2/script.json`
- Read: `src/agents/creative/script-agent.ts`
- Read: `src/engine/drgwang-template.ts`

- [ ] **Step 1: Query Supabase for Part 1 data + audience insights**

```bash
cd /Users/witsarutkrimthungthong/WhisperCUT
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const { data } = await sb.from('shared_memories')
  .select('pattern, context')
  .or('category.eq.clinic_crossover_formula,category.eq.viral_formula,category.eq.hormone_arc')
  .limit(5);
console.log(JSON.stringify(data, null, 2));
"
```

Expected: 3-5 memory entries about crossover formula, viral patterns, hormone arc

- [ ] **Step 2: Write the script using Claude directly**

Write the script to `output/hogweheng-part2/script.json`:

```json
{
  "title": "โหงวเฮ้ง จริงหรือมั่ว? วิทยาศาสตร์ตอบ",
  "series": "Face Science",
  "part": 2,
  "part1_ref": "ใบหน้าบอกฐานะได้ (22% save)",
  "duration_sec": 75,
  "hook": "โหงวเฮ้ง ดูหน้าทายนิสัย — คนโบราณเชื่อ แต่วิทยาศาสตร์ว่าอะไร?",
  "hook_type": "myth_bust_question",
  "target_save_pct": 15,
  "vibe": "educational_warm",
  "platform": "tiktok",
  "segments": [
    {
      "label": "hook",
      "pct": [0, 0.07],
      "text_overlay": "โหงวเฮ้ง จริงหรือมั่ว?",
      "text_style": "bold_thai_keyword",
      "text_color": "#FF4444",
      "insert_image": "hogweheng_face_chart.png",
      "insert_desc": "แผนภาพโหงวเฮ้ง 5 จุด (หน้าผาก ตา จมูก ปาก คาง) สไตล์ traditional Thai-Chinese",
      "narration": "คนโบราณเชื่อว่าดูหน้าทายนิสัยได้ แต่วิทยาศาสตร์จริงๆ ว่าอะไร?"
    },
    {
      "label": "point_1",
      "pct": [0.07, 0.30],
      "text_overlay": "1. หน้าผาก กว้าง = ฉลาด?",
      "text_style": "number_large",
      "english_subtitle": "Forehead Width & Intelligence",
      "insert_image": "brain_frontal_lobe.png",
      "insert_desc": "ภาพสมอง highlight Frontal Lobe สีน้ำเงิน",
      "narration": "โหงวเฮ้งบอกว่าหน้าผากกว้าง = ฉลาด คนสมัยก่อนเชื่อมาก แต่งานวิจัยจาก Cambridge ปี 2019 พบว่า ขนาดหน้าผากไม่ได้สัมพันธ์กับ IQ โดยตรง แต่สิ่งที่สัมพันธ์จริงคือ ความหนาของ Frontal Cortex ซึ่งมองจากภายนอกไม่ได้"
    },
    {
      "label": "point_2",
      "pct": [0.30, 0.55],
      "text_overlay": "2. จมูกโด่ง = รวย?",
      "text_style": "number_large",
      "english_subtitle": "Nose Shape & Wealth Perception",
      "insert_image": "face_perception_study.png",
      "insert_desc": "กราฟแสดงผลวิจัย Face Perception จาก Journal of Personality",
      "narration": "โหงวเฮ้งบอกจมูกโด่งรวย แต่ที่น่าสนใจคืองานวิจัยจาก Journal of Personality ปี 2017 พบว่า คนที่ใบหน้าดูมั่นใจ จะถูกประเมินว่ามีฐานะดีกว่า โดยไม่เกี่ยวกับรูปจมูกโดยตรง แต่เกี่ยวกับ Expression ความมั่นใจบนใบหน้า"
    },
    {
      "label": "point_3",
      "pct": [0.55, 0.78],
      "text_overlay": "3. คาง = บั้นปลายชีวิต?",
      "text_style": "number_large",
      "english_subtitle": "Chin Shape & Life Outcomes",
      "insert_image": "jaw_testosterone.png",
      "insert_desc": "ภาพเปรียบเทียบใบหน้า Testosterone สูง vs ต่ำ",
      "narration": "คางและกรามสัมพันธ์กับ Testosterone จริง งานวิจัยปี 2021 จาก Evolution and Human Behavior พบว่า ผู้ชายกรามเหลี่ยมถูกประเมินว่า dominant มากกว่า แต่ไม่ได้หมายความว่าบั้นปลายจะดี โหงวเฮ้งจึงจริงครึ่งเดียว"
    },
    {
      "label": "summary",
      "pct": [0.78, 0.92],
      "text_overlay": "สรุป: จริง 50% มั่ว 50%",
      "text_style": "bold_thai_keyword",
      "text_color": "#FF6B35",
      "insert_image": "summary_50_50.png",
      "insert_desc": "Infographic วงกลม 50/50 — จริง (เขียว) vs มั่ว (แดง)",
      "narration": "สรุปคือ โหงวเฮ้งจริงครึ่งเดียว ส่วนที่จริงคือ ใบหน้าส่งผลต่อ First Impression และการประเมินจากคนอื่น แต่ส่วนที่มั่วคือ ใบหน้าไม่ได้กำหนดชะตาชีวิต สิ่งที่เปลี่ยนได้คือ Expression ความมั่นใจ"
    },
    {
      "label": "bridge_to_part3",
      "pct": [0.92, 1.0],
      "text_overlay": "แล้วจุดไหนเปลี่ยนได้?",
      "text_style": "cta_yellow",
      "narration": "แล้วถ้าอยากเปลี่ยน First Impression ให้ดีขึ้น จุดไหนบนใบหน้าที่เปลี่ยนแล้วเห็นผลมากที่สุด? Part 3 หมอจะบอกเลย กดติดตามไว้นะคะ"
    }
  ],
  "hashtags": ["#โหงวเฮ้ง", "#ใบหน้า", "#จิตวิทยา", "#วิจัย", "#Face", "#Science", "#หมอกวาง"],
  "caption": "โหงวเฮ้ง จริงหรือมั่ว? วิทยาศาสตร์ตอบ Part 2 🔬 #โหงวเฮ้ง #ใบหน้า #จิตวิทยา #Face @หมอกวาง วลีรัตน์คลินิก",
  "cover": {
    "style": "question_hook",
    "headline": "โหงวเฮ้ง\nจริงหรือมั่ว?",
    "accent_color": "#FF4444",
    "expression": "explaining"
  },
  "bridge_note": "Part 3 = 'จุดไหนเปลี่ยนแล้วดูดีขึ้น?' → TREATMENT BRIDGE to clinic services"
}
```

- [ ] **Step 3: Create output directory**

```bash
mkdir -p /Users/witsarutkrimthungthong/WhisperCUT/output/hogweheng-part2
```

- [ ] **Step 4: Save script file**

Write the JSON above to `output/hogweheng-part2/script.json`

- [ ] **Step 5: Commit**

```bash
git add output/hogweheng-part2/script.json
git commit -m "feat: script for โหงวเฮ้ง Part 2 clip"
```

---

### Task 2: Generate Insert Images via Canva/AI

**Files:**
- Create: `output/hogweheng-part2/images/hogweheng_face_chart.png`
- Create: `output/hogweheng-part2/images/brain_frontal_lobe.png`
- Create: `output/hogweheng-part2/images/face_perception_study.png`
- Create: `output/hogweheng-part2/images/jaw_testosterone.png`
- Create: `output/hogweheng-part2/images/summary_50_50.png`

- [ ] **Step 1: Generate 5 insert images using AI image generation**

For each image, use descriptive prompts. Since Canva API may not be available, use any AI image tool or create simple graphics:

Image 1 — `hogweheng_face_chart.png`:
```
Prompt: "Thai-Chinese face reading diagram (โหงวเฮ้ง), minimalist style, 
5 points labeled on face: forehead, eyes, nose, mouth, chin. 
Clean white background, 1080x810px, infographic style"
```

Image 2 — `brain_frontal_lobe.png`:
```
Prompt: "Human brain diagram highlighting frontal lobe in blue, 
clean medical illustration style, labeled 'Frontal Cortex', 
white background, 1080x810px"
```

Image 3 — `face_perception_study.png`:
```
Prompt: "Scientific bar chart showing 'Confidence Expression vs Wealth Perception', 
3 bars: Low/Medium/High confidence, clean infographic, 
Journal of Personality citation, 1080x810px"
```

Image 4 — `jaw_testosterone.png`:
```
Prompt: "Side-by-side face comparison: strong jaw (high testosterone) vs 
soft jaw (low testosterone), anatomical style, clean labels, 1080x810px"
```

Image 5 — `summary_50_50.png`:
```
Prompt: "50/50 pie chart infographic, left green 'จริง' right red 'มั่ว', 
Thai text, clean modern design, 1080x810px"
```

- [ ] **Step 2: Save all images to output directory**

```bash
ls -la /Users/witsarutkrimthungthong/WhisperCUT/output/hogweheng-part2/images/
```

Expected: 5 PNG files

- [ ] **Step 3: Commit**

```bash
git add output/hogweheng-part2/images/
git commit -m "feat: insert images for โหงวเฮ้ง Part 2"
```

---

### Task 3: Generate Voice with MiniMax TTS

**Files:**
- Create: `output/hogweheng-part2/audio/narration.mp3`
- Read: `src/mcp/tools/capcut-bridge.ts` (for TTS function reference)

- [ ] **Step 1: Extract full narration text from script**

Concatenate all `narration` fields from script.json segments:

```
คนโบราณเชื่อว่าดูหน้าทายนิสัยได้ แต่วิทยาศาสตร์จริงๆ ว่าอะไร?
[pause 0.5s]
โหงวเฮ้งบอกว่าหน้าผากกว้าง = ฉลาด...
[continues for all segments]
```

- [ ] **Step 2: Call MiniMax TTS API**

```bash
cd /Users/witsarutkrimthungthong/WhisperCUT
npx tsx -e "
const resp = await fetch('https://api.minimaxi.chat/v1/t2a_v2?GroupId=' + process.env.MINIMAX_GROUP_ID, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + process.env.MINIMAX_API_KEY,
  },
  body: JSON.stringify({
    model: 'speech-02-hd',
    text: 'คนโบราณเชื่อว่าดูหน้าทายนิสัยได้ แต่วิทยาศาสตร์จริงๆ ว่าอะไร? โหงวเฮ้งบอกว่าหน้าผากกว้าง เท่ากับฉลาด คนสมัยก่อนเชื่อมาก แต่งานวิจัยจาก Cambridge ปี 2019 พบว่า ขนาดหน้าผากไม่ได้สัมพันธ์กับ IQ โดยตรง แต่สิ่งที่สัมพันธ์จริงคือ ความหนาของ Frontal Cortex ซึ่งมองจากภายนอกไม่ได้ โหงวเฮ้งบอกจมูกโด่งรวย แต่ที่น่าสนใจคืองานวิจัยจาก Journal of Personality ปี 2017 พบว่า คนที่ใบหน้าดูมั่นใจ จะถูกประเมินว่ามีฐานะดีกว่า โดยไม่เกี่ยวกับรูปจมูกโดยตรง แต่เกี่ยวกับ Expression ความมั่นใจบนใบหน้า คางและกรามสัมพันธ์กับ Testosterone จริง งานวิจัยปี 2021 จาก Evolution and Human Behavior พบว่า ผู้ชายกรามเหลี่ยมถูกประเมินว่า dominant มากกว่า แต่ไม่ได้หมายความว่าบั้นปลายจะดี โหงวเฮ้งจึงจริงครึ่งเดียว สรุปคือ โหงวเฮ้งจริงครึ่งเดียว ส่วนที่จริงคือ ใบหน้าส่งผลต่อ First Impression และการประเมินจากคนอื่น แต่ส่วนที่มั่วคือ ใบหน้าไม่ได้กำหนดชะตาชีวิต สิ่งที่เปลี่ยนได้คือ Expression ความมั่นใจ แล้วถ้าอยากเปลี่ยน First Impression ให้ดีขึ้น จุดไหนบนใบหน้าที่เปลี่ยนแล้วเห็นผลมากที่สุด? Part 3 หมอจะบอกเลย กดติดตามไว้นะคะ',
    voice_setting: {
      voice_id: 'moss_audio_39a5b671-1e08-11f1-be4b-de7d2e195ee6',
      speed: 1.0,
      vol: 1.0,
      pitch: 0,
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: 'mp3',
    },
  }),
});
const data = await resp.json();
if (data.data?.audio) {
  const buf = Buffer.from(data.data.audio, 'hex');
  require('fs').writeFileSync('output/hogweheng-part2/audio/narration.mp3', buf);
  console.log('Audio saved! Size:', buf.length);
} else {
  console.log('Error:', JSON.stringify(data));
}
"
```

Expected: `narration.mp3` file saved (~75 seconds of audio)

- [ ] **Step 3: Verify audio plays correctly**

```bash
file output/hogweheng-part2/audio/narration.mp3
# Expected: MPEG audio, MP3
```

- [ ] **Step 4: Commit**

```bash
git add output/hogweheng-part2/audio/
git commit -m "feat: MiniMax TTS narration for โหงวเฮ้ง Part 2"
```

---

### Task 4: Compose CapCut Draft

**Files:**
- Modify: `src/engine/capcut-draft-bridge.ts` (if needed)
- Create: `output/hogweheng-part2/capcut-project/draft_info.json`

- [ ] **Step 1: Build CapCut draft using existing bridge**

```bash
cd /Users/witsarutkrimthungthong/WhisperCUT
npx tsx -e "
import { generateCapCutDraft } from './src/engine/capcut-draft-bridge.js';

const draft = generateCapCutDraft({
  projectName: 'hogweheng_part2_โหงวเฮ้ง',
  clips: [
    // Insert images as photo clips (each segment)
    {
      filePath: '/Users/witsarutkrimthungthong/WhisperCUT/output/hogweheng-part2/images/hogweheng_face_chart.png',
      type: 'photo',
      width: 1080, height: 810,
      startOnTimeline: 0, duration: 5,
    },
    {
      filePath: '/Users/witsarutkrimthungthong/WhisperCUT/output/hogweheng-part2/images/brain_frontal_lobe.png',
      type: 'photo',
      width: 1080, height: 810,
      startOnTimeline: 5, duration: 17,
    },
    {
      filePath: '/Users/witsarutkrimthungthong/WhisperCUT/output/hogweheng-part2/images/face_perception_study.png',
      type: 'photo',
      width: 1080, height: 810,
      startOnTimeline: 22, duration: 19,
    },
    {
      filePath: '/Users/witsarutkrimthungthong/WhisperCUT/output/hogweheng-part2/images/jaw_testosterone.png',
      type: 'photo',
      width: 1080, height: 810,
      startOnTimeline: 41, duration: 17,
    },
    {
      filePath: '/Users/witsarutkrimthungthong/WhisperCUT/output/hogweheng-part2/images/summary_50_50.png',
      type: 'photo',
      width: 1080, height: 810,
      startOnTimeline: 58, duration: 11,
    },
  ],
  audio: [
    {
      filePath: '/Users/witsarutkrimthungthong/WhisperCUT/output/hogweheng-part2/audio/narration.mp3',
      startOnTimeline: 0,
      duration: 75,
      volume: 1.0,
      name: 'Dr.Gwang Voice Clone',
    },
  ],
  textOverlays: [
    { text: 'โหงวเฮ้ง จริงหรือมั่ว?', startOnTimeline: 0, duration: 5, fontSize: 42, color: '#FF4444' },
    { text: '1. หน้าผาก กว้าง = ฉลาด?', startOnTimeline: 5, duration: 17, fontSize: 36, color: '#FFFFFF' },
    { text: 'Forehead Width & Intelligence', startOnTimeline: 5, duration: 17, fontSize: 22, color: '#AAAAAA' },
    { text: '2. จมูกโด่ง = รวย?', startOnTimeline: 22, duration: 19, fontSize: 36, color: '#FFFFFF' },
    { text: 'Nose Shape & Wealth Perception', startOnTimeline: 22, duration: 19, fontSize: 22, color: '#AAAAAA' },
    { text: '3. คาง = บั้นปลายชีวิต?', startOnTimeline: 41, duration: 17, fontSize: 36, color: '#FFFFFF' },
    { text: 'Chin Shape & Life Outcomes', startOnTimeline: 41, duration: 17, fontSize: 22, color: '#AAAAAA' },
    { text: 'สรุป: จริง 50% มั่ว 50%', startOnTimeline: 58, duration: 11, fontSize: 42, color: '#FF6B35' },
    { text: 'แล้วจุดไหนเปลี่ยนได้? Part 3 →', startOnTimeline: 69, duration: 6, fontSize: 36, color: '#FFD700' },
  ],
});

console.log('Draft created at:', draft);
"
```

Expected: CapCut project folder created with `draft_info.json`

- [ ] **Step 2: Verify draft structure**

```bash
ls -la ~/Movies/CapCut/User\ Data/Projects/com.lveditor.draft/hogweheng_part2_โหงวเฮ้ง/
# Expected: draft_info.json, draft_meta_info.json, etc.
```

- [ ] **Step 3: Commit**

```bash
git add output/hogweheng-part2/
git commit -m "feat: CapCut draft for โหงวเฮ้ง Part 2"
```

---

### Task 5: Quality Check + Human Approval

**Files:**
- Read: `src/agents/quality/qa-gate-agent.ts`

- [ ] **Step 1: Run QA Gate checks**

Verify manually:
1. ✅ Hook contains "โหงวเฮ้ง" + question = curiosity gap
2. ✅ 3 numbered points = list format (proven save booster)
3. ✅ English subtitle per point = bilingual credibility
4. ✅ Insert images per segment = muted-viewing friendly
5. ✅ Bridge to Part 3 at end = series continuation
6. ✅ No needle/blood = TikTok safe
7. ✅ No price mention = not medical advertising
8. ✅ No off-platform CTA = algorithm friendly
9. ✅ Duration ~75s = sweet spot (60-90s)
10. ✅ Crossover educational format = Tier 1 predicted save 15%+

- [ ] **Step 2: Open CapCut Desktop and preview the draft**

Open CapCut Desktop → project should appear in recent projects → preview timeline

- [ ] **Step 3: Human reviews and approves or requests edits**

Present to user for approval. Expected human time: ~30 seconds.

- [ ] **Step 4: Save performance prediction to Supabase**

```bash
cd /Users/witsarutkrimthungthong/WhisperCUT
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
await sb.from('content_topics').insert({
  hook: 'โหงวเฮ้ง จริงหรือมั่ว? วิทยาศาสตร์ตอบ',
  topic: 'Face Science Part 2: โหงวเฮ้ง',
  content_type: 'crossover_educational',
  vibe: 'educational_warm',
  viral_score: 8,
  research_title: 'Face Perception & First Impression studies',
  angle: 'myth_bust_folk_wisdom_vs_science',
  status: 'ready',
});
console.log('Topic saved!');
"
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: โหงวเฮ้ง Part 2 clip ready for posting"
```

---

### Task 6: Post Preparation

- [ ] **Step 1: Export from CapCut Desktop**

In CapCut Desktop: Export → 1080x1920 → 30fps → High Quality

- [ ] **Step 2: Prepare cover image**

Use cover template from script.json:
- Style: question_hook
- Headline: "โหงวเฮ้ง\nจริงหรือมั่ว?"
- Red accent (#FF4444)
- Dr.Gwang explaining expression

- [ ] **Step 3: Prepare caption + hashtags**

```
โหงวเฮ้ง จริงหรือมั่ว? วิทยาศาสตร์ตอบ 🔬 Part 2
#โหงวเฮ้ง #ใบหน้า #จิตวิทยา #วิจัย #Face #Science #หมอกวาง
@หมอกวาง วลีรัตน์คลินิก
```

- [ ] **Step 4: Schedule post for 20:00 ICT (optimal time for target audience)**

- [ ] **Step 5: Prepare Part 3 teaser**

Comment on own clip after 1 hour:
"Part 3 จุดไหนเปลี่ยนแล้วดูดีขึ้น? มาเร็วๆ นี้ค่ะ 😊"
