# AI Agents Army — Design Spec
## WhisperCUT v6.0 — "War Room" Architecture

**Date:** 2026-04-08
**Status:** Approved
**Author:** Claude + User collaboration
**Runtime:** Claude Code subagents (natural language control)

---

## 1. Vision

พูดภาษาธรรมชาติ → Claude เลือก + spawn agents อัตโนมัติตาม context
เหมือนห้องที่ agents เดินเข้าออกตามความสนใจ

**Full pipeline:** วิเคราะห์ TikTok → สร้าง content → ปิดยอดขาย

## 2. Architecture

```
┌─────────────────────────────────────┐
│       ARMY COMMANDER (Claude)       │
│   Natural language → agent routing  │
├──────────┬──────────┬───────────────┤
│ ANALYZE  │ CREATE   │ CONVERT       │
│ War Room │ Factory  │ Sales Engine  │
│          │          │               │
│ Personas │ Script   │ DM Closer     │
│ Experts  │ Hook     │ Lead Tracker  │
│ Algorithm│ QA Gate  │ Revenue       │
│ Legal    │ AI Video │ CTA Compliant │
└──────────┴──────────┴───────────────┘
         ↕ Supabase shared_memories ↕
```

### "Open Room" Model
- Agents เข้าเมื่อ topic เกี่ยวข้อง (auto-trigger)
- Agents ออกเมื่อไม่มีอะไรจะพูด
- ทุก agent เห็น findings ของ agent อื่น = ต่อยอดได้
- Findings สะสมใน Supabase shared_memories
- User สั่งเพิ่ม agent ใหม่ได้ตลอดเวลา

## 3. Division 1: ANALYZE (360° War Room)

### Expert Agents (always available)

| Agent | ID | Auto-Trigger | Purpose |
|-------|-----|-------------|---------|
| Hook Master | `hook_master` | ทุกคลิป | วิเคราะห์ hook, first 3 seconds |
| Mind Reader | `mind_reader` | comments >50 | จิตวิทยาผู้บริโภค |
| Visual Sensei | `visual_sensei` | ทุกคลิป | Production quality, layers |
| Algo Whisperer | `algo_whisperer` | มี metrics | TikTok algorithm analysis |
| Policy Guardian | `policy_guardian` | medical content | TikTok + Thai law compliance |
| Clinic Spy | `clinic_spy` | ดูช่องอื่น | Competitive intelligence |
| Ad Detective | `ad_detective` | likes >10K + save <1% | Detect paid vs organic |
| Conversion Doctor | `conversion_doctor` | มี purchase intent comments | Sales funnel analysis |
| Growth Hacker | `growth_hacker` | channel-level analysis | 22.5K → 100K roadmap |

### Patient Personas (auto-match by relevance)

| Persona | ID | Triggers On | Profile |
|---------|-----|-----------|---------|
| คุณนิด | `persona_nid` | parenting, fear, first-timer | 45, แม่บ้าน, งบ 30-80K |
| คุณมิ้นท์ | `persona_mint` | comparison, office worker | 32, สาวออฟฟิศ, งบ 10-25K |
| คุณแม่จันทร์ | `persona_jan` | age 50+, health concern | 58, ข้าราชการเกษียณ, โคราช |
| คุณเบล | `persona_bel` | wedding, event-driven | 28, เจ้าสาว, งบ 20-40K |
| คุณบอส | `persona_boss` | male beauty, executive | 35, เจ้าของธุรกิจ, งบไม่จำกัด |
| น้องแพร | `persona_prae` | student, budget, career | 22, นศ.ปี 4, งบ 5-8K |
| คุณหน่อย | `persona_noi` | single mom, rebuild | 40, แม่เลี้ยงเดี่ยว, งบ 15-25K |

### Gap-Specific Agents (spawn when gap detected)

