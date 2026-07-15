# LoRA Training Guide for Whisper

## Prerequisites

- **Python 3.10+**
- **CUDA-capable GPU** (recommended, 4GB+ VRAM) or CPU (slower, 3–5x)
- **FFmpeg** installed and available in PATH
- At least **50+ correction pairs** collected by Dhwani

```bash
# Install Python dependencies
cd docs/LoRA/scripts
pip install -r requirements.txt
```

---

## Step-by-Step Training Pipeline

### Step 1: Export Correction Data from Dhwani

The `collect_training_data.py` script reads your local Dhwani SQLite database and exports all correction pairs into a structured directory.

```bash
python collect_training_data.py \
    --db-path "C:/Users/<you>/AppData/Roaming/dhwani/transcriptions.db" \
    --audio-dir "C:/Users/<you>/AppData/Roaming/dhwani/training_audio" \
    --output ./training_data \
    --min-pairs 50
```

**What this produces:**

```
training_data/
├── manifest.json          # Metadata about the export
├── pairs/
│   ├── 0001.json          # { "audio": "...", "raw": "...", "corrected": "..." }
│   ├── 0002.json
│   └── ...
└── stats.json             # Summary statistics
```

### Step 2: Prepare the HuggingFace Dataset

The `prepare_dataset.py` script converts the raw export into a format compatible with HuggingFace's `datasets` library, including audio preprocessing.

```bash
python prepare_dataset.py \
    --input ./training_data \
    --output ./dataset \
    --whisper-model openai/whisper-base \
    --max-duration 30.0 \
    --test-split 0.1
```

**What this does:**
1. Loads each audio file and resamples to 16kHz mono (Whisper's expected format)
2. Computes Whisper log-mel spectrograms
3. Tokenizes the corrected text using Whisper's tokenizer
4. Splits into train/test sets (default 90/10)
5. Saves as a HuggingFace `DatasetDict`

### Step 3: Run LoRA Fine-Tuning

```bash
python train_whisper_lora.py \
    --model openai/whisper-base \
    --dataset ./dataset \
    --output ./lora_adapter \
    --epochs 5 \
    --rank 8 \
    --alpha 16 \
    --learning-rate 3e-4 \
    --batch-size 4 \
    --gradient-accumulation 2 \
    --warmup-steps 50
```

**Key flags explained:**

| Flag | Description |
|---|---|
| `--model` | HuggingFace model ID (e.g., `openai/whisper-base`, `openai/whisper-small`) |
| `--rank` | LoRA rank. Start with 8. Increase to 16 if you have lots of data. |
| `--alpha` | LoRA scaling factor. Usually `2 * rank`. |
| `--epochs` | Number of training passes. 3–5 for small datasets, 5–10 for larger ones. |
| `--learning-rate` | Start with `3e-4`. Lower to `1e-4` if loss oscillates. |
| `--gradient-accumulation` | Simulates larger batch sizes on small GPUs. |

**Expected output:**

```
[Epoch 1/5] Loss: 2.341 | WER: 18.2%
[Epoch 2/5] Loss: 1.892 | WER: 14.7%
[Epoch 3/5] Loss: 1.456 | WER: 11.3%
[Epoch 4/5] Loss: 1.201 | WER:  9.8%
[Epoch 5/5] Loss: 1.089 | WER:  8.5%

✓ Training complete! Adapter saved to ./lora_adapter/
  Baseline WER: 18.2% → Fine-tuned WER: 8.5% (53% improvement)
```

### Step 4: Evaluate the Fine-Tuned Model

Before deploying, always evaluate on the held-out test set:

```bash
python evaluate.py \
    --base-model openai/whisper-base \
    --lora-path ./lora_adapter \
    --test-data ./dataset/test \
    --output ./evaluation_report.json
```

**Sample output:**

```
╔══════════════════════════════════════════════════════════╗
║                  Evaluation Results                      ║
╠══════════════════════════════════════════════════════════╣
║  Base Model WER:        18.2%                            ║
║  Fine-Tuned WER:         8.5%                            ║
║  Improvement:           53.3%                            ║
║                                                          ║
║  Most Improved Words:                                    ║
║    "cure nettles" → "Kubernetes"     (100% fixed)        ║
║    "g r p c" → "gRPC"               (100% fixed)        ║
║    "tan stack" → "TanStack"          ( 85% fixed)        ║
║                                                          ║
║  Regression Check:       PASSED (no new errors)          ║
╚══════════════════════════════════════════════════════════╝
```

### Step 5: Merge LoRA Adapter into Base Model

For deployment, merge the LoRA weights back into the base Whisper model:

```bash
python merge_lora.py \
    --base-model openai/whisper-base \
    --lora-path ./lora_adapter \
    --output ./whisper-base-personalized \
    --export-ggml
```

**What this produces:**

```
whisper-base-personalized/
├── model.safetensors         # Merged HuggingFace model
├── config.json               # Model config
├── tokenizer.json            # Tokenizer
├── ggml-model.bin            # GGML format for whisper.cpp (if --export-ggml)
└── training_metadata.json    # Training run info
```

The `ggml-model.bin` file can be directly loaded by Dhwani's `whisper.cpp` backend.

---

## Training on CPU (No GPU)

If you don't have a CUDA GPU, training is still possible but slower:

```bash
python train_whisper_lora.py \
    --model openai/whisper-tiny \
    --dataset ./dataset \
    --output ./lora_adapter \
    --epochs 3 \
    --rank 4 \
    --batch-size 2 \
    --device cpu
```

**Tips for CPU training:**
- Use `whisper-tiny` or `whisper-base` (larger models are impractical on CPU)
- Lower the rank to `4` to reduce computation
- Use a smaller batch size (`2`)
- Expect 3–5x longer training times

---

## Incremental Training (Continuous Learning)

As the user collects more correction pairs over time, you don't need to retrain from scratch. You can resume from an existing LoRA adapter:

```bash
python train_whisper_lora.py \
    --model openai/whisper-base \
    --dataset ./dataset_v2 \
    --output ./lora_adapter_v2 \
    --resume-from ./lora_adapter \
    --epochs 3
```

This loads the previously trained LoRA weights and continues learning on the new data — preserving everything learned so far.

---

## Automated Training (Scheduled)

For a fully hands-off experience, Dhwani could schedule training runs automatically:

```
Trigger Conditions:
  1. At least 50 NEW correction pairs since last training run
  2. Computer is idle for 10+ minutes
  3. Computer is plugged into AC power (battery-aware)

Pipeline:
  1. Export new pairs → prepare_dataset.py
  2. Resume from last adapter → train_whisper_lora.py --resume-from
  3. Evaluate → evaluate.py
  4. If WER improved → merge and hot-swap the model
  5. If WER regressed → discard and alert the user
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|---|---|
| `CUDA out of memory` | Lower `--batch-size` to 1, increase `--gradient-accumulation` |
| `Loss not decreasing` | Lower `--learning-rate` to `1e-4` or `5e-5` |
| `Loss oscillating wildly` | Increase `--warmup-steps` to 100 or reduce `--learning-rate` |
| `WER got worse after training` | Your dataset may be too noisy. Filter out pairs with very high edit distance. |
| `Model hallucinates after training` | Reduce `--epochs` (overfitting). Add `--lora-dropout 0.1`. |

### Recommended Checkpoints

The training script automatically saves checkpoints every N steps. If training crashes, you can resume:

```bash
python train_whisper_lora.py \
    --resume-from ./lora_adapter/checkpoint-500 \
    ...
```

---

## Next Steps

- **[Integration Guide](./integration.md)** — How to load the fine-tuned model back into Dhwani
