/**
 * Hook Scorer — Research-backed hook quality evaluation
 *
 * Based on dopamine prediction error theory (Schultz et al., 1997)
 * and TikTok algorithm research (completion rate signals).
 *
 * Taxonomy lift figures from 10K+ video performance dataset.
 */

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export type HookTaxonomy =
  | "CuriosityGap"       // +67% watch-through
  | "SocialProofShock"   // +54%
  | "VisualContrast"     // +48%
  | "DirectAddress"      // +43%
  | "BoldClaim"          // +41%
  | "StoryOpening"       // +38%
  | "Unknown";

export interface HookScoreResult {
  taxonomy: HookTaxonomy;
  taxonomy_lift_pct: number;      // expected watch-through improvement
  dopamine_trigger: number;       // 0–10
  curiosity_gap_opened: boolean;  // Zeigarnik loop created?
  pattern_interrupt: boolean;     // involuntary attention captured?
  first_3sec_text_present: boolean; // critical for 85% muted viewers
  relevance_clear: boolean;       // does viewer know "this is for me"?
  overall: number;                // 0–10 composite score
  suggestion: string;             // specific improvement
  rewrite?: string;               // suggested hook rewrite if score < 8
}

const TAXONOMY_LIFT: Record<HookTaxonomy, number> = {
  CuriosityGap:     67,
  SocialProofShock: 54,
  VisualContrast:   48,
  DirectAddress:    43,
  BoldClaim:        41,
  StoryOpening:     38,
  Unknown:          0,
};

export async function scoreHook(
  hookText: string,           // first 3 seconds of script
  topic: string,
  platform: "tiktok" | "instagram" | "youtube" | "facebook"
): Promise<HookScoreResult> {

  const prompt = `You are an expert in viral short-form video psychology and neuroscience.

Analyze this video hook (first 3 seconds of script):
HOOK: "${hookText}"
TOPIC: "${topic}"
PLATFORM: ${platform}

Evaluate against research-backed criteria:

1. TAXONOMY — classify into one:
   - CuriosityGap: creates unanswered question (+67% watch-through)
   - SocialProofShock: uses social comparison/FOMO (+54%)
   - VisualContrast: implies before/after in words (+48%)
   - DirectAddress: speaks directly to specific viewer (+43%)
   - BoldClaim: makes counter-intuitive or threat statement (+41%)
   - StoryOpening: begins in-medias-res with tension (+38%)
   - Unknown: doesn't fit any category

2. SCORING (0–10 each):
   - dopamine_trigger: does it create prediction of reward? (10=certain reward expected)
   - curiosity_gap_opened: does it create a Zeigarnik loop? (true/false)
   - pattern_interrupt: would it stop the scroll reflex? (true/false)
   - first_3sec_text_present: could a muted viewer understand the hook? (true/false)
   - relevance_clear: does target viewer immediately know "this is for me"? (true/false)

3. OVERALL: weighted score 0–10
   - hook_clarity × 0.3
   - dopamine_trigger × 0.3  
   - taxonomy_strength × 0.2
   - platform_fit × 0.2

4. SUGGESTION: one specific improvement
5. REWRITE: if overall < 8.0, provide a rewritten hook

Respond in JSON only:
{
  "taxonomy": "...",
  "dopamine_trigger": 0-10,
  "curiosity_gap_opened": true/false,
  "pattern_interrupt": true/false,
  "first_3sec_text_present": true/false,
  "relevance_clear": true/false,
  "overall": 0.0-10.0,
  "suggestion": "...",
  "rewrite": "..." or null
}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  let raw = (response.text ?? "").trim();
  if (raw.startsWith("```")) {
    raw = raw.split("\n").slice(1).join("\n").replace(/```$/, "").trim();
  }

  const parsed = JSON.parse(raw);
  const taxonomy = parsed.taxonomy as HookTaxonomy;

  return {
    taxonomy,
    taxonomy_lift_pct: TAXONOMY_LIFT[taxonomy] ?? 0,
    dopamine_trigger:         parsed.dopamine_trigger,
    curiosity_gap_opened:     parsed.curiosity_gap_opened,
    pattern_interrupt:        parsed.pattern_interrupt,
    first_3sec_text_present:  parsed.first_3sec_text_present,
    relevance_clear:          parsed.relevance_clear,
    overall:                  parsed.overall,
    suggestion:               parsed.suggestion,
    rewrite:                  parsed.rewrite,
  };
}