| Agent | ID | Trigger | Purpose |
|-------|-----|---------|---------|
| Comment Detective | `comment_detective` | comments loaded | Categorize comment intent |
| Price Detective | `price_detective` | "ราคา" in comments | Pricing strategy |
| Fear Crusher | `fear_crusher` | needle/blood visible | Reduce patient anxiety |
| Series Architect | `series_architect` | viral clip found | Design series continuation |
| Access Optimizer | `access_optimizer` | "อยู่ไหน" in comments | Location/booking access |
| Reply Master | `reply_master` | unanswered comments | Comment reply strategy |
| Brand Storyteller | `brand_storyteller` | origin/transparency content | Brand narrative |
| Unmet Needs Hunter | `unmet_needs` | deep analysis mode | Find hidden needs |
| Sales Psychologist | `sales_psych` | conversion focus | จิตวิทยาการขาย |

### Routing Logic

```typescript
function routeAgents(clip: ClipData): AgentID[] {
  const agents: AgentID[] = ['hook_master', 'visual_sensei']; // always

  // Metrics-based
  if (clip.metrics) agents.push('algo_whisperer');
  if (clip.likes > 10000 && clip.savePercent < 1) agents.push('ad_detective');
  
  // Content-based
  if (clip.hasNeedle || clip.hasTreatment) {
    agents.push('fear_crusher', 'policy_guardian');
  }
  if (clip.topic === 'crossover' || clip.topic === 'educational') {
    agents.push('mind_reader', 'series_architect');
  }
  if (clip.topic === 'career' || clip.topic === 'education') {
    agents.push('persona_prae', 'growth_hacker');
  }
  if (clip.topic === 'relationship' || clip.topic === 'psychology') {
    agents.push('persona_nid', 'mind_reader');
  }
  
  // Comment-based
  if (clip.comments.some(c => c.includes('ราคา'))) {
    agents.push('price_detective', 'conversion_doctor');
  }
  if (clip.comments.some(c => c.includes('อยู่ไหน') || c.includes('สาขา'))) {
    agents.push('access_optimizer');
  }
  if (clip.comments.some(c => c.includes('เจ็บ'))) {
    agents.push('fear_crusher');
  }
  if (clip.comments.length > 50) {
    agents.push('comment_detective', 'mind_reader');
  }
  
  // Persona matching by age/topic
  if (clip.targetAge >= 40) agents.push('persona_nid', 'persona_jan');
  if (clip.targetAge <= 30) agents.push('persona_mint', 'persona_prae');
  if (clip.topic === 'wedding') agents.push('persona_bel');
  if (clip.targetGender === 'male') agents.push('persona_boss');
  
  return agents;
}
```

## 4. Division 2: CREATE (Content Factory)

Uses existing WhisperCUT agents (BaseAgent + Registry):

| Agent | Existing? | Function |
|-------|-----------|----------|
| ScriptAgent | ✅ Yes | topic → script with hook |
| HookAgent | ✅ Yes | score hook, rewrite if <7 |
| QAGateAgent | ✅ Yes | quality check, muted test |
| PlannerAgent | ✅ Yes | trend research → topic ranking |
| AI Factory | 🆕 New | orchestrate: script → avatar → TTS → CapCut → render |

### Content Pipeline
```
PlannerAgent (topic)
  → ScriptAgent (script + keyframe template)
    → HookAgent (score, rewrite if needed)
      → AI Factory:
        - HeyGen/Dreamina → AI avatar
        - MiniMax TTS → voice clone
        - Canva API → insert images
        - CapCut Bridge → compose layers
          → QAGateAgent (pass/fail)
            → Human: approve/edit (30 sec)
              → Post to TikTok
```

## 5. Division 3: CONVERT (Sales Engine)

| Agent | Function | TikTok-Safe? |
|-------|----------|-------------|
| Revenue Architect | Design conversion funnel | N/A (strategy) |
| DM Closer | Write reply scripts per comment type | ✅ All on-platform |
| Lead Tracker | Track comment → DM → LINE → booking | ✅ Internal metrics |
| CTA Compliance | Check every post for TikTok rule violations | ✅ Pre-post check |

