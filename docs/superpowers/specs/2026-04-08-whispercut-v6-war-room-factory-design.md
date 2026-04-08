# WhisperCUT v6.0 — War Room + Content Factory
## Architecture Design Spec

**Date:** 2026-04-08
**Status:** Draft → Pending Review
**Scope:** War Room (analyze) + Content Factory (create). Sales Engine (WhisperChat.co) deferred to separate spec.
**Runtime:** Claude Code subagents via `.claude/skills/` markdown files
**Agent Selection:** Dynamic — Claude auto-detects which agents to spawn per context

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────┐
│          ARMY COMMANDER (Claude)         │
│     Natural language → skill routing     │
├────────────────────┬─────────────────────┤
│     WAR ROOM       │   CONTENT FACTORY   │
│   /whisper-army    │   /whisper-create    │
│                    │                     │
│  .claude/skills/   │  Existing MCP:      │
│  agents/*.md       │  ScriptAgent        │
│  (dynamic select)  │  HookAgent          │
│                    │  QAGateAgent        │
│  Chrome (clips)    │  CapCut Bridge      │
│  → spawn agents    │  Cover Template     │
│  → debate          │  Keyframe Template  │
│  → save findings   │                     │
├────────────────────┴─────────────────────┤
│          Supabase shared_memories        │
├──────────────────────────────────────────┤
│          WhisperChat.co (future)         │
│       DM automation + lead tracking      │
└──────────────────────────────────────────┘
```

## 2. File Structure

```
WhisperCUT/
├── .claude/
│   └── skills/
│       ├── war-room.md                  # /whisper-army — master router
│       ├── content-factory.md           # /whisper-create — production pipeline
│       └── agents/                      # Agent prompt templates
│           ├── hook-master.md
│           ├── mind-reader.md
│           ├── visual-sensei.md
│           ├── algo-whisperer.md
│           ├── policy-guardian.md
│           ├── conversion-doctor.md
│           ├── fear-crusher.md
│           ├── ad-detective.md
│           ├── persona-template.md      # Template for dynamic personas
│           └── debate-moderator.md      # Cross-agent debate facilitator
│
├── src/                                 # Existing code — NO changes needed
│   ├── agents/
│   │   ├── base-agent.ts               # Keep as-is
│   │   ├── registry.ts                 # Keep as-is
│   │   └── creative/
│   │       ├── script-agent.ts          # Used by Content Factory
│   │       └── hook-agent.ts            # Used by Content Factory
│   ├── engine/
│   │   ├── drgwang-template.ts          # Keyframe templates
│   │   ├── cover-template.ts            # Cover generation
│   │   └── capcut-draft-bridge.ts       # CapCut project creation
│   └── mcp/tools/                       # 36 existing tools — keep all
│
├── docs/research/                       # 38-agent findings — read-only reference
│   ├── 100-viral-hypotheses.md
│   ├── 1000-clinic-hypotheses.md
│   ├── 1000-clinic-topics-filtered.md
│   └── clinic-18-agents-compiled-report.md
│
└── output/                              # Production output (gitignored)
```

**Key decisions:**
- Agent prompts are `.claude/skills/agents/*.md` — markdown files, easy to edit, Claude loads automatically
- No new TypeScript code for agent logic — Claude Code's Agent tool handles orchestration
- Existing MCP pipeline (ScriptAgent → HookAgent → QAGate → CapCut) used as-is for content production
- Supabase is the shared memory layer between sessions and agents

## 3. War Room Skill (`/whisper-army`)

### Trigger
User says anything related to analyzing TikTok content: "ดูคลิปนี้", "วิเคราะห์ช่อง X", "ดูคลิปเพิ่ม", or directly invokes `/whisper-army`.

### Flow

```
Step 1: EXTRACT
  Read clip data from context:
  - URL, title, metrics (likes, comments, saves) from Chrome/TikTok
  - Comments (top 10-20 visible)
  - Visual description (from screenshot)
  - Channel stats if on profile page

Step 2: ROUTE
  Claude reads extracted data and selects relevant agents:
  
  ALWAYS spawn:
  - hook_master (every clip has a hook to analyze)
  - visual_sensei (every clip has visual elements)
  
  CONDITIONAL spawn based on data:
  - algo_whisperer      → when metrics available (likes/saves/comments count)
  - ad_detective         → when likes >10K AND save% <1% (suspicious ratio)
  - policy_guardian      → when content shows needles, treatment, medical claims
  - fear_crusher         → when content shows procedures or "เจ็บ" in comments
  - mind_reader          → when comments >50 (enough for psychology analysis)
  - conversion_doctor    → when comments contain "ราคา", "อยากทำ", "อยู่ไหน"
  - series_architect     → when clip has viral metrics (save% >5%)
  - comment_detective    → when comments loaded and numerous
  - price_detective      → when "ราคา"/"เท่าไหร่" in comments
  - access_optimizer     → when "อยู่ไหน"/"สาขา"/"จังหวัด" in comments
  - clinic_spy           → when watching competitor channel (not @waleeratclinic)
  
  PERSONA spawn based on topic:
  - Topic about parenting/fear/first-timer → persona คุณนิด (45, แม่บ้าน)
  - Topic about comparison/office → persona คุณมิ้นท์ (32, สาวออฟฟิศ)
  - Topic about age 50+/health → persona คุณแม่จันทร์ (58, เกษียณ)
  - Topic about wedding/event → persona คุณเบล (28, เจ้าสาว)
  - Topic about male beauty → persona คุณบอส (35, เจ้าของธุรกิจ)
  - Topic about student/budget → persona น้องแพร (22, นศ.)
  - Topic about single mom/rebuild → persona คุณหน่อย (40, แม่เลี้ยงเดี่ยว)
  - Topic doesn't match any → Claude creates persona dynamically from persona-template.md

Step 3: SPAWN
  Launch selected agents as Claude Code subagents (background):
  - Each agent receives: agent skill prompt + clip data + relevant shared_memories
  - Agents run in parallel (3-8 agents typical)
  - Each agent outputs: findings, hypotheses, recommendations

Step 4: DEBATE
  When agents complete, launch debate-moderator agent:
  - Receives ALL agent findings
  - Identifies contradictions between agents
  - Finds consensus points
  - Generates NEW insights from cross-pollination
  - Outputs: "ยืนบนไหล่ยักษ์" group insight

Step 5: SAVE
  Write to Supabase shared_memories:
  - Each agent's findings (memory_type, category, pattern, context)
  - Debate synthesis (tagged with session_id)
  - Video performance data if metrics available

Step 6: PRESENT
  Display 360° War Room format:
  - Which agents entered the room and why
  - Key findings per agent (2-3 lines each)
  - Debate highlights (contradictions resolved)
  - "ยืนบนไหล่ยักษ์" = group insight
  - Actionable next steps
```

### Agent Skill File Format

Each `.claude/skills/agents/*.md` follows this structure:

```markdown
---
name: Hook Master
description: Analyze TikTok hooks — first 3 seconds, scroll-stop techniques
triggers: every clip analysis
---

# Hook Master — Agent Prompt

You are "HOOK MASTER" — expert in TikTok hook psychology.

## YOUR KNOWLEDGE:
[Agent-specific expertise from 38-agent session findings]

## INPUT YOU RECEIVE:
- Clip data: title, metrics, visual description, comments
- Shared memories: relevant past findings from Supabase

## YOUR TASK:
1. Analyze the hook (first 3 seconds)
2. Score it 1-10
3. Identify hook type (question, bold claim, list, drama, identity)
4. Compare to proven formulas from shared_memories
5. Generate 3-5 hypotheses specific to this clip
6. Recommend improvements

## OUTPUT FORMAT:
- Hook Score: X/10
- Hook Type: [type]
- What works: [specific elements]
- What fails: [specific problems]
- Hypotheses: [3-5 testable predictions]
- Recommendation: [specific improvement]

Max 400 words. Be opinionated and specific.
```

### Dynamic Persona Template

`.claude/skills/agents/persona-template.md`:

```markdown
---
name: Dynamic Persona
description: Template for creating patient personas on-the-fly
triggers: when no existing persona matches the clip's target audience
---

# Create a Patient Persona

Based on the clip's content and target audience, create a persona:

1. Name (Thai nickname)
2. Age, occupation, location
3. Budget range for beauty treatments
4. Primary concern/motivation
5. Biggest fear about procedures
6. How they discover clinics (TikTok, Pantip, friends?)
7. Decision-making style (impulsive, research-heavy, needs permission)

Then REACT to the clip AS this persona:
- First reaction (2-3 sentences, Thai casual)
- Would you save/share/comment? Why?
- What information is missing?
- What would make you DM the clinic?
- 3 hypotheses from this persona's perspective
```

## 4. Content Factory Skill (`/whisper-create`)

### Trigger
User says: "สร้างคลิป X", "ทำ script เรื่อง Y", "produce 7 คลิปสัปดาห์นี้", or directly invokes `/whisper-create`.

### Flow

```
Step 1: TOPIC SELECTION
  Source (priority order):
  a) User specifies directly ("ทำคลิปเรื่อง โหงวเฮ้ง")
  b) War Room recommendation ("agents แนะนำหัวข้อนี้")
  c) Supabase content_topics table (993 filtered topics, sorted by viral_score)
  d) Supabase shared_memories unmet needs ("ราคา" = most asked question)

Step 2: SCRIPT GENERATION
  Use existing ScriptAgent (src/agents/creative/script-agent.ts):
  - Input: topic + vibe + platform + duration
  - Enrich with shared_memories (hook formulas, hormone arc, 38-agent insights)
  - Output: script with segments, narration, text overlays
  
  Then HookAgent scores the hook:
  - If hook_score < 7 → auto-rewrite and re-score
  - If hook_score >= 7 → proceed

Step 3: COMPLIANCE CHECK
  Launch policy_guardian agent (background):
  - Check script for 15 banned keywords (แพทยสภา)
  - Check for guaranteed result claims
  - Check for TikTok-suppressed terms (ศัลยกรรม, ฟิลเลอร์, โบท็อกซ์)
  - Suggest safe alternatives
  - Output: pass/fail + edits

Step 4: ASSET GENERATION
  Run in parallel:
  a) Insert images:
     - Generate HTML infographics (from script image descriptions)
     - Save to output/{project}/images/
  b) Cover image:
     - Use cover-template.ts with script.cover data
  c) Narration script:
     - Extract narration text per segment for CapCut TTS

Step 5: COMPOSE
  Two paths:
  a) AUTO: CapCut Draft Bridge (capcut-draft-bridge.ts)
     - Input: images + audio + text overlays + timing
     - Output: CapCut Desktop project (draft_info.json)
  b) MANUAL: CapCut narration script
     - Input: segment-by-segment narration text + timing + visual instructions
     - Output: capcut-narration-script.txt (human assembles in CapCut)

Step 6: QA GATE
  QAGateAgent checks:
  - Muted test: does text tell story without audio?
  - Hook score >= 7
  - Duration 60-90s (sweet spot)
  - No banned keywords (compliance passed)
  - Insert images present per segment
  - CTA at end (verbal, TikTok-safe)

Step 7: HUMAN APPROVAL
  Present complete package:
  - Script summary (hook + 3 points + CTA)
  - Images preview (if possible via local server)
  - Compliance status
  - Predicted Save% (based on template match)
  User: "approve" → proceed | "แก้ X" → edit and re-check

Step 8: POST PREPARATION
  Generate:
  - Caption + hashtags (from script)
  - Cover image specification
  - Optimal posting time (20:30-21:30 ICT, Tue/Thu preferred)
  - Save to Supabase content_calendar
  - Comment to post 1 hour after: "[Part X+1 มาเร็วๆ นี้ 😊]" (if series)
```

### Content Ratio (from 38 agents consensus)

```
Weekly 7 clips, ratio 4:2:1 (Magnet:Bridge:Closer):

Mon — Type A MAGNET: crossover/lifestyle hook (reach, NO CTA)
Tue — Type A MAGNET: "ใบหน้าบอก___" series (saves, NO CTA)
Wed — Type B BRIDGE: reply-to-comment video (funnel, soft CTA "DM ได้เลย")
Thu — Type A MAGNET: psychology/career crossover (saves, NO CTA)
Fri — Type B BRIDGE: pain/recovery FAQ (fear reduce, soft CTA)
Sat — Type C CLOSER: before/after + testimonial (convert, "DM มาปรึกษาฟรี")
Sun — Type A MAGNET: doctor lifestyle/personality (parasocial trust, NO CTA)

Rules:
- Type A (magnet): NO CTA, NO treatment mention → maximize algorithm reach
- Type B (bridge): soft CTA "DM ได้เลย" → qualify leads
- Type C (closer): social proof + "DM มาปรึกษาฟรี" → convert
- Never 2 Type C clips in a row (algorithm reads as promotional)
- Post at 20:30-21:30 ICT (peak for women 30-50+)
- Tuesday + Thursday = highest Thai female engagement
```

## 5. Data Layer

### Existing Supabase Tables (no changes to schema)

| Table | Records | Used By |
|-------|---------|---------|
| `shared_memories` | 112+ | War Room saves findings, Content Factory reads insights |
| `video_performance` | 40+ | War Room saves clip metrics, RL reads for learning |
| `content_topics` | 7 (+ 993 in markdown) | Content Factory reads topic queue |
| `rl_preferences` | 13 | ScriptAgent reads for optimization |
| `content_calendar` | 0 | Content Factory writes post schedule |

### New Columns (2 migrations)

```sql
-- Migration 1: Track agent source per memory
ALTER TABLE shared_memories 
  ADD COLUMN IF NOT EXISTS agent_source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS session_id text;

-- Migration 2: Organic confidence on video data
ALTER TABLE video_performance 
  ADD COLUMN IF NOT EXISTS organic_confidence smallint DEFAULT 5;
```

### Key Query Patterns

```sql
-- War Room: load context for agent prompts
SELECT pattern, context, score 
FROM shared_memories 
WHERE tags && ARRAY[$topic_tags] 
ORDER BY score DESC LIMIT 10;

-- Content Factory: next best topic
SELECT hook, topic, viral_score 
FROM content_topics 
WHERE status = 'ready' 
ORDER BY viral_score DESC LIMIT 5;

-- Learning: what hooks worked
SELECT preferred_value, win_rate 
FROM rl_preferences 
WHERE dimension = 'hook_quality' 
ORDER BY win_rate DESC LIMIT 5;
```

## 6. Key Constraints (from 38 agents)

### TikTok Platform Rules
- No external links in comments (BAN risk)
- No aggressive off-platform push (algorithm punishment)
- No graphic medical content: needles, blood (shadowban)
- Medical content classifier suppresses treatment clips 40-60%
- Save weighted 3x over likes since 2025
- Branded device names in captions reduce reach 30-40%
- Bio link allowed (1 link, use LINE OA direct)
- TikTok native "Book" CTA button available

### Thai Medical Advertising Law
- Every clinic ad post requires สบส. approval (500 THB/page, 50 THB/sec video)
- 15 banned words (แพทยสภา): "ดีที่สุด", "อันดับ 1", "การันตี", "ไม่เจ็บ", "ปลอดภัย 100%"
- Before/after with exaggerated claims = illegal (ม.38 ข้อ 7)
- Price promotion in comments = illegal (ข้อ 17)
- Crossover/educational content = NOT medical advertising = legally safest

### Algorithm Optimization
- Save% = only true organic metric (likes inflate from ads)
- Wave 1→2 needs: completion >55% + save >2% + comment >1% in 90 min
- Content keeping users ON TikTok = rewarded
- 70:30 entertainment:medical ratio = safe distribution tier
- Post 20:30-21:30 ICT, Tue/Thu for Thai women 30-50+

## 7. What Is NOT In This Spec

Deferred to separate specs:
- **Sales Engine** → WhisperChat.co integration (DM automation, lead tracking, booking)
- **RL Self-Learning Loop** → auto-adjust content mix from booking data
- **Multi-channel** → Douyin, IG Reels adaptation
- **AI Avatar pipeline** → HeyGen/Dreamina integration (requires API access)
- **MiniMax TTS** → voice clone (requires Group ID + credits)

## 8. Success Criteria

| Metric | Baseline | Target (30 days) |
|--------|----------|-------------------|
| War Room analysis per clip | manual, 30+ min | automated, 5 min (agents parallel) |
| Agent findings per session | 0 (manual notes) | 10+ saved to Supabase per clip |
| Content scripts per week | 0-1 manual | 7 (1/day from factory) |
| Script-to-post time | hours | 30 min (script+images+narration) |
| Compliance check | none | every script auto-checked |
| Supabase shared_memories | 112 | 200+ (organic growth from usage) |

## 9. Implementation Scope

### Files to Create (11 skill files)

1. `.claude/skills/war-room.md` — master War Room router
2. `.claude/skills/content-factory.md` — content production pipeline
3. `.claude/skills/agents/hook-master.md` — hook analysis agent
4. `.claude/skills/agents/mind-reader.md` — consumer psychology agent
5. `.claude/skills/agents/visual-sensei.md` — visual production agent
6. `.claude/skills/agents/algo-whisperer.md` — TikTok algorithm agent
7. `.claude/skills/agents/policy-guardian.md` — compliance agent
8. `.claude/skills/agents/fear-crusher.md` — fear reduction agent
9. `.claude/skills/agents/ad-detective.md` — organic vs paid detector
10. `.claude/skills/agents/persona-template.md` — dynamic persona creator
11. `.claude/skills/agents/debate-moderator.md` — cross-agent debate

### Database Migrations (2)

1. `shared_memories` — add `agent_source` + `session_id` columns
2. `video_performance` — add `organic_confidence` column

### Files NOT Modified

All existing `src/` code stays untouched. The skill files orchestrate existing MCP tools via Claude Code's Agent tool — no new TypeScript needed for v6.0 War Room + Factory.
