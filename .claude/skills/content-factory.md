---
name: content-factory
description: |
  /whisper-create — Content Factory for automated TikTok clip production.
  Topic selection, script generation, compliance check, asset generation,
  QA gate, retention optimization, and post preparation.
---

# Content Factory — /whisper-create

Automated content production pipeline. From topic to ready-to-post TikTok clip with script, images, narration, compliance check, retention optimization, and posting schedule.

## TRIGGER

Activate when user says anything about creating content:
- "create a clip about X", "make a script for Y"
- Thai: "สร้างคลิป X", "ทำ script เรื่อง Y", "produce 7 คลิปสัปดาห์นี้"
- Or directly invokes `/whisper-create`

## WORKFLOW

### Step 1: TOPIC SELECTION

Source (priority order):
1. **User specifies directly** — "ทำคลิปเรื่อง โหงวเฮ้ง"
2. **War Room recommendation** — agents recommended this topic
3. **Supabase content_topics** — sorted by viral_score DESC
4. **shared_memories unmet needs** — most-asked questions ("ราคา", "เจ็บไหม")

Query for topics:
```sql
SELECT hook, topic, viral_score, content_type, vibe
FROM content_topics 
WHERE status = 'ready' 
ORDER BY viral_score DESC LIMIT 5;
```

### Step 2: SCRIPT GENERATION

Use existing MCP pipeline:
1. Call `whispercut_vibe_edit` or ScriptAgent with:
   - topic + vibe + platform (tiktok) + duration (60-90s)
   - Enrich with shared_memories (hook formulas, proven patterns)

2. Script structure (Dr.Gwang template):
   ```
   EMOTIONAL TRIGGER (0-1.5s): Charged phrase that activates emotion BEFORE hook
     Examples: "90% ของคนทำผิดตรงนี้" / "หมอบอกตรงๆ:" / "สิ่งที่พ่อแม่ไม่เคยรู้..."
   HOOK (1.5-5s): Bold claim or question — must score 7+ on hook_scorer
   POINT 1 (5-22s): First argument with research reference
   POINT 2 (22-41s): Second argument with study
   POINT 3 (41-58s): Third argument with evidence
   SUMMARY (58-69s): "สรุป: [key takeaway]"
   CTA/BRIDGE (69-75s): Bridge to next part or soft CTA
   ```
   
   **MANDATORY: Every script MUST have an emotional trigger phrase in the first 1.5 seconds.**
   Select from Retention Optimizer's trigger phrase library based on content type.

3. Hook scoring via HookAgent:
   - If `hook_score < 7` → auto-rewrite and re-score (max 3 attempts)
   - If `hook_score >= 7` → proceed

### Step 3: RETENTION OPTIMIZATION

Launch Retention Optimizer agent (`agents/retention-optimizer.md`):

Input: the generated script
Task:
1. Analyze script for retention curve prediction
2. Insert retention bridges every 3-5 seconds
3. Add pattern interrupts at predicted drop points
4. Ensure re-hooks at 12s, 24s, 36s marks
5. Add open loops (minimum 2 per clip)
6. Validate against retention benchmarks from Supabase

Output: optimized script with retention annotations

### Step 4: COMPLIANCE CHECK

Launch Policy Guardian agent (background):
- Check script for 15 banned keywords (แพทยสภา):
  "ดีที่สุด", "อันดับ 1", "การันตี", "ไม่เจ็บ", "ปลอดภัย 100%",
  "ทุกคนทำได้", "ถูกที่สุด", "เห็นผลทันที", "ไม่มีผลข้างเคียง",
  "แพทย์อันดับ 1", "ศูนย์ที่ดีที่สุด", "ราคาพิเศษ", "ลดราคา",
  "โปรโมชั่น", "ผ่อน 0%"
- Check for guaranteed result claims
- Check for TikTok-suppressed terms (ศัลยกรรม, ฟิลเลอร์, โบท็อกซ์)
- Suggest safe alternatives
- Output: pass/fail + suggested edits

### Step 5: ASSET GENERATION

