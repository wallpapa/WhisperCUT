/**
 * AI Provider — OpenRouter (free models) + Ollama (local) via Vercel AI SDK
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, generateObject } from "ai";
import { z } from "zod";

// OpenRouter provider (free models)
const openrouter = createOpenAICompatible({
  name: "openrouter",
  baseURL: "https://openrouter.ai/api/v1",
  headers: {
    "HTTP-Referer": "https://github.com/whispercut",
    "X-Title": "WhisperCUT",
  },
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

// Ollama provider (local)
const ollama = createOpenAICompatible({
  name: "ollama",
  baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
  apiKey: "ollama", // Ollama doesn't need real key
});

// Free OpenRouter models optimized for different tasks
export const MODELS = {
  // Text analysis + generation (fast, free)
  text: "openrouter/auto",
  // Video understanding (multimodal)
  vision: "qwen/qwen3-vl-235b-a22b:free",
  // Multilingual (Thai, Chinese, Japanese, Arabic)
  multilingual: "google/gemma-3-27b-it:free",
  // Local fallback
  local: "llama3.2",
} as const;

export type ModelRole = keyof typeof MODELS;

/** Get the appropriate AI model */
export function getModel(role: ModelRole = "text", useLocal = false) {
  if (useLocal) {
    return ollama(MODELS.local);
  }
  return openrouter(MODELS[role]);
}

/** Generate text with AI */
export async function aiGenerate(
  prompt: string,
  options: {
    system?: string;
    role?: ModelRole;
    useLocal?: boolean;
    maxTokens?: number;
  } = {}
): Promise<string> {
  const { system, role = "text", useLocal = false, maxTokens = 2048 } = options;
  const { text } = await generateText({
    model: getModel(role, useLocal),
    system,
    prompt,
    maxTokens,
  });
  return text;
}

/** Generate structured JSON output */
export async function aiStructured<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options: {
    system?: string;
    role?: ModelRole;
    useLocal?: boolean;
  } = {}
): Promise<T> {
  const { system, role = "text", useLocal = false } = options;
  const { object } = await generateObject({
    model: getModel(role, useLocal),
    system,
    prompt,
    schema,
  });
  return object;
}

/** Check if OpenRouter API key is configured */
export function hasOpenRouter(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

/** Check if Ollama is available */
export async function hasOllama(): Promise<boolean> {
  try {
    const base = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