### TikTok-Safe Conversion Flow
```
Watch clip → Comment on TikTok → Reply (on TikTok)
  → They DM (on TikTok) → Qualify in DM
    → Natural handoff to LINE → Booking → $$$

RULES:
❌ NEVER pin LINE@ link in comments (BAN risk)
❌ NEVER push traffic off-platform aggressively
✅ Bio link (1 LINE@ link allowed)
✅ Verbal CTA: "DM มาปรึกษาได้ค่ะ"
✅ Text overlay: "กดลิงก์ใน bio"
✅ Keep engagement ON TikTok first
```

### DM Script Templates
```
"ราคาเท่าไหร่" → "ขึ้นอยู่กับเคสค่ะ DM มาบอกปัญหาที่กังวล หมอประเมินให้เลย ฟรี 😊"
"เจ็บไหม" → "ส่วนใหญ่บอกเจ็บน้อยกว่าที่คิดค่ะ DM มาเล่าให้ฟังได้ ❤️"
"อยู่ไหน" → "5 สาขาค่ะ DM มาบอกจังหวัด แนะนำสาขาใกล้สุดเลย 😊"
"อยากทำ" → "ยินดีค่ะ DM มาคุยกันก่อนนะคะ ปรึกษาฟรี ❤️"
```

## 6. Data Layer (Supabase)

All agents share data via existing Supabase tables:

| Table | Purpose |
|-------|---------|
| `shared_memories` | Agent findings, hypotheses, insights |
| `video_performance` | Clip metrics (likes, saves, comments) |
| `content_topics` | Topic ideas with viral scores |
| `rl_preferences` | Learning from user selections |

### New fields needed:
- `shared_memories.agent_source` — which agent produced this
- `shared_memories.debate_thread` — link findings to same debate
- `video_performance.organic_confidence` — 1-10 scale (ad detection)
- `video_performance.agent_analysis` — JSON of agent findings per clip

## 7. Key Constraints

### TikTok Rules:
- ❌ No external links in comments/pins
- ❌ No aggressive off-platform traffic push
- ❌ No graphic medical content (needle close-ups risk shadowban)
- ✅ 1 bio link allowed
- ✅ Verbal/text CTA within video
- ✅ DM conversations on-platform

### Thai Law:
- พ.ร.บ.สถานพยาบาล — medical advertising restrictions
- แพทยสภา — before/after claim limitations
- สคบ. — consumer protection on beauty claims
- Crossover content = legally safest (not medical advertising)

### Algorithm:
- Save% > Likes for organic quality
- Content keeping users ON TikTok = rewarded
- Medical content may be suppressed automatically
- Crossover content avoids medical content graph = wider distribution

## 8. Success Metrics

| Metric | Current | Target (90 days) |
|--------|---------|-------------------|
| Followers | 22.5K | 50K+ |
| Avg Save% (organic) | 5% | 10%+ |
| DMs/week from TikTok | ~5 (est) | 50+ |
| Bookings/week from TikTok | ~1 (est) | 10+ |
| Content/week | 3-4 | 12 (6 crossover + 3 B/A + 3 treatment) |
| Agent hypotheses validated | 38/100 | 200+ |

## 9. Implementation Phases

### Phase 1 (Week 1-2): War Room Skill
- Create `/whisper-army` skill for Claude Code
- Define agent prompt templates (from 34 agents tested today)
- Auto-routing logic based on clip data
- Output: 360° War Room debate per clip

### Phase 2 (Week 3-4): Content Factory Integration
- Connect War Room findings → ScriptAgent
- Auto-generate scripts from top hypotheses
- HookAgent rewrite using proven hook templates
- AI Factory: avatar + TTS + CapCut pipeline

### Phase 3 (Week 5-8): Sales Engine
- DM script library (from DM Closer agent)
- Comment monitoring + suggested replies
- Lead tracking: comment → DM → LINE → booking
- Weekly conversion report

### Phase 4 (Week 9-12): Self-Learning
- RL engine learns from booking data (not just views)
- Auto-adjust content mix based on conversion
- Agent roster evolves: spawn new agents for new gaps
- Target: autonomous content + sales system
