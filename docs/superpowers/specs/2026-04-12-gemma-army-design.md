# Gemma Army — Fine-Tuned Local AI for WhisperCUT

**Date:** 2026-04-12
**Status:** Approved
**Model:** Gemma 4 31B (Google DeepMind) with QLoRA 4-bit on Kaggle (FREE)

---

## Problem

WhisperCUT pays ~$0.20/clip (~7 THB) for API calls (Gemini, Claude, Nano Banana Pro). At 30 clips/month = ~200 THB. While cheap, this creates vendor dependency and requires internet. A fine-tuned local model could reduce API costs by 93% while enabling offline production.

## Solution

Train 3 specialized Gemma 4 31B LoRA adapters on Kaggle (free GPU) using synthetic + real data. Deploy via Kaggle inference notebooks with API fallback. Retrain every 2 weeks with real production data (bootstrap loop).

---

## Architecture: 3 Soldiers

### Soldier 1: Cover Judge (Vision)

**Purpose:** Score TikTok covers 0-100 using 15 research-backed rules

**Model:** `unsloth/gemma-4-31B` + QLoRA 4-bit (vision mode)

**Input:** Cover image (1080x1920 PNG)

**Output:**
```json
{
  "score": 82,
  "face_ratio": 55,
  "eye_contact": true,
  "text_readability": 90,
  "color_contrast": 85,
  "failing_rules": ["R14: grid-safe — face too small at 110x195"],
  "fix_suggestion": "Zoom in 10% to improve grid thumbnail visibility"
}
```

**Training data:** 200 cover images + scores (synthetic from Claude scoring real covers)

**Eval metric:** MAE < 10 on held-out set

**Kaggle time:** ~2-4h on T4/P100

### Soldier 2: Vibe Analyst (Text)

**Purpose:** Score scripts with 6-dim VibeScore (replace Gemini API call)

**Model:** `unsloth/gemma-4-31B` + QLoRA 4-bit (text mode)

**Input:** Thai script text + target vibe name

**Output:**
```json
{
  "cortisol_spike": 88,
  "dopamine_gap": 72,
  "oxytocin_trust": 65,
  "adrenaline_peak": 90,
  "serotonin_close": 58,
  "rhythm_score": 80,
  "vibe_fidelity": 82,
  "predicted_completion": 75,
  "weakest_dimension": "serotonin_close",
  "improvement_suggestion": "CTA needs specific time-bound promise"
}
```

**Training data:** 500 script + VibeScore pairs (synthetic from Gemini scoring)

**Eval metric:** vibe_fidelity correlation > 0.8 with Gemini scores

**Kaggle time:** ~3-5h on T4/P100

### Soldier 3: Script Writer (Text)

**Purpose:** Generate Thai scripts with hormone arc + EN code-switching

**Model:** `unsloth/gemma-4-31B` + QLoRA 4-bit (text mode)

**Input:** Topic + vibe + memory insights

**Output:** Full Thai script with:
- 5 hormone segments (cortisol → dopamine → oxytocin → adrenaline → serotonin)
- English medical terms naturally embedded
- Hook text + CTA + on-screen text per segment
- Predicted completion rate

**Training data:** 100 topic+vibe → script pairs (top-performing + synthetic)

**Eval metric:** VibeScore > 75 on generated scripts (judged by Soldier 2)

**Kaggle time:** ~4-6h on T4/P100

---

## 4-Phase Pipeline

### Phase A: Synthetic Data Generation (one-time, ~$3)

```
Claude/Gemini API → generate training pairs:
  • 500 script + VibeScore pairs (from scoring real + generated scripts)
  • 200 cover + quality score pairs (from scoring with 15 rules)
  • 100 topic + hormone-arc script pairs (top-performing templates)
  • Format: JSONL for Unsloth SFT
  • Store: data/gemma-training/ + HuggingFace dataset
```

### Phase B: Kaggle Training (free)

3 notebooks, each < 6h:

```python
# Common setup for all notebooks
from unsloth import FastModel

model, tokenizer = FastModel.from_pretrained(
    "unsloth/gemma-4-31B",
    load_in_4bit=True,
    max_seq_length=2048,
)

model = FastModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    lora_alpha=16,
    lora_dropout=0,
)

# Train with SFTTrainer
from trl import SFTTrainer
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    max_seq_length=2048,
    dataset_num_proc=2,
    args=TrainingArguments(
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        num_train_epochs=3,
        learning_rate=2e-4,
        fp16=True,
        output_dir="outputs",
    ),
)
trainer.train()

# Export LoRA adapter
model.save_pretrained("soldier-name-lora")
# Upload to HuggingFace
model.push_to_hub("wallpapa/whispercut-soldier-name")
```

### Phase C: Deployment (Kaggle Inference)

Smart router in WhisperCUT:

```
if kaggle_notebook_running:
  → Gemma Army (FREE, ~5s/request)
elif ollama_available:
  → Local Gemma via Ollama (FREE, ~15s/request)
else:
  → API fallback: Gemini/Claude (paid, ~2s/request)
```

