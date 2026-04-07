/**
 * AI Provider — Unified BYOK Gateway
 *
 * Users bring their own AI key. Supports:
 *   - gemini     (free tier 250 req/day via OpenAI-compatible endpoint)
 *   - openrouter (free models via openrouter.ai)
 *   - ollama     (local: Gemma 4, Llama, Qwen, GLM, etc.)
 *   - custom     (any OpenAI-compatible API)
 *
 * Config via env:
 *   AI_PROVIDER=gemini|openrouter|ollama|custom
 *   AI_MODEL=gemini-2.5-flash (or gemma3:27b, glm-4-flash, etc.)
 *   AI_API_KEY=your-key
 *   AI_BASE_URL=https://your-api.com/v1  (custom only)
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, generateObject } from "ai";
import { z } from "zod";

// ── Provider Registry ────────────────────────────────────────────

interface ProviderConfig {
  name: string;
  baseURL: string;
  apiKey: string;
  headers?: Record<string, string>;
  defaultModel: string;
}

const PROVIDER_CONFIGS: Record<string, () => ProviderConfig> = {
  gemini: () => ({
    name: "gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKey: process.env.AI_API_KEY || process.env.GEMINI_API_KEY || "",
    defaultModel: "gemini-2.5-flash",
  }),
  openrouter: () => ({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY || "",
    headers: {
      "HTTP-Referer": "https://github.com/whispercut",
      "X-Title": "WhisperCUT",
    },
    defaultModel: "google/gemma-3-27b-it:free",
  }),
  ollama: () => ({
    name: "ollama",
    baseURL: process.env.AI_BASE_URL || process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
    apiKey: "ollama",
    defaultModel: "gemma3:27b",
  }),
  custom: () => ({
    name: "custom",
    baseURL: process.env.AI_BASE_URL || "http://localhost:8000/v1",
    apiKey: process.env.AI_API_KEY || "",
    defaultModel: process.env.AI_MODEL || "default",
  }),
};

// ── Detect Provider ──────────────────────────────────────────────

function detectProvider(): string {
  if (process.env.AI_PROVIDER) return process.env.AI_PROVIDER;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  return "ollama"; // fallback to local
}

function getProviderConfig(): ProviderConfig {
  const name = detectProvider();
  const factory = PROVIDER_CONFIGS[name] || PROVIDER_CONFIGS.ollama;
  return factory();
}

// ── Singleton Provider ───────────────────────────────────────────

let _provider: ReturnType<typeof createOpenAICompatible> | null = null;
let _config: ProviderConfig | null = null;

function getProvider() {
  if (!_provider) {
    _config = getProviderConfig();
    _provider = createOpenAICompatible({
      name: _config.name,
      baseURL: _config.baseURL,
      apiKey: _config.apiKey,
      headers: _config.headers,
    });
  }
  return _provider;
}

function getModelName(): string {
  if (!_config) getProvider();
  return process.env.AI_MODEL || _config!.defaultModel;
}

/** Get the AI model instance */
export function getModel() {
  return getProvider()(getModelName());
}

// ── Public API ───────────────────────────────────────────────────

/** Generate text with AI */
export async function aiGenerate(
  prompt: string,
  options: { system?: string; maxTokens?: number } = {}
): Promise<string> {
  const { system, maxTokens = 4096 } = options;
  const { text } = await generateText({
    model: getModel(),
    system,
    prompt,
    maxTokens,
  });
  return text;
}

/** Generate structured JSON output with Zod validation */
export async function aiStructured<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options: { system?: string } = {}
): Promise<T> {
  const { system } = options;
  try {
    // Try native structured output first
    const { object } = await generateObject({
      model: getModel(),
      system,
      prompt,
      schema,
    });
    return object;
  } catch {
    // Fallback: generate text then parse JSON
    const text = await aiGenerate(prompt, { system, maxTokens: 8192 });
    const json = extractJSON(text);
    return schema.parse(json);
  }
}

/**
 * Generate JSON from AI — replaces all direct Gemini calls.
 * Generates text, strips markdown fences, parses JSON.
 * Optionally validates with Zod schema.
 */
export async function aiGenerateJSON<T = unknown>(
  prompt: string,
  options: {
    system?: string;
    maxTokens?: number;
    schema?: z.ZodType<T>;
  } = {}
): Promise<T> {
  const { system, maxTokens = 8192, schema } = options;
  const text = await aiGenerate(prompt, { system, maxTokens });
  const parsed = extractJSON(text);
  if (schema) return schema.parse(parsed);
  return parsed as T;
}

// ── Utilities ────────────────────────────────────────────────────

/** Extract JSON from text that may contain markdown code fences */
function extractJSON(text: string): unknown {
  // Strip markdown code fences
  let clean = text.trim();
  const fenceMatch = clean.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    clean = fenceMatch[1].trim();
  }
  return JSON.parse(clean);
}

/** Get provider info for status display */
export function getProviderInfo(): {
  provider: string;
  model: string;
  baseURL: string;
  hasKey: boolean;
} {
  const config = getProviderConfig();
  return {
    provider: config.name,
    model: process.env.AI_MODEL || config.defaultModel,
    baseURL: config.baseURL,
    hasKey: config.apiKey !== "" && config.apiKey !== "ollama",
  };
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

// Legacy exports for backward compatibility
export type ModelRole = "text" | "vision" | "multilingual" | "local";
export function hasOpenRouter(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}
