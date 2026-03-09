/**
 * whispercut_publish — Auto-post to TikTok via tiktok-uploader
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";

const exec = promisify(execFile);

export const publishTool = {
  name: "whispercut_publish",
  description:
    "Auto-post a rendered video to TikTok using tiktok-uploader (Playwright-based). Requires TIKTOK_SESSION_ID env var or cookies file.",
  inputSchema: {
    type: "object" as const,
    properties: {
      video_path: {
        type: "string",
        description: "Path to the rendered MP4 video",
      },
      caption: {
        type: "string",
        description: "TikTok caption text",
      },
      hashtags: {
        type: "array",
        items: { type: "string" },
        description: "Hashtags to include",
      },
      schedule: {
        type: "string",
        description: "Optional ISO timestamp to schedule the post",
      },
      cookies_path: {
        type: "string",
        description: "Path to cookies.txt file (alternative to TIKTOK_SESSION_ID)",
      },
    },
    required: ["video_path", "caption"],
  },
};

export async function handlePublish(args: any) {
  const {
    video_path,
    caption,
    hashtags = [],
    schedule,
    cookies_path,
  } = args;

  // Validate video exists
  if (!existsSync(video_path)) {
    return {
      content: [{ type: "text", text: `Error: Video not found: ${video_path}` }],
      isError: true,
    };
  }

  // Build full caption with hashtags
  const fullCaption = [caption, ...hashtags].join(" ");

  // Build tiktok-uploader command
  // Uses: pip install tiktok-uploader
  const cmdArgs = [
    "-m", "tiktok_uploader",
    "-v", video_path,
    "-d", fullCaption,
  ];

  if (cookies_path && existsSync(cookies_path)) {
    cmdArgs.push("-c", cookies_path);
  }

  if (schedule) {
    cmdArgs.push("--schedule", schedule);
  }

  try {
    const { stdout, stderr } = await exec("python3", cmdArgs, {
      timeout: 120_000, // 2 min timeout
      env: {
        ...process.env,
        TIKTOK_SESSION_ID: process.env.TIKTOK_SESSION_ID || "",
      },
    });

    // Try to extract TikTok URL from output
    const urlMatch = stdout.match(/https:\/\/(?:www\.)?tiktok\.com\S+/);
    const tiktokUrl = urlMatch ? urlMatch[0] : "Upload completed (URL not captured)";

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "published",
            tiktok_url: tiktokUrl,
            caption: fullCaption,
            scheduled: schedule || null,
          }, null, 2),
        },
      ],
    };
  } catch (error: any) {
    // Provide helpful setup instructions on failure
    const isNotInstalled = error.message?.includes("No module named");
    const hint = isNotInstalled
      ? "Install tiktok-uploader: pip install tiktok-uploader"
      : "Check TIKTOK_SESSION_ID env var or provide cookies_path";

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "failed",
            error: error.message,
            hint,
            setup_instructions: [
              "1. pip install tiktok-uploader",
              "2. Set TIKTOK_SESSION_ID in .env",
              "   OR provide cookies_path from browser export",
              "3. Ensure Playwright browsers are installed: playwright install",
            ],
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
