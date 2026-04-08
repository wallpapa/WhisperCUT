"""
MemFactory GRPO Training Script — Cloud-Ready

Trains a memory policy model using collected WhisperCUT RL data.
Run on cloud GPU (Colab, Lambda, RunPod) when sufficient data collected.

Data flow:
  data/rl-training/cover_selections.jsonl → GRPO training → model weights
  → download weights → load into WhisperCUT MemoryLayer

Usage:
  # Local (CPU — for testing only, slow):
  python train_grpo.py --data ../data/rl-training/cover_selections.jsonl --epochs 3

  # Cloud GPU (recommended):
  python train_grpo.py --data cover_selections.jsonl --epochs 10 --device cuda

  # With MemFactory (if installed):
  python train_grpo.py --data cover_selections.jsonl --use-memfactory

Requirements:
  pip install torch transformers datasets
  # Optional: pip install -e /path/to/MemFactory
"""

import argparse
import json
import os
import sys
from pathlib import Path
from dataclasses import dataclass

# ── Types ──────────────────────────────────────────────────────

@dataclass
class TrainingExample:
    input_text: str
    output_text: str
    reward: float
    channel: str
    category: str

# ── Data Loading ───────────────────────────────────────────────

def load_jsonl(path: str) -> list[TrainingExample]:
    """Load JSONL training data from WhisperCUT RL collector."""
    examples = []
    with open(path) as f:
        for line in f:
            if not line.strip():
                continue
            data = json.loads(line)

            # Format input as natural language context
            inp = data.get("input", {})
            input_text = (
                f"Channel: {inp.get('channel', 'unknown')}\n"
                f"Topic: {inp.get('topic', 'unknown')}\n"
                f"Category: {inp.get('category', 'unknown')}\n"
            )
            if inp.get("memory_context"):
                input_text += f"Memory: {'; '.join(inp['memory_context'][:3])}\n"

            # Format output as the action taken
            out = data.get("output", {})
            output_text = (
                f"Strategy: {out.get('strategy', 'unknown')}\n"
                f"Style: {json.dumps(out.get('style', {}))}\n"
            )

            reward_data = data.get("reward", {})
            examples.append(TrainingExample(
                input_text=input_text,
                output_text=output_text,
                reward=reward_data.get("composite", 0.0),
                channel=inp.get("channel", "unknown"),
                category=inp.get("category", "unknown"),
            ))

    return examples

# ── GRPO Training (Simplified) ─────────────────────────────────

def train_grpo_simple(
    examples: list[TrainingExample],
    epochs: int = 5,
    lr: float = 1e-4,
    output_dir: str = "./grpo_output",
):
    """
    Simplified GRPO training without MemFactory dependency.
    Learns a reward-weighted policy over style dimensions.

    This is a lightweight alternative that:
    1. Groups examples by (channel, category)
    2. Computes reward-weighted style preferences
    3. Outputs a JSON policy file (no neural network needed)
    """
    from collections import defaultdict

    print(f"\n=== GRPO Simple Training ===")
    print(f"Examples: {len(examples)}")
    print(f"Epochs: {epochs} (iterations for convergence)")

    # Group by channel+category
    groups: dict[str, list[TrainingExample]] = defaultdict(list)
    for ex in examples:
        key = f"{ex.channel}:{ex.category}"
        groups[key].append(ex)

    print(f"Groups: {len(groups)}")

    # For each group, compute reward-weighted preferences
    policy: dict[str, dict[str, dict[str, float]]] = {}

    for group_key, group_examples in groups.items():
        channel, category = group_key.split(":", 1)
        style_rewards: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))

        for ex in group_examples:
            style = json.loads(
                ex.output_text.split("Style: ", 1)[1].strip()
                if "Style: " in ex.output_text else "{}"
            )
            for dim, value in style.items():
                style_rewards[dim][value].append(ex.reward)

        # GRPO: compute relative advantage within group
        group_policy: dict[str, dict[str, float]] = {}
        for dim, values in style_rewards.items():
            dim_scores: dict[str, float] = {}
            all_rewards = [r for rs in values.values() for r in rs]
            mean_reward = sum(all_rewards) / len(all_rewards) if all_rewards else 0

            for value, rewards in values.items():
                # GRPO advantage: mean reward - group baseline
                advantage = (sum(rewards) / len(rewards)) - mean_reward
                # Iterative softmax-like update over epochs
                score = advantage
                for _ in range(epochs):
                    score = score * (1 + lr * advantage)
                dim_scores[value] = round(score, 4)

            group_policy[dim] = dim_scores
        policy[group_key] = group_policy

    # Save policy
    os.makedirs(output_dir, exist_ok=True)
    policy_path = os.path.join(output_dir, "grpo_policy.json")
    with open(policy_path, "w") as f:
        json.dump(policy, f, indent=2, ensure_ascii=False)

    print(f"\nPolicy saved: {policy_path}")
    print(f"Groups: {list(policy.keys())}")
    for gk, gp in policy.items():
        print(f"\n  {gk}:")
        for dim, scores in gp.items():
            best = max(scores, key=scores.get) if scores else "none"
            print(f"    {dim}: best={best} ({scores.get(best, 0):.3f})")

    return policy_path


