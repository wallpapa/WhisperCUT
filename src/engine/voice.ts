/**
 * Voice Engine — MiniMax clone + free Thai system voice
 *
 * Modes:
 *   - clone: MiniMax T2A v2 (cloned voice "Dr.Gwang")
 *   - free_female_th: Edge TTS Thai female voice (Premwadee)
 *   - auto: clone first, then free Thai voice, then local F5-TTS-THAI
 *
 * MiniMax docs: https://www.minimax.io/audio/text-to-speech
 * Voice ID: set MINIMAX_VOICE_ID env var (from "My Voices" page)
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { execFileSync, execSync } from "child_process";
import { join, resolve, dirname } from "path";
import { aiGenerate } from "../ai/provider.js";

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "";
const MINIMAX_GROUP_ID = process.env.MINIMAX_GROUP_ID || "";
const MINIMAX_VOICE_ID = process.env.MINIMAX_VOICE_ID || "moss_audio_39a5b671-1e08-11f1-be4b-de7d2e195ee6"; // Dr.Gwang cloned voice
const DEFAULT_VOICE_PROFILE = process.env.WHISPERCUT_DEFAULT_VOICE_PROFILE || "drgwang";
const VOICE_PROFILES_PATH = process.env.WHISPERCUT_VOICE_PROFILES_PATH || resolve(process.cwd(), "config", "voice-profiles.json");

// MiniMax TTS API endpoint (T2A v2 — speech-02-turbo)
// Note: api.minimax.io (not .chat) is the correct endpoint
const MINIMAX_TTS_URL = process.env.MINIMAX_TTS_URL || "https://api.minimax.io/v1/t2a_v2";

const LANGUAGE_LABELS = {
  th: "Thai",
  en: "English",
  zh: "Chinese (Simplified Mandarin)",
  ja: "Japanese",
} as const;

export type VoiceLanguage = keyof typeof LANGUAGE_LABELS;
export type VoiceSourceLanguage = VoiceLanguage | "auto";
export type VoiceEmotion = "neutral" | "happy" | "sad" | "angry" | "fearful" | "surprised";
export type VoiceMode = "auto" | "clone" | "free_female_th";

export interface VoiceOptions {
  text: string;
  outputPath: string;            // absolute path for .mp3 / .wav output
  speed?: number;                // 0.5 – 2.0 (default 1.0)
  vol?: number;                  // 0.1 – 10.0 (default 1.0)
  pitch?: number;                // -12 to 12 semitones (default 0)
  emotion?: VoiceEmotion;
  sourceLanguage?: VoiceSourceLanguage;
  targetLanguage?: VoiceLanguage;
  translate?: boolean;
  mode?: VoiceMode;
  voiceProfile?: string;
  voiceId?: string;
}

export interface VoiceResult {
  audioPath: string;
  engine: "minimax" | "edge_tts" | "f5tts";
  originalText: string;
  spokenText: string;
  sourceLanguage: VoiceSourceLanguage;
  targetLanguage: VoiceLanguage;
  translated: boolean;
  voiceProfile?: string;
  voiceId?: string;
}

interface VoiceProfileEntry {
  id: string;
  provider: "minimax";
  voiceId: string;
  sampleAudioPath?: string;
  note?: string;
}

interface VoiceProfilesConfig {
  defaultProfile?: string;
  profiles?: Record<string, VoiceProfileEntry>;
}

let cachedVoiceProfilesConfig: VoiceProfilesConfig | null = null;

function loadVoiceProfilesConfig(): VoiceProfilesConfig {
  if (cachedVoiceProfilesConfig) return cachedVoiceProfilesConfig;
  if (!existsSync(VOICE_PROFILES_PATH)) {
    cachedVoiceProfilesConfig = {};
    return cachedVoiceProfilesConfig;
  }

  try {
    cachedVoiceProfilesConfig = JSON.parse(readFileSync(VOICE_PROFILES_PATH, "utf-8")) as VoiceProfilesConfig;
    return cachedVoiceProfilesConfig;
  } catch {
    cachedVoiceProfilesConfig = {};
    return cachedVoiceProfilesConfig;
  }
}

function resolveVoiceProfileName(opts: VoiceOptions): string | undefined {
  const config = loadVoiceProfilesConfig();
  return opts.voiceProfile || config.defaultProfile || DEFAULT_VOICE_PROFILE || undefined;
}

function resolveMiniMaxVoiceId(opts: VoiceOptions): string {
  if (opts.voiceId) return opts.voiceId;

  const config = loadVoiceProfilesConfig();
  const profileName = resolveVoiceProfileName(opts);
  const profileVoiceId = profileName ? config.profiles?.[profileName]?.voiceId : undefined;
  return profileVoiceId || MINIMAX_VOICE_ID;
}

interface PreparedVoiceText {
  originalText: string;
  spokenText: string;
  sourceLanguage: VoiceSourceLanguage;
  targetLanguage: VoiceLanguage;
  translated: boolean;
}

function getTargetLanguage(opts: VoiceOptions): VoiceLanguage {
  return opts.targetLanguage || (process.env.WHISPERCUT_VOICE_TARGET_LANGUAGE as VoiceLanguage) || "th";
}

function shouldTranslate(opts: VoiceOptions, targetLanguage: VoiceLanguage): boolean {
  if (opts.translate !== undefined) return opts.translate;
  if (opts.sourceLanguage && opts.sourceLanguage !== "auto") {
    return opts.sourceLanguage !== targetLanguage;
  }
  return targetLanguage !== "th";
}

async function prepareVoiceText(opts: VoiceOptions): Promise<PreparedVoiceText> {
  const targetLanguage = getTargetLanguage(opts);
  const sourceLanguage = opts.sourceLanguage || "auto";

  if (!shouldTranslate(opts, targetLanguage)) {
    return {
      originalText: opts.text,
      spokenText: opts.text,
      sourceLanguage,
      targetLanguage,
      translated: false,
    };
  }

  if (sourceLanguage !== "auto" && sourceLanguage === targetLanguage) {
    return {
      originalText: opts.text,
      spokenText: opts.text,
      sourceLanguage,
      targetLanguage,
      translated: false,
    };
  }

  const translatedText = (await aiGenerate(
    [
      `Translate the narration into natural spoken ${LANGUAGE_LABELS[targetLanguage]}.`,
      "Keep the meaning, pacing, and persuasion intact for short-form video voiceover.",
      "If the input is already in the target language, return it unchanged except for minimal punctuation cleanup.",
      "Do not add explanations, notes, quotation marks, emojis, or bullet points.",
      "Return only the final spoken narration.",
      "",
      `Source language hint: ${sourceLanguage === "auto" ? "auto-detect" : LANGUAGE_LABELS[sourceLanguage]}.`,
      `Target language: ${LANGUAGE_LABELS[targetLanguage]}.`,
      "",
      "Narration:",
      opts.text,
    ].join("\n"), {
      system: "You are a broadcast translation editor for video voiceovers. Preserve meaning exactly while making the speech sound natural when read aloud.",
      maxTokens: 4096,
    }
  )).trim();

  if (!translatedText) {
    throw new Error(`Voice translation to ${LANGUAGE_LABELS[targetLanguage]} returned empty text`);
  }

  return {
    originalText: opts.text,
    spokenText: translatedText,
    sourceLanguage,
    targetLanguage,
    translated: translatedText !== opts.text,
  };
}

// ── MiniMax TTS ────────────────────────────────────────────────────────────

export async function generateVoiceMiniMax(opts: VoiceOptions): Promise<string> {
  if (!MINIMAX_API_KEY) throw new Error("MINIMAX_API_KEY not set");
  const voiceId = resolveMiniMaxVoiceId(opts);
  mkdirSync(dirname(opts.outputPath), { recursive: true });

  const payload = {
    model: "speech-02-turbo",
    text: opts.text,
    stream: false,
    voice_setting: {
      voice_id: voiceId,
      speed: opts.speed ?? 1.0,
      vol: opts.vol ?? 1.0,
      pitch: opts.pitch ?? 0,
      emotion: opts.emotion ?? "neutral",
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: "mp3",
      channel: 1,
    },
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${MINIMAX_API_KEY}`,
  };
  if (MINIMAX_GROUP_ID) headers.GroupId = MINIMAX_GROUP_ID;

  const res = await fetch(MINIMAX_TTS_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MiniMax TTS error ${res.status}: ${err}`);
  }

  const json = await res.json() as { data?: { audio?: string } };
  const audioHex = json.data?.audio;
  if (!audioHex) throw new Error("MiniMax response missing audio data");

  const audioBuffer = Buffer.from(audioHex, "hex");
  const mp3Path = opts.outputPath.replace(/\.(wav|mp3)$/, ".mp3");
  writeFileSync(mp3Path, audioBuffer);

  console.error(`[voice] MiniMax TTS (${voiceId}) → ${mp3Path} (${(audioBuffer.length / 1024).toFixed(0)} KB)`);
  return mp3Path;
}

// ── Edge TTS free Thai female voice ───────────────────────────────────────

const EDGE_TTS_VOICE = process.env.EDGE_TTS_VOICE || "th-TH-PremwadeeNeural";

function hasPythonModule(pythonBin: string, moduleName: string): boolean {
  try {
    execFileSync(
      pythonBin,
      ["-c", `import importlib.util, sys; sys.exit(0 if importlib.util.find_spec(${JSON.stringify(moduleName)}) else 1)`],
      { stdio: "ignore" }
    );
    return true;
  } catch {
    return false;
  }
}

function resolveEdgeTtsPython(): string {
  const candidates = [
    process.env.EDGE_TTS_PYTHON,
    process.env.WHISPERCUT_SYSTEM_PYTHON,
    "/Library/Frameworks/Python.framework/Versions/3.13/bin/python3",
    "/usr/local/bin/python3",
    "python3",
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (hasPythonModule(candidate, "edge_tts")) {
      return candidate;
    }
  }
  throw new Error("No python interpreter with edge_tts module found");
}

function toEdgeRate(speed = 1.0): string {
  const pct = Math.round((speed - 1.0) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

function toEdgePitch(semitones = 0): string {
  const hz = Math.round(semitones * 8);
  return `${hz >= 0 ? "+" : ""}${hz}Hz`;
}

export async function generateVoiceEdgeTTS(opts: VoiceOptions): Promise<string> {
  const mediaPath = opts.outputPath.replace(/\.(wav|mp3)$/i, ".mp3");
  const subtitlesPath = mediaPath.replace(/\.mp3$/i, ".vtt");
  mkdirSync(dirname(mediaPath), { recursive: true });

  const pythonBin = resolveEdgeTtsPython();

  // Use Python API directly (more reliable than CLI for long/multilingual text)
  const cleanText = opts.text.replace(/\n+/g, " ").replace(/"/g, '\\"').trim();
  const rate = toEdgeRate(opts.speed ?? 1.0);
  const pitch = toEdgePitch(opts.pitch ?? 0);

  const pyScript = `
import asyncio, edge_tts

async def main():
    communicate = edge_tts.Communicate(
        text="${cleanText}",
        voice="${EDGE_TTS_VOICE}",
        rate="${rate}",
        pitch="${pitch}",
    )
    submaker = edge_tts.SubMaker()
    with open("${mediaPath}", "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                submaker.feed(chunk)
    with open("${subtitlesPath}", "w") as f:
        f.write(submaker.generate_subs())

asyncio.run(main())
`;

  const tmpPy = mediaPath.replace(/\.mp3$/i, "_tts.py");
  writeFileSync(tmpPy, pyScript);

  try {
    execFileSync(pythonBin, [tmpPy], {
      encoding: "utf-8",
      timeout: 600_000,
    });
  } finally {
    try { require("fs").unlinkSync(tmpPy); } catch {}
  }

  if (!existsSync(mediaPath)) {
    throw new Error("Edge TTS produced no output");
  }

  console.error(`[voice] Edge TTS (${EDGE_TTS_VOICE}) via ${pythonBin} → ${mediaPath}`);
  return mediaPath;
}

// ── gTTS (Google Translate TTS) — FREE, zero-config fallback ──────────────

export async function generateVoiceGTTS(opts: VoiceOptions): Promise<string> {
  const mediaPath = opts.outputPath.replace(/\.(wav|mp3)$/i, ".mp3");
  mkdirSync(dirname(mediaPath), { recursive: true });

  const cleanText = opts.text.replace(/\n+/g, " ").replace(/'/g, "\\'").trim();
  const lang = opts.targetLanguage === "en" ? "en" : "th";

  // Find Python with gtts
  const pythonCandidates = [
    process.env.WHISPERCUT_SYSTEM_PYTHON,
    "/Library/Frameworks/Python.framework/Versions/3.13/bin/python3",
    "/usr/local/bin/python3",
    "python3",
  ].filter((v): v is string => Boolean(v));

  let pythonBin = "python3";
  for (const candidate of pythonCandidates) {
    try {
      execFileSync(candidate, ["-c", "import gtts"], { stdio: "ignore" });
      pythonBin = candidate;
      break;
    } catch {}
  }

  execFileSync(pythonBin, [
    "-c",
    `from gtts import gTTS; tts = gTTS('${cleanText}', lang='${lang}'); tts.save('${mediaPath}')`,
  ], { encoding: "utf-8", timeout: 120_000 });

  if (!existsSync(mediaPath)) {
    throw new Error("gTTS produced no output");
  }

  console.error(`[voice] gTTS (${lang}) → ${mediaPath}`);
  return mediaPath;
}

// ── F5-TTS-THAI local fallback ─────────────────────────────────────────────

export async function generateVoiceF5TTS(opts: VoiceOptions): Promise<string> {
  const scriptPath = join(process.cwd(), "python", "f5tts_generate_cpu.py");
  if (!existsSync(scriptPath)) throw new Error("f5tts_generate_cpu.py not found");
  mkdirSync(dirname(opts.outputPath), { recursive: true });

  const cmd = `python3 "${scriptPath}" --text "${opts.text.replace(/"/g, '\\"')}" --output "${opts.outputPath}"`;
  execSync(cmd, { encoding: "utf-8", timeout: 600_000 });

  if (!existsSync(opts.outputPath)) throw new Error("F5-TTS produced no output");
  console.error(`[voice] F5-TTS-THAI → ${opts.outputPath}`);
  return opts.outputPath;
}

// ── Auto-select best available voice engine ────────────────────────────────

export async function generateVoiceDetailed(opts: VoiceOptions): Promise<VoiceResult> {
  const prepared = await prepareVoiceText(opts);
  const voiceProfile = resolveVoiceProfileName(opts);
  const resolvedVoiceId = resolveMiniMaxVoiceId(opts);
  const request: VoiceOptions = {
    ...opts,
    text: prepared.spokenText,
    targetLanguage: prepared.targetLanguage,
    voiceProfile,
    voiceId: opts.voiceId || resolvedVoiceId,
  };

  const mode = opts.mode || "auto";

  if (mode === "clone" || mode === "auto") {
    if (MINIMAX_API_KEY) {
      try {
        const audioPath = await generateVoiceMiniMax(request);
        return {
          audioPath,
          engine: "minimax",
          ...prepared,
          voiceProfile,
          voiceId: request.voiceId,
        };
      } catch (e: any) {
        console.error(`[voice] MiniMax failed: ${e.message} — checking fallback`);
      }
    } else if (mode === "clone") {
      throw new Error("MINIMAX_API_KEY not set for clone voice mode");
    }
  }

  if (mode === "free_female_th" || mode === "auto") {
    if (prepared.targetLanguage !== "th") {
      if (mode === "free_female_th") {
        throw new Error("free_female_th mode currently supports Thai output only");
      }
    } else {
      try {
        const audioPath = await generateVoiceEdgeTTS(request);
        return {
          audioPath,
          engine: "edge_tts",
          ...prepared,
          voiceProfile,
        };
      } catch (e: any) {
        console.error(`[voice] Edge TTS failed: ${e.message} — checking fallback`);
      }
    }
  }

  if (mode === "clone") {
    throw new Error("Clone voice generation failed and no fallback is allowed in clone mode");
  }

  // gTTS fallback (Google Translate TTS — free, always available)
  try {
    const audioPath = await generateVoiceGTTS(request);
    return {
      audioPath,
      engine: "edge_tts" as const, // report as edge_tts for compatibility
      ...prepared,
      voiceProfile,
    };
  } catch (e: any) {
    console.error(`[voice] gTTS failed: ${e.message} — checking F5-TTS`);
  }

  if (prepared.targetLanguage !== "th") {
    throw new Error(`No free fallback available for ${LANGUAGE_LABELS[prepared.targetLanguage]}; clone voice is required`);
  }

  const audioPath = await generateVoiceF5TTS(request);
  return {
    audioPath,
    engine: "f5tts",
    ...prepared,
    voiceProfile,
  };
}

export async function generateVoice(opts: VoiceOptions): Promise<string> {
  const result = await generateVoiceDetailed(opts);
  return result.audioPath;
}
