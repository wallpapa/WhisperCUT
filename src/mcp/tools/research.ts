/**
 * whispercut_research_topic  — Research any topic via Tavily + save patterns to memory
 * whispercut_find_research   — Find peer-reviewed papers with DOI extraction + save to topics
 */

import {
  researchTopic,
  findResearchPapers,
  hasTavily,
} from "../../p2p/tavily.js";
import { extractFromResearch } from "../../p2p/memory-extractor.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!,
);

const USER_EMAIL = process.env.WHISPERCUT_USER_EMAIL || "anonymous";

// ── Setup instructions (shown when TAVILY_API_KEY missing) ──────

const TAVILY_SETUP = [
  "Tavily API key not configured. To enable research tools:",
  "",
  "1. Sign up at https://tavily.com (free tier: 1,000 searches/month)",
  "2. Copy your API key from the dashboard",
  "3. Add to your .env file:",
  "   TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxx",
  "4. Restart the WhisperCUT MCP server",
].join("\n");

// ── whispercut_research_topic ───────────────────────────────────

export const researchTopicTool = {
  name: "whispercut_research_topic",
  description:
    "Research any topic using Tavily search API. Returns a synthesised answer " +
    "plus scored sources. Optionally saves discovered patterns to the shared " +
    "memory network for future content production.",
  inputSchema: {
    type: "object" as const,
    required: ["topic"] as const,
    properties: {
      topic: {
        type: "string",
        description: "Topic to research (e.g. 'sleep deprivation effects on children')",
      },
      language: {
        type: "string",
        description: "Preferred result language (e.g. 'Thai', 'English'). Default: any",
      },
      save_to_memory: {
        type: "boolean",
        description: "Save discovered research patterns to shared memory network (default: false)",
      },
    },
  },
};

export async function handleResearchTopic(args: {
  topic: string;
  language?: string;
  save_to_memory?: boolean;
}) {
  if (!hasTavily()) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ error: "tavily_not_configured", setup: TAVILY_SETUP }, null, 2),
      }],
    };
  }

  try {
    const result = await researchTopic(args.topic, {
      language: args.language,
      depth: "advanced",
    });

    let savedToMemory = false;

    if (args.save_to_memory && result.sources.length > 0) {
      // Pick the top source to save as a research memory
      const topSource = result.sources[0];
      try {
        await extractFromResearch({
          topic: args.topic,
          research_doi: "",
          research_title: topSource.title,
          research_year: new Date().getFullYear(),
          research_journal: new URL(topSource.url).hostname,
          hook: result.answer.slice(0, 120),
          content_type: "research_discovery",
          angle: result.answer.slice(0, 200),
        });
        savedToMemory = true;
      } catch (memErr: unknown) {
        const msg = memErr instanceof Error ? memErr.message : String(memErr);
        console.error(`[research] Memory save failed (non-fatal): ${msg}`);
      }
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          topic: args.topic,
          answer: result.answer,
          sources: result.sources.map((s) => ({
            title: s.title,
            url: s.url,
            content: s.content.slice(0, 300),
            score: s.score,
          })),
          saved_to_memory: savedToMemory,
        }, null, 2),
      }],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: msg }, null, 2) }],
      isError: true,
    };
  }
}

// ── whispercut_find_research ────────────────────────────────────

export const findResearchTool = {
  name: "whispercut_find_research",
  description:
    "Find peer-reviewed research papers on a topic. Searches for studies with " +
    "DOI extraction from PubMed, journals, and academic databases. " +
    "Optionally saves found topics to the content_topics table for content planning.",
  inputSchema: {
    type: "object" as const,
    required: ["topic"] as const,
    properties: {
      topic: {
        type: "string",
        description: "Research topic to find papers for (e.g. 'screen time toddlers brain development')",
      },
      save_to_topics: {
        type: "boolean",
        description: "Save found papers as content topics in Supabase (default: false)",
      },
    },
  },
};

export async function handleFindResearch(args: {
  topic: string;
  save_to_topics?: boolean;
}) {
  if (!hasTavily()) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ error: "tavily_not_configured", setup: TAVILY_SETUP }, null, 2),
      }],
    };
  }

  try {
    const result = await findResearchPapers(args.topic);
    let savedToTopics = false;

    if (args.save_to_topics && result.papers.length > 0) {
      const rows = result.papers.map((p) => ({
        topic: args.topic,
        paper_title: p.title,
        paper_url: p.url,
        doi: p.doi,
        snippet: p.snippet,
        status: "discovered",
        contributed_by: USER_EMAIL,
        created_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from("content_topics").insert(rows);
      if (error) {
        console.error(`[research] Topic insert failed: ${error.message}`);
      } else {
        savedToTopics = true;
      }
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          topic: args.topic,
          papers: result.papers.map((p) => ({
            title: p.title,
            doi: p.doi,
            url: p.url,
            snippet: p.snippet,
          })),
          papers_found: result.papers.length,
          with_doi: result.papers.filter((p) => p.doi !== null).length,
          saved_to_topics: savedToTopics,
        }, null, 2),
      }],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: msg }, null, 2) }],
      isError: true,
    };
  }
}
