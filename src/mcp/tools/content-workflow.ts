/**
 * Content workflow tools for collaborative content creation.
 *
 * Flow: wallpapa researches topics + hooks  →  waleerat claims, scripts, films, publishes
 *
 * Status flow: ready → claimed → scripted → filmed → published
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ── Supabase client (lazy singleton) ────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: SupabaseClient<any, "public", any> | null = null;

function getSupabase() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables"
    );
  }
  _supabase = createClient(url, key);
  return _supabase;
}

function getUserEmail(): string {
  const email = process.env.WHISPERCUT_USER_EMAIL;
  if (!email) {
    throw new Error(
      "Missing WHISPERCUT_USER_EMAIL environment variable"
    );
  }
  return email;
}

// ── Types ────────────────────────────────────────────────────────
type TopicStatus = "ready" | "claimed" | "scripted" | "filmed" | "published";

interface ContentTopic {
  id: number;
  hook: string;
  topic: string;
  content_type: string;
  vibe: string | null;
  viral_score: number | null;
  research_title: string | null;
  research_doi: string | null;
  research_year: number | null;
  research_journal: string | null;
  angle: string | null;
  status: TopicStatus;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
}

/** Valid status transitions: each key can only advance to its value */
const VALID_TRANSITIONS: Record<string, TopicStatus> = {
  claimed: "scripted",
  scripted: "filmed",
  filmed: "published",
};

// ── Helpers ──────────────────────────────────────────────────────
function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

