/**
 * Gemma Provider — Smart Router for Fine-Tuned Local AI
 *
 * Routes AI requests through the cheapest available provider:
 *   1. Kaggle Inference (FREE, if notebook running)
 *   2. Local Ollama (FREE, if Gemma model loaded)
 *   3. API fallback (paid: Gemini/Claude/OpenRouter)
 *
 * Supports 3 specialized soldiers:
 *   - cover-judge: Score covers 0-100
 *   - vibe-analyst: 6-dim VibeScore
 *   - script-writer: Thai hormone-arc scripts
 *
 * Cost: $0/call via Gemma vs $0.05/call via API
 */

import { aiGenerate, aiGenerateJSON, hasOllama } from "./provider.js";

// ── Types ─────────────────────────────────────────────────────

export type GemmaSoldier = "cover-judge" | "vibe-analyst" | "script-writer" | "general";

interface GemmaProviderStatus {
  kaggle: boolean;
  ollama: boolean;
  api: boolean;
  activeProvider: "kaggle" | "ollama" | "api" | "none";
}

// ── Kaggle Inference ──────────────────────────────────────────

const KAGGLE_URL = process.env.KAGGLE_INFERENCE_URL;

async function callKaggle(prompt: string, soldier: GemmaSoldier): Promise<string | null> {
  if (!KAGGLE_URL) return null;

  try {
    const res = await fetch(KAGGLE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, soldier }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) return null;
    const data = await res.json() as any;
    return data.text || data.output || JSON.stringify(data);
  } catch {
    return null;
  }
}

// ── Ollama Local ──────────────────────────────────────────────

async function callOllamaGemma(prompt: string, soldier: GemmaSoldier): Promise<string | null> {
  const ollamaAvailable = await hasOllama();
  if (!ollamaAvailable) return null;

  // Use fine-tuned model if available, otherwise base Gemma
  const model = soldier !== "general"
    ? `whispercut-${soldier}` // custom GGUF from Kaggle training
    : "gemma3:12b";          // base model fallback

  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0.3, num_predict: 2048 },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      // Model not found — try base Gemma
      if (soldier !== "general") {
        return callOllamaGemma(prompt, "general");
      }
      return null;
    }

    const data = await res.json() as any;
    return data.response;
  } catch {
    return null;
  }
}

// ── Smart Router ──────────────────────────────────────────────

/**
 * Generate text using the cheapest available Gemma provider.
 * Falls back to API if no local/free option available.
 */
export async function gemmaGenerate(
  prompt: string,
  options?: { soldier?: GemmaSoldier; maxTokens?: number },
): Promise<string> {
  const soldier = options?.soldier || "general";

  // 1. Try Kaggle (FREE)
  const kaggleResult = await callKaggle(prompt, soldier);
  if (kaggleResult) {
    console.error(`[gemma] Kaggle (${soldier}) → response`);
    return kaggleResult;
  }

  // 2. Try Ollama (FREE)
  const ollamaResult = await callOllamaGemma(prompt, soldier);
  if (ollamaResult) {
    console.error(`[gemma] Ollama (${soldier}) → response`);
    return ollamaResult;
  }

  // 3. API fallback (paid)
  console.error(`[gemma] API fallback (${soldier}) → paid call`);
  return aiGenerate(prompt, { maxTokens: options?.maxTokens || 4096 });
}

/**
 * Generate JSON using Gemma with structured output.
 */
export async function gemmaGenerateJSON<T = unknown>(
  prompt: string,
  options?: { soldier?: GemmaSoldier },
): Promise<T> {
  const text = await gemmaGenerate(
    prompt + "\n\nReturn ONLY valid JSON, no markdown fences.",
    options,
  );

  // Parse JSON from response
  let clean = text.trim();
  const fenceMatch = clean.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) clean = fenceMatch[1].trim();

  return JSON.parse(clean) as T;
}

/** Check which providers are available */
export async function getGemmaStatus(): Promise<GemmaProviderStatus> {
  const kaggle = !!KAGGLE_URL;

  let ollama = false;
  try {
    ollama = await hasOllama();
  } catch {}

  const api = true; // API always available as fallback

  const activeProvider = kaggle ? "kaggle" : ollama ? "ollama" : api ? "api" : "none";

  return { kaggle, ollama, api, activeProvider };
}
