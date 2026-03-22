#!/usr/bin/env python3
"""
Style Template Aggregator: Analyze all Gemini JSON outputs → build comprehensive style_template.json
Run this after batch_pipeline.py has processed enough videos.
"""

import json
import glob
from collections import Counter, defaultdict
from pathlib import Path


def load_analyses():
    """Load all analysis JSON files."""
    files = sorted(glob.glob("/tmp/tiktok-clone/analysis/*.json"))
    analyses = []
    for f in files:
        try:
            data = json.load(open(f, encoding="utf-8"))
            analyses.append(data)
        except:
            pass
    return analyses


def aggregate(analyses: list) -> dict:
    """Aggregate patterns across all videos."""

    # Counters
    hook_types = Counter()
    hook_descriptions = []
    cta_types = Counter()
    cta_descriptions = []
    categories = Counter()
    tones = []
    targets = []
    body_types = Counter()
    text_positions = Counter()
    text_font_styles = Counter()
    text_colors = Counter()
    text_backgrounds = Counter()
    pacing = Counter()
    camera_angles = Counter()
    settings = []
    transitions = Counter()
    engagement_hooks_list = []
    language_mix = Counter()

    all_text_overlays = []
    all_transcripts = []
    overlay_counts = []
    body_section_counts = []
    segment_counts = []
    durations = []
    token_totals = []

    for a in analyses:
        # Structure
        struct = a.get("structure", {})
        hook = struct.get("hook", {})
        hook_type = hook.get("type", "unknown")
        # Handle multi-value types like "question|shock"
        for ht in hook_type.split("|"):
            hook_types[ht.strip()] += 1
        hook_descriptions.append({
            "type": hook_type,
            "description": hook.get("description", ""),
            "text_overlay": hook.get("text_overlay", ""),
            "duration_sec": hook.get("duration_sec", 3),
        })

        cta = struct.get("cta", {})
        cta_type = cta.get("type", "none")
        for ct in cta_type.split("|"):
            cta_types[ct.strip()] += 1
        cta_descriptions.append({
            "type": cta_type,
            "description": cta.get("description", ""),
        })

        body = struct.get("body", [])
        body_section_counts.append(len(body))
        for b in body:
            bt = b.get("type", "unknown")
            for t in bt.split("|"):
                body_types[t.strip()] += 1

        # Text overlays
        overlays = a.get("text_overlays", [])
        overlay_counts.append(len(overlays))
        all_text_overlays.extend(overlays[:5])  # Sample

        # Style
        style = a.get("style", {})
        for pos in str(style.get("text_position", "")).split("|"):
            text_positions[pos.strip()] += 1
        for fs in str(style.get("text_font_style", "")).split("|"):
            text_font_styles[fs.strip()] += 1
        for c in style.get("text_colors", []):
            text_colors[c] += 1
        text_backgrounds[style.get("text_background", "none")] += 1
        pacing[style.get("pacing", "medium")] += 1
        for ca in str(style.get("camera_angle", "")).split("|"):
            camera_angles[ca.strip()] += 1
        settings.append(style.get("setting", ""))
        for tr in style.get("transitions", []):
            for t in tr.split("|"):
                transitions[t.strip()] += 1

        # Metadata
        meta = a.get("metadata", {})
        for cat in str(meta.get("category", "")).split("|"):
            categories[cat.strip()] += 1
        tones.append(meta.get("tone", ""))
        targets.append(meta.get("target_audience", ""))
        engagement_hooks_list.extend(meta.get("engagement_hooks", []))
        durations.append(meta.get("duration_sec", 60))
        language_mix[meta.get("language_mix", "thai_english")] += 1

        # Transcript
        transcript = a.get("transcript", {})
        segments = transcript.get("segments", [])
        segment_counts.append(len(segments))
        all_transcripts.append(transcript.get("full_text", "")[:200])

        # Tokens
        tokens = a.get("_tokens", {})
        token_totals.append(tokens.get("total", 0))

    n = len(analyses)

    # Build template
    template = {
        "meta": {
            "total_videos_analyzed": n,
            "avg_tokens_per_video": sum(token_totals) // max(n, 1),
            "total_tokens": sum(token_totals),
        },
        "hook_patterns": {
            "distribution": dict(hook_types.most_common()),
            "top_hooks": hook_types.most_common(5),
            "avg_hook_duration_sec": sum(h["duration_sec"] for h in hook_descriptions) / max(n, 1),
            "examples": hook_descriptions[:10],
        },
        "cta_patterns": {
            "distribution": dict(cta_types.most_common()),
            "top_ctas": cta_types.most_common(5),
            "examples": cta_descriptions[:10],
        },
        "body_structure": {
            "avg_sections": sum(body_section_counts) / max(n, 1),
            "section_type_distribution": dict(body_types.most_common()),
        },
        "text_overlay_patterns": {
            "avg_overlays_per_video": sum(overlay_counts) / max(n, 1),
            "font_styles": dict(text_font_styles.most_common()),
            "positions": dict(text_positions.most_common()),
            "colors": dict(text_colors.most_common(10)),
            "backgrounds": dict(text_backgrounds.most_common()),
            "sample_overlays": all_text_overlays[:30],
        },
        "visual_style": {
            "camera_angles": dict(camera_angles.most_common()),
            "pacing": dict(pacing.most_common()),
            "transitions": dict(transitions.most_common()),
            "settings": list(set(s for s in settings if s))[:10],
        },
        "content_patterns": {
            "categories": dict(categories.most_common()),
            "language_mix": dict(language_mix.most_common()),
            "avg_duration_sec": sum(durations) / max(n, 1),
            "avg_segments": sum(segment_counts) / max(n, 1),
            "engagement_hooks": Counter(engagement_hooks_list).most_common(20),
            "tone_samples": list(set(t for t in tones if t))[:10],
            "target_audience_samples": list(set(t for t in targets if t))[:10],
        },
        "transcript_samples": all_transcripts[:5],
    }

    return template


