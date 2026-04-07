/**
 * whispercut_create_capcut_project — Generate CapCut Desktop project from WhisperCUT output
 * whispercut_tts_dr_gwang — Text-to-Speech with Dr.Gwang cloned voice via MiniMax
 */

import { generateCapCutDraft, type DraftBridgeInput } from "../../engine/capcut-draft-bridge.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ── CapCut Bridge Tool ──────────────────────────────────────────

export const capcutBridgeTool = {
  name: "whispercut_create_capcut_project",
  description:
    "Generate a CapCut Desktop project from WhisperCUT auto_edit output. " +
    "Creates draft_info.json + draft_meta_info.json in ~/Movies/CapCut/User Data/Projects/. " +
    "Opens instantly in CapCut Desktop. Supports: video clips, audio tracks, text overlays, captions. " +
    "All times in seconds. Default canvas: 1080x1920 (9:16 vertical TikTok).",
  inputSchema: {
    type: "object" as const,
    required: ["projectName", "clips"],
    properties: {
      projectName: {
        type: "string",
        description: "Name for the CapCut project (e.g., 'Longlife_DrGwang_v2')",
      },
      clips: {
        type: "array",
        description: "Video/image clips to place on timeline",
        items: {
          type: "object",
          required: ["filePath", "type", "width", "height", "startOnTimeline", "duration"],
          properties: {
            filePath: { type: "string", description: "Absolute path to video/image file" },
            type: { type: "string", enum: ["video", "photo"], description: "Clip type" },
            width: { type: "number", description: "Source width in pixels" },
            height: { type: "number", description: "Source height in pixels" },
            startOnTimeline: { type: "number", description: "When clip appears (seconds)" },
            duration: { type: "number", description: "How long it shows (seconds)" },
            sourceStart: { type: "number", description: "Where in source video to start (seconds)" },
            sourceDuration: { type: "number", description: "How much of source to use (seconds)" },
          },
        },
      },
      audio: {
        type: "array",
        description: "Audio tracks (voiceover, music, SFX)",
        items: {
          type: "object",
          required: ["filePath", "startOnTimeline", "duration"],
          properties: {
            filePath: { type: "string", description: "Absolute path to audio file" },
            startOnTimeline: { type: "number", description: "When audio starts (seconds)" },
            duration: { type: "number", description: "Audio duration (seconds)" },
            volume: { type: "number", description: "Volume 0-1, default 1.0" },
            name: { type: "string", description: "Display name for audio track" },
          },
        },
      },
      textOverlays: {
        type: "array",
        description: "Keyword text overlays (bold text on screen for engagement)",
        items: {
          type: "object",
          required: ["text", "startOnTimeline", "duration"],
          properties: {
            text: { type: "string", description: "Text content" },
            startOnTimeline: { type: "number", description: "When text appears (seconds)" },
            duration: { type: "number", description: "How long text shows (seconds)" },
            fontSize: { type: "number", description: "Font size, default 30" },
            color: { type: "string", description: "Hex color, default #FFFFFF" },
            bgAlpha: { type: "number", description: "Background alpha 0-1, default 1.0" },
          },
        },
      },
      captions: {
        type: "array",
        description: "Subtitle captions (timed text at bottom)",
        items: {
          type: "object",
          required: ["text", "startOnTimeline", "duration"],
          properties: {
            text: { type: "string", description: "Caption text" },
            startOnTimeline: { type: "number", description: "When caption appears (seconds)" },
            duration: { type: "number", description: "Caption duration (seconds)" },
          },
        },
      },
      width: { type: "number", description: "Canvas width, default 1080" },
      height: { type: "number", description: "Canvas height, default 1920" },
      fps: { type: "number", description: "Frames per second, default 30" },
    },
  },
};

export async function handleCapcutBridge(args: Record<string, unknown>) {
  try {
    const input: DraftBridgeInput = {
      projectName: args.projectName as string,
      clips: (args.clips as DraftBridgeInput["clips"]) || [],
      audio: (args.audio as DraftBridgeInput["audio"]) || [],
      textOverlays: (args.textOverlays as DraftBridgeInput["textOverlays"]) || [],
      captions: (args.captions as DraftBridgeInput["captions"]) || [],
      width: (args.width as number) || 1080,
      height: (args.height as number) || 1920,
      fps: (args.fps as number) || 30,
    };

    const result = generateCapCutDraft(input);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: result.success,
          project_path: result.projectPath,
          draft_info: result.draftInfoPath,
          meta_info: result.metaInfoPath,
          stats: {
            clips: input.clips.length,
            audio_tracks: input.audio.length,
            text_overlays: input.textOverlays?.length || 0,
            captions: input.captions?.length || 0,
            canvas: `${input.width}x${input.height}`,
            fps: input.fps,
          },
          next_step: "Open CapCut Desktop — the project should appear in your project list. If not, restart CapCut.",
        }, null, 2),
      }],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          error: msg,
          hint: "Ensure clips have valid absolute file paths and CapCut Desktop is installed.",
        }, null, 2),
      }],
      isError: true,
    };
  }
}

