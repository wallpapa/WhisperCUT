#!/usr/bin/env python3
"""
CapCut Draft Export: Convert a clone script → CapCut draft_content.json
Based on pyJianYingDraft patterns for JianYing/CapCut desktop.
"""

import json
import os
import sys
import uuid
import time
from pathlib import Path


def generate_id():
    """Generate a UUID for CapCut draft elements."""
    return str(uuid.uuid4()).upper()


def time_to_microseconds(ts: str) -> int:
    """Convert timestamp string like '0:05' or '1:30' to microseconds."""
    parts = ts.split(":")
    if len(parts) == 2:
        minutes = int(parts[0])
        seconds = int(parts[1])
    else:
        minutes = 0
        seconds = int(parts[0])
    return (minutes * 60 + seconds) * 1_000_000


def create_text_segment(text: str, start_us: int, duration_us: int,
                         font_size: int = 12, color: list = None,
                         position: str = "center"):
    """Create a CapCut text segment."""
    if color is None:
        color = [1.0, 1.0, 1.0, 1.0]  # White RGBA

    # Position mapping
    pos_map = {
        "top": [0.5, 0.15],
        "center": [0.5, 0.5],
        "bottom": [0.5, 0.8],
    }
    pos = pos_map.get(position, [0.5, 0.5])

    segment_id = generate_id()
    material_id = generate_id()

    material = {
        "id": material_id,
        "type": "text",
        "content": text,
        "font_path": "",
        "font_size": font_size,
        "font_color": color,
        "font_bold": True,
        "font_italic": False,
        "text_align": 1,  # center
        "text_shadow": {
            "color": [0.0, 0.0, 0.0, 0.8],
            "offset": [2, 2],
            "blur": 4
        },
        "background_color": [0.0, 0.0, 0.0, 0.0],
        "has_shadow": True,
        "position": pos,
    }

    segment = {
        "id": segment_id,
        "material_id": material_id,
        "type": "text",
        "target_timerange": {
            "start": start_us,
            "duration": duration_us,
        },
        "source_timerange": {
            "start": 0,
            "duration": duration_us,
        },
        "extra_material_refs": [],
        "enable_adjust": True,
        "render_index": 0,
    }

    return segment, material


def create_caption_segment(text: str, start_us: int, duration_us: int):
    """Create a caption/subtitle segment."""
    segment_id = generate_id()
    material_id = generate_id()

    material = {
        "id": material_id,
        "type": "subtitle",
        "content": text,
        "font_size": 8,
        "font_color": [1.0, 1.0, 1.0, 1.0],
        "font_bold": True,
        "background_color": [0.0, 0.0, 0.0, 0.6],
        "position": [0.5, 0.85],
        "has_shadow": True,
    }

    segment = {
        "id": segment_id,
        "material_id": material_id,
        "type": "subtitle",
        "target_timerange": {
            "start": start_us,
            "duration": duration_us,
        },
        "source_timerange": {
            "start": 0,
            "duration": duration_us,
        },
    }

    return segment, material


def script_to_capcut_draft(script: dict, project_name: str = "WhisperCUT Clone"):
    """Convert a clone script to CapCut draft_content.json format."""

    duration_sec = script.get("duration_sec", 90)
    total_duration_us = duration_sec * 1_000_000

    # Initialize draft structure
    draft = {
        "id": generate_id(),
        "name": project_name,
        "type": "draft_content",
        "version": 360000,
        "create_time": int(time.time()),
        "update_time": int(time.time()),
        "duration": total_duration_us,
        "canvas_config": {
            "width": 1080,
            "height": 1920,
            "ratio": "original",
        },
        "tracks": [],
        "materials": {
            "texts": [],
            "subtitles": [],
            "videos": [],
            "audios": [],
            "effects": [],
            "transitions": [],
            "stickers": [],
        },
        "config": {
            "original_sound_last_value": 1.0,
            "export_range": None,
        },
    }

    # Track collections
    text_segments = []
    text_materials = []
    caption_segments = []
    caption_materials = []

    # 1. Hook text overlay
    hook = script.get("hook", {})
    hook_text = hook.get("text_overlay", "")
    hook_dur = hook.get("duration_sec", 3) * 1_000_000
    if hook_text:
        seg, mat = create_text_segment(
            hook_text, 0, hook_dur,
            font_size=16, color=[1.0, 1.0, 0.0, 1.0],  # Yellow
            position="top"
        )
        text_segments.append(seg)
        text_materials.append(mat)

    # 2. Body text overlays
    body = script.get("body", [])
    for section in body:
        start_us = time_to_microseconds(section.get("timestamp_start", "0:00"))
        end_us = time_to_microseconds(section.get("timestamp_end", "0:10"))
        dur_us = end_us - start_us

        # Text overlays for this section
        overlays = section.get("text_overlays", [])
        overlay_dur = dur_us // max(len(overlays), 1) if overlays else dur_us

        for j, overlay in enumerate(overlays):
            seg, mat = create_text_segment(
                overlay,
                start_us + j * overlay_dur,
                overlay_dur,
                font_size=14,
                color=[1.0, 1.0, 1.0, 1.0],  # White
                position="center"
            )
            text_segments.append(seg)
            text_materials.append(mat)

        # Caption for this section
        caption_text = section.get("script", "")
        if caption_text:
            seg, mat = create_caption_segment(
                caption_text[:100],
                start_us,
                dur_us
            )
            caption_segments.append(seg)
            caption_materials.append(mat)

    # 3. CTA text overlay
    cta = script.get("cta", {})
    cta_text = cta.get("text_overlay", "")
    if cta_text:
        cta_start = total_duration_us - 10_000_000  # Last 10 seconds
        seg, mat = create_text_segment(
            cta_text, cta_start, 10_000_000,
            font_size=14, color=[1.0, 0.0, 0.0, 1.0],  # Red
            position="bottom"
        )
        text_segments.append(seg)
        text_materials.append(mat)

    # Build tracks
    text_track = {
        "id": generate_id(),
        "type": "text",
        "segments": text_segments,
        "attribute": {"is_default_name": True, "name": "Text Overlays"},
    }

    caption_track = {
        "id": generate_id(),
        "type": "subtitle",
        "segments": caption_segments,
        "attribute": {"is_default_name": True, "name": "Captions"},
    }

    # Placeholder video track (user adds their footage here)
    video_track = {
        "id": generate_id(),
        "type": "video",
        "segments": [],
        "attribute": {"is_default_name": True, "name": "Video"},
    }

    draft["tracks"] = [video_track, text_track, caption_track]
    draft["materials"]["texts"] = text_materials
    draft["materials"]["subtitles"] = caption_materials

    return draft


