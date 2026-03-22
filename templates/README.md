# WhisperCUT Community Templates

Style templates encode the full psychological + visual recipe for a content archetype.
AI agents load these to produce platform-native videos without human creative direction.

## Available Templates

| File | Vibe | Optimal Duration | Completion | Share Rate |
|------|------|-----------------|------------|------------|
| `doctorwaleerat.json` | educational_warm | 75s | 71% | 6.4% |
| `shocking_thai.json`  | shocking_reveal  | 63s | 74% | 8.3% |

## How to Use

### Via MCP tool
```
whispercut_vibe_edit(
  topic = "พัฒนาการลูก 3 ขวบ",
  vibe  = "educational_warm",
  platform = "tiktok"
)
```
The vibe engine auto-loads the matching template.

### Via environment variable
```bash
export WHISPERCUT_TEMPLATE="doctorwaleerat"
```

### Template schema
```json
{
  "_meta": { "channel", "description", "version" },
  "vibe": "educational_warm | shocking_reveal | story_driven | quick_tips | myth_bust",
  "voice": { "provider", "voice_id", "speed", "pitch", "style" },
  "hook": { "taxonomy", "duration_sec", "patterns[]", "font_size", "badge" },
  "hormone_arc": [{ "label", "hormone", "pct": [start%, end%], "cut_rate" }],
  "story_pattern": "ProblemAgitateSolve | MythBustTruth | BeforeDuringAfter ...",
  "cta": { "primary", "primary_templates[]", "secondary", "placement_pct" },
  "visual": { "face_time_pct", "caption_density", "bg_style", "font" },
  "pacing": { "optimal_duration_sec", "hook_cut_rate", "body_cut_rate" },
  "platform_adaptations": { "tiktok", "instagram", "youtube" }
}
```

## Contributing a Template

1. Study a channel with 50+ videos using `whispercut_study`
2. Analyze top 10 videos for hormone arc patterns
3. Fill in the template schema above
4. Submit PR to `wallpapa/WhisperCUT`
