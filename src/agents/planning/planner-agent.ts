/**
 * ContentPlannerAgent — AI-powered content planning with trend analysis
 *
 * Wraps Tavily research + content_workflow tools
 * Queries trends → ranks by RL preferences → outputs weekly plan
 * Learns from TikTok performance which topics work best
 *
 * Real data: Parenting+DNA=1.9M views, AI+Medicine=150K, Fun facts+Kids=117K
 */

import { BaseAgent, type AgentResult } from "../base-agent.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ""
);

interface PlannerPayload {
  channel?: string;           // e.g., "@doctorwaleerat"
  niche?: string;             // e.g., "health", "parenting", "longevity"
  num_topics?: number;        // default 7 (weekly)
  platform?: string;          // default "tiktok"
}

interface TopicSuggestion {
  topic: string;
  hook: string;
  vibe: string;
  predicted_score: number;
  reasoning: string;
  research_angle?: string;
}

export class ContentPlannerAgent extends BaseAgent {
  readonly name = "ContentPlannerAgent";
  readonly jobType = "content_plan";
  readonly description = "Plans weekly content topics by analyzing trends, past performance, and RL preferences";

  async process(payload: unknown): Promise<AgentResult> {
    const startTime = Date.now();
    const params = payload as PlannerPayload;
    const numTopics = params.num_topics || 7;

    // Step 1: Query memory for best-performing content patterns
    const memories = await this.queryMemory(
      `${params.niche || "health"} tiktok viral ${params.channel || ""}`,
      10
    );

    // Step 2: Get existing topics from content_topics table
    let existingTopics: string[] = [];
    try {
      const { data } = await supabase
        .from("content_topics")
        .select("topic")
        .order("created_at", { ascending: false })
        .limit(20);
      existingTopics = (data || []).map(t => t.topic);
    } catch {
      // Non-blocking
    }

    // Step 3: Research trending topics via Tavily (if available)
    let trendingTopics: string[] = [];
    if (process.env.TAVILY_API_KEY) {
      try {
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: process.env.TAVILY_API_KEY,
            query: `trending ${params.niche || "health"} topics Thailand TikTok 2026`,
            max_results: 5,
            search_depth: "basic",
          }),
        });
        if (response.ok) {
          const data = await response.json() as { results?: Array<{ title: string }> };
          trendingTopics = (data.results || []).map(r => r.title).slice(0, 5);
        }
      } catch {
        // Tavily optional
      }
    }

    // Step 4: Score and rank topic suggestions
    const topPatterns = memories
      .filter(m => m.category === "topic" || m.category === "hook")
      .sort((a, b) => b.score - a.score);

    const suggestions: TopicSuggestion[] = [];

    // From memory patterns (highest performing)
    for (const mem of topPatterns.slice(0, Math.ceil(numTopics / 2))) {
      suggestions.push({
        topic: mem.pattern.split("=")[0]?.trim() || mem.pattern.slice(0, 50),
        hook: `Based on pattern: ${mem.pattern.slice(0, 80)}`,
        vibe: "educational_warm",
        predicted_score: mem.score,
        reasoning: `Memory score ${mem.score}/10, confidence ${mem.confidence}`,
      });
    }

    // From trending topics (fresh content)
    for (const trend of trendingTopics.slice(0, Math.floor(numTopics / 2))) {
      suggestions.push({
        topic: trend,
        hook: `Trending: ${trend.slice(0, 60)}`,
        vibe: "shocking_reveal", // Trends often work with bold claims
        predicted_score: 7.0,
        reasoning: "Trending topic from Tavily search",
        research_angle: trend,
      });
    }

    // Filter out already-existing topics
    const newSuggestions = suggestions.filter(
      s => !existingTopics.some(et => et.toLowerCase().includes(s.topic.toLowerCase().slice(0, 20)))
    ).slice(0, numTopics);

    // Step 5: Save to content_topics table
    let topicsSaved = 0;
    for (const sug of newSuggestions) {
      try {
        await supabase.from("content_topics").insert({
          topic: sug.topic,
          hook: sug.hook,
          vibe: sug.vibe,
          viral_score: sug.predicted_score,
          content_type: params.niche || "health",
          angle: sug.reasoning,
          status: "ready",
        });
        topicsSaved++;
      } catch {
        // Skip duplicates
      }
    }

    // Step 6: Emit RL signals
    const signals = [
      {
        dimension: "content_plan_quality",
        value: Math.min(10, newSuggestions.length * 1.5),
        context: { num_topics: newSuggestions.length, from_memory: topPatterns.length, from_trends: trendingTopics.length },
      },
    ];

    return {
      success: newSuggestions.length > 0,
      output: {
        suggestions: newSuggestions,
        topics_saved: topicsSaved,
        sources: {
          from_memory: topPatterns.length,
          from_trends: trendingTopics.length,
          existing_topics_filtered: existingTopics.length,
        },
      },
      confidence: newSuggestions.length >= numTopics ? 0.8 : 0.5,
      signals,
      duration_ms: Date.now() - startTime,
    };
  }
}
