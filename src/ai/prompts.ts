/**
 * AI Prompts — Analysis, hook scoring, CTA improvement, multilingual
 */

export const SYSTEM_PROMPT = `You are WhisperCUT, an AI video editor specialized in vertical short-form content (TikTok, Reels, Shorts). You analyze footage, create roughcuts, and optimize for engagement. Always output structured JSON when asked.`;

/** Analyze transcript + scenes for roughcut decisions */
export function analyzeFootagePrompt(transcript: string, scenes: string, language: string): string {
  return `Analyze this video footage for a ${language} vertical short-form video (TikTok/Reels/Shorts).

TRANSCRIPT:
${transcript}

SCENE CHANGES (timestamps):
${scenes}

Return JSON:
{
  "hook_candidates": [{"text": "...", "start_sec": 0, "end_sec": 3, "score": 8}],
  "key_moments": [{"text": "...", "start_sec": 0, "end_sec": 0, "type": "climax|reveal|emotion|humor"}],
  "suggested_cuts": [{"start_sec": 0, "end_sec": 0, "reason": "..."}],
  "pacing": "fast|medium|slow",
  "recommended_duration": 30,
  "content_type": "tutorial|story|reaction|review|vlog|other",
  "hashtag_suggestions": ["#tag1", "#tag2"]
}`;
}

/** Score video quality for feedback loop */
export function scoreVideoPrompt(transcript: string, duration: number): string {
  return `Score this short-form vertical video on 4 dimensions (1-10 each).

TRANSCRIPT: ${transcript}
DURATION: ${duration}s

Scoring criteria:
- HOOK (first 3 seconds): Does it grab attention instantly? Pattern interrupt? Curiosity gap?
- CTA (call-to-action): Clear, compelling, natural-feeling? Like/follow/share prompt?
- PACING: Right rhythm for TikTok? No dead air? Quick cuts? Builds momentum?
- ENGAGEMENT: Would viewers watch to the end? Share? Save? Comment?

Return JSON:
{
  "hook_score": 0,
  "cta_score": 0,
  "pacing_score": 0,
  "engagement_score": 0,
  "overall": 0,
  "strengths": ["..."],
  "weaknesses": ["..."],
  "improvements": ["specific actionable improvement 1", "..."]
}`;
}

/** Rewrite script to improve weak areas */
export function improveScriptPrompt(
  transcript: string,
  scores: { hook_score: number; cta_score: number; pacing_score: number; engagement_score: number },
  improvements: string[],
  language: string
): string {
  const weakAreas = [];
  if (scores.hook_score < 7) weakAreas.push("hook (first 3 seconds)");
  if (scores.cta_score < 7) weakAreas.push("CTA (call-to-action)");
  if (scores.pacing_score < 7) weakAreas.push("pacing");
  if (scores.engagement_score < 7) weakAreas.push("engagement");

  return `Rewrite this ${language} short-form video script to improve: ${weakAreas.join(", ")}.

ORIGINAL SCRIPT:
${transcript}

SCORES: Hook=${scores.hook_score}, CTA=${scores.cta_score}, Pacing=${scores.pacing_score}, Engagement=${scores.engagement_score}

SUGGESTED IMPROVEMENTS:
${improvements.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}

Rules:
- Keep the same language (${language})
- Maintain the core message
- Make the hook irresistible in first 3 seconds
- Add a natural CTA if missing
- Optimize pacing for TikTok attention spans
- Target 30-60 second duration

Return JSON:
{
  "revised_script": "...",
  "changes_made": ["what changed and why"],
  "estimated_score_improvement": {"hook": 0, "cta": 0, "pacing": 0, "engagement": 0}
}`;
}

/** Generate caption/subtitle text optimized for short-form */
export function captionStylePrompt(transcript: string, style: "word-by-word" | "sentence"): string {
  return `Format this transcript for ${style} animated captions in a vertical short-form video.

TRANSCRIPT: ${transcript}

Rules for ${style === "word-by-word" ? "word-by-word (TikTok style)" : "sentence-by-sentence"}:
${style === "word-by-word"
    ? "- Each word appears individually with emphasis\n- Key words get larger/colored treatment\n- Max 3-4 words visible at once"
    : "- One sentence at a time\n- Keep under 2 lines\n- Break at natural pauses"
  }

Return JSON:
{
  "captions": [{"text": "...", "start_sec": 0, "end_sec": 0, "emphasis": false}],
  "highlight_words": ["key", "words", "to", "emphasize"]
}`;
}

/** Generate TikTok caption + hashtags */
export function tiktokCaptionPrompt(transcript: string, language: string): string {
  return `Write a TikTok caption and hashtags for this ${language} video.

CONTENT: ${transcript}

Rules:
- Caption max 150 chars (TikTok limit is 2200 but short performs better)
- Include 1 hook/question to encourage comments
- 5-8 relevant hashtags (mix popular + niche)
- Language: ${language}

Return JSON:
{
  "caption": "...",
  "hashtags": ["#tag1", "#tag2"],
  "comment_hook": "question to pin as first comment"
}`;
}
