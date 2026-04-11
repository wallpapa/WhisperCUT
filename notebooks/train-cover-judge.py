"""
Kaggle Notebook: Train Cover Judge (Soldier 1)
Gemma 4 31B QLoRA 4-bit — FREE on Kaggle GPU

Fine-tunes Gemma 4 31B to score TikTok covers 0-100
based on 15 research-backed viral cover rules.

Usage: Upload to Kaggle → Enable GPU (T4) → Run All
Training time: ~2-4h
Output: LoRA adapter → upload to HuggingFace

Prerequisites:
  1. Upload cover-judge.jsonl to Kaggle dataset
  2. Or run: npx tsx scripts/generate-synthetic-data.ts --soldier cover-judge
"""

# ── Install ────────────────────────────────────────────────────
# !pip install unsloth "xformers==0.0.28.post2" --no-deps
# !pip install --no-deps trl peft accelerate bitsandbytes

# ── Imports ────────────────────────────────────────────────────
import json
import os
from datasets import Dataset
from unsloth import FastModel
from trl import SFTTrainer
from transformers import TrainingArguments

# ── Config ─────────────────────────────────────────────────────
MODEL_NAME = "unsloth/gemma-4-31B"
DATASET_PATH = "/kaggle/input/whispercut-training/cover-judge.jsonl"  # Upload as Kaggle dataset
OUTPUT_DIR = "/kaggle/working/cover-judge-lora"
HF_REPO = "wallpapa/whispercut-cover-judge"  # Change to your HF username

MAX_SEQ_LENGTH = 2048
LORA_R = 16
LORA_ALPHA = 16
EPOCHS = 3
BATCH_SIZE = 2
GRAD_ACCUM = 4
LR = 2e-4

# ── Load Model ─────────────────────────────────────────────────
print("Loading Gemma 4 31B with 4-bit QLoRA...")
model, tokenizer = FastModel.from_pretrained(
    MODEL_NAME,
    load_in_4bit=True,
    max_seq_length=MAX_SEQ_LENGTH,
)

# ── Add LoRA Adapters ──────────────────────────────────────────
model = FastModel.get_peft_model(
    model,
    r=LORA_R,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                     "gate_proj", "up_proj", "down_proj"],
    lora_alpha=LORA_ALPHA,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",
)

print(f"Trainable parameters: {model.print_trainable_parameters()}")

# ── Load Dataset ───────────────────────────────────────────────
print(f"Loading dataset from {DATASET_PATH}...")

def load_jsonl(path):
    examples = []
    with open(path) as f:
        for line in f:
            if line.strip():
                examples.append(json.loads(line))
    return examples

raw_data = load_jsonl(DATASET_PATH)
print(f"Loaded {len(raw_data)} examples")

# Format for Gemma chat template
def format_example(ex):
    return {
        "text": f"""<start_of_turn>user
{ex['instruction']}

Cover Description:
{ex['input']}<end_of_turn>
<start_of_turn>model
{ex['output']}<end_of_turn>"""
    }

formatted = [format_example(ex) for ex in raw_data]
dataset = Dataset.from_list(formatted)

# Split train/eval
split = dataset.train_test_split(test_size=0.1, seed=42)
train_dataset = split["train"]
eval_dataset = split["test"]

print(f"Train: {len(train_dataset)}, Eval: {len(eval_dataset)}")

# ── Train ──────────────────────────────────────────────────────
print("Starting training...")

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=train_dataset,
    eval_dataset=eval_dataset,
    dataset_text_field="text",
    max_seq_length=MAX_SEQ_LENGTH,
    dataset_num_proc=2,
    args=TrainingArguments(
        per_device_train_batch_size=BATCH_SIZE,
        gradient_accumulation_steps=GRAD_ACCUM,
        num_train_epochs=EPOCHS,
        learning_rate=LR,
        fp16=True,
        logging_steps=10,
        eval_strategy="epoch",
        save_strategy="epoch",
        output_dir=OUTPUT_DIR,
        report_to="none",
        seed=42,
        warmup_ratio=0.1,
        lr_scheduler_type="cosine",
    ),
)

trainer.train()

# ── Evaluate ───────────────────────────────────────────────────
print("\nEvaluating on test set...")
eval_results = trainer.evaluate()
print(f"Eval loss: {eval_results['eval_loss']:.4f}")

# ── Save & Export ──────────────────────────────────────────────
print("\nSaving LoRA adapter...")
model.save_pretrained(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)

# Export GGUF for local inference
print("Exporting GGUF (q4_k_m)...")
model.save_pretrained_gguf(
    f"{OUTPUT_DIR}-gguf",
    tokenizer,
    quantization_method="q4_k_m",
)

# Upload to HuggingFace (optional)
try:
    print(f"\nUploading to HuggingFace: {HF_REPO}")
    model.push_to_hub(HF_REPO, token=os.environ.get("HF_TOKEN"))
    tokenizer.push_to_hub(HF_REPO, token=os.environ.get("HF_TOKEN"))
    print("Upload complete!")
except Exception as e:
    print(f"HF upload skipped: {e}")

print(f"\n=== Cover Judge Training Complete ===")
print(f"LoRA adapter: {OUTPUT_DIR}")
print(f"GGUF model: {OUTPUT_DIR}-gguf")
print(f"Eval loss: {eval_results['eval_loss']:.4f}")
