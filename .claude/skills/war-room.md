---
name: war-room
description: |
  /whisper-army — 360 War Room for TikTok clip analysis.
  Auto-detects and spawns relevant AI agents, runs parallel analysis,
  cross-agent debate, saves findings to Supabase shared_memories.
---

# War Room — /whisper-army

Master router for TikTok content analysis. Spawns specialized AI agents based on clip data, runs them in parallel, facilitates debate, and saves findings.

## TRIGGER

Activate when user says anything about analyzing TikTok content:
- "analyze this clip", "watch this video"
- Thai: "ดูคลิปนี้", "วิเคราะห์ช่อง X", "ดูคลิปเพิ่ม"
- Or directly invokes `/whisper-army`

## WORKFLOW

### Step 1: EXTRACT

Read clip data from the current context:

```
REQUIRED:
- URL (TikTok/Reels link)
- Title / hook text (first line of caption or first 3 seconds)
- Metrics: views, likes, comments, saves, shares (from TikTok page)

OPTIONAL (when available):
- Top 10-20 visible comments
- Visual description (from screenshot or page observation)
- Channel stats (followers, total videos)
- Duration of clip
- Posted date
```

Compute derived metrics:
- `save_pct` = saves / views * 100
- `share_pct` = shares / views * 100
- `engagement_rate` = (likes + comments + saves + shares) / views * 100

### Step 2: ROUTE — Select Agents

Based on extracted data, select which agents to spawn:

**ALWAYS spawn (every clip):**
| Agent | Skill File | Reason |
|-------|-----------|--------|
| Hook Master | `agents/hook-master.md` | Every clip has a hook to analyze |
| Visual Sensei | `agents/visual-sensei.md` | Every clip has visual elements |
| Retention Analyzer | `agents/retention-analyzer.md` | Every clip needs retention diagnosis |

**CONDITIONAL spawn:**
| Condition | Agent | Skill File |
|-----------|-------|-----------|
| Metrics available (likes/saves/comments) | Algo Whisperer | `agents/algo-whisperer.md` |
| Likes >10K AND save% <1% | Ad Detective | `agents/ad-detective.md` |
| Content shows needles, treatment, medical claims | Policy Guardian | `agents/policy-guardian.md` |
| Content shows procedures or "เจ็บ" in comments | Fear Crusher | `agents/fear-crusher.md` |
| Comments >50 loaded | Mind Reader | `agents/mind-reader.md` |
| Comments contain "ราคา", "อยากทำ", "อยู่ไหน" | Conversion Doctor | `agents/conversion-doctor.md` |
| Clip is EP.N (series) OR save% >5% AND topic has sub-topics | Series Architect | Series analysis inline |
| Share% >35% | LINE Group Proxy flag | Flag as "Social Weapon" distribution |

**PERSONA spawn (based on topic):**
| Topic Match | Persona |
|-------------|---------|
| Parenting / fear / first-timer | คุณนิด (45, แม่บ้าน) |
| Comparison / office worker | คุณมิ้นท์ (32, สาวออฟฟิศ) |
| Age 50+ / health concern | คุณแม่จันทร์ (58, เกษียณ) |
| Wedding / event prep | คุณเบล (28, เจ้าสาว) |
| Male beauty / grooming | คุณบอส (35, เจ้าของธุรกิจ) |
| Student / budget | น้องแพร (22, นศ.) |
| Single mom / rebuild | คุณหน่อย (40, แม่เลี้ยงเดี่ยว) |
| No match | Create via `agents/persona-template.md` |

**Additional routing flags:**
- `visual_risk_flag` — when Visual Sensei detects algo-suppressing visuals (B&W filter, static inserts)
- `ip_risk_severity` — low (name-mention), medium (image-use), high (broadcast-screenshot)
- `content_function` — classify: seeding / scaling / converting / social_weapon
- `line_group_proxy` — when Share% >35%, flag as "likely LINE group distribution"

### Step 3: SPAWN — Launch Agents

Launch selected agents as parallel Claude Code subagents (use `Agent` tool with `run_in_background: true`):

Each agent receives this context package:
```
{clip_data}        — URL, title, metrics, comments, visual description
{shared_memories}  — top 10 relevant memories from Supabase (query by topic tags)
{agent_skill}      — the agent's skill prompt from .claude/skills/agents/
```

Typical run: 3-8 agents in parallel.

### Step 4: DEBATE

After all agents complete, launch the Debate Moderator (`agents/debate-moderator.md`):

Input: ALL agent findings collected together
Task:
1. Identify contradictions between agents
2. Find consensus points (agreed by 3+ agents)
3. Generate NEW cross-pollination insights
4. Output: combined group insight

### Step 5: SAVE TO SUPABASE

Write findings to `shared_memories`:
```sql
INSERT INTO shared_memories (memory_type, category, pattern, context, score, confidence, contributed_by, tags, agent_source, session_id)
VALUES ($type, $category, $pattern, $context, $score, 0.5, 'war-room', $tags, $agent_name, $session_id);
```

Also save video metrics to `video_performance`:
```sql
INSERT INTO video_performance (tiktok_url, channel, topic, hook_text, views, likes, comments, shares, saves, organic_confidence)
VALUES ($url, $channel, $topic, $hook, $views, $likes, $comments, $shares, $saves, $organic_conf);
```

### Step 6: PRESENT — 360 War Room Report

Display results in this format:

```
## 360 War Room Report
**Clip:** [title] | **Channel:** @channel
**Metrics:** views / likes / comments / saves (save% / share%)
**Organic Confidence:** X/10

### Agents in the Room (N agents)
[List which agents entered and WHY they were selected]

### Key Findings
**Hook Master:** [2-3 lines]
**Visual Sensei:** [2-3 lines]
**Retention Analyzer:** [2-3 lines — curve shape, drop points, bridges needed]
[... other agents ...]

### Debate Highlights
- Contradiction: [what agents disagreed on]
- Resolution: [how it was resolved]

### Group Insight
[The combined "standing on shoulders of giants" insight]

### Actionable Next Steps
1. [Specific action]
2. [Specific action]
3. [Specific action]
```

## SPEED SETTINGS

When analyzing multiple clips in sequence:
- Watch SLOWLY and in DETAIL (user preference)
- Sort by ยอดนิยม (most popular) first
- Save% is the only true organic metric (likes inflate from ads)
- Never pin LINE@ links in TikTok (channel BAN risk)
- Use WhisperChat.co for DM automation (NOT ManyChat)

## SUPABASE QUERIES

```sql
-- Load agent context memories
SELECT pattern, context, score 
FROM shared_memories 
WHERE tags && ARRAY[$topic_tags] 
ORDER BY score DESC LIMIT 10;

-- Load retention benchmarks
SELECT * FROM retention_benchmarks WHERE niche = 'educational';

-- Load retention techniques
SELECT * FROM retention_techniques ORDER BY impact_rank ASC;

-- Check if clip already analyzed
SELECT id FROM video_performance WHERE tiktok_url = $url LIMIT 1;
```