def export_capcut_project(script: dict, output_name: str):
    """Export a complete CapCut project folder."""

    output_dir = Path(f"/tmp/tiktok-clone/capcut_drafts/{output_name}")
    output_dir.mkdir(parents=True, exist_ok=True)

    # Generate draft_content.json
    draft = script_to_capcut_draft(script, project_name=output_name)

    draft_path = output_dir / "draft_content.json"
    with open(draft_path, "w", encoding="utf-8") as f:
        json.dump(draft, f, ensure_ascii=False, indent=2)

    # Generate draft_meta_info.json
    meta = {
        "draft_id": draft["id"],
        "draft_name": output_name,
        "draft_removable_storage_device": "",
        "draft_cloud_capcut_purchase_info": "",
        "draft_cloud_last_action_download": False,
        "draft_cloud_purchase_info": "",
        "draft_cloud_template_id": "",
        "draft_cloud_tutorial_info": "",
        "draft_cover": "",
        "draft_deeplink_url": "",
        "draft_enterprise_info": {
            "draft_enterprise_extra": "",
            "draft_enterprise_id": "",
            "draft_enterprise_name": "",
        },
        "draft_fold_path": str(output_dir),
        "draft_is_ai_shorts_draft": False,
        "draft_is_article_video_draft": False,
        "draft_is_from_deeplink": "",
        "draft_materials_copied": False,
        "draft_new_version": "",
        "draft_root_path": str(output_dir),
        "draft_segment_extra_info": "",
        "draft_timeline_materials_size_": 0,
        "draft_type": "",
        "tm_draft_cloud_completed": "",
        "tm_draft_cloud_modified": 0,
        "tm_draft_create": int(time.time()),
        "tm_draft_modified": int(time.time()),
        "tm_duration": draft["duration"],
    }

    meta_path = output_dir / "draft_meta_info.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    # Generate draft_agency_config.json
    agency = {
        "edit_page_project_config": {},
        "export_param": {
            "export_bitrate": 10000000,
            "export_fps": 30,
            "export_resolution_height": 1920,
            "export_resolution_width": 1080,
        },
    }

    agency_path = output_dir / "draft_agency_config.json"
    with open(agency_path, "w", encoding="utf-8") as f:
        json.dump(agency, f, ensure_ascii=False, indent=2)

    return str(output_dir)


def main():
    # Load a clone script
    if len(sys.argv) > 1:
        script_path = sys.argv[1]
    else:
        # Find latest clone script
        clones_dir = Path("/tmp/tiktok-clone/clones")
        scripts = sorted(clones_dir.glob("*.json"), key=os.path.getmtime, reverse=True)
        if not scripts:
            print("No clone scripts found. Run clone_generator.py first.")
            return
        script_path = str(scripts[0])

    print(f"{'='*60}")
    print(f"CapCut Draft Export")
    print(f"{'='*60}")
    print(f"Script: {script_path}")

    with open(script_path, "r", encoding="utf-8") as f:
        script = json.load(f)

    title = script.get("title", "Untitled")[:40]
    print(f"Title: {title}")

    # Export
    name_slug = Path(script_path).stem
    output_dir = export_capcut_project(script, name_slug)

    print(f"\n✅ CapCut draft exported to: {output_dir}")
    print(f"\nFiles created:")
    for f in Path(output_dir).iterdir():
        size = f.stat().st_size
        print(f"  📄 {f.name} ({size:,} bytes)")

    # Stats
    draft = json.load(open(Path(output_dir) / "draft_content.json", encoding="utf-8"))
    text_count = len(draft["materials"]["texts"])
    caption_count = len(draft["materials"]["subtitles"])
    track_count = len(draft["tracks"])

    print(f"\nDraft stats:")
    print(f"  Tracks: {track_count}")
    print(f"  Text overlays: {text_count}")
    print(f"  Captions: {caption_count}")
    print(f"  Duration: {draft['duration'] / 1_000_000:.0f}s")
    print(f"  Resolution: {draft['canvas_config']['width']}x{draft['canvas_config']['height']}")

    print(f"\n💡 To use: Copy the folder to CapCut's Drafts directory")
    print(f"   macOS: ~/Movies/CapCut/User Data/Projects/com.lveditor.draft/")


if __name__ == "__main__":
    main()