### Phase D: Bootstrap Loop (every 2 weeks)

```
Week 1-2: Collect real data
  • Cover selections → Mem0 + rl_collector JSONL
  • VibeScore from production → whispercut_feedback
  • User edits → PRELUDE capture from CapCut
  • TikTok performance → whispercut_sync_tiktok

Week 2 Sunday: Retrain on Kaggle
  • Merge: synthetic + real data
  • Real data weighted 2x (more valuable)
  • Upload new LoRA to HuggingFace
  • Validate: new model > old model on held-out set?
  • If improved → deploy new LoRA
  • If not → keep old LoRA
```

---

## Integration with WhisperCUT

### New Files

```
NEW:
  src/ai/gemma-provider.ts          — Smart router (Gemma → Ollama → API)
  data/gemma-training/               — Training data directory
  notebooks/                          — Kaggle notebook templates
    ├── train-cover-judge.ipynb
    ├── train-vibe-analyst.ipynb
    └── train-script-writer.ipynb
  scripts/generate-synthetic-data.ts  — Generate training data via API

MODIFY:
  src/science/vibe-verifier.ts       — Add Gemma inference option
  src/mcp/tools/cover-design.ts      — Add Gemma cover scoring option
  src/engine/vibe-engine.ts          — Add Gemma script generation option
```

### Smart Router

```typescript
// src/ai/gemma-provider.ts
export async function aiGenerateWithGemma(
  prompt: string,
  options?: { soldier: "cover-judge" | "vibe-analyst" | "script-writer" }
): Promise<string> {
  // 1. Kaggle notebook (free, if running)
  if (process.env.KAGGLE_INFERENCE_URL) {
    return await callKaggleInference(prompt, options?.soldier);
  }

  // 2. Local Ollama (free, slower)
  if (await hasOllama()) {
    const model = options?.soldier
      ? `whispercut-${options.soldier}` // custom LoRA
      : "gemma-4-31b";
    return await callOllama(prompt, model);
  }

  // 3. API fallback (paid)
  return await aiGenerate(prompt);
}
```

---

## Cost Comparison

| | Current (API) | After Gemma Army | Savings |
|---|---|---|---|
| Per clip | ~7 THB ($0.20) | ~0.50 THB ($0.015) | **93%** |
| Per month (30 clips) | ~200 THB | ~15 THB | **93%** |
| Training (one-time) | — | ~100 THB ($3) synthetic data | — |
| Retraining | — | $0 (Kaggle free) | — |
| Cover scoring | $0.05/call | $0 (Gemma) | 100% |
| VibeScore | $0.03/call | $0 (Gemma) | 100% |
| Script gen | $0.05/call | $0 (Gemma) | 100% |

---

## Kaggle Resource Budget

| Resource | Limit/week | Usage | Headroom |
|----------|-----------|-------|----------|
| GPU (T4) | 30h | ~12h (all 3 soldiers) | 18h spare |
| Session | 12h max | ~6h per notebook | OK |
| Storage | 20GB | ~2GB (LoRA adapters) | 18GB spare |
| RAM | 16GB | ~14GB (4-bit 31B) | Tight but OK |

---

## Success Criteria

1. **Cover Judge:** MAE < 10 vs Gemini scores on 50 test covers
2. **Vibe Analyst:** Correlation > 0.8 vs Gemini VibeScore on 100 test scripts
3. **Script Writer:** VibeScore > 75 on 80%+ of generated scripts
4. **Bootstrap:** Retrained model improves by >5% after 2 weeks of real data
5. **Cost:** Total API spend drops from ~200 THB to <20 THB/month

---

## Timeline

| Week | Task |
|------|------|
| Week 1 | Generate synthetic data (~$3) + upload to HuggingFace |
| Week 1 | Train Cover Judge on Kaggle (2-4h) |
| Week 2 | Train Vibe Analyst on Kaggle (3-5h) |
| Week 2 | Train Script Writer on Kaggle (4-6h) |
| Week 3 | Deploy smart router + validate all 3 soldiers |
| Week 4+ | Bootstrap loop: collect real data → retrain every 2 weeks |

---

## References

- [Gemma 4 Fine-tuning Guide (Unsloth)](https://unsloth.ai/docs/models/gemma-4/train)
- [Fine-Tune Gemma 4 31B for Free](https://ai-engineering-trend.medium.com/fine-tune-gemma-4-31b-for-free-unsloth-makes-it-possible-f0fabf6a7e13)
- [gemma-4-31b-it-UD-MLX-4bit (Mac)](https://huggingface.co/unsloth/gemma-4-31b-it-UD-MLX-4bit)
- [QLoRA Paper (NeurIPS 2023)](https://proceedings.neurips.cc/paper_files/paper/2023/file/1feb87871436031bdc0f2beaa62a049b-Paper-Conference.pdf)
