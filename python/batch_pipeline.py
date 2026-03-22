#!/usr/bin/env python3
"""
Batch Pipeline: Download TikTok videos → Gemini analysis → Save JSON → Cleanup
Processes all 2026 @doctorwaleerat videos efficiently.
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path

from google import genai

# Config
API_KEY = open("/tmp/tiktok-clone/.env").read().split("=", 1)[1].strip()
client = genai.Client(api_key=API_KEY)
VIDEOS_DIR = Path("/tmp/tiktok-clone/videos")
ANALYSIS_DIR = Path("/tmp/tiktok-clone/analysis")
VIDEOS_DIR.mkdir(exist_ok=True)
ANALYSIS_DIR.mkdir(exist_ok=True)

# Gemini analysis prompt
PROMPT = """วิเคราะห์วิดีโอ TikTok นี้แบบละเอียด ตอบเป็น JSON เท่านั้น (ไม่ต้องมี markdown code block):

{
  "transcript": {
    "full_text": "ข้อความทั้งหมดที่พูดในวิดีโอ ภาษาไทย",
    "segments": [
      {"start": "0:00", "end": "0:03", "text": "ข้อความ"}
    ]
  },
  "structure": {
    "hook": {
      "type": "news_clip|question|statement|shock|story|humor",
      "duration_sec": 3,
      "description": "อธิบาย hook ที่ใช้",
      "text_overlay": "ข้อความที่แสดงบนหน้าจอ"
    },
    "body": [
      {
        "timestamp": "0:05",
        "type": "talking_head|b_roll|split_screen|text_card",
        "text_overlay": "ข้อความบนหน้าจอ (ถ้ามี)",
        "content_summary": "สรุปเนื้อหาส่วนนี้"
      }
    ],
    "cta": {
      "type": "book_plug|follow|link|subscribe|none",
      "timestamp": "1:10",
      "description": "อธิบาย CTA"
    }
  },
  "text_overlays": ["รายการข้อความทั้งหมดที่แสดงบนหน้าจอ"],
  "style": {
    "text_font_style": "bold|regular|outline",
    "text_position": "center|top|bottom",
    "text_colors": ["#FFFFFF"],
    "text_background": "none|solid|gradient",
    "has_background_music": true,
    "face_screen_ratio": 0.6,
    "camera_angle": "front|side|mixed",
    "setting": "อธิบายฉากหลัง",
    "transitions": ["cut|fade|zoom"],
    "pacing": "fast|medium|slow"
  },
  "metadata": {
    "topic": "หัวข้อหลักของวิดีโอ",
    "category": "health|education|lifestyle|drama|business|psychology|parenting",
    "tone": "อธิบายโทนการนำเสนอ",
    "target_audience": "กลุ่มเป้าหมาย",
    "engagement_hooks": ["เทคนิคที่ใช้ดึงดูดคนดู"],
    "duration_sec": 60,
    "language_mix": "thai_only|thai_english|thai_chinese"
  }
}"""


def get_video_ids():
    """Read saved 2026 video list."""
    ids = []
    with open("/tmp/tiktok-clone/videos_2026_list.txt") as f:
        for line in f:
            parts = line.strip().split(None, 2)
            if len(parts) >= 2:
                ids.append({"id": parts[0], "timestamp": int(parts[1]), "title": parts[2] if len(parts) > 2 else ""})
    return ids


def download_video(video_id: str) -> str | None:
    """Download a single TikTok video. Returns path or None."""
    output = VIDEOS_DIR / f"{video_id}.mp4"
    if output.exists():
        return str(output)

    cmd = [
        "yt-dlp",
        f"https://www.tiktok.com/@doctorwaleerat/video/{video_id}",
        "-o", str(output),
        "--no-warnings",
        "-q",
    ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=60)
        if output.exists():
            return str(output)
    except subprocess.TimeoutExpired:
        pass
    return None


def analyze_video(video_path: str, video_id: str) -> dict | None:
    """Upload to Gemini File API → analyze → return JSON."""
    try:
        # Upload
        uploaded = client.files.upload(file=video_path)

        # Wait for processing
        retries = 0
        while uploaded.state.name == "PROCESSING" and retries < 30:
            time.sleep(2)
            uploaded = client.files.get(name=uploaded.name)
            retries += 1

        if uploaded.state.name != "ACTIVE":
            print(f"    ⚠️ File stuck in {uploaded.state.name}")
            return None

        # Analyze
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                genai.types.Content(
                    parts=[
                        genai.types.Part.from_uri(
                            file_uri=uploaded.uri,
                            mime_type="video/mp4"
                        ),
                        genai.types.Part.from_text(text=PROMPT)
                    ]
                )
            ]
        )

        # Parse JSON
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            if raw.endswith("```"):
                raw = raw[:-3].strip()

        result = json.loads(raw)

        # Add token usage
        if hasattr(response, 'usage_metadata') and response.usage_metadata:
            u = response.usage_metadata
            result["_tokens"] = {
                "input": getattr(u, 'prompt_token_count', 0),
                "output": getattr(u, 'candidates_token_count', 0),
                "total": getattr(u, 'total_token_count', 0),
            }

        # Cleanup uploaded file
        try:
            client.files.delete(name=uploaded.name)
        except:
            pass

        return result

    except json.JSONDecodeError as e:
        print(f"    ⚠️ JSON parse error: {e}")
        # Save raw for debugging
        raw_path = ANALYSIS_DIR / f"{video_id}_raw.txt"
        raw_path.write_text(raw if 'raw' in dir() else "no response")
        try:
            client.files.delete(name=uploaded.name)
        except:
            pass
        return None

    except Exception as e:
        print(f"    ❌ Error: {e}")
        try:
            client.files.delete(name=uploaded.name)
        except:
            pass
        return None


def main():
    videos = get_video_ids()
    total = len(videos)
    print(f"{'='*60}")
    print(f"WhisperCUT Batch Pipeline — {total} videos")
    print(f"{'='*60}")

    # Check which are already analyzed
    done = set()
    for f in ANALYSIS_DIR.glob("*.json"):
        done.add(f.stem)

    remaining = [v for v in videos if v["id"] not in done]
    print(f"Already analyzed: {len(done)}")
    print(f"Remaining: {len(remaining)}")

    if not remaining:
        print("✅ All videos analyzed!")
        return

    # Process batch
    start_idx = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    batch_size = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    batch = remaining[start_idx:start_idx + batch_size]

    total_tokens = 0
    success = 0
    failed = 0
    t_start = time.time()

    for i, video in enumerate(batch):
        vid = video["id"]
        title = video["title"][:60]
        print(f"\n[{start_idx + i + 1}/{len(remaining)}] {vid}")
        print(f"  📝 {title}")

        # Step 1: Download
        print("  ⬇️  Downloading...", end=" ", flush=True)
        t0 = time.time()
        path = download_video(vid)
        if not path:
            print("❌ Download failed")
            failed += 1
            continue
        size_mb = os.path.getsize(path) / 1024 / 1024
        print(f"✅ {size_mb:.1f}MB in {time.time()-t0:.1f}s")

        # Step 2: Analyze with Gemini
        print("  🤖 Analyzing...", end=" ", flush=True)
        t1 = time.time()
        result = analyze_video(path, vid)
        if result:
            # Save
            result["_video_id"] = vid
            result["_title"] = video["title"]
            result["_timestamp"] = video["timestamp"]
            out_path = ANALYSIS_DIR / f"{vid}.json"
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)

            tokens = result.get("_tokens", {}).get("total", 0)
            total_tokens += tokens
            print(f"✅ {time.time()-t1:.1f}s ({tokens:,} tokens)")
            success += 1
        else:
            print("❌ Analysis failed")
            failed += 1

        # Step 3: Cleanup video file (keep analysis JSON)
        try:
            os.remove(path)
            print("  🗑️  Video cleaned up")
        except:
            pass

        # Rate limit: Gemini free tier = 15 RPM for 2.5 Flash
        if i < len(batch) - 1:
            time.sleep(5)

    # Summary
    elapsed = time.time() - t_start
    print(f"\n{'='*60}")
    print(f"BATCH COMPLETE")
    print(f"{'='*60}")
    print(f"Success: {success}/{len(batch)}")
    print(f"Failed: {failed}/{len(batch)}")
    print(f"Total tokens: {total_tokens:,}")
    print(f"Time: {elapsed:.0f}s ({elapsed/60:.1f}min)")
    print(f"Total analyzed: {len(done) + success}/{total}")

    est_cost = total_tokens * 0.00000015  # ~$0.15/M input for 2.5 Flash
    print(f"Est cost: ${est_cost:.4f}")

    remaining_count = len(remaining) - len(batch)
    if remaining_count > 0:
        print(f"\n⏭️  {remaining_count} videos remaining.")
        print(f"   Run: python3 batch_pipeline.py {start_idx + batch_size} {batch_size}")


if __name__ == "__main__":
    main()
