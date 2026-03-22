#!/usr/bin/env python3
"""
Clone Generator: Given a style template + topic → generate TikTok script in หมอกวาง's style
Uses Gemini to generate the script, then FFmpeg to render with text overlays.
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path

from google import genai

API_KEY = open("/tmp/tiktok-clone/.env").read().split("=", 1)[1].strip()
client = genai.Client(api_key=API_KEY)

OUTPUT_DIR = Path("/tmp/tiktok-clone/clones")
OUTPUT_DIR.mkdir(exist_ok=True)


def load_style_template():
    """Load aggregated style template."""
    with open("/tmp/tiktok-clone/style_template.json", "r", encoding="utf-8") as f:
        return json.load(f)


def generate_script(topic: str, style_template: dict, duration_sec: int = 90) -> dict:
    """Generate a TikTok script that clones หมอกวาง's style."""

    # Build context from style template
    hook_dist = style_template.get("hook_patterns", {}).get("distribution", {})
    cta_dist = style_template.get("cta_patterns", {}).get("distribution", {})
    categories = style_template.get("content_patterns", {}).get("categories", {})
    avg_overlays = style_template.get("text_overlay_patterns", {}).get("avg_overlays_per_video", 30)
    avg_sections = style_template.get("body_structure", {}).get("avg_sections", 10)
    colors = style_template.get("text_overlay_patterns", {}).get("colors", {})
    pacing = style_template.get("visual_style", {}).get("pacing", {})
    engagement = style_template.get("content_patterns", {}).get("engagement_hooks", [])
    tone_samples = style_template.get("content_patterns", {}).get("tone_samples", [])
    sample_overlays = style_template.get("text_overlay_patterns", {}).get("sample_overlays", [])

    prompt = f"""คุณคือผู้เชี่ยวชาญสร้างสคริปต์วิดีโอ TikTok สไตล์ "หมอกวาง" (@doctorwaleerat)

## สไตล์ที่วิเคราะห์จากวิดีโอ {style_template.get('meta', {}).get('total_videos_analyzed', 0)} คลิป:

### Hook Patterns (ช่วงเปิด 3-5 วินาทีแรก):
{json.dumps(hook_dist, ensure_ascii=False)}

### CTA Patterns (ช่วงปิด):
{json.dumps(cta_dist, ensure_ascii=False)}

### Visual Style:
- Text overlay เฉลี่ย {avg_overlays:.0f} ข้อความต่อวิดีโอ
- Body sections เฉลี่ย {avg_sections:.1f} ส่วน
- สีตัวอักษรหลัก: {json.dumps(dict(list(colors.items())[:5]), ensure_ascii=False)}
- จังหวะ (pacing): {json.dumps(pacing, ensure_ascii=False)}

### Tone & Engagement:
- โทน: {', '.join(tone_samples[:5])}
- Engagement hooks: {json.dumps([h[0] for h in engagement[:10]], ensure_ascii=False)}

### ตัวอย่าง Text Overlays:
{chr(10).join(f'• {o}' for o in sample_overlays[:10])}

---

## คำสั่ง: สร้างสคริปต์วิดีโอ TikTok เรื่อง "{topic}"

ตอบเป็น JSON เท่านั้น (ไม่ต้องมี markdown code block):

{{
  "title": "ชื่อคลิป (ใส่ emoji ตามสไตล์หมอกวาง)",
  "duration_sec": {duration_sec},
  "hook": {{
    "type": "ประเภท hook ที่เหมาะสมที่สุดจากข้อมูล",
    "duration_sec": 3,
    "script": "สคริปต์พูดช่วง hook",
    "text_overlay": "ข้อความบนหน้าจอช่วง hook",
    "visual": "อธิบายภาพ/กราฟิกที่ใช้"
  }},
  "body": [
    {{
      "section_number": 1,
      "timestamp_start": "0:03",
      "timestamp_end": "0:15",
      "script": "สคริปต์พูดส่วนนี้",
      "text_overlays": ["ข้อความบนหน้าจอ 1", "ข้อความ 2"],
      "visual": "talking_head|b_roll|split_screen",
      "notes": "หมายเหตุการตัดต่อ"
    }}
  ],
  "cta": {{
    "type": "ประเภท CTA",
    "script": "สคริปต์พูดช่วง CTA",
    "text_overlay": "ข้อความ CTA บนหน้าจอ",
    "visual": "อธิบายภาพ CTA"
  }},
  "full_script": "สคริปต์เต็มทั้งหมดที่พูดในวิดีโอ (ต่อเนื่อง)",
  "all_text_overlays": ["รายการ text overlay ทั้งหมดตามลำดับเวลา"],
  "hashtags": ["#hashtag1", "#hashtag2"],
  "caption": "คำอธิบายใต้คลิป",
  "music_suggestion": "แนะนำเพลงประกอบ"
}}

สำคัญ:
1. พูดแบบหมอกวาง — ภาษากึ่งทางการ + เป็นกันเอง, ใช้ "นะคะ", "ค่ะ", "กันค่ะ"
2. เปิดด้วย hook ที่ดึงดูด (ใช้คำถาม/ข่าว/ข้อเท็จจริงช็อค)
3. เนื้อหาต้องมีข้อมูลทางวิทยาศาสตร์/แพทย์รองรับ
4. Text overlay ทุก 5-8 วินาที ตัวอักษรหนาสีขาว/เหลือง
5. ปิดด้วย CTA (แนะนำหนังสือ/กดติดตาม/คอมเมนต์)
6. ความยาวประมาณ {duration_sec} วินาที"""

    print("  🤖 Generating script with Gemini...")
    t0 = time.time()

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[prompt]
    )

    t1 = time.time() - t0
    print(f"  ✅ Script generated in {t1:.1f}s")

    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
        if raw.endswith("```"):
            raw = raw[:-3].strip()

    try:
        script = json.loads(raw)
        return script
    except json.JSONDecodeError as e:
        print(f"  ⚠️ JSON parse error: {e}")
        print(f"  Raw: {raw[:500]}")
        return None


