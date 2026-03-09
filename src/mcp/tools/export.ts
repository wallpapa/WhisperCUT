/**
 * whispercut_export_capcut — Export timeline to CapCut draft
 */
import { exportCapCutDraft } from "../../engine/capcut.js";
import type { Timeline } from "../../engine/timeline.js";

export const exportTool = {
  name: "whispercut_export_capcut",
  description:
    "Export a timeline as a CapCut draft (draft_content.json). The draft can be imported into CapCut desktop for further manual editing.",
  inputSchema: {
    type: "object" as const,
    properties: {
      timeline: {
        type: "object",
        description: "Timeline object from whispercut_cut",
      },
      output_dir: {
        type: "string",
        description: "Output directory for CapCut draft folder",
        default: "./output",
      },
    },
    required: ["timeline"],
  },
};

export async function handleExport(args: any) {
  const { timeline, output_dir = "./output" } = args;
  const tl: Timeline = timeline;

  const { draftPath, instructions } = await exportCapCutDraft(tl, output_dir);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          draft_path: draftPath,
          instructions,
          clip_count: tl.clips.length,
          duration_sec: tl.duration_sec,
        }, null, 2),
      },
    ],
  };
}
