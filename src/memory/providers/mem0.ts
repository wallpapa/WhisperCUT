/**
 * Mem0 Provider — Wraps mem0ai npm package
 *
 * Stores natural language insights about what works per channel/topic.
 * Uses Mem0's built-in vector search for recall.
 *
 * Config: MEM0_API_KEY env var (or uses Mem0 local mode if not set)
 */

import type { MemoryProvider, MemoryEvent, RecallQuery, MemoryInsight } from "../types.js";

// ── Mem0 Client ───────────────────────────────────────────────

let mem0Client: any = null;

function getMem0() {
  if (mem0Client) return mem0Client;

  try {
    // Dynamic import to avoid hard crash if mem0ai not installed
    const { MemoryClient } = require("mem0ai");
    const apiKey = process.env.MEM0_API_KEY;

    if (apiKey) {
      mem0Client = new MemoryClient({ apiKey });
    } else {
      // Local mode — no API key, uses in-memory storage
      mem0Client = new MemoryClient();
    }
    return mem0Client;
  } catch {
    return null;
  }
}

// ── Event → Mem0 Message ──────────────────────────────────────

function eventToMessages(event: MemoryEvent): Array<{ role: string; content: string }> {
  const { type, channel, topic, data } = event;

  switch (type) {
    case "cover_selected":
      return [
        { role: "user", content: `Generate cover for channel "${channel}", topic "${topic}"` },
        {
          role: "assistant",
          content: `Selected cover style: expression=${data.expression}, lighting=${data.lighting_mood}, `
            + `color_scheme=${data.color_scheme}, background=${data.background_type}. `
            + `This style won against ${data.rejected_count || 3} other variants.`,
        },
      ];

    case "cover_rejected":
      return [
        { role: "user", content: `Generate cover for channel "${channel}", topic "${topic}"` },
        {
          role: "assistant",
          content: `Cover style rejected: expression=${data.expression}, lighting=${data.lighting_mood}. `
            + `User feedback: ${data.feedback || "not selected"}`,
        },
      ];

    case "feedback_scored":
      return [
        { role: "user", content: `Evaluate video for channel "${channel}", topic "${topic}"` },
        {
          role: "assistant",
          content: `Video scored: hook=${data.hook_score}/10, pacing=${data.pacing_score}/10, `
            + `vibe="${data.vibe}", completion_rate=${data.completion_rate}%. `
            + `${data.passed ? "Passed QA gate." : "Failed QA gate — needs improvement."}`,
        },
      ];

    case "style_studied":
      return [
        { role: "user", content: `Study TikTok style for channel "${channel}"` },
        {
          role: "assistant",
          content: `Style DNA extracted: ${data.style_summary}. Top patterns: ${data.top_patterns}`,
        },
      ];

    default:
      return [
        { role: "user", content: `${type} for channel "${channel}", topic "${topic}"` },
        { role: "assistant", content: JSON.stringify(data).slice(0, 500) },
      ];
  }
}

// ── Provider Implementation ───────────────────────────────────

export const mem0Provider: MemoryProvider = {
  name: "mem0",

  async remember(event: MemoryEvent): Promise<void> {
    const client = getMem0();
    if (!client) return;

    const messages = eventToMessages(event);
    const userId = `channel:${event.channel}`;
    const metadata = {
      topic: event.topic,
      channel: event.channel,
      event_type: event.type,
      timestamp: new Date().toISOString(),
    };

    try {
      await client.add(messages, {
        user_id: userId,
        metadata,
      });
    } catch (e: any) {
      console.error(`[mem0] remember failed: ${e.message}`);
    }
  },

  async recall(query: RecallQuery): Promise<MemoryInsight[]> {
    const client = getMem0();
    if (!client) return [];

    const insights: MemoryInsight[] = [];

    try {
      // Level 1: Per-Topic (highest priority)
      if (query.topic) {
        const topicResults = await client.search(
          `${query.intent} for topic "${query.topic}"`,
          {
            user_id: `channel:${query.channel}`,
            limit: query.limit || 3,
          },
        );

        for (const r of topicResults?.results || topicResults || []) {
          insights.push({
            text: r.memory || r.text || String(r),
            confidence: r.score ?? 0.8,
            source: "mem0",
            scope: "per_topic",
          });
        }
      }

      // Level 2: Per-Channel
      const channelResults = await client.search(query.intent, {
        user_id: `channel:${query.channel}`,
        limit: query.limit || 3,
      });

      for (const r of channelResults?.results || channelResults || []) {
        const text = r.memory || r.text || String(r);
        // Avoid duplicates from topic search
        if (!insights.some(i => i.text === text)) {
          insights.push({
            text,
            confidence: r.score ?? 0.6,
            source: "mem0",
            scope: "per_channel",
          });
        }
      }

      // Level 3: Cross-Channel (search without user_id filter)
      const globalResults = await client.search(query.intent, {
        limit: 2,
      });

      for (const r of globalResults?.results || globalResults || []) {
        const text = r.memory || r.text || String(r);
        if (!insights.some(i => i.text === text)) {
          insights.push({
            text,
            confidence: r.score ?? 0.4,
            source: "mem0",
            scope: "cross_channel",
          });
        }
      }
    } catch (e: any) {
      console.error(`[mem0] recall failed: ${e.message}`);
    }

    // Sort: per_topic first, then per_channel, then cross_channel
    const scopeOrder: Record<string, number> = { per_topic: 0, per_channel: 1, cross_channel: 2 };
    return insights.sort((a, b) => (scopeOrder[a.scope] ?? 9) - (scopeOrder[b.scope] ?? 9));
  },
};
