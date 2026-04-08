/**
 * Memory Layer — Shared Types
 *
 * Used by memory-layer.ts and all providers (mem0, supabase, telemem future)
 */

// ── Events (what happened — stored after user action) ─────────

export type MemoryEventType =
  | "cover_selected"
  | "cover_rejected"
  | "video_published"
  | "feedback_scored"
  | "style_studied";

export interface MemoryEvent {
  type: MemoryEventType;
  channel: string;
  topic: string;
  data: Record<string, unknown>;
}

// ── Queries (what do we know — asked before generation) ───────

export interface RecallQuery {
  channel: string;
  topic?: string;
  intent: string;
  limit?: number;
}

// ── Results ───────────────────────────────────────────────────

export type MemorySource = "mem0" | "supabase" | "telemem";
export type MemoryScope = "cross_channel" | "per_channel" | "per_topic";

export interface MemoryInsight {
  text: string;
  confidence: number;
  source: MemorySource;
  scope: MemoryScope;
}

export interface Pattern {
  pattern: string;
  frequency: number;
  channels: string[];
}

// ── Provider Interface ────────────────────────────────────────

export interface MemoryProvider {
  name: MemorySource;
  remember(event: MemoryEvent): Promise<void>;
  recall(query: RecallQuery): Promise<MemoryInsight[]>;
}
