/**
 * Vercel Serverless Function — /api endpoint
 * Health check + project status for WhisperCUT
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return res.json({
    ok: true,
    name: "WhisperCUT",
    version: "0.1.0",
    description: "AI-native vertical video factory for Claude Cowork",
    format: "9:16 vertical only (1080x1920)",
    mcp_tools: [
      "whispercut_analyze",
      "whispercut_cut",
      "whispercut_caption",
      "whispercut_render",
      "whispercut_export_capcut",
      "whispercut_publish",
      "whispercut_feedback",
    ],
    usage: "Add WhisperCUT as MCP server in Claude Code settings",
    github: "https://github.com/wallpapa/WhisperCUT",
  });
}
