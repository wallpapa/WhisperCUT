/**
 * whispercut_study — Batch analyze a TikTok channel to extract style template
 * Uses Gemini File API to analyze videos one shot per video
 */
import { execSync } from "child_process";
import { readFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { extractFromStudy } from "../../p2p/memory-extractor.js";

export const studyTool = {
  name: "whispercut_study",
  description:
    "Batch analyze a TikTok channel's videos to extract an editing style template. Downloads videos via yt-dlp, analyzes each with Gemini 2.5 Flash (1 API call per video), aggregates patterns into style_template.json.",
  inputSchema: {
    type: "object" as const,
    properties: {
      channel: { type: "string", description: "TikTok channel handle, e.g. @doctorwaleerat" },
      max_videos: { type: "number", description: "Maximum videos to analyze in this batch (default 10)" },
      offset: { type: "number", description: "Start from this video index (default 0, for pagination)" },
    },
    required: ["channel"],
  },
};

export async function handleStudy(args: any) {
  const { channel, max_videos = 10, offset = 0 } = args;
  const DATA_DIR = process.env.WHISPERCUT_DATA_DIR || "/tmp/tiktok-clone";
  const PYTHON_DIR = join(process.cwd(), "python");

  // Ensure python scripts are accessible
  for (const dir of ["analysis", "clones", "capcut_drafts", "videos"]) {
    mkdirSync(join(DATA_DIR, dir), { recursive: true });
  }

  try {
    const cmd = `cd "${DATA_DIR}" && python3 "${PYTHON_DIR}/batch_pipeline.py" ${offset} ${max_videos} 2>&1`;
    const output = execSync(cmd, { timeout: 600_000, encoding: "utf-8" });

    execSync(`cd "${DATA_DIR}" && python3 "${PYTHON_DIR}/aggregate_style.py" 2>&1`, { encoding: "utf-8" });

    const templatePath = join(DATA_DIR, "style_template.json");
    const template = existsSync(templatePath)
      ? JSON.parse(readFileSync(templatePath, "utf-8"))
      : {};

    const analysisCount = readdirSync(join(DATA_DIR, "analysis")).filter((f) =>
      f.endsWith(".json")
    ).length;

    await extractFromStudy({ channel, template, video_count: analysisCount }).catch(() => 0);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: "success",
              channel,
              videos_analyzed: analysisCount,
              batch_output: output.slice(-500),
              style_summary: {
                hook_patterns: template.hook_patterns?.top_hooks,
                cta_patterns: template.cta_patterns?.top_ctas,
                categories: template.content_patterns?.categories,
                avg_duration_sec: template.content_patterns?.avg_duration_sec,
                avg_overlays: template.text_overlay_patterns?.avg_overlays_per_video,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [{ type: "text" as const, text: `Error: ${error.message}` }],
      isError: true,
    };
  }
}