def main():
    analyses = load_analyses()
    print(f"Loaded {len(analyses)} analyses")

    if len(analyses) == 0:
        print("No analyses found. Run batch_pipeline.py first.")
        return

    template = aggregate(analyses)

    out_path = "/tmp/tiktok-clone/style_template.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(template, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Style template saved to {out_path}")
    print(f"\n{'='*60}")
    print(f"STYLE TEMPLATE SUMMARY ({len(analyses)} videos)")
    print(f"{'='*60}")

    print(f"\n🎣 Hook Types:")
    for hook, count in template["hook_patterns"]["top_hooks"]:
        pct = count / len(analyses) * 100
        print(f"  {hook}: {count} ({pct:.0f}%)")

    print(f"\n📢 CTA Types:")
    for cta, count in template["cta_patterns"]["top_ctas"]:
        pct = count / len(analyses) * 100
        print(f"  {cta}: {count} ({pct:.0f}%)")

    print(f"\n📂 Categories:")
    for cat, count in sorted(template["content_patterns"]["categories"].items(), key=lambda x: -x[1])[:7]:
        pct = count / len(analyses) * 100
        print(f"  {cat}: {count} ({pct:.0f}%)")

    print(f"\n📊 Averages:")
    print(f"  Duration: {template['content_patterns']['avg_duration_sec']:.0f}s")
    print(f"  Body sections: {template['body_structure']['avg_sections']:.1f}")
    print(f"  Text overlays: {template['text_overlay_patterns']['avg_overlays_per_video']:.0f}")
    print(f"  Hook duration: {template['hook_patterns']['avg_hook_duration_sec']:.1f}s")

    print(f"\n🎨 Visual Style:")
    print(f"  Pacing: {template['visual_style']['pacing']}")
    print(f"  Camera: {template['visual_style']['camera_angles']}")
    print(f"  Colors: {template['text_overlay_patterns']['colors']}")


if __name__ == "__main__":
    main()
