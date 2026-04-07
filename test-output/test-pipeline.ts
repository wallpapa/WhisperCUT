/**
 * WhisperCUT test pipeline — test with real TikTok video
 */
import { probe, extractAudio, detectScenes } from "../src/engine/ffmpeg.js";
import { transcribe, generateSRT, saveSRT } from "../src/engine/whisper.js";
import { createRoughcut, toFFmpegCommands } from "../src/engine/timeline.js";
import { timelineToCapCut } from "../src/engine/capcut.js";
import { writeFile, mkdir } from "node:fs/promises";

const VIDEO = "./test-output/doctorwaleerat_latest.mp4";
const OUT = "./test-output";

async function main() {
  console.log("=== WhisperCUT Test Pipeline ===\n");

  // Step 1: Probe
  console.log("1. Probing video...");
  const info = await probe(VIDEO);
  console.log(`   Duration: ${info.duration_sec.toFixed(1)}s`);
  console.log(`   Resolution: ${info.width}x${info.height}`);
  console.log(`   FPS: ${info.fps}, Codec: ${info.codec}`);
  console.log(`   Size: ${(info.size_bytes / 1024 / 1024).toFixed(2)} MB\n`);

  // Step 2: Extract audio
  console.log("2. Extracting audio (16kHz WAV)...");
  const wavPath = await extractAudio(VIDEO, `${OUT}/audio_16k.wav`);
  console.log(`   Saved: ${wavPath}\n`);

  // Step 3: Detect scenes
  console.log("3. Detecting scene changes...");
  const scenes = await detectScenes(VIDEO, 0.3);
  console.log(`   Found ${scenes.length} scene changes`);
  for (const s of scenes.slice(0, 5)) {
    console.log(`   - ${s.timestamp_sec.toFixed(2)}s (score: ${s.score})`);
  }
  console.log();

  // Step 4: Transcribe
  console.log("4. Transcribing with Whisper (Thai)...");
  try {
    const transcript = await transcribe(wavPath, { language: "th" });
    console.log(`   Language: ${transcript.language}`);
    console.log(`   Segments: ${transcript.segments.length}`);
    console.log(`   Words: ${transcript.word_segments.length}`);
    console.log(`   Text: ${transcript.full_text.substring(0, 200)}...`);
    console.log();

    // Step 5: Generate SRT
    console.log("5. Generating SRT captions...");
    const srt = generateSRT(transcript.segments);
    await saveSRT(srt, `${OUT}/captions.srt`);
    console.log(`   Saved: ${OUT}/captions.srt\n`);

    // Step 6: Create roughcut
    console.log("6. Creating roughcut timeline...");
    const timeline = createRoughcut(
      "doctorwaleerat-test",
      VIDEO,
      transcript.segments,
      "highlight",
      60
    );
    console.log(`   Clips: ${timeline.clips.length}`);
    console.log(`   Duration: ${timeline.duration_sec.toFixed(1)}s`);
    console.log();

    // Step 7: Generate FFmpeg commands
    console.log("7. Generating FFmpeg commands...");
    const commands = toFFmpegCommands(timeline, OUT);
    console.log(`   Commands: ${commands.length}`);
    for (const cmd of commands) {
      console.log(`   - ${cmd.type}: ${cmd.input} → ${cmd.output} (${cmd.startSec.toFixed(1)}s, ${cmd.durationSec.toFixed(1)}s)`);
    }
    console.log();

    // Step 8: Generate CapCut draft
    console.log("8. Generating CapCut draft...");
    const capcut = timelineToCapCut(timeline);
    await writeFile(`${OUT}/draft_content.json`, JSON.stringify(capcut, null, 2));
    console.log(`   Saved: ${OUT}/draft_content.json`);
    console.log(`   Tracks: ${capcut.tracks.length}`);
    console.log(`   Materials: videos=${capcut.materials.videos.length}, texts=${capcut.materials.texts.length}`);
    console.log();

    // Save full transcript
    await writeFile(`${OUT}/transcript.json`, JSON.stringify(transcript, null, 2));

    console.log("=== ALL TESTS PASSED ===");
  } catch (err: any) {
    if (err.message?.includes("Whisper")) {
      console.log("   Whisper not installed — skipping transcription");
      console.log("   Install: pip install faster-whisper");
      console.log();
      console.log("   Testing roughcut with mock data instead...");

      // Mock segments for testing
      const mockSegments = [
        { start: 0, end: 3, text: "ทำไมลูกหน้าตาเหมือนพ่อมากกว่าแม่" },
        { start: 3, end: 8, text: "เรื่องนี้มีคำอธิบายทางวิทยาศาสตร์" },
        { start: 8, end: 15, text: "DNA ของพ่อจะมี dominant gene มากกว่า" },
        { start: 15, end: 22, text: "ทำให้ลูกสาวหน้าเหมือนพ่อ" },
        { start: 22, end: 30, text: "แต่ลูกชายหน้าเหมือนแม่" },
      ];

      const timeline = createRoughcut("doctorwaleerat-test", VIDEO, mockSegments, "highlight", 60);
      console.log(`   Clips: ${timeline.clips.length}`);
      console.log(`   Duration: ${timeline.duration_sec.toFixed(1)}s`);

      const capcut = timelineToCapCut(timeline);
      await writeFile(`${OUT}/draft_content.json`, JSON.stringify(capcut, null, 2));
      console.log(`   CapCut draft saved: ${OUT}/draft_content.json\n`);

      console.log("=== PARTIAL TEST PASSED (no Whisper) ===");
    } else {
      throw err;
    }
  }
}

main().catch(console.error);