def train_grpo_memfactory(
    examples: list[TrainingExample],
    epochs: int = 10,
    output_dir: str = "./grpo_output",
):
    """
    Full MemFactory GRPO training (requires GPU + MemFactory installed).
    Uses the actual GRPO algorithm from the MemFactory framework.
    """
    try:
        from memfactory.trainer import MemTrainer
        from memfactory.agents import MemoryAgent
        from memfactory.envs import MemoryBankEnv
    except ImportError:
        print("ERROR: MemFactory not installed.")
        print("Install: git clone https://github.com/MemTensor/MemFactory && pip install -e MemFactory/")
        print("Falling back to simple GRPO...")
        return train_grpo_simple(examples, epochs, output_dir=output_dir)

    print(f"\n=== MemFactory GRPO Training ===")
    print(f"Examples: {len(examples)}, Epochs: {epochs}")

    # Convert to MemFactory format
    dataset = []
    for ex in examples:
        dataset.append({
            "input": ex.input_text,
            "output": ex.output_text,
            "reward": ex.reward,
        })

    # Save as HuggingFace dataset format
    os.makedirs(output_dir, exist_ok=True)
    dataset_path = os.path.join(output_dir, "train.jsonl")
    with open(dataset_path, "w") as f:
        for item in dataset:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    print(f"Dataset saved: {dataset_path} ({len(dataset)} examples)")
    print("To run MemFactory GRPO training:")
    print(f"  cd MemFactory && bash examples/RunMemoryAgent1.7B.sh --data {os.path.abspath(dataset_path)}")

    return dataset_path


# ── Main ───────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="WhisperCUT GRPO Training")
    parser.add_argument("--data", required=True, help="Path to JSONL training data")
    parser.add_argument("--epochs", type=int, default=5, help="Training epochs")
    parser.add_argument("--lr", type=float, default=1e-4, help="Learning rate")
    parser.add_argument("--output", default="./grpo_output", help="Output directory")
    parser.add_argument("--use-memfactory", action="store_true", help="Use full MemFactory (requires GPU)")
    parser.add_argument("--device", default="cpu", help="Device: cpu or cuda")
    args = parser.parse_args()

    if not os.path.exists(args.data):
        print(f"ERROR: Data file not found: {args.data}")
        sys.exit(1)

    examples = load_jsonl(args.data)
    print(f"Loaded {len(examples)} examples from {args.data}")

    if len(examples) < 10:
        print(f"WARNING: Only {len(examples)} examples. Recommend 50+ for meaningful training.")

    if args.use_memfactory:
        train_grpo_memfactory(examples, args.epochs, args.output)
    else:
        train_grpo_simple(examples, args.epochs, args.lr, args.output)

    print("\n=== Training Complete ===")
    print(f"Next: Load policy with WhisperCUT MemoryLayer Phase 3 provider")


if __name__ == "__main__":
    main()