// ── MiniMax TTS Tool (Dr.Gwang Voice Clone) ─────────────────────

export const ttsDrGwangTool = {
  name: "whispercut_tts_dr_gwang",
  description:
    "Generate speech audio using Dr.Gwang's cloned voice via MiniMax TTS API. " +
    "Perfect for voiceover narration in health/wellness TikTok videos. " +
    "Returns an audio file path ready to add to CapCut project or FFmpeg pipeline.",
  inputSchema: {
    type: "object" as const,
    required: ["text"],
    properties: {
      text: {
        type: "string",
        description: "Thai text to speak (e.g., 'สวัสดีค่ะ วันนี้หมอกวางจะมาเล่าเรื่อง...')",
      },
      output_path: {
        type: "string",
        description: "Where to save the audio file (default: /tmp/whispercut/tts_{timestamp}.mp3)",
      },
      speed: {
        type: "number",
        description: "Speech speed multiplier (0.5-2.0, default 1.0)",
      },
      emotion: {
        type: "string",
        enum: ["neutral", "happy", "sad", "angry", "fearful", "surprised"],
        description: "Emotion tone (default: neutral)",
      },
    },
  },
};

export async function handleTtsDrGwang(args: Record<string, unknown>) {
  const text = args.text as string;
  const speed = (args.speed as number) || 1.0;
  const emotion = (args.emotion as string) || "neutral";

  const apiKey = process.env.MINIMAX_API_KEY;
  const voiceId = process.env.MINIMAX_VOICE_ID || "moss_audio_39a5b671-1e08-11f1-be4b-de7d2e195ee6";
  const groupId = process.env.MINIMAX_GROUP_ID || "";

  if (!apiKey) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          error: "MINIMAX_API_KEY not set in .env",
          hint: "Add your MiniMax API key to .env: MINIMAX_API_KEY=sk-api-...",
        }, null, 2),
      }],
      isError: true,
    };
  }

  // Generate output path
  const timestamp = Date.now();
  const outputDir = (args.output_path as string)
    ? (args.output_path as string).replace(/\/[^/]+$/, "")
    : "/tmp/whispercut";
  const outputPath = (args.output_path as string) || join(outputDir, `tts_drgwang_${timestamp}.mp3`);

  mkdirSync(outputDir, { recursive: true });

  try {
    // MiniMax T2A v2 API
    const apiUrl = groupId
      ? `https://api.minimax.chat/v1/t2a_v2?GroupId=${groupId}`
      : "https://api.minimax.chat/v1/t2a_v2";

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "speech-02-hd",
        text,
        voice_setting: {
          voice_id: voiceId,
          speed: Math.max(0.5, Math.min(2.0, speed)),
          vol: 1.0,
          pitch: 0,
          emotion,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: "mp3",
          channel: 1,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiniMax API error (${response.status}): ${errorText}`);
    }

    const result = await response.json() as Record<string, unknown>;

    // MiniMax returns base64 audio data or a URL
    const audioData = result.data as Record<string, unknown> | undefined;
    const extraInfo = result.extra_info as Record<string, unknown> | undefined;

    if (audioData && audioData.audio) {
      // Base64 encoded audio
      const audioBuffer = Buffer.from(audioData.audio as string, "hex");
      writeFileSync(outputPath, audioBuffer);
    } else if (result.audio_file) {
      // Direct audio response
      const audioResp = await fetch(result.audio_file as string);
      const audioArrayBuffer = await audioResp.arrayBuffer();
      writeFileSync(outputPath, Buffer.from(audioArrayBuffer));
    } else {
      // Try to get audio from response directly
      throw new Error("Unexpected MiniMax response format. Check API docs for v1/t2a_v2.");
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          audio_path: outputPath,
          text_length: text.length,
          voice: "Dr.Gwang (Instant Clone)",
          voice_id: voiceId,
          speed,
          emotion,
          duration_estimate: `~${Math.ceil(text.length / 5)}s`,
          usage: extraInfo || {},
          next_steps: [
            `Add to CapCut: whispercut_create_capcut_project with audio[].filePath = "${outputPath}"`,
            `Add to FFmpeg: whispercut_render with voiceover_path = "${outputPath}"`,
          ],
        }, null, 2),
      }],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          error: msg,
          hint: "Check MINIMAX_API_KEY and MINIMAX_VOICE_ID in .env. API docs: https://platform.minimaxi.com/document/T2A%20V2",
        }, null, 2),
      }],
      isError: true,
    };
  }
}
