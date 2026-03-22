/**
 * whispercut_clone — Generate a TikTok clone script from studied style template
 * whispercut_capcut — Export clone script as CapCut draft
 */
import { execSync } from "child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

// ── Clone ──────────────────────────────────────────────────────────────────

export const cloneTool = {
  name: "whispercut_clone",
  description:
    "Generate a TikTok clone script from a style template (created by whispercut_study). Uses Gemini to produce a detailed script matching the analyzed creator's style: hook, body sections, CTAs, text overlays, hashtags.",
  inputSchema: {
    type: "object" as const,
    properties: {
      topic: { type: "string", description: "Topic for the clone video, in Thai" },
      duration_sec: { type: "number", description: "Target duration in seconds (default 90)" },
    },
    required: ["topic"],
  },
};

export async function handleClone(args: any) {
  const { topic, duration_sec = 90 } = args;
  const DATA_DIR = process.env.WHISPERCUT_DATA_DIR || "/tmp/tiktok-clone";
  const PYTHON_DIR = join(process.cwd(), "python");

  try {
    const safeTopic = topic.replace(/"/g, '\\"');
    const cmd = `cd "${DATA_DIR}" && python3 "${PYTHON_DIR}/clone_generator.py" "${safeTopic}" ${duration_sec} 2>&1`;
    const output = execSync(cmd, { timeout: 120_000, encoding: "utf-8" });

    const clonesDir = join(DATA_DIR, "clones");
    const scripts = readdirSync(clonesDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({ name: f, mtime: statSync(join(clonesDir, f)).mtime.getTime() }))
      .sort((a, b) => b.mtime - a.mtime);

    let script: any = {};
    if (scripts.length > 0) {
      script = JSON.parse(readFileSync(join(clonesDir, scripts[0].name), "utf-8"));
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: "success",
              topic,
              script_file: scripts[0]?.name,
              title: script.title,
              hook: script.hook,
              body_sections: script.body?.length,
              cta: script.cta,
              text_overlays_count: script.all_text_overlays?.length,
              hashtags: script.hashtags,
              full_script: script.full_script,
              pipeline_output: output.slice(-300),
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

// ── CapCut Export ──────────────────────────────────────────────────────────

export const capcutCloneTool = {
  name: "whispercut_capcut_clone",
  description:
    "Export a clone script (from whispercut_clone) as a CapCut/JianYing draft project (draft_content.json). Copy the output folder to CapCut's Drafts directory for professional editing.",
  inputSchema: {
    type: "object" as const,
    properties: {
      script_name: {
        type: "string",
        description: "Name of the clone script file without .json (uses latest if omitted)",
      },
    },
  },
};

export async function handleCapcutClone(args: any) {
  const { script_name } = args;
  const DATA_DIR = process.env.WHISPERCUT_DATA_DIR || "/tmp/tiktok-clone";
  const PYTHON_DIR = join(process.cwd(), "python");

  try {
    const scriptArg = script_name
      ? `"${join(DATA_DIR, "clones", `${script_name}.json`)}"`
      : "";
    const cmd = `cd "${DATA_DIR}" && python3 "${PYTHON_DIR}/capcut_export.py" ${scriptArg} 2>&1`;
    const output = execSync(cmd, { timeout: 30_000, encoding: "utf-8" });

    const draftsDir = join(DATA_DIR, "capcut_drafts");
    const drafts = existsSync(draftsDir)
      ? readdirSync(draftsDir).filter((d) =>
          existsSync(join(draftsDir, d, "draft_content.json"))
        )
      : [];

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: "success",
              draft_folder: drafts.length > 0 ? join(draftsDir, drafts[drafts.length - 1]) : "",
              output: output.slice(-400),
              instructions:
                "Copy the draft folder to: ~/Movies/CapCut/User Data/Projects/com.lveditor.draft/",
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