function jsonResult(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

// ── Tool 1: whispercut_claim_topic ──────────────────────────────
export const claimTopicTool = {
  name: "whispercut_claim_topic",
  description:
    "Claim a content topic for production. Only topics with status 'ready' can be claimed. " +
    "Sets the topic status to 'claimed' and assigns it to the current user. " +
    "Returns the full topic details including hook, research info, and suggested angle.",
  inputSchema: {
    type: "object" as const,
    properties: {
      topic_id: {
        type: "number",
        description: "The ID of the topic to claim",
      },
    },
    required: ["topic_id"],
  },
};

export async function handleClaimTopic(args: Record<string, unknown>) {
  const topicId = args.topic_id as number;
  const supabase = getSupabase();
  const userEmail = getUserEmail();

  // Fetch the topic first to validate
  const { data: topic, error: fetchError } = await supabase
    .from("content_topics")
    .select("*")
    .eq("id", topicId)
    .single();

  if (fetchError || !topic) {
    return errorResult(`Topic #${topicId} not found`);
  }

  const row = topic as ContentTopic;

  if (row.status !== "ready") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              error: `Topic #${topicId} cannot be claimed — current status is '${row.status}'`,
              claimed_by: row.claimed_by,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  // Claim the topic
  const { data: updated, error: updateError } = await supabase
    .from("content_topics")
    .update({
      status: "claimed",
      claimed_by: userEmail,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", topicId)
    .select("*")
    .single();

  if (updateError || !updated) {
    return errorResult(`Failed to claim topic: ${updateError?.message ?? "unknown error"}`);
  }

  return jsonResult({ status: "claimed", topic: updated as ContentTopic });
}

// ── Tool 2: whispercut_update_topic_status ──────────────────────
export const updateTopicStatusTool = {
  name: "whispercut_update_topic_status",
  description:
    "Advance a content topic to the next production stage. " +
    "Valid transitions: claimed → scripted → filmed → published. " +
    "Optionally attach notes (e.g. script draft link, filming location).",
  inputSchema: {
    type: "object" as const,
    properties: {
      topic_id: {
        type: "number",
        description: "The ID of the topic to update",
      },
      status: {
        type: "string",
        enum: ["scripted", "filmed", "published"],
        description:
          "The new status. Must follow the valid transition order: claimed → scripted → filmed → published",
      },
      notes: {
        type: "string",
        description:
          "Optional notes about this status change (e.g. script link, filming details)",
      },
    },
    required: ["topic_id", "status"],
  },
};

export async function handleUpdateTopicStatus(args: Record<string, unknown>) {
  const topicId = args.topic_id as number;
  const newStatus = args.status as TopicStatus;
  const notes = args.notes as string | undefined;
  const supabase = getSupabase();

  // Fetch current topic
  const { data: topic, error: fetchError } = await supabase
    .from("content_topics")
    .select("*")
    .eq("id", topicId)
    .single();

  if (fetchError || !topic) {
    return errorResult(`Topic #${topicId} not found`);
  }

  const row = topic as ContentTopic;

  // Validate transition
  const allowed = VALID_TRANSITIONS[row.status];
  if (allowed !== newStatus) {
    const hint = allowed
      ? `Current status '${row.status}' can only transition to '${allowed}'`
      : `Current status '${row.status}' has no further transitions`;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { error: `Invalid status transition: '${row.status}' → '${newStatus}'`, hint },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = { status: newStatus };
  if (notes !== undefined) {
    updatePayload.notes = notes;
  }

  const { data: updated, error: updateError } = await supabase
    .from("content_topics")
    .update(updatePayload)
    .eq("id", topicId)
    .select("*")
    .single();

  if (updateError || !updated) {
    return errorResult(`Failed to update topic: ${updateError?.message ?? "unknown error"}`);
  }

  return jsonResult({
    status: "updated",
    previous_status: row.status,
    new_status: newStatus,
    topic: updated as ContentTopic,
  });
}

// ── Tool 3: whispercut_production_board ──────────────────────────
export const productionBoardTool = {
  name: "whispercut_production_board",
  description:
    "View the content production board. Shows all topics in the pipeline with their current status. " +
    "Filter by: 'all' (everything), 'ready' (unclaimed topics), 'claimed' (in-progress), " +
    "or 'mine' (topics assigned to the current user). " +
    "Includes a summary count of topics in each status.",
  inputSchema: {
    type: "object" as const,
    properties: {
      filter: {
        type: "string",
        enum: ["all", "ready", "claimed", "mine"],
        description:
          "Filter topics: 'all' = everything, 'ready' = unclaimed, 'claimed' = in-progress, 'mine' = assigned to me (default: 'all')",
        default: "all",
      },
    },
    required: [] as string[],
  },
};

export async function handleProductionBoard(args: Record<string, unknown>) {
  const filter = (args.filter as string | undefined) ?? "all";
  const supabase = getSupabase();

  // Build query based on filter
  let query = supabase
    .from("content_topics")
    .select("*")
    .order("created_at", { ascending: false });

  switch (filter) {
    case "ready":
      query = query.eq("status", "ready");
      break;
    case "claimed":
      query = query.in("status", ["claimed", "scripted", "filmed"]);
      break;
    case "mine": {
      const userEmail = getUserEmail();
      query = query.eq("claimed_by", userEmail);
      break;
    }
    // 'all' — no extra filter
  }

  const { data: topics, error } = await query;

  if (error) {
    return errorResult(`Failed to fetch board: ${error.message}`);
  }

  const topicList = (topics ?? []) as ContentTopic[];

  // Build summary counts
  const summary: Record<TopicStatus, number> = {
    ready: 0,
    claimed: 0,
    scripted: 0,
    filmed: 0,
    published: 0,
  };
  for (const t of topicList) {
    if (t.status in summary) {
      summary[t.status] += 1;
    }
  }

  return jsonResult({
    filter,
    total: topicList.length,
    summary,
    topics: topicList,
  });
}

// ── Tool 4: whispercut_add_topic ────────────────────────────────
export const addTopicTool = {
  name: "whispercut_add_topic",
  description:
    "Add a new content topic to the production board with status 'ready'. " +
    "Provide at minimum a hook, topic, and content type. Optionally include research references " +
    "(DOI, title, journal, year), a suggested angle, vibe, and viral score.",
  inputSchema: {
    type: "object" as const,
    properties: {
      hook: {
        type: "string",
        description: "The attention-grabbing hook for the video",
      },
      topic: {
        type: "string",
        description: "The main topic or subject of the content",
      },
      content_type: {
        type: "string",
        description:
          "Content format, e.g. 'edutainment', 'myth-bust', 'how-to', 'story'",
      },
      vibe: {
        type: "string",
        description: "Visual/editing vibe, e.g. 'fast-cut', 'calm', 'dramatic'",
      },
      viral_score: {
        type: "number",
        description: "Predicted viral potential score (1-10)",
      },
      research_doi: {
        type: "string",
        description: "DOI of the supporting research paper",
      },
      research_title: {
        type: "string",
        description: "Title of the supporting research paper",
      },
      research_year: {
        type: "number",
        description: "Publication year of the research paper",
      },
      research_journal: {
        type: "string",
        description: "Journal name of the research paper",
      },
      angle: {
        type: "string",
        description:
          "Suggested creative angle for presenting this topic in the video",
      },
    },
    required: ["hook", "topic", "content_type"],
  },
};

export async function handleAddTopic(args: Record<string, unknown>) {
  const supabase = getSupabase();

  const insertPayload: Record<string, unknown> = {
    hook: args.hook,
    topic: args.topic,
    content_type: args.content_type,
    status: "ready",
  };

  // Optional fields — only include if provided
  const optionalFields = [
    "vibe",
    "viral_score",
    "research_doi",
    "research_title",
    "research_year",
    "research_journal",
    "angle",
  ] as const;

  for (const field of optionalFields) {
    if (args[field] !== undefined) {
      insertPayload[field] = args[field];
    }
  }

  const { data: created, error } = await supabase
    .from("content_topics")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error || !created) {
    return errorResult(`Failed to add topic: ${error?.message ?? "unknown error"}`);
  }

  return jsonResult({ status: "created", topic: created as ContentTopic });
}
