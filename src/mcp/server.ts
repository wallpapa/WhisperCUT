#!/usr/bin/env node
/**
 * WhisperCUT MCP Server
 * 7 tools for AI-native vertical video editing
 * Primary user: Claude Cowork / OpenClaw
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { handleAnalyze, analyzeTool } from "./tools/analyze.js";
import { handleCut, cutTool } from "./tools/cut.js";
import { handleCaption, captionTool } from "./tools/caption.js";
import { handleRender, renderTool } from "./tools/render.js";
import { handleExport, exportTool } from "./tools/export.js";
import { handlePublish, publishTool } from "./tools/publish.js";
import { handleFeedback, feedbackTool } from "./tools/feedback.js";

const server = new Server(
  {
    name: "whispercut",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register all 7 tools
const tools = [analyzeTool, cutTool, captionTool, renderTool, exportTool, publishTool, feedbackTool];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "whispercut_analyze":
        return await handleAnalyze(args);
      case "whispercut_cut":
        return await handleCut(args);
      case "whispercut_caption":
        return await handleCaption(args);
      case "whispercut_render":
        return await handleRender(args);
      case "whispercut_export_capcut":
        return await handleExport(args);
      case "whispercut_publish":
        return await handlePublish(args);
      case "whispercut_feedback":
        return await handleFeedback(args);
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("WhisperCUT MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
