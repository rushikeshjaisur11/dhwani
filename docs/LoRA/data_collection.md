# Data Collection for LoRA Training

## Overview

The most critical part of LoRA fine-tuning is having **high-quality training data**. For Dhwani, training data comes directly from the user's natural workflow — every time they correct a transcription mistake, they are implicitly generating a training pair.

This document explains:
1. What data we need to collect
2. How to capture it from user interactions
3. The database schema for storing correction pairs
4. The Electron-side implementation

---

## What Data Do We Need?

Each training sample requires three components:

| Component | Description | Example |
|---|---|---|
| **Audio File** | The raw `.wav` or `.webm` file from the recording session | `~/.config/dhwani/audio/rec_1720990200.wav` |
| **Raw STT Output** | The exact text that Whisper produced (before any LLM polish) | `"we need to migrate to cure nettles by end of sprint"` |
| **User-Corrected Text** | The text after the user manually edited it | `"we need to migrate to Kubernetes by end of sprint"` |

### Why All Three?

- **Audio + Corrected Text** = The actual training pair (input → target)
- **Raw STT Output** = Lets us compute WER (Word Error Rate) and identify which specific words Whisper consistently gets wrong
- **Diff (Raw vs Corrected)** = Builds the real-time correction map (immediate STT improvement without training)

---

## Data Collection Strategy

### Passive Collection (Zero User Effort)

The user should never have to manually "record training data." Instead, Dhwani silently captures correction pairs during normal usage:

```
┌──────────────────────────────────────────────────────────┐
│                   User's Normal Workflow                   │
│                                                          │
│  1. User holds hotkey → Records audio                    │
│  2. Whisper transcribes → Raw STT text saved             │
│  3. LLM polishes → Polished text pasted into app         │
│  4. User manually edits a word → Correction detected!    │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Correction Pair Saved to SQLite:                  │  │
│  │                                                    │  │
│  │  audio_path:    /audio/rec_1720990200.wav          │  │
│  │  raw_stt_text:  "migrate to cure nettles"          │  │
│  │  corrected:     "migrate to Kubernetes"            │  │
│  │  timestamp:     2026-07-14T23:41:00Z               │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### When to Capture

Corrections can be detected in two places:

1. **Transcription Preview Dialog**: If the user edits text in Dhwani's preview modal before pasting, we capture the diff between the raw STT and the edited version.

2. **External App Monitoring** (Advanced): After pasting text into an external app, Dhwani could monitor the clipboard for a few seconds. If the user immediately `Ctrl+Z` → retypes a word, that's a correction signal. (This is optional and privacy-sensitive.)

---

## Database Schema

### New Table: `correction_pairs`

```sql
CREATE TABLE IF NOT EXISTS correction_pairs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Link to the original transcription
    transcription_id INTEGER,

    -- Path to the audio file on disk
    audio_path TEXT NOT NULL,

    -- The exact output from the STT engine (before LLM polish)
    raw_stt_text TEXT NOT NULL,

    -- The text after the user manually corrected it
    corrected_text TEXT NOT NULL,

    -- The specific words that were changed (JSON array)
    -- Example: [{"original": "cure nettles", "corrected": "Kubernetes", "position": 6}]
    word_diffs TEXT,

    -- Metadata
    whisper_model TEXT,              -- e.g., "whisper-base", "whisper-medium"
    audio_duration_ms INTEGER,       -- Duration of the audio clip
    language TEXT DEFAULT 'en',      -- Detected or configured language
    confidence_score REAL,           -- Average confidence from Whisper (if available)

    -- Training status
    used_in_training INTEGER DEFAULT 0,   -- 0 = not yet used, 1 = included in a training run
    training_run_id TEXT,                  -- UUID of the training run that consumed this pair

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (transcription_id) REFERENCES transcriptions(id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_correction_pairs_unused
    ON correction_pairs(used_in_training) WHERE used_in_training = 0;
```

### New Table: `training_runs`

```sql
CREATE TABLE IF NOT EXISTS training_runs (
    id TEXT PRIMARY KEY,                -- UUID
    whisper_model TEXT NOT NULL,         -- Base model used (e.g., "openai/whisper-base")
    lora_rank INTEGER DEFAULT 8,
    num_samples INTEGER,                -- How many correction pairs were used
    total_audio_minutes REAL,           -- Total audio duration in the training set
    epochs INTEGER,
    final_wer REAL,                     -- Word Error Rate after training
    baseline_wer REAL,                  -- Word Error Rate before training
    adapter_path TEXT,                   -- Path to the saved LoRA adapter
    status TEXT DEFAULT 'pending',       -- pending | running | completed | failed
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Electron-Side Implementation

### 1. Saving Audio Files for Training

Currently, Dhwani may discard audio after transcription. For training, we need to **retain the audio**:

```javascript
// In ipcHandlers.js — when a dictation completes

ipcMain.handle("save-training-audio", async (event, sessionId, audioBuffer) => {
    const audioDir = path.join(app.getPath("userData"), "training_audio");
    if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
    }

    const fileName = `training_${sessionId}_${Date.now()}.wav`;
    const filePath = path.join(audioDir, fileName);

    fs.writeFileSync(filePath, Buffer.from(audioBuffer));

    debugLogger.info(`[Training] Saved audio: ${filePath}`);
    return filePath;
});
```

### 2. Capturing Correction Pairs

```javascript
// In ipcHandlers.js — when the user submits a correction

ipcMain.handle("save-correction-pair", async (event, data) => {
    const {
        transcriptionId,
        audioPath,
        rawSttText,
        correctedText,
        whisperModel,
        audioDurationMs,
        language,
    } = data;

    // Compute word-level diffs
    const wordDiffs = computeWordDiffs(rawSttText, correctedText);

    // Only save if there are actual differences
    if (wordDiffs.length === 0) {
        debugLogger.info("[Training] No corrections detected, skipping.");
        return { saved: false, reason: "no_diff" };
    }

    const stmt = this.db.prepare(`
        INSERT INTO correction_pairs
            (transcription_id, audio_path, raw_stt_text, corrected_text,
             word_diffs, whisper_model, audio_duration_ms, language)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        transcriptionId,
        audioPath,
        rawSttText,
        correctedText,
        JSON.stringify(wordDiffs),
        whisperModel || "unknown",
        audioDurationMs || 0,
        language || "en"
    );

    debugLogger.info(
        `[Training] Saved correction pair: ${wordDiffs.length} word(s) changed`
    );

    return { saved: true, corrections: wordDiffs.length };
});
```

### 3. Computing Word-Level Diffs

```javascript
/**
 * Computes word-level differences between raw STT output and user-corrected text.
 * Returns an array of {original, corrected, position} objects.
 */
