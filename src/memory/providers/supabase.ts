/**
 * Supabase Bridge Provider — Reads existing RL data as MemoryInsights
 *
 * Bridges cover_preferences + rl_preferences → MemoryInsight format.
 * Read-only for recall; remember() is a no-op (RL writes handled by cover-design.ts).
 */

import { createClient } from "@supabase/supabase-js";
import type { MemoryProvider, MemoryEvent, RecallQuery, MemoryInsight } from "../types.js";

const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!,
  );
}

export const supabaseBridgeProvider: MemoryProvider = {
  name: "supabase",

  // No-op — RL writes are handled directly by cover-design.ts
  async remember(_event: MemoryEvent): Promise<void> {},

  async recall(query: RecallQuery): Promise<MemoryInsight[]> {
    const insights: MemoryInsight[] = [];

    try {
      const supabase = getSupabase();

      // Read cover_preferences for this channel
      const { data: prefs } = await supabase
        .from("cover_preferences")
        .select("dimension, value, win_rate, win_count, loss_count")
        .eq("channel", query.channel)
        .eq("user_email", USER_EMAIL)
        .order("win_rate", { ascending: false })
        .limit(query.limit || 10);

      if (prefs?.length) {
        // Group by dimension, take top value per dimension
        const topByDimension = new Map<string, typeof prefs[0]>();
        for (const p of prefs) {
          if (!topByDimension.has(p.dimension) && p.win_count > 0) {
            topByDimension.set(p.dimension, p);
          }
        }

        for (const [dim, pref] of topByDimension) {
          const total = pref.win_count + pref.loss_count;
          if (total < 2) continue; // Not enough data

          insights.push({
            text: `RL data: ${dim}="${pref.value}" has ${Math.round(pref.win_rate * 100)}% win rate (${total} samples) for channel "${query.channel}"`,
            confidence: Math.min(pref.win_rate, 0.95),
            source: "supabase",
            scope: "per_channel",
          });
        }
      }

      // Also check rl_preferences (general vibes/hooks)
      const { data: rlPrefs } = await supabase
        .from("rl_preferences")
        .select("dimension, value, win_rate, win_count, loss_count")
        .eq("user_email", USER_EMAIL)
        .order("win_rate", { ascending: false })
        .limit(5);

      if (rlPrefs?.length) {
        for (const p of rlPrefs) {
          const total = p.win_count + p.loss_count;
          if (total < 3) continue;

          insights.push({
            text: `Global RL: ${p.dimension}="${p.value}" wins ${Math.round(p.win_rate * 100)}% (${total} samples)`,
            confidence: Math.min(p.win_rate * 0.8, 0.7), // Lower confidence for global
            source: "supabase",
            scope: "cross_channel",
          });
        }
      }
    } catch (e: any) {
      console.error(`[supabase-bridge] recall failed: ${e.message}`);
    }

    return insights;
  },
};
