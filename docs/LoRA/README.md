# LoRA Fine-Tuning for Whisper in Dhwani

## Overview

**LoRA (Low-Rank Adaptation)** is a parameter-efficient fine-tuning technique that allows you to adapt large pre-trained models (like OpenAI's Whisper) to specific use cases — without retraining the entire model from scratch.

In Dhwani's context, LoRA enables the app to **learn from each user's voice, accent, vocabulary, and speaking style** over time, dramatically improving Speech-to-Text (STT) accuracy for that specific individual.

---

## What is LoRA?

### The Problem with Full Fine-Tuning

A standard Whisper model has between **39 million** (Tiny) and **1.55 billion** (Large-v3) parameters. Fine-tuning all of these parameters requires:
- Massive GPU memory (16GB+ VRAM)
- Hours of training time
- Risk of catastrophic forgetting (the model "forgets" how to transcribe general speech)

### How LoRA Solves This

Instead of modifying all the parameters, LoRA **freezes** the entire pre-trained model and injects tiny, trainable "adapter" matrices into specific layers.

```
┌─────────────────────────────────────────────┐
│              Whisper Model                   │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │    Self-Attention Layer (Frozen)    │    │
│  │                                     │    │
│  │   W_q ─────────────────── Output    │    │
│  │    │                        ▲       │    │
│  │    │    ┌──────────────┐    │       │    │
│  │    └───►│  LoRA A (r×d) │───►│       │    │
│  │         │  LoRA B (d×r) │    │       │    │
│  │         └──────────────┘    │       │    │
│  │         (Trainable: ~1MB)          │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Total trainable params: ~0.5-2% of model  │
└─────────────────────────────────────────────┘
```

**Key insight:** LoRA decomposes the weight update matrix `ΔW` into two low-rank matrices:

$$\Delta W = B \times A$$

Where:
- `A` has shape `(r, d)` — the "down-projection"
- `B` has shape `(d, r)` — the "up-projection"
- `r` is the **rank** (typically 4–32), much smaller than `d` (model dimension)

This means instead of training millions of parameters, you only train **thousands** — making it feasible to run on consumer hardware.

---

## Why LoRA for Dhwani?

### The User Adaptation Problem

Every user has unique characteristics that generic Whisper models struggle with:

| Challenge | Example |
|---|---|
| **Accent** | Indian English, Southern American, Scottish |
| **Vocabulary** | Domain jargon: "Kubernetes", "gRPC", "TanStack Query" |
| **Speaking Style** | Fast talkers, people who mumble, people who pause a lot |
| **Microphone** | Laptop mic vs. studio condenser vs. AirPods |
| **Environment** | Quiet office vs. cafe vs. mechanical keyboard |

### What LoRA Training Achieves

After collecting enough user data (typically 30+ minutes of corrected audio), a LoRA fine-tune can:

- **Reduce Word Error Rate (WER) by 15–30%** for domain-specific vocabulary
- **Adapt to the user's specific accent** without hurting general accuracy
- **Learn microphone characteristics** to reduce noise-related errors
- **Produce a tiny adapter file** (1–5 MB) instead of a full model copy (hundreds of MB)

---

## Architecture in Dhwani

```
┌─────────────────────────────────────────────────────────────────┐
│                        Dhwani Application                       │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐  │
│  │  Recording    │───►│  Whisper STT      │───►│  LLM Polish  │  │
│  │  Manager      │    │  (Base + LoRA)    │    │  Engine       │  │
│  └──────────────┘    └──────────────────┘    └──────────────┘  │
│         │                     ▲                      │          │
│         │                     │                      │          │
│         ▼                     │                      ▼          │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐  │
│  │  Audio File   │    │  LoRA Adapter     │    │  Corrected   │  │
│  │  Storage      │    │  Weights (.safet) │    │  Text Output │  │
│  └──────┬───────┘    └──────────────────┘    └──────┬───────┘  │
│         │                     ▲                      │          │
│         │                     │                      │          │
│         ▼                     │                      ▼          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Training Data Collector                 │   │
│  │                                                         │   │
│  │  Captures:  audio_path + raw_stt + user_corrected_text  │   │
│  │  Storage:   SQLite (correction_pairs table)             │   │
│  │  Trigger:   User edits pasted transcription             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              LoRA Training Pipeline (Offline)            │   │
│  │                                                         │   │
│  │  1. Export correction pairs from SQLite                 │   │
│  │  2. Prepare audio-text dataset                          │   │
│  │  3. Run LoRA fine-tuning on Whisper encoder/decoder     │   │
│  │  4. Merge adapter into GGML format for whisper.cpp      │   │
│  │  5. Hot-swap the model in the running application       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## LoRA Hyperparameters Explained

| Parameter | Recommended Value | Description |
|---|---|---|
| `r` (rank) | `8` – `16` | Rank of the low-rank matrices. Higher = more capacity, more memory. Start with 8. |
| `lora_alpha` | `16` – `32` | Scaling factor. Typically set to `2 * r`. Controls how strongly the adapter influences outputs. |
| `lora_dropout` | `0.05` – `0.1` | Dropout applied to LoRA layers. Prevents overfitting on small datasets. |
| `target_modules` | `["q_proj", "v_proj"]` | Which attention matrices to inject LoRA into. Q and V projections give the best bang for the buck. |
| `learning_rate` | `1e-4` – `5e-4` | Learning rate for the adapter weights. Higher than full fine-tuning since we're training fewer params. |
| `epochs` | `3` – `10` | Number of passes over the training data. More epochs for smaller datasets. |
| `batch_size` | `4` – `8` | Depends on available GPU memory. Use gradient accumulation if memory is tight. |

---

## File Structure

```
docs/LoRA/
├── README.md                          ← You are here
├── data_collection.md                 ← How Dhwani collects training data
├── training_guide.md                  ← Step-by-step training walkthrough
├── integration.md                     ← How to integrate the trained model back
└── scripts/
    ├── requirements.txt               ← Python dependencies
    ├── collect_training_data.py       ← Export correction pairs from SQLite
    ├── prepare_dataset.py             ← Prepare HuggingFace-compatible dataset
    ├── train_whisper_lora.py          ← Full LoRA training script
    ├── merge_lora.py                  ← Merge LoRA weights into base model
    └── evaluate.py                    ← Evaluate WER before/after fine-tuning
```

---

## Quick Start

```bash
# 1. Install dependencies
cd docs/LoRA/scripts
pip install -r requirements.txt

# 2. Export your correction data from Dhwani's database
python collect_training_data.py --db-path ~/.config/dhwani/transcriptions.db --output ./training_data

# 3. Prepare the dataset
python prepare_dataset.py --input ./training_data --output ./dataset

# 4. Run LoRA fine-tuning
python train_whisper_lora.py \
  --model openai/whisper-base \
  --dataset ./dataset \
  --output ./lora_adapter \
  --epochs 5 \
  --rank 8

# 5. Merge LoRA weights into a standalone model
python merge_lora.py \
  --base-model openai/whisper-base \
  --lora-path ./lora_adapter \
  --output ./whisper-base-personalized

# 6. (Optional) Evaluate the improvement
python evaluate.py \
  --base-model openai/whisper-base \
  --finetuned-model ./whisper-base-personalized \
  --test-data ./dataset/test
```

---

## Hardware Requirements

| Whisper Model | Parameters | Min VRAM (LoRA) | Training Time (1hr audio) |
|---|---|---|---|
| Tiny | 39M | 2 GB | ~10 min |
| Base | 74M | 4 GB | ~20 min |
| Small | 244M | 6 GB | ~45 min |
| Medium | 769M | 10 GB | ~90 min |
| Large-v3 | 1.55B | 16 GB | ~3 hrs |

> **Note:** CPU-only training is possible but significantly slower (3–5x). For users without a GPU, we recommend training only the Tiny or Base models.

---

## Next Steps

1. **[Data Collection](./data_collection.md)** — How Dhwani captures correction pairs from user interactions
2. **[Training Guide](./training_guide.md)** — Detailed walkthrough of the training pipeline
3. **[Integration Guide](./integration.md)** — How to load the fine-tuned model back into Dhwani
