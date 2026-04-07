# CapCut Web Editor — UI Automation Recipe for Claude Chrome

## Overview
Step-by-step recipe for Claude in Chrome to operate CapCut Web Editor.
URL: `https://www.capcut.com/editor?draft_id={ID}&workspaceId={WORKSPACE_ID}`

## Pre-requisites
- User must be logged into CapCut in Chrome (TikTok/Google/Facebook login)
- Workspace: `waleerat marketing's space` (ID: 7350165605154242562)

## UI Layout Map

```
┌─────────────────────────────────────────────────────────────┐
│ [CapCut Logo] [workspace ▼] [project name ▼] [100%] [undo/redo] [ส่งออก] │
├────┬────────────┬─────────────────────┬─────────────────────┤
│    │            │                     │                     │
│ S  │  Media     │     Preview         │   Properties        │
│ I  │  Panel     │     Canvas          │   Panel             │
│ D  │            │                     │   (shows when       │
│ E  │  (left)    │     (center)        │    clip selected)   │
│ B  │            │                     │                     │
│ A  │            │                     │                     │
│ R  │            │                     │                     │
├────┴────────────┴─────────────────────┴─────────────────────┤
│ [split][delete]  [play] [00:00:00 | 00:00:00] [mic][ai][zoom] │
├─────────────────────────────────────────────────────────────┤
│                    TIMELINE                                  │
│  [00:00]  [10:00]  [20:00]  [30:00]  [40:00]  [50:00]      │
│  ████████████████████████████████████████ Video Track        │
│  ████████████████████████████████████████ Audio Track        │
│  ████████████████████████████████████████ Text Track         │
└─────────────────────────────────────────────────────────────┘
```

## Sidebar Tools (Left, top to bottom)

| # | Icon | Thai Name | English | CSS/Find Query | Action |
|---|------|-----------|---------|----------------|--------|
| 1 | 📁 | สื่อ | Media | "สื่อ" | Browse/upload files |
| 2 | 📐 | แม่แบบ | Templates | "แม่แบบ" | Pre-made templates |
| 3 | 🧩 | องค์ประกอบ | Elements | "องค์ประกอบ" | Stickers, shapes, AI elements |
| 4 | 🎵 | ระบบเสียง | Audio | "ระบบเสียง" | Music, SFX |
| 5 | T | ข้อความ | Text | "ข้อความ" | Text overlays |
| 6 | 💬 | คำบรรยาย | Captions | "คำบรรยาย" | Auto-captions/subtitles |
| 7 | 📝 | การถอดเสียง | Transcription | "การถอดเสียง" | Speech-to-text |
| 8 | ✨ | เอฟเฟกต์ | Effects | "เอฟเฟกต์" | Video effects |
| 9 | 🔄 | การเปลี่ยน | Transitions | "การเปลี่ยน" | Transition effects |

## Recipe 1: Import Video to Timeline

```
STEP 1: Navigate to editor
  → navigate("https://www.capcut.com/editor?draft_id={ID}&workspaceId=7350165605154242562")
  → wait(8) — editor loads slowly

STEP 2: Dismiss popups (CRITICAL — CapCut shows 2-3 popups on first load)
  → key("Escape")
  → wait(1)
  → key("Escape")
  → wait(1)
  → find("ตกลง") → click if exists
  → find("ถัดไป") → click if exists
  → find("close button") → click if exists

STEP 3: Click สื่อ (Media) in sidebar
  → find("สื่อ") → click
  → wait(2)

STEP 4: Find video in media panel
  → scroll down in media panel to find video thumbnails
  → videos show duration badge (e.g., "01:07")

STEP 5: Add video to timeline (TWO methods)
  METHOD A (hover + click +):
    → hover(video_thumbnail)
    → wait(1) — + button appears
    → click(+ button)

  METHOD B (drag):
    → left_click_drag(video_thumbnail → timeline_area)

  → wait(3) — video loads on timeline
```

## Recipe 2: Split/Cut Video

```
STEP 1: Click on clip in timeline to select it
  → click(clip_on_timeline)
  → clip turns blue when selected

STEP 2: Move playhead to cut point
  → click on timeline ruler at desired time position
  → OR use keyboard: arrow keys to move frame by frame

STEP 3: Split
  → keyboard shortcut: Ctrl+B (or Cmd+B on Mac)
  → OR click split button (scissors icon) above timeline
  → find("split") or find icon near [00:00:00]

STEP 4: Delete unwanted segment
  → click on unwanted segment
  → key("Delete") or key("Backspace")
  → OR click trash icon above timeline
```

## Recipe 3: Add Text Overlay

