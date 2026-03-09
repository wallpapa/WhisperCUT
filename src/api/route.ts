/**
 * Vercel API Routes — Serverless endpoints for WhisperCUT
 * Deploy as Vercel serverless functions
 *
 * POST /api/route?action=analyze
 * POST /api/route?action=status
 * POST /api/route?action=projects
 */
import { hasOpenRouter, hasOllama } from "../ai/provider.js";
import { hasSupabase, listProjects, getProject } from "../db/client.js";

interface ApiRequest {
  action: string;
  [key: string]: any;
}

interface ApiResponse {
  ok: boolean;
  data?: any;
  error?: string;
}

/** Health check + system status */
function statusCheck(): ApiResponse {
  return {
    ok: true,
    data: {
      name: "WhisperCUT",
      version: "0.1.0",
      format: "9:16 vertical only",
      capabilities: {
        openrouter: hasOpenRouter(),
        supabase: hasSupabase(),
      },
      tools: [
        "whispercut_analyze",
        "whispercut_cut",
        "whispercut_caption",
        "whispercut_render",
        "whispercut_export_capcut",
        "whispercut_publish",
        "whispercut_feedback",
      ],
    },
  };
}

/** Route handler — works as Vercel serverless function */
export async function handler(req: Request): Promise<Response> {
  // CORS headers
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify(statusCheck()), { headers });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "status";
    const body: ApiRequest = req.method === "POST" ? await req.json() : { action };

    let response: ApiResponse;

    switch (action) {
      case "status":
        response = statusCheck();
        break;

      case "projects":
        if (!hasSupabase()) {
          response = { ok: false, error: "Supabase not configured" };
        } else {
          const projects = await listProjects(body.limit || 20);
          response = { ok: true, data: projects };
        }
        break;

      case "project":
        if (!hasSupabase() || !body.id) {
          response = { ok: false, error: "Supabase not configured or missing project ID" };
        } else {
          const project = await getProject(body.id);
          response = { ok: true, data: project };
        }
        break;

      default:
        response = {
          ok: false,
          error: `Unknown action: ${action}. Use MCP tools for video operations.`,
        };
    }

    return new Response(JSON.stringify(response), { headers });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers }
    );
  }
}

// Vercel edge function export
export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
