# Integration Guide: Loading Fine-Tuned Whisper into Dhwani

## Overview

After LoRA training produces a personalized Whisper model, this guide explains how to integrate it back into Dhwani so users benefit from improved STT accuracy immediately.

---

## Integration Strategies

There are two ways to load the fine-tuned model:

### Strategy 1: GGML Export (For whisper.cpp — Recommended)

Dhwani uses `whisper.cpp` as its local STT backend. The fine-tuned model needs to be converted to GGML format.

```bash
# The merge_lora.py script handles this automatically
python merge_lora.py \
    --base-model openai/whisper-base \
    --lora-path ./lora_adapter \
    --output ./whisper-base-personalized \
    --export-ggml
```

This produces a `ggml-model.bin` file that is a drop-in replacement for the standard Whisper GGML weights.

#### Deploying the GGML Model

```javascript
// In whisper.js — modify the model resolution logic

function getWhisperModelPath(modelSize) {
    const personalizedModelDir = path.join(
        app.getPath("userData"),
        "personalized_models"
    );

    // Check if a personalized model exists for this size
    const personalizedPath = path.join(
        personalizedModelDir,
        `ggml-${modelSize}-personalized.bin`
    );

    if (fs.existsSync(personalizedPath)) {
        debugLogger.info(
            `[Whisper] Using personalized model: ${personalizedPath}`
        );
        return personalizedPath;
    }

    // Fall back to the standard model
    return getDefaultModelPath(modelSize);
}
```

### Strategy 2: HuggingFace Transformers (For cloud/hybrid setups)

If using HuggingFace's `transformers` pipeline instead of `whisper.cpp`:

```python
from transformers import WhisperForConditionalGeneration, WhisperProcessor
from peft import PeftModel

# Load base model
base_model = WhisperForConditionalGeneration.from_pretrained("openai/whisper-base")
processor = WhisperProcessor.from_pretrained("openai/whisper-base")

# Load LoRA adapter on top
model = PeftModel.from_pretrained(base_model, "./lora_adapter")

# Use normally — the adapter is applied transparently
input_features = processor(audio, sampling_rate=16000, return_tensors="pt").input_features
predicted_ids = model.generate(input_features)
transcription = processor.batch_decode(predicted_ids, skip_special_tokens=True)
```

---

## Hot-Swapping Models at Runtime

Dhwani should be able to swap between the base and personalized models without restarting:

```javascript
// In ipcHandlers.js

ipcMain.handle("swap-whisper-model", async (event, modelType) => {
    // modelType: "base" | "personalized"

    const modelPath =
        modelType === "personalized"
            ? getPersonalizedModelPath()
            : getDefaultModelPath();

    if (!fs.existsSync(modelPath)) {
        return {
            success: false,
            error: `Model not found: ${modelPath}`,
        };
    }

    // Terminate current whisper.cpp process
    await this.whisperManager.shutdown();

    // Restart with the new model
    await this.whisperManager.initialize({ modelPath });

    debugLogger.info(`[Whisper] Swapped to ${modelType} model`);
    return { success: true, modelPath };
});
```

---

## Settings UI Integration

Add a section to the Settings page for managing personalized models:

```
Settings → Transcription → Voice Adaptation

┌─────────────────────────────────────────────────────┐
│  Voice Adaptation                                   │
│                                                     │
│  ☑ Enable voice adaptation data collection          │
│    "Save your corrections to improve accuracy."     │
│                                                     │
│  Training Data: 127 correction pairs (42 min audio) │
│  [View Data]  [Export Data]  [Clear Data]            │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  Personalized Model                                 │
│  Status: ✅ Trained (2026-07-14)                    │
│  Improvement: 18.2% → 8.5% WER (53% better)        │
│                                                     │
│  ○ Use personalized model (recommended)             │
│  ○ Use standard model                               │
│                                                     │
│  [Retrain Now]  [Export Model]  [Delete Model]      │
└─────────────────────────────────────────────────────┘
```

---

## Model File Management

### Storage Locations

```
<userData>/
├── training_audio/                   # Raw audio recordings
│   ├── training_rec_17209902.wav
│   └── ...
├── personalized_models/              # Trained model weights
│   ├── ggml-base-personalized.bin    # GGML format for whisper.cpp
│   ├── training_metadata.json        # Training run info
│   └── lora_adapter/                 # Raw LoRA weights (for incremental training)
│       ├── adapter_model.safetensors
│       └── adapter_config.json
└── transcriptions.db                 # SQLite (includes correction_pairs table)
```

### Disk Space Considerations

| Component | Typical Size |
|---|---|
| Training audio (1 hour) | ~50–100 MB |
| LoRA adapter weights | ~1–5 MB |
| Merged GGML model (base) | ~142 MB |
| Merged GGML model (small) | ~466 MB |

The LoRA adapter itself is tiny (1–5 MB). The merged model is the same size as the base model since LoRA weights are folded in.

---

## GGML Conversion Details

Converting from HuggingFace format to GGML requires the `whisper.cpp` conversion script:

```bash
# Option 1: Using whisper.cpp's built-in converter
python whisper.cpp/models/convert-h5-to-ggml.py \
    ./whisper-base-personalized \
    ./whisper.cpp/models \
    ./ggml-base-personalized.bin

# Option 2: Using our merge_lora.py (handles everything automatically)
python merge_lora.py \
    --base-model openai/whisper-base \
    --lora-path ./lora_adapter \
    --output ./whisper-base-personalized \
    --export-ggml \
    --whisper-cpp-path ../../resources/bin/whisper
```

The `merge_lora.py` script automates this by:
1. Loading the base model + LoRA adapter
2. Merging the weights
3. Saving as a standard HuggingFace model
4. Running the GGML conversion script
5. Copying the output to Dhwani's `personalized_models` directory

---

## Rollback & Safety

### Automatic Rollback

If the personalized model performs worse than the base model (detected via the evaluation step), Dhwani automatically:
1. Discards the new adapter
2. Keeps using the previous best model (or the base model)
3. Notifies the user: *"Your recent corrections didn't improve accuracy. More data needed."*

### Manual Rollback

Users can always switch back:
```
Settings → Transcription → Voice Adaptation → Use standard model
```

This instantly swaps back to the unmodified Whisper model with zero data loss.
