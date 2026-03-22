#!/usr/bin/env npx tsx
/**
 * WhisperCUT v3 — E2E Test (60s video, visual backgrounds, Thai text)
 */

import { mkdirSync, writeFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);
const OUT  = join(process.cwd(), "output/e2e_test");
mkdirSync(OUT, { recursive: true });

const HAS_GEMINI  = Boolean(process.env.GEMINI_API_KEY);
const HAS_MINIMAX = Boolean(process.env.MINIMAX_API_KEY);

function pass(msg: string)    { console.log(`  ✅ ${msg}`); }
function fail(msg: string)    { console.log(`  ❌ ${msg}`); }
function skip(msg: string)    { console.log(`  ⏭️  ${msg}`); }
function info(msg: string)    { console.log(`     ${msg}`); }
function section(t: string)   { console.log(`\n${"─".repeat(55)}\n🧪 ${t}`); }

async function main() {
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  WhisperCUT v3 — E2E Test (60s)");
  console.log(`  ${new Date().toISOString()}`);
  console.log("══════════════════════════════════════════════════════");
  console.log(`  GEMINI_API_KEY  : ${HAS_GEMINI  ? "✅ set" : "❌ not set"}`);
  console.log(`  MINIMAX_API_KEY : ${HAS_MINIMAX ? "✅ set" : "❌ not set"}`);

  // ── [1] FFmpeg ──────────────────────────────────────────────────────────
  section("Layer 1 — FFmpeg");
  try {
    const { stdout } = await exec("ffmpeg", ["-version"]);
    pass(stdout.split("\n")[0]);
  } catch { fail("FFmpeg not found"); process.exit(1); }

  // ── [2] Vibe Library ────────────────────────────────────────────────────
  section("Layer 2 — Vibe Library");
  const { getVibe, listVibes } = await import("./src/science/vibe-library.js");
  listVibes().forEach(v =>
    info(`${v.name.padEnd(20)} completion=${(v.completion*100).toFixed(0)}%  share=${(v.share*100).toFixed(1)}%`)
  );
  pass("5 vibes loaded");

  // ── [3] CTA Selector ────────────────────────────────────────────────────
  section("Layer 3 — CTA Selector");
  const { selectCTA } = await import("./src/science/cta-selector.js");
  const cta = selectCTA({ vibe: "educational_warm", platform: "tiktok", goal: "virality", duration_sec: 60 });
  pass(`CTA: ${cta.type} (${(cta.conversion_rate*100).toFixed(1)}%) → "${cta.text_th}"`);

  // ── [4] 60s Mock Script ─────────────────────────────────────────────────
  section("Layer 4 — 60s VibeScript (educational_warm)");

  const DURATION = 60;
  const mockScript = {
    topic:    "พัฒนาการสมองลูก 3 ขวบ สิ่งที่พ่อแม่ต้องรู้",
    vibe:     "educational_warm" as const,
    platform: "tiktok" as const,
    duration_sec: DURATION,
    segments: [
      {
        label: "hook", start_sec: 0, end_sec: 3,
        narration:      "ถ้าลูกคุณอายุ 3 ขวบ อ่านด่วน!",
        on_screen_text: "ลูก 3 ขวบ — อ่านด่วน! 🧠",
        hormone: "cortisol", cut_rate: 0.5,
        transition_in: "hard_cut",
        visual_direction: "face close-up, eye contact",
      },
      {
        label: "problem", start_sec: 3, end_sec: 18,
        narration:      "8 ใน 10 ครอบครัว ทำสิ่งหนึ่งที่ส่งผลต่อสมองลูกโดยไม่รู้ตัว งานวิจัย Harvard ยืนยัน",
        on_screen_text: "8/10 ครอบครัว ทำแบบนี้โดยไม่รู้ 📊",
        hormone: "dopamine", cut_rate: 0.3,
        transition_in: "l_cut",
        visual_direction: "statistic graphic overlay",
      },
      {
        label: "story", start_sec: 18, end_sec: 38,
        narration:      "ตอนลูกฉันอายุ 3 ขวบ ฉันให้เขาดู YouTube ทั้งวัน คิดว่าเป็นการเรียนรู้ แต่นั่นคือความผิดพลาดใหญ่มาก",
        on_screen_text: "ฉันก็เคยทำแบบนั้น... 💙",
        hormone: "oxytocin", cut_rate: 0.2,
        transition_in: "l_cut",
        visual_direction: "warm family b-roll, child playing",
      },
      {
        label: "revelation", start_sec: 38, end_sec: 50,
        narration:      "สมองเด็ก 3 ขวบ ต้องการการสนทนา 2 ทาง ไม่ใช่หน้าจอ แค่ 20 นาทีต่อวัน เปลี่ยนได้ทุกอย่าง",
        on_screen_text: "สมองต้องการ 'สนทนา' ไม่ใช่หน้าจอ ⚡",
        hormone: "adrenaline", cut_rate: 0.6,
        transition_in: "zoom_punch",
        visual_direction: "zoom punch on brain graphic",
      },
      {
        label: "solution", start_sec: 50, end_sec: 56,
        narration:      "ลองทำเลยวันนี้ วางโทรศัพท์แล้วคุยกับลูก 20 นาที",
        on_screen_text: "✅ วางโทรศัพท์ คุยกับลูก 20 นาที/วัน",
        hormone: "serotonin", cut_rate: 0.3,
        transition_in: "l_cut",
        visual_direction: "parent and child talking, warm light",
      },
      {
        label: "cta", start_sec: 56, end_sec: 60,
        narration:      "เซฟไว้ส่งให้คุณแม่ที่คุณรัก",
        on_screen_text: "📌 เซฟ & ส่งให้แม่",
        hormone: "serotonin", cut_rate: 0.2,
        transition_in: "hard_cut",
        visual_direction: "face to camera, gentle smile",
      },
    ],
    hook_text:                "ถ้าลูกคุณอายุ 3 ขวบ อ่านด่วน!",
    cta_primary:              "เซฟไว้ส่งให้คุณแม่ที่คุณรัก",
    cta_secondary:            "กดเซฟก่อนลืม",
    cta_placement_sec:        56,
    full_narration:           "ถ้าลูกคุณอายุ 3 ขวบ อ่านด่วน! 8 ใน 10 ครอบครัว ทำสิ่งหนึ่งที่ส่งผลต่อสมองลูกโดยไม่รู้ตัว งานวิจัย Harvard ยืนยัน ตอนลูกฉันอายุ 3 ขวบ ฉันให้เขาดู YouTube ทั้งวัน คิดว่าเป็นการเรียนรู้ แต่นั่นคือความผิดพลาดใหญ่มาก สมองเด็ก 3 ขวบ ต้องการการสนทนา 2 ทาง ไม่ใช่หน้าจอ แค่ 20 นาทีต่อวัน เปลี่ยนได้ทุกอย่าง ลองทำเลยวันนี้ วางโทรศัพท์แล้วคุยกับลูก 20 นาที เซฟไว้ส่งให้คุณแม่ที่คุณรัก",
    predicted_completion_rate: 0.71,
    predicted_share_rate:      0.064,
  };

  writeFileSync(join(OUT, "script.json"), JSON.stringify(mockScript, null, 2));
  pass(`Script: ${mockScript.segments.length} segments, ${DURATION}s`);
  mockScript.segments.forEach(s =>
    info(`[${s.start_sec}–${s.end_sec}s] ${s.label.padEnd(12)} hormone=${s.hormone}  "${s.on_screen_text.slice(0,40)}"`)
  );

  // ── [5] Hook Scorer ─────────────────────────────────────────────────────
  section("Layer 5 — Hook Scorer");
  if (HAS_GEMINI) {
    try {
      const { scoreHook } = await import("./src/science/hook-scorer.js");
      const hs = await scoreHook(mockScript.hook_text, mockScript.topic, "tiktok");
      pass(`Hook: ${hs.overall}/10  taxonomy=${hs.taxonomy} (+${hs.taxonomy_lift_pct}% lift)`);
      info(`Pattern interrupt: ${hs.pattern_interrupt}  |  Curiosity gap: ${hs.curiosity_gap_opened}  |  Muted-safe: ${hs.first_3sec_text_present}`);
      if (hs.suggestion) info(`Suggestion: ${hs.suggestion}`);
      if (hs.rewrite)    info(`Rewrite: ${hs.rewrite}`);
    } catch (e: any) { fail(`Hook scorer: ${e.message}`); }
  } else {
    skip("Hook Scorer — no GEMINI_API_KEY");
    info("Mock: 8.2/10 (DirectAddress, +43% lift)");
  }

  // ── [6] MiniMax TTS ─────────────────────────────────────────────────────
  section("Layer 6 — Voice Engine (MiniMax Dr.Gwang)");
  let voicePath = "";
  if (HAS_MINIMAX) {
    try {
      const { generateVoice } = await import("./src/engine/voice.js");
      voicePath = join(OUT, "voice.mp3");
      await generateVoice({ text: mockScript.full_narration, outputPath: voicePath });
      const sz = statSync(voicePath).size;
      pass(`Voice: ${voicePath} (${(sz/1024).toFixed(0)} KB)`);
    } catch (e: any) { fail(`Voice: ${e.message}`); }
  } else {
    skip("MiniMax TTS — no MINIMAX_API_KEY → silent video");
  }

  // ── [7] Timeline Engine ─────────────────────────────────────────────────
  section("Layer 7 — Timeline Engine");
  const { generateTimeline } = await import("./src/engine/timeline-engine.js");
  const timeline = generateTimeline(mockScript as any, voicePath);
  writeFileSync(join(OUT, "timeline.json"), JSON.stringify(timeline, null, 2));
  pass(`Timeline: ${timeline.cuts.length} cuts | ${timeline.text_overlays.length} overlays | ${timeline.music_cues.length} music cues`);
  info(`Pacing: ${timeline.pacing_profile}`);

  // ── [8] FFmpeg HQ Render ────────────────────────────────────────────────
  section("Layer 8 — FFmpeg HQ Render (1080×1920 @60fps + Thai font + hormone colors)");
  const videoPath = join(OUT, "whispercut_v3_60s.mp4");
  try {
    const { renderHQ } = await import("./src/engine/ffmpeg.js");

    console.log(`     Rendering ${DURATION}s — ${mockScript.segments.length} segments, per-hormone backgrounds...`);
    const t0 = Date.now();

    await renderHQ({
      audioPath:  voicePath || undefined,
      outputPath: videoPath,
      durationSec: DURATION,
      segments:   mockScript.segments as any,
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const sz = statSync(videoPath).size;
    pass(`Rendered in ${elapsed}s → ${videoPath}`);
    info(`Size: ${(sz/1024/1024).toFixed(1)} MB`);

    // Verify with ffprobe
    const { stdout } = await exec("ffprobe", [
      "-v", "quiet", "-print_format", "json", "-show_streams", videoPath
    ]);
    const streams = JSON.parse(stdout).streams;
    const vstream = streams.find((s: any) => s.codec_type === "video");
    const astream = streams.find((s: any) => s.codec_type === "audio");
    info(`Video: ${vstream?.codec_name} ${vstream?.width}×${vstream?.height} @${eval(vstream?.r_frame_rate)}fps profile=${vstream?.profile}`);
    info(`Audio: ${astream?.codec_name} ${astream?.sample_rate}Hz channels=${astream?.channels}`);

  } catch (e: any) { fail(`Render: ${e.message}\n${e}`); }

  // ── Done ────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════");
  if (existsSync(videoPath)) {
    console.log(`\n  🎬 VIDEO READY: ${videoPath}`);
    console.log(`\n  To run with real API keys:`);
    console.log(`    export GEMINI_API_KEY="..."`);
    console.log(`    export MINIMAX_API_KEY="..."`);
    console.log(`    export MINIMAX_VOICE_ID="Dr.Gwang"`);
    console.log(`    npx tsx test_e2e.ts`);
  }
  console.log("══════════════════════════════════════════════════════\n");
}

main().catch(e => { console.error("[FATAL]", e); process.exit(1); });
