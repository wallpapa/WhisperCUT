/**
 * Voice Engine — MiniMax TTS with Dr.Gwang cloned voice
 *
 * Primary:  MiniMax T2A v2 (cloned voice "Dr.Gwang")
 * Fallback: F5-TTS-THAI local (free, slower)
 *
 * MiniMax docs: https://www.minimax.io/audio/text-to-speech
 * Voice ID: set MINIMAX_VOICE_ID env var (from "My Voices" page)
 */

import { writeFileSync, existsSync } from "fs";
import { execSync }                  from "child_process";
import { join }                      from "path";

const MINIMAX_API_KEY  = process.env.MINIMAX_API_KEY  || "";
const MINIMAX_GROUP_ID = process.env.MINIMAX_GROUP_ID || "";
const MINIMAX_VOICE_ID = process.env.MINIMAX_VOICE_ID || "moss_audio_39a5b671-1e08-11f1-be4b-de7d2e195ee6"; // Dr.Gwang cloned voice

// MiniMax TTS API endpoint (T2A v2 — speech-02-turbo)
// Note: api.minimax.io (not .chat) is the correct endpoint
const MINIMAX_TTS_URL = process.env.MINIMAX_TTS_URL || "https://api.minimax.io/v1/t2a_v2";

export interface VoiceOptions {
  text:       string;
  outputPath: string;            // absolute path for .mp3 / .wav output
  speed?:     number;            // 0.5 – 2.0 (default 1.0)
  vol?:       number;            // 0.1 – 10.0 (default 1.0)
  pitch?:     number;            // -12 to 12 semitones (default 0)
}

// ── MiniMax TTS ────────────────────────────────────────────────────────────

export async function generateVoiceMiniMax(opts: VoiceOptions): Promise<string> {
  if (!MINIMAX_API_KEY) throw new Error("MINIMAX_API_KEY not set");

  const payload = {
    model:      "speech-02-turbo",   // fastest + highest quality
    text:       opts.text,
    stream:     false,
    voice_setting: {
      voice_id:  MINIMAX_VOICE_ID,
      speed:     opts.speed  ?? 1.0,
      vol:       opts.vol    ?? 1.0,
      pitch:     opts.pitch  ?? 0,
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate:     128000,
      format:      "mp3",
      channel:     1,
    },
  };

  const headers: Record<string, string> = {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${MINIMAX_API_KEY}`,
  };
  if (MINIMAX_GROUP_ID) headers["GroupId"] = MINIMAX_GROUP_ID;

  const res = await fetch(MINIMAX_TTS_URL, {
    method:  "POST",
    headers,
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MiniMax TTS error ${res.status}: ${err}`);
  }

  const json: any = await res.json();

  // Extract audio bytes (hex encoded in MiniMax response)
  const audioHex: string = json?.data?.audio;
  if (!audioHex) throw new Error("MiniMax response missing audio data");

  const audioBuffer = Buffer.from(audioHex, "hex");
  const mp3Path = opts.outputPath.replace(/\.(wav|mp3)$/, ".mp3");
  writeFileSync(mp3Path, audioBuffer);

  console.error(`[voice] MiniMax TTS → ${mp3Path} (${(audioBuffer.length / 1024).toFixed(0)} KB)`);
  return mp3Path;
}

// ── F5-TTS-THAI local fallback ─────────────────────────────────────────────

export async function generateVoiceF5TTS(opts: VoiceOptions): Promise<string> {
  const scriptPath = join(process.cwd(), "python", "f5tts_generate_cpu.py");
  if (!existsSync(scriptPath)) throw new Error("f5tts_generate_cpu.py not found");

  const cmd = `python3 "${scriptPath}" --text "${opts.text.replace(/"/g, '\\"')}" --output "${opts.outputPath}"`;
  execSync(cmd, { encoding: "utf-8", timeout: 600_000 });

  if (!existsSync(opts.outputPath)) throw new Error("F5-TTS produced no output");
  console.error(`[voice] F5-TTS-THAI → ${opts.outputPath}`);
  return opts.outputPath;
}

// ── Auto-select best available voice engine ────────────────────────────────

export async function generateVoice(opts: VoiceOptions): Promise<string> {
  // 1. MiniMax (Dr.Gwang clone) — preferred
  if (MINIMAX_API_KEY) {
    try {
      return await generateVoiceMiniMax(opts);
    } catch (e: any) {
      console.error(`[voice] MiniMax failed: ${e.message} — falling back to F5-TTS`);
    }
  }

  // 2. F5-TTS-THAI local — free fallback
  return await generateVoiceF5TTS(opts);
}