```
STEP 1: Click ข้อความ (Text) in sidebar
  → find("ข้อความ") → click
  → text panel opens

STEP 2: Choose text style
  → find("เพิ่มข้อความ") or find("Add text") → click
  → OR choose from preset styles

STEP 3: Type text content
  → double-click text on preview canvas
  → type("อยากอายุยืน")

STEP 4: Style the text (Dr.Gwang style)
  → Properties panel (right side) appears when text selected
  → Font: find Thai bold font
  → Size: 72+
  → Color: white text
  → Background: enable, black color
  → For highlight keyword: yellow color, in quotes
```

## Recipe 4: Add Auto-Captions (Thai Subtitles)

```
STEP 1: Click คำบรรยาย (Captions) in sidebar
  → find("คำบรรยาย") → click

STEP 2: Select language
  → find("ไทย" or "Thai") → click

STEP 3: Generate auto-captions
  → find("สร้างคำบรรยาย" or "Auto captions" or "Generate") → click
  → wait(30-60) — AI processes audio

STEP 4: Review and edit
  → captions appear on timeline as separate track
  → click individual caption to edit text
```

## Recipe 5: Add Transitions

```
STEP 1: Click การเปลี่ยน (Transitions) in sidebar
  → find("การเปลี่ยน") → click
  → transition gallery opens

STEP 2: Choose transition
  → browse categories or search
  → Dr.Gwang style: hard_cut (default) or zoom_punch

STEP 3: Apply to cut point
  → drag transition to the junction between two clips on timeline
  → OR double-click transition with cut point selected
```

## Recipe 6: Export Video

```
STEP 1: Click ส่งออก (Export) button — top right, blue button
  → find("ส่งออก") → click

STEP 2: Set export settings
  → Resolution: 1440P (or 1080P)
  → Format: MP4
  → Quality: Recommended

STEP 3: Export
  → find("ส่งออก" or "Export") in dialog → click
  → wait(60-300) — rendering time depends on duration
```

## Recipe 7: Full WhisperCUT → CapCut Workflow

```
STEP 1: WhisperCUT generates script + cut_plan via auto_edit
  → whispercut_auto_edit(video_path, topic, vibe)
  → returns: cut_plan with segments, timestamps, text overlays

STEP 2: Open CapCut editor with source video
  → navigate to CapCut editor
  → import source video to timeline

STEP 3: Apply cuts from WhisperCUT cut_plan
  → for each segment in cut_plan:
    → move playhead to segment.original_start
    → split (Ctrl+B)
    → move playhead to segment.original_end
    → split (Ctrl+B)
  → delete segments marked as "cut"

STEP 4: Reorder segments (if needed)
  → drag segments on timeline to match hormone arc order

STEP 5: Add text overlays from cut_plan
  → for each text_overlay in cut_plan:
    → click ข้อความ → add text
    → type(overlay.text)
    → position at overlay.start_sec on timeline
    → style per Dr.Gwang pattern (bold, black bg, yellow highlight)

STEP 6: Add auto-captions
  → click คำบรรยาย → generate Thai captions

STEP 7: Add transitions
  → apply transitions at each cut point per cut_plan

STEP 8: Export
  → ส่งออก → 1440P MP4
```

## Keyboard Shortcuts (CapCut Web)

| Action | Shortcut |
|--------|----------|
| Play/Pause | Space |
| Split | Ctrl+B / Cmd+B |
| Delete | Delete / Backspace |
| Undo | Ctrl+Z / Cmd+Z |
| Redo | Ctrl+Shift+Z / Cmd+Shift+Z |
| Copy | Ctrl+C / Cmd+C |
| Paste | Ctrl+V / Cmd+V |
| Select All | Ctrl+A / Cmd+A |
| Zoom In Timeline | Ctrl++ / Cmd++ |
| Zoom Out Timeline | Ctrl+- / Cmd+- |
| Frame Forward | → (right arrow) |
| Frame Back | ← (left arrow) |

## Common Popup Dismissal

CapCut shows tutorial popups on first load. Always dismiss:
```
→ key("Escape") × 2
→ find("ตกลง") → click
→ find("ถัดไป") → click
→ find("close") → click
→ find("×") → click
```

## Notes for Claude Chrome Automation

1. **Always wait 8+ seconds** after navigating to editor — heavy JS app
2. **Dismiss 2-3 popups** before any action — use Escape + find("ตกลง")
3. **Desktop-only projects** show dialog "โปรเจกต์นี้ใช้ฟีเจอร์ที่มีเฉพาะใน CapCut บนเดสก์ท็อป" — click ยกเลิก
4. **Drag-to-timeline** may not work in web — use hover + click + method instead
5. **Thai language UI** — search by Thai text (สื่อ, ข้อความ, คำบรรยาย, ส่งออก)
6. **Timeline zoom** — use Ctrl+/- to zoom in/out for precision cuts
7. **Auto-save** — CapCut auto-saves to cloud, project name shows at top