def render_with_ffmpeg(script: dict, output_name: str, bg_color: str = "black"):
    """Render a basic preview video with text overlays using FFmpeg."""

    if not script:
        print("  ❌ No script to render")
        return None

    duration = script.get("duration_sec", 90)
    overlays = script.get("all_text_overlays", [])
    full_script_text = script.get("full_script", "")
    title = script.get("title", "Untitled")

    output_path = OUTPUT_DIR / f"{output_name}.mp4"
    srt_path = OUTPUT_DIR / f"{output_name}.srt"

    # Generate SRT captions from body sections
    srt_content = ""
    idx = 1
    body = script.get("body", [])

    for section in body:
        start = section.get("timestamp_start", "0:00")
        end = section.get("timestamp_end", "0:10")
        text = section.get("script", "")

        # Parse timestamps
        def parse_ts(ts):
            parts = ts.split(":")
            if len(parts) == 2:
                return f"00:{parts[0].zfill(2)}:{parts[1].zfill(2)},000"
            return f"00:00:{ts.zfill(2)},000"

        srt_content += f"{idx}\n{parse_ts(start)} --> {parse_ts(end)}\n{text}\n\n"
        idx += 1

    with open(srt_path, "w", encoding="utf-8") as f:
        f.write(srt_content)

    # Build FFmpeg command for 9:16 video with text overlays
    # Create a basic talking-head placeholder with text
    overlay_filter = []

    # Title text at top
    overlay_filter.append(
        f"drawtext=text='{title[:40]}'"
        f":fontcolor=white:fontsize=40:x=(w-text_w)/2:y=50"
        f":enable='between(t,0,{duration})'"
        f":borderw=2:bordercolor=black"
    )

    # Add text overlays at intervals
    interval = max(duration / max(len(overlays), 1), 5)
    for i, overlay_text in enumerate(overlays[:15]):
        start_t = i * interval
        end_t = start_t + interval
        clean_text = overlay_text.replace("'", "").replace(":", " ")[:50]
        y_pos = 400 + (i % 3) * 80

        overlay_filter.append(
            f"drawtext=text='{clean_text}'"
            f":fontcolor=yellow:fontsize=36:x=(w-text_w)/2:y={y_pos}"
            f":enable='between(t,{start_t:.1f},{end_t:.1f})'"
            f":borderw=2:bordercolor=black"
        )

    # Build full FFmpeg command
    filter_str = ",".join(overlay_filter)

    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"color=c={bg_color}:s=1080x1920:d={duration}",
        "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo",
        "-t", str(duration),
        "-vf", filter_str,
        "-c:v", "libx264", "-preset", "ultrafast",
        "-c:a", "aac",
        "-shortest",
        str(output_path)
    ]

    print(f"  🎬 Rendering {duration}s video...")
    t0 = time.time()
    result = subprocess.run(cmd, capture_output=True, timeout=60)
    t1 = time.time() - t0

    if result.returncode == 0 and output_path.exists():
        size_mb = os.path.getsize(output_path) / 1024 / 1024
        print(f"  ✅ Rendered: {output_path} ({size_mb:.1f}MB in {t1:.1f}s)")
        return str(output_path)
    else:
        print(f"  ❌ FFmpeg error: {result.stderr.decode()[:500]}")
        return None


def main():
    topic = sys.argv[1] if len(sys.argv) > 1 else "ทำไมเด็กรุ่นใหม่ถึงสายตาสั้นมากขึ้น"
    duration = int(sys.argv[2]) if len(sys.argv) > 2 else 90

    print(f"{'='*60}")
    print(f"WhisperCUT Clone Generator")
    print(f"{'='*60}")
    print(f"Topic: {topic}")
    print(f"Duration: {duration}s")

    # Load style template
    print("\n[1/3] Loading style template...")
    template = load_style_template()
    n = template.get("meta", {}).get("total_videos_analyzed", 0)
    print(f"  ✅ Template from {n} videos loaded")

    # Generate script
    print("\n[2/3] Generating clone script...")
    script = generate_script(topic, template, duration)

    if script:
        # Save script
        name_slug = topic[:30].replace(" ", "_").replace("/", "_")
        script_path = OUTPUT_DIR / f"{name_slug}.json"
        with open(script_path, "w", encoding="utf-8") as f:
            json.dump(script, f, ensure_ascii=False, indent=2)
        print(f"  📄 Script saved: {script_path}")

        # Print summary
        print(f"\n  📝 Title: {script.get('title', '')}")
        print(f"  🎣 Hook: {script.get('hook', {}).get('type', '')} — {script.get('hook', {}).get('script', '')[:80]}")
        print(f"  📋 Sections: {len(script.get('body', []))}")
        print(f"  📢 CTA: {script.get('cta', {}).get('type', '')}")
        print(f"  #️⃣  Hashtags: {', '.join(script.get('hashtags', [])[:5])}")
        print(f"  💬 Text overlays: {len(script.get('all_text_overlays', []))}")

        # Render preview
        print("\n[3/3] Rendering FFmpeg preview...")
        video_path = render_with_ffmpeg(script, name_slug)

        if video_path:
            print(f"\n✅ Clone complete!")
            print(f"   Script: {script_path}")
            print(f"   Video:  {video_path}")
    else:
        print("  ❌ Script generation failed")


if __name__ == "__main__":
    main()
