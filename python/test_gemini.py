#!/usr/bin/env python3
"""Test Gemini File API: upload TikTok video → transcribe Thai + analyze structure in ONE call."""

import json
import os
import time

from google import genai

# Load API key
api_key = os.environ.get("GEMINI_API_KEY") or open("/tmp/tiktok-clone/.env").read().split("=", 1)[1].strip()
client = genai.Client(api_key=api_key)

VIDEO_PATH = "/tmp/tiktok-clone/latest_7615254547165891858.mp4"

print("=" * 60)
print("Gemini Video Analysis Test")
print("=" * 60)

# Step 1: Upload video to Gemini File API
print("\n[1/3] Uploading video to Gemini File API...")
t0 = time.time()
uploaded_file = client.files.upload(file=VIDEO_PATH)
t_upload = time.time() - t0
print(f"  ✅ Uploaded in {t_upload:.1f}s")
print(f"  URI: {uploaded_file.uri}")
print(f"  State: {uploaded_file.state}")

# Wait for processing
while uploaded_file.state.name == "PROCESSING":
    print("  ⏳ Processing...")
    time.sleep(2)
    uploaded_file = client.files.get(name=uploaded_file.name)

print(f"  State: {uploaded_file.state}")

# Step 2: Analyze with Gemini 2.5 Flash (ONE call)
print("\n[2/3] Analyzing with Gemini 2.5 Flash (transcribe + structure + OCR)...")

PROMPT = """วิเคราะห์วิดีโอ TikTok นี้แบบละเอียด ตอบเป็น JSON เท่านั้น (ไม่ต้องมี markdown code block):

{
  "transcript": {
    "full_text": "ข้อความทั้งหมดที่พูดในวิดีโอ ภาษาไทย",
    "segments": [
      {"start": "0:00", "end": "0:03", "text": "ข้อความ"},
      {"start": "0:03", "end": "0:10", "text": "ข้อความ"}
    ]
  },
  "structure": {
    "hook": {
      "type": "news_clip|question|statement|shock",
      "duration_sec": 3,
      "description": "อธิบาย hook ที่ใช้",
      "text_overlay": "ข้อความที่แสดงบนหน้าจอ"
    },
    "body": [
      {
        "timestamp": "0:05",
        "type": "talking_head|b_roll|split_screen",
        "text_overlay": "ข้อความบนหน้าจอ (ถ้ามี)",
        "content_summary": "สรุปเนื้อหาส่วนนี้"
      }
    ],
    "cta": {
      "type": "book_plug|follow|link|none",
      "timestamp": "1:10",
      "description": "อธิบาย CTA"
    }
  },
  "text_overlays": ["รายการข้อความทั้งหมดที่แสดงบนหน้าจอ"],
  "style": {
    "text_font_style": "bold|regular|outline",
    "text_position": "center|top|bottom",
    "text_colors": ["#FFFFFF"],
    "has_background_music": true,
    "face_screen_ratio": 0.6,
    "camera_angle": "front|side|mixed",
    "setting": "อธิบายฉากหลัง"
  },
  "metadata": {
    "topic": "หัวข้อหลักของวิดีโอ",
    "tone": "อธิบายโทนการนำเสนอ",
    "target_audience": "กลุ่มเป้าหมาย",
    "engagement_hooks": ["เทคนิคที่ใช้ดึงดูดคนดู"]
  }
}"""

t1 = time.time()
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=[
        genai.types.Content(
            parts=[
                genai.types.Part.from_uri(
                    file_uri=uploaded_file.uri,
                    mime_type="video/mp4"
                ),
                genai.types.Part.from_text(text=PROMPT)
            ]
        )
    ]
)
t_analyze = time.time() - t1

print(f"  ✅ Analysis completed in {t_analyze:.1f}s")
print(f"  Total time: {t_upload + t_analyze:.1f}s")

# Step 3: Parse and save results
print("\n[3/3] Saving results...")

raw_text = response.text.strip()
# Remove markdown code blocks if present
if raw_text.startswith("```"):
    raw_text = raw_text.split("\n", 1)[1]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3].strip()

try:
    result = json.loads(raw_text)
    with open("/tmp/tiktok-clone/gemini_analysis.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print("  ✅ Saved to gemini_analysis.json")

    # Print summary
    print("\n" + "=" * 60)
    print("RESULTS SUMMARY")
    print("=" * 60)

    if "transcript" in result:
        print(f"\n📝 Transcript ({len(result['transcript'].get('segments', []))} segments):")
        full = result['transcript'].get('full_text', '')
        print(f"  {full[:200]}...")

    if "structure" in result:
        s = result['structure']
        print(f"\n🎬 Structure:")
        print(f"  Hook: {s.get('hook', {}).get('type', 'N/A')} — {s.get('hook', {}).get('description', '')[:100]}")
        print(f"  Body sections: {len(s.get('body', []))}")
        print(f"  CTA: {s.get('cta', {}).get('type', 'N/A')} — {s.get('cta', {}).get('description', '')[:100]}")

    if "text_overlays" in result:
        print(f"\n📋 Text overlays ({len(result['text_overlays'])}):")
        for t in result['text_overlays'][:5]:
            print(f"  • {t}")

    if "style" in result:
        st = result['style']
        print(f"\n🎨 Style:")
        print(f"  Font: {st.get('text_font_style', 'N/A')}")
        print(f"  Position: {st.get('text_position', 'N/A')}")
        print(f"  Colors: {st.get('text_colors', [])}")
        print(f"  Music: {st.get('has_background_music', 'N/A')}")

    if "metadata" in result:
        m = result['metadata']
        print(f"\n📊 Metadata:")
        print(f"  Topic: {m.get('topic', 'N/A')}")
        print(f"  Tone: {m.get('tone', 'N/A')}")
        print(f"  Target: {m.get('target_audience', 'N/A')}")

except json.JSONDecodeError as e:
    print(f"  ⚠️ JSON parse error: {e}")
    with open("/tmp/tiktok-clone/gemini_analysis_raw.txt", "w", encoding="utf-8") as f:
        f.write(raw_text)
    print("  Saved raw text to gemini_analysis_raw.txt")
    print(f"\n  Raw response (first 500 chars):\n  {raw_text[:500]}")

# Usage stats
if hasattr(response, 'usage_metadata') and response.usage_metadata:
    u = response.usage_metadata
    print(f"\n💰 Token Usage:")
    print(f"  Input: {getattr(u, 'prompt_token_count', 'N/A')}")
    print(f"  Output: {getattr(u, 'candidates_token_count', 'N/A')}")
    print(f"  Total: {getattr(u, 'total_token_count', 'N/A')}")

# Cleanup
client.files.delete(name=uploaded_file.name)
print(f"\n🗑️ Cleaned up uploaded file")

print(f"\n⏱️ Total pipeline time: {time.time() - t0:.1f}s")
