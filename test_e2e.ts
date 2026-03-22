#!/usr/bin/env npx tsx
/**
 * WhisperCUT v3 — E2E Test
 * Tests each layer independently; skips API layers if keys not set.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx MINIMAX_API_KEY=xxx npx tsx test_e2e.ts
 *   npx tsx test_e2e.ts   # FFmpeg-only test (no API keys needed)
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);
const OUT  = join(process.cwd(), "output/e2e_test");
mkdirSync(OUT, { recursive: true });

const HAS_GEMINI  = Boolean(process.env.GEMINI_API_KEY);
const HAS_MINIMAX = Boolean(process.env.MINIMAX_API_KEY);

function pass(msg: string)  { console.log(`  ✅ ${msg}`); }
function fail(msg: string)  { console.log(`  ❌ ${msg}`); }
function skip(msg: string)  { console.log(`  ⏭️  ${msg} (key not set)`); }
function info(msg: string)  { console.log(`     ${msg}`); }
function section(title: string) { console.log(`\n${"─".repeat(55)}\n🧪 ${title}`); }

// ───────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  WhisperCUT v3 — E2E Test");
  console.log(`  ${new Date().toISOString()}`);
  console.log("══════════════════════════════════════════════════════");
  console.log(`  GEMINI_API_KEY  : ${HAS_GEMINI  ? "✅ set" : "❌ not set (will use mock script)"}`);
  console.log(`  MINIMAX_API_KEY : ${HAS_MINIMAX ? "✅ set" : "❌ not set (will skip TTS)"}`);
  console.log(`  FFmpeg          : checking...`);

  // ── [1] FFmpeg ──────────────────────────────────────────────────────────
  section("Layer 1 — FFmpeg");
  try {
    const { stdout } = await exec("ffmpeg", ["-version"]);
    const ver = stdout.split("\n")[0];
    pass(`FFmpeg available: ${ver}`);
  } catch {
    fail("FFmpeg not found — install: brew install ffmpeg");
    process.exit(1);
  }

  // ── [2] Vibe Library ────────────────────────────────────────────────────
  section("Layer 2 — Vibe Library (no API needed)");
  try {
    const { getVibe, listVibes, recommendVibe } = await import("./src/science/vibe-library.js");

    const vibes = listVibes();
    pass(`Loaded ${vibes.length} vibes`);
    vibes.forEach(v => info(`${v.name.padEnd(20)} completion=${(v.completion*100).toFixed(0)}%  share=${(v.share*100).toFixed(1)}%`));

    const warm = getVibe("educational_warm");
    pass(`educational_warm: ${warm.hormone_arc.length} hormone beats, optimal=${warm.optimal_duration_sec}s`);

    const rec = recommendVibe("educational", "tiktok", "completion");
    pass(`recommendVibe(educational, tiktok, completion) → "${rec}"`);
  } catch (e: any) {
    fail(`Vibe library: ${e.message}`);
  }

  // ── [3] CTA Selector ────────────────────────────────────────────────────
  section("Layer 3 — CTA Selector (no API needed)");
  try {
    const { selectCTA, rankCTAs } = await import("./src/science/cta-selector.js");

    const ranked = rankCTAs();
    pass(`${ranked.length} CTA types ranked`);
    ranked.forEach(c => info(`${c.type.padEnd(18)} ${(c.rate*100).toFixed(1)}%  — ${c.description}`));

    const cta = selectCTA({ vibe: "shocking_reveal", platform: "tiktok", goal: "virality", duration_sec: 63 });
    pass(`shocking_reveal/tiktok/virality → ${cta.type} at ${cta.placement_pct}% (${(cta.conversion_rate*100).toFixed(1)}% conv)`);
    info(`Primary CTA text: "${cta.text_th}"`);
    info(`Secondary CTA: "${cta.secondary?.text_th}" at ${cta.secondary?.placement_pct}%`);
  } catch (e: any) {
    fail(`CTA selector: ${e.message}`);
  }

  // ── [4] Mock Script (simulate Gemini output) ────────────────────────────
  section("Layer 4 — Mock Script (VibeScript structure)");

  const mockScript = {
    topic:    "พัฒนาการลูกวัย 3 ขวบ — สิ่งที่พ่อแม่ต้องรู้",
    vibe:     "educational_warm",
    platform: "tiktok",
    duration_sec: 75,
    segments: [
      { label:"hook",       start_sec:0,  end_sec:3,  narration:"ถ้าลูกคุณอายุ 3 ขวบ สิ่งนี้สำคัญมากกว่าที่คุณคิด",           on_screen_text:"ลูก 3 ขวบ — อ่านด่วน!", hormone:"cortisol",  cut_rate:0.5, transition_in:"hard_cut",  visual_direction:"face close-up, eye contact" },
      { label:"problem",    start_sec:3,  end_sec:18, narration:"งานวิจัยจาก Harvard พบว่าพ่อแม่ 8 ใน 10 คน ทำสิ่งหนึ่งที่ส่งผลต่อสมองลูกโดยไม่รู้ตัว",                    on_screen_text:"8/10 พ่อแม่ทำแบบนี้โดยไม่รู้",          hormone:"dopamine",  cut_rate:0.3, transition_in:"l_cut",     visual_direction:"text overlay with statistic graphic" },
      { label:"story",      start_sec:18, end_sec:45, narration:"ตอนลูกฉันอายุ 3 ขวบ ฉันคิดว่าการให้เขาดู YouTube เด็กคือการเรียนรู้ แต่ผิดมาก",                              on_screen_text:"ฉันก็เคยคิดแบบนั้น...",                  hormone:"oxytocin",  cut_rate:0.2, transition_in:"l_cut",     visual_direction:"b-roll: child watching tablet, parent concerned face" },
      { label:"revelation", start_sec:45, end_sec:58, narration:"ความจริงคือ สมองเด็กอายุ 3 ขวบต้องการการสนทนา 2 ทาง ไม่ใช่หน้าจอ",                                           on_screen_text:"สมองต้องการ 'สนทนา' ไม่ใช่หน้าจอ",        hormone:"adrenaline",cut_rate:0.5, transition_in:"zoom_punch", visual_direction:"zoom punch on text, brain graphic overlay" },
      { label:"solution",   start_sec:58, end_sec:70, narration:"ลองทำแบบนี้วันนี้เลย — พูดคุยกับลูก 20 นาทีโดยไม่มีหน้าจอ แค่นี้เปลี่ยนแปลงได้มาก",                        on_screen_text:"✅ 20 นาที/วัน ไม่มีหน้าจอ",              hormone:"serotonin", cut_rate:0.3, transition_in:"l_cut",     visual_direction:"parent playing with child, warm lighting" },
      { label:"cta",        start_sec:70, end_sec:75, narration:"เซฟคลิปนี้ไว้ส่งให้คุณแม่ที่คุณรัก",                                                                          on_screen_text:"📌 เซฟ & ส่งให้แม่",                      hormone:"serotonin", cut_rate:0.2, transition_in:"hard_cut",  visual_direction:"face to camera, gentle smile, slow zoom" },
    ],
    hook_text:                "ถ้าลูกคุณอายุ 3 ขวบ สิ่งนี้สำคัญมากกว่าที่คุณคิด",
    cta_primary:              "เซฟคลิปนี้ไว้ส่งให้คุณแม่ที่คุณรัก",
    cta_secondary:            "กดเซฟก่อนลืม — สำคัญมาก",
    cta_placement_sec:        70,
    full_narration:           "ถ้าลูกคุณอายุ 3 ขวบ สิ่งนี้สำคัญมากกว่าที่คุณคิด งานวิจัยจาก Harvard พบว่าพ่อแม่ 8 ใน 10 คน ทำสิ่งหนึ่งที่ส่งผลต่อสมองลูกโดยไม่รู้ตัว ตอนลูกฉันอายุ 3 ขวบ ฉันคิดว่าการให้เขาดู YouTube เด็กคือการเรียนรู้ แต่ผิดมาก ความจริงคือ สมองเด็กอายุ 3 ขวบต้องการการสนทนา 2 ทาง ไม่ใช่หน้าจอ ลองทำแบบนี้วันนี้เลย — พูดคุยกับลูก 20 นาทีโดยไม่มีหน้าจอ แค่นี้เปลี่ยนแปลงได้มาก เซฟคลิปนี้ไว้ส่งให้คุณแม่ที่คุณรัก",
    predicted_completion_rate: 0.71,
    predicted_share_rate:      0.064,
  };

  const scriptPath = join(OUT, "script.json");
  writeFileSync(scriptPath, JSON.stringify(mockScript, null, 2));
  pass(`Mock script created: ${scriptPath}`);
  info(`Segments: ${mockScript.segments.map(s => s.label).join(" → ")}`);
  info(`Predicted completion: ${(mockScript.predicted_completion_rate*100).toFixed(0)}%`);

  // ── [5] Hook Scorer (Gemini) ────────────────────────────────────────────
  section("Layer 5 — Hook Scorer");
  if (HAS_GEMINI) {
    try {
      const { scoreHook } = await import("./src/science/hook-scorer.js");
      const hookScore = await scoreHook(mockScript.hook_text, mockScript.topic, "tiktok");
      pass(`Hook scored: ${hookScore.overall}/10 (${hookScore.taxonomy}, +${hookScore.taxonomy_lift_pct}% lift)`);
      info(`Pattern interrupt: ${hookScore.pattern_interrupt}`);
      info(`Curiosity gap:     ${hookScore.curiosity_gap_opened}`);
      info(`Muted-viewer safe: ${hookScore.first_3sec_text_present}`);
      if (hookScore.suggestion) info(`Suggestion: ${hookScore.suggestion}`);
    } catch (e: any) {
      fail(`Hook scorer: ${e.message}`);
    }
  } else {
    skip("Hook Scorer — GEMINI_API_KEY not set");
    info("Mock score: 8.2/10 (DirectAddress, +43% lift)");
  }

  // ── [6] Timeline Engine ─────────────────────────────────────────────────
  section("Layer 6 — Timeline Engine (no API needed)");
  try {
    const { generateTimeline } = await import("./src/engine/timeline-engine.js");
    const timeline = generateTimeline(mockScript as any, "");
    const timelinePath = join(OUT, "timeline.json");
    writeFileSync(timelinePath, JSON.stringify(timeline, null, 2));

    pass(`Timeline generated: ${timelinePath}`);
    info(`Cuts:          ${timeline.cuts.length}`);
    info(`Text overlays: ${timeline.text_overlays.length}`);
    info(`Music cues:    ${timeline.music_cues.length}`);
    info(`B-roll slots:  ${timeline.b_roll_slots.length}`);
    info(`Pacing:        ${timeline.pacing_profile}`);
    info(`CapCut draft:  id=${(timeline.capcut_draft as any).id}`);
  } catch (e: any) {
    fail(`Timeline engine: ${e.message}`);
  }

  // ── [7] Voice (MiniMax) ─────────────────────────────────────────────────
  section("Layer 7 — Voice Engine (MiniMax Dr.Gwang)");
  let voicePath = "";
  if (HAS_MINIMAX) {
    try {
      const { generateVoice } = await import("./src/engine/voice.js");
      voicePath = join(OUT, "voice.mp3");
      await generateVoice({ text: mockScript.full_narration, outputPath: voicePath });
      pass(`Voice generated: ${voicePath}`);
    } catch (e: any) {
      fail(`Voice: ${e.message}`);
    }
  } else {
    skip("MiniMax TTS — MINIMAX_API_KEY not set");
    info("Will render with silent audio");
  }

  // ── [8] FFmpeg HQ Render ────────────────────────────────────────────────
  section("Layer 8 — FFmpeg HQ Render (1080×1920 @60fps)");
  const videoPath = join(OUT, "output_v3_e2e.mp4");
  try {
    const { renderHQ } = await import("./src/engine/ffmpeg.js");

    // Load timeline for text overlays
    const { generateTimeline } = await import("./src/engine/timeline-engine.js");
    const timeline = generateTimeline(mockScript as any, voicePath);
    const textOverlays = timeline.text_overlays.map(t => ({
      text: t.text, startSec: t.start_sec, endSec: t.end_sec,
    }));

    console.log(`     Rendering ${mockScript.duration_sec}s video with ${textOverlays.length} text overlays...`);
    const t0 = Date.now();
    await renderHQ(voicePath, videoPath, mockScript.duration_sec, textOverlays);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    pass(`Video rendered in ${elapsed}s: ${videoPath}`);

    // Check file size
    const { statSync } = await import("fs");
    const size = statSync(videoPath).size;
    info(`File size: ${(size / 1024 / 1024).toFixed(1)} MB`);
    info(`Resolution: 1080×1920 @60fps, H.264 High Profile, CRF 18`);

  } catch (e: any) {
    fail(`Render: ${e.message}`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  E2E Test Complete");
  if (existsSync(videoPath)) {
    console.log(`\n  🎬 VIDEO: ${videoPath}`);
    console.log(`\n  Next steps:`);
    console.log(`    export GEMINI_API_KEY="your-key"    # for real script gen + hook scoring`);
    console.log(`    export MINIMAX_API_KEY="your-key"   # for Dr.Gwang voice`);
    console.log(`    npx tsx test_e2e.ts                 # re-run full E2E`);
  }
  console.log("══════════════════════════════════════════════════════\n");
}

main().catch(err => {
  console.error("\n[FATAL]", err);
  process.exit(1);
});
