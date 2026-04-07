# Dr.Gwang Full Clone Spec — AI Avatar + Zero Filming

## Vision
Clone ทุกองค์ประกอบของคลิป @doctorwaleerat ให้เป๊ะ ไม่ต้องถ่ายจริงอีก.
AI ทำ 100% → Human approve 1 click.

## องค์ประกอบที่ถอดได้ (12 layers)

### Layer 1: LAYOUT (9:16 vertical)
```
┌─────────────────────┐
│  B-roll / Insert     │ ← AI-generated image (Canva/Dreamina)
│  (ด้านบน 40%)        │   ข่าว, งานวิจัย, กราฟิก, สถิติ
├─────────────────────┤
│  Talking Head        │ ← HeyGen AI Avatar (หมอกวาง clone)
│  (ด้านกลาง 40%)      │   หรือ Dreamina Seedance 2.0
├─────────────────────┤
│  Props / Lower Third │ ← Canva graphic (หนังสือ, กราฟ)
│  (ด้านล่าง 20%)      │   + Like/Share/Subscribe animation
└─────────────────────┘
```

### Layer 2: INSERT FOOTAGE (ด้านบน)
**สำคัญมาก** — คลิปจริงมักมี insert ภาพ/footage ด้านบน:
- Screen capture ข่าวไวรัล → AI regenerate ใหม่ (ป้องกัน IP)
- งานวิจัย/กราฟ → Canva สร้างกราฟิกใหม่จาก data
- ภาพประกอบ → Dreamina/DALL-E generate
- **เป้าหมาย**: คนดูเข้าใจเนื้อหาโดยไม่ต้องฟังเสียง (muted viewing)

**Tools**: Canva Magic Design (แตกองค์ประกอบจาก screenshot) → แก้ไข → export

### Layer 3: TEXT OVERLAY (keyword)
```
Style: Bold white Thai center
       "ทฤษฎีแรงจูงใจ"

Font: Thick Thai (ตัวหนา)
Size: 36-40px
Color: #FFFFFF
Background: semi-transparent black rounded rect
Position: center of frame
```

### Layer 4: ENGLISH SUBTITLE
```
Style: Smaller, below Thai keyword
       "Paternal Investment Theory"

Font: Sans-serif
Size: 20-24px
Color: #CCCCCC (light gray)
Position: below Thai text
```

### Layer 5: NUMBER OVERLAY (for list content)
```
Style: Large number top-left
       "1" "2" "3"

Font: Bold sans-serif
Size: 72px
Color: #FFFFFF
Position: top-left corner
Animation: fade in
```

### Layer 6: CTA OVERLAY (ท้ายคลิป)
```
Style: Yellow bold
       "คอมเมนต์ได้เลย!"
       "กดเซฟ + กดติดตาม"

Color: #FFD700
+ Like/Share/Subscribe graphic animation
+ Social proof numbers overlay (views, likes)
```

### Layer 7: CAPTIONS (auto-subtitle)
```
Style: Bottom center, white on dark semi-transparent
Font: System Thai
Auto-generated from narration via Whisper
```

### Layer 8: AI AVATAR (หมอกวาง)
```
Source: HeyGen Avatar OR Dreamina Seedance 2.0
Input: Full narration text (Thai)
Output: Talking head video with lip sync
Style: Professional clinic setting
Outfit: Smart casual (เสื้อลายสก็อต, ชุดหมอ)
Expression: Friendly, educational
Gesture: Hand gestures while explaining
```

### Layer 9: VOICE (เสียงหมอกวาง)
```
Source: MiniMax TTS (speech-02-hd)
Voice ID: moss_audio_39a5b671-1e08-11f1-be4b-de7d2e195ee6
Endpoint: api.minimaxi.chat (international)
Style: Natural Thai, warm, educational tone
Speed: 1.0x
```

### Layer 10: BACKGROUND MUSIC
```
Style: NONE (Dr.Gwang signature = voice only!)
Exception: Very subtle ambient for specific vibes
Volume: 0% (voice 100%)
```

### Layer 11: TRANSITIONS
```
Style: HARD CUT only (no fancy transitions)
Between segments: instant cut
No dissolves, no wipes, no zoom
Clean and professional
```

### Layer 12: POST METADATA
```
Hashtags: #หมอกวาง #เลี้ยงลูก #พ่อแม่ #หมอ #สุขภาพ + topic-specific
Caption: Hook text + 3-5 hashtags
Post time: 19:00-21:00 (2x engagement)
Pin: Top 3 videos = ปักหมุด (32x views multiplier)
Comment reply: emoji 😊 for humor, 2-4 words for questions
```

## Full Pipeline Flow

```
1. TOPIC      ← ContentPlannerAgent (Tavily trends + memory)
              → Human picks (10 sec)

2. RESEARCH   ← Tavily API + PubMed (auto)
              → Extract key stats, theories, English terms

3. SCRIPT     ← ScriptAgent (Vibe Engine + keyframe template)
              → 5-10 segments with narration + keyword + English term

4. INSERT     ← For each segment that needs visual:
   IMAGES       - Search news/research screenshots
              → Canva "แตกองค์ประกอบ" from reference
              → AI regenerate (Dreamina/DALL-E) to avoid IP
              → Export as PNG 1080x(variable)

5. AVATAR     ← HeyGen or Dreamina Seedance 2.0
              → Input: full_narration text
              → Output: talking head MP4 with lip sync
              → Green screen or clinic background

6. VOICE      ← MiniMax TTS Dr.Gwang voice
              → If MiniMax unavailable: F5-TTS local clone
              → Output: MP3/WAV

7. COMPOSE    ← CapCut Draft Bridge (keyframe template)
              → Layer: insert images (top) + avatar (center) + props (bottom)
              → Add text overlays per segment
              → Add English subtitles
              → Add number overlays for list content
              → Add captions (Whisper auto-subtitle)
              → Add CTA overlay at end
              → NO music, NO transitions (hard cut only)

8. QA         ← QAGateAgent
              → Hook score ≥ 7
              → Check: muted viewing test (text visible?)

9. EXPORT     ← CapCut Desktop render 1080P
              → OR FFmpeg headless render

10. APPROVE   ← Human reviews (30 sec)
              → "approve" or "แก้ไข..."

11. PUBLISH   ← TikTok auto-post at 19:00-21:00
              → Pin if top performer
              → Auto-reply comments 😊
```

## Canva Integration for Insert Images

### Workflow:
1. Screenshot reference (news article, research graph)
2. Upload to Canva → "Edit image" / "Magic Design"
3. Canva แตกองค์ประกอบ: text, shapes, colors, layout
4. Modify: change text, restyle, add brand elements
5. Export as PNG → WhisperCUT pipeline
6. **Alternative**: Use Canva API to generate programmatically

### Canva API Flow:
```
whispercut_generate_covers({
  topic: "ทฤษฎีแรงจูงใจ Paternal Investment Theory",
  style: "research_graph",    // or "news_screenshot", "statistic"
  variants: 3,
  dimensions: "1080x720"      // top section of 9:16
})
→ Returns 3 variants
→ User picks best (RL learning)
→ Insert into CapCut timeline
```

## Muted Viewing Principle
"คนดูเข้าใจเนื้อหาโดยไม่ต้องฟังเสียง แค่ดูก็เข้าใจ"

Every segment must pass the MUTED TEST:
- [ ] Text overlay visible and readable
- [ ] Insert image/graphic tells the story visually
- [ ] Numbers/statistics shown on screen
- [ ] English terms displayed (bilingual viewers)
- [ ] CTA graphic clear without audio
