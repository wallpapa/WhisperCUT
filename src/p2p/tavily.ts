/**
 * Tavily Research API — Topic discovery & paper finding
 *
 * Uses fetch() against Tavily REST API (no npm package needed).
 * Provides two main functions:
 *   1. researchTopic()       — General topic research with structured results
 *   2. findResearchPapers()  — Find peer-reviewed papers with DOI extraction
 */

const TAVILY_API_URL = "https://api.tavily.com/search";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";

// ── Types ───────────────────────────────────────────────────────

interface TavilySource {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyRawResult {
  title: string;
  url: string;
  content: string;
  score: number;
  raw_content?: string;
}

interface TavilyResponse {
  answer: string;
  results: TavilyRawResult[];
  query: string;
}

export interface ResearchResult {
  answer: string;
  sources: TavilySource[];
}

export interface ResearchPaper {
  title: string;
  url: string;
  doi: string | null;
  snippet: string;
}

export interface PaperSearchResult {
  papers: ResearchPaper[];
}

interface ResearchOptions {
  language?: string;
  depth?: "basic" | "advanced";
}

// ── Core fetch helper ───────────────────────────────────────────

async function tavilySearch(
  query: string,
  depth: "basic" | "advanced" = "advanced",
  maxResults: number = 5,
): Promise<TavilyResponse> {
  if (!TAVILY_API_KEY) {
    throw new Error(
      "TAVILY_API_KEY not set. " +
      "Get your key at https://tavily.com → Add to .env: TAVILY_API_KEY=tvly-...",
    );
  }

  const body = {
    api_key: TAVILY_API_KEY,
    query,
    search_depth: depth,
    include_answer: true,
    max_results: maxResults,
  };

  const res = await fetch(TAVILY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Tavily auth failed (${res.status}). Check TAVILY_API_KEY is valid. ` +
        `Get a new key at https://tavily.com`,
      );
    }
    if (res.status === 429) {
      throw new Error(
        "Tavily rate limit reached. Free tier: 1,000 searches/month. " +
        "Wait a minute or upgrade at https://tavily.com/pricing",
      );
    }
    throw new Error(`Tavily API error ${res.status}: ${text.slice(0, 200)}`);
  }

  return (await res.json()) as TavilyResponse;
}

// ── DOI extraction ──────────────────────────────────────────────

const DOI_REGEX = /10\.\d{4,}\/[^\s,)}\]>"]+/g;

function extractDois(text: string): string[] {
  const matches = text.match(DOI_REGEX);
  if (!matches) return [];
  // Deduplicate and clean trailing punctuation
  const cleaned = matches.map((d) => d.replace(/[.;]+$/, ""));
  return [...new Set(cleaned)];
}

// ── Exported functions ──────────────────────────────────────────

/**
 * Research a topic using Tavily search.
 * Returns a synthesised answer and structured source list.
 */
export async function researchTopic(
  topic: string,
  options?: ResearchOptions,
): Promise<ResearchResult> {
  const query = options?.language
    ? `${topic} (${options.language})`
    : topic;

  const data = await tavilySearch(query, options?.depth ?? "advanced");

  return {
    answer: data.answer || "",
    sources: data.results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
    })),
  };
}

/**
 * Find peer-reviewed research papers on a topic.
 * Searches with academic qualifiers and extracts DOIs from results.
 */
export async function findResearchPapers(
  topic: string,
): Promise<PaperSearchResult> {
  const query = `${topic} research study pubmed doi peer-reviewed`;
  const data = await tavilySearch(query, "advanced", 5);

  const papers: ResearchPaper[] = data.results.map((r) => {
    // Try to extract DOI from URL first, then from content
    const urlDois = extractDois(r.url);
    const contentDois = extractDois(r.content || "");
    const allDois = [...urlDois, ...contentDois];

    return {
      title: r.title,
      url: r.url,
      doi: allDois[0] ?? null,
      snippet: r.content.slice(0, 300),
    };
  });

  return { papers };
}

/**
 * Check whether the Tavily API key is configured.
 */
export function hasTavily(): boolean {
  return TAVILY_API_KEY.length > 0;
}
