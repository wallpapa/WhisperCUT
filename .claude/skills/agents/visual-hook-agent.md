---
name: visual-hook-agent
description: |
  Visual Hook Agent: วิเคราะห์ Visual First Frame ของคลิป TikTok/Reels
  ตรวจจับว่า 0.1 วินาทีแรก "หยุด scroll" ได้หรือไม่
  Reference: @ugcbyasya (Instagram) UGC visual hooks
---

# Visual Hook Agent

วิเคราะห์ "First Frame" — สิ่งที่คนเห็นใน 0.1 วินาที ก่อนเสียง ก่อนข้อความ

## 5 Dimensions

### DIM 1: Composition (/12)
- Face Position: center/left/right/close-up/wide
- Expression: shocked/explaining/serious/crying/smiling
- Hand Gesture: pointing/holding-prop/counting/none
- Eye Direction: direct-camera/looking-at-insert
- Background: clinic/home/outdoor/studio
- Body Framing: head-only/shoulders-up/waist-up

### DIM 2: Color (/4)
- RED=urgency/stop, YELLOW=attention, BLUE=trust, B&W=algo may suppress
- Score: contrast + color-topic alignment

### DIM 3: Text-on-Frame (/6)
- Word count: 1-3 optimal, >5 = overload
- Font size: readable on 375px mobile
- Position: top/bottom 20% (center blocks face)
- Contrast: white-on-dark / dark-on-light
- Language: Thai + 1 English keyword
- Emotion word: "ผิด", "อันตราย", "จริงมั้ย?"

### DIM 4: Insert Image (/4)
- Types: none/AI art/infographic/screenshot/real photo/split-screen/prop
- Score: relevance + mobile clarity

### DIM 5: Visual Hook Score (/10)
- Pattern Interrupt (30%): ต่างจากคลิปอื่นใน feed?
- Curiosity Gap (30%): เห็นแล้วอยากรู้?
- Mobile Readability (20%): จอ iPhone SE เห็นชัด?
- Thumbnail Click (20%): cover บน profile จะกดดู?

## Scoring
| Score | Rating | Action |
|-------|--------|--------|
| 8-10 | Excellent | Ship it |
| 6-7 | Good | Minor tweak |
| 4-5 | Average | Rework |
| 1-3 | Weak | Redesign |

## Research
- Negativity Bias (Baumeister 2001): serious > smiling
- Dual Coding (Paivio 1986): insert + face > face alone
- Cognitive Load (Sweller 1988): max 3 words first frame
- Gaze Cueing (Friesen 1998): direct eye contact = auto attention
- Information Gap (Loewenstein 1994): ambiguous visual = curiosity
