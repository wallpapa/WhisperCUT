import { readFile, writeFile } from "node:fs/promises";
import { createRoughcut, toFFmpegCommands } from "../src/engine/timeline.js";
import { timelineToCapCut, exportCapCutDraft } from "../src/engine/capcut.js";
import { generateSRT, generateWordSRT, saveSRT } from "../src/engine/whisper.js";

async function main() {
  const transcript = JSON.parse(await readFile("./test-output/transcript.json", "utf-8"));
  console.log("=== WhisperCUT Pipeline (Steps 5-8) with REAL transcript ===\n");

  console.log("5. Generating SRT captions...");
  const srt = generateSRT(transcript.segments);
  await saveSRT(srt, "./test-output/captions.srt");
  const wordSrt = generateWordSRT(transcript.word_segments);
  await saveSRT(wordSrt, "./test-output/captions_word.srt");
  console.log("   Saved: captions.srt + captions_word.srt\n");

  console.log("6. Creating roughcut timelines...");
  const highlight = createRoughcut("doctorwaleerat-highlight", "./test-output/doctorwaleerat_latest.mp4", transcript.segments, "highlight", 60);
  const summary = createRoughcut("doctorwaleerat-summary", "./test-output/doctorwaleerat_latest.mp4", transcript.segments, "summary", 60);
  console.log(`   Highlight: ${highlight.clips.filter((c: any) => c.type === "video").length} video clips, ${highlight.duration_sec.toFixed(1)}s`);
  console.log(`   Summary: ${summary.clips.filter((c: any) => c.type === "video").length} video clips, ${summary.duration_sec.toFixed(1)}s\n`);

  console.log("7. FFmpeg commands for highlight:");
  const cmds = toFFmpegCommands(highlight, "./test-output");
  for (const cmd of cmds) {
    console.log(`   ${cmd.type}: ${cmd.startSec.toFixed(1)}s → ${(cmd.startSec + cmd.durationSec).toFixed(1)}s (${cmd.durationSec.toFixed(1)}s)`);
  }
  console.log();

  console.log("8. Exporting CapCut draft...");
  const { draftPath, instructions } = await exportCapCutDraft(highlight, "./test-output");
  console.log(`   Draft: ${draftPath}\n`);
  console.log(instructions);
  console.log();
  console.log("=== ALL STEPS PASSED ===");
}

main().catch(console.error);