function computeWordDiffs(rawText, correctedText) {
    const rawWords = rawText.trim().split(/\s+/);
    const correctedWords = correctedText.trim().split(/\s+/);
    const diffs = [];

    // Use Levenshtein-based word alignment for robust diffing
    const aligned = alignWords(rawWords, correctedWords);

    for (const pair of aligned) {
        if (pair.raw !== pair.corrected) {
            diffs.push({
                original: pair.raw,
                corrected: pair.corrected,
                position: pair.position,
            });
        }
    }

    return diffs;
}

/**
 * Simple word alignment using dynamic programming (edit distance).
 * For production, consider using a proper sequence alignment library.
 */
function alignWords(source, target) {
    const m = source.length;
    const n = target.length;

    // Build DP table
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (source[i - 1].toLowerCase() === target[j - 1].toLowerCase()) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(
                    dp[i - 1][j],     // deletion
                    dp[i][j - 1],     // insertion
                    dp[i - 1][j - 1]  // substitution
                );
            }
        }
    }

    // Backtrace to find alignment
    const aligned = [];
    let i = m, j = n;

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 &&
            (source[i - 1].toLowerCase() === target[j - 1].toLowerCase() ||
             dp[i][j] === dp[i - 1][j - 1] + 1)) {
            aligned.unshift({
                raw: source[i - 1],
                corrected: target[j - 1],
                position: i - 1,
            });
            i--;
            j--;
        } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
            aligned.unshift({
                raw: "",
                corrected: target[j - 1],
                position: i,
            });
            j--;
        } else {
            aligned.unshift({
                raw: source[i - 1],
                corrected: "",
                position: i - 1,
            });
            i--;
        }
    }

    return aligned;
}
```

### 4. Frontend Integration (React)

In the transcription preview component, detect when the user edits text:

```tsx
// In TranscriptionPreview.tsx or similar component

const [rawSttText] = useState(initialRawText);  // Store the original STT output
const [editedText, setEditedText] = useState(initialRawText);

const handleSaveCorrection = async () => {
    if (rawSttText !== editedText) {
        await window.electronAPI.saveCorrectionPair({
            transcriptionId: currentTranscription.id,
            audioPath: currentTranscription.audioPath,
            rawSttText: rawSttText,
            correctedText: editedText,
            whisperModel: currentTranscription.model,
            audioDurationMs: currentTranscription.audioDurationMs,
            language: currentTranscription.language || "en",
        });
    }
};

// Call handleSaveCorrection when:
// 1. User clicks "Paste" after editing in the preview modal
// 2. User closes the preview modal after making changes
```

---

## Data Quality Guidelines

### Minimum Data Requirements

| Quality Level | Audio Duration | Correction Pairs | Expected WER Improvement |
|---|---|---|---|
| **Minimal** | 15 minutes | 50+ pairs | 5–10% |
| **Good** | 30 minutes | 150+ pairs | 10–20% |
| **Excellent** | 60+ minutes | 300+ pairs | 20–30% |

### What Makes Good Training Data

✅ **Include:**
- Domain-specific vocabulary corrections (jargon, product names)
- Accent-related corrections (where Whisper misheard your pronunciation)
- Punctuation and casing corrections
- Audio from your typical recording environment (same mic, same room)

❌ **Exclude:**
- Corrections where you completely rewrote the sentence (not an STT error)
- Audio files that are corrupted or extremely noisy
- Corrections made by the LLM polish step (we only want raw STT → human corrections)

### Automatic Quality Filters

The `collect_training_data.py` script automatically filters out:
- Pairs where the edit distance is too large (likely a rewrite, not a correction)
- Audio files shorter than 1 second (likely noise)
- Audio files longer than 30 seconds (too long for a single training sample — will be chunked)
- Duplicate correction pairs

---

## Privacy & Data Handling

All training data is:
- **Stored 100% locally** on the user's machine (never uploaded to any server)
- **User-controlled** — they can view, delete, or export their correction data at any time
- **Opt-in** — Data collection for training should be enabled via a toggle in Settings
- **Encrypted at rest** (if the OS-level encryption is enabled)

### Settings Toggle (Proposed)

```
Settings → Transcription → Voice Adaptation
  ☐ Enable voice adaptation data collection
    "Dhwani will save your audio corrections locally to improve
     transcription accuracy over time. Data never leaves your device."
```

---

## Next Steps

Once you have collected sufficient training data, proceed to:
- **[Training Guide](./training_guide.md)** — Run the LoRA fine-tuning pipeline