Run in parallel:

**a) Insert images:**
- Generate HTML infographics from script image descriptions
- Style: 1080x810px, clean, sans-serif, data-visualization
- RED (#FF4444) for emphasis (proven 4/5 clips use it)
- Save to `output/{project}/images/`

**b) Cover image:**
- Use cover-template.ts or generate HTML cover
- Bold headline (max 8 Thai characters visible)
- Style matches script.cover data

**c) Narration script:**
- Extract narration text per segment for CapCut TTS
- Format: segment markers + timing + visual instructions
- Save to `output/{project}/capcut-narration-script.txt`

### Step 6: COMPOSE

Two paths:

**AUTO (CapCut Draft Bridge):**
- Input: images + text overlays + timing from script
- Output: CapCut Desktop project (draft_info.json)
- User opens in CapCut, adds TTS voice, exports

**MANUAL (Narration Script):**
- Input: segment-by-segment text + timing + visual instructions
- Output: capcut-narration-script.txt
- User assembles manually in CapCut

### Step 7: QA GATE

QAGateAgent checks (threshold 7.5/10):
- [ ] Muted test: does text tell story without audio?
- [ ] Hook score >= 7
- [ ] Duration 60-90s (sweet spot)
- [ ] No banned keywords (compliance passed)
- [ ] Insert images present per segment
- [ ] CTA at end (verbal, TikTok-safe — no external links)
- [ ] Retention bridges present every 3-5s
- [ ] Open loops >= 2

If score < 7.5 → auto-retry pipeline (max 3 attempts)
If 3 failures → log + skip, move to next topic

### Step 8: HUMAN APPROVAL

Present complete package:
```
## Script: [title]
**Hook:** [hook text] (Score: X/10, Type: [taxonomy])
**Duration:** Xs | **Segments:** N
**Retention:** [predicted curve shape] — bridges at [timestamps]
**Compliance:** PASS/FAIL

### Content Summary
[Hook → Point 1 → Point 2 → Point 3 → Summary → CTA]

### Assets
- Images: N infographics generated
- Narration: capcut-narration-script.txt ready
- Cover: [cover description]

### Predicted Performance
- Content Function: [seeding/scaling/converting/social_weapon]
- Predicted Save%: X% (based on template match)
```

User: "approve" → proceed | "แก้ X" → edit and re-check

### Step 9: POST PREPARATION

Generate:
- Caption + hashtags (from script, max 4-5 relevant Thai + English)
- Cover image specification
- Optimal posting time: 20:30-21:30 ICT (Tue/Thu preferred)
- Save to Supabase content_calendar
- Comment to post 1 hour after: "[Part X+1 มาเร็วๆ นี้ 😊]" (if series)

## CONTENT RATIO

Weekly 7 clips, ratio 4:2:1 (Magnet:Bridge:Closer):

| Day | Type | Purpose | CTA Rule |
|-----|------|---------|----------|
| Mon | A MAGNET | crossover/lifestyle hook | NO CTA |
| Tue | A MAGNET | "ใบหน้าบอก___" series | NO CTA |
| Wed | B BRIDGE | reply-to-comment video | soft "DM ได้เลย" |
| Thu | A MAGNET | psychology/career crossover | NO CTA |
| Fri | B BRIDGE | pain/recovery FAQ | soft CTA |
| Sat | C CLOSER | before/after + testimonial | "DM มาปรึกษาฟรี" |
| Sun | A MAGNET | doctor lifestyle/personality | NO CTA |

Rules:
- Type A: NO CTA, NO treatment mention → maximize algorithm reach
- Type B: soft CTA "DM ได้เลย" → qualify leads
- Type C: social proof + "DM มาปรึกษาฟรี" → convert
- Never 2 Type C clips in a row (algorithm reads as promotional)

## OUTPUT STRUCTURE

```
output/{project-slug}/
  script.json           — full script with segments, timing, text overlays
  images/               — HTML infographics (1080x810px)
  capcut-narration-script.txt  — CapCut TTS narration per segment
  cover.html            — cover image template
```
