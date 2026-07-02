# Private Local Dictation (Wispr Flow replacement) — Design

**Date:** 2026-07-02
**Status:** Approved
**Base:** OpenWhispr fork (local clone, branch `private-local`, upstream commit `38f2688`)

## Goal

A fully private, on-device replacement for Wispr Flow on Windows 11: hold a hotkey,
speak, release — cleaned-up text appears at the cursor in any app. No audio or text
leaves the machine. The fork is published on the user's GitHub, and the STT model is
personally fine-tuned to beat stock accuracy on the user's own voice and vocabulary.

## Why OpenWhispr as the base

- Accuracy tie: all candidates run the same local Whisper/Parakeet models.
- Best UI of the open-source options (React overlay, onboarding, Prompt Studio,
  settings), 4.2k stars, active development.
- Local LLM cleanup already built in via OpenAI-compatible endpoints (Ollama supported
  explicitly).
- The only missing piece for Wispr Flow parity is app-aware cleanup — a small,
  localized fork delta.

Hardware: RTX 3070 Laptop (8GB VRAM) — runs a local Whisper model plus a small Ollama
model (e.g. `gemma3`) concurrently. Ollama 0.30.11 already installed with models.

## Phase 1 — config only, zero code

1. Install deps and run OpenWhispr from source (`npm install`, `npm start` or packaged
   build).
2. Onboarding: choose a local transcription model (Whisper large-v3-turbo or Parakeet),
   GPU-accelerated.
3. Reasoning model: point to Ollama at `http://localhost:11434` (OpenAI-compatible),
   model `gemma3` (or another small resident model).
4. Prompt Studio: cleanup prompt — remove filler words, fix grammar/punctuation,
   preserve meaning, no additions.
5. Hotkey: hold-to-talk.
6. Privacy check: confirm no cloud provider is configured; offline mode works.

**Acceptance:** dictate into Slack/VS Code/browser; cleaned text appears at cursor
in ~1–2s; works with Wi-Fi disabled.

## Phase 2 — fork delta: app-aware cleanup

**Change:** at dictation-stop in the Electron main process, detect the foreground
application (exe name + window title) on Windows and expose it to the reasoning prompt
as an `{activeApp}` placeholder usable in Prompt Studio templates.

- Detection: `GetForegroundWindow` → process exe name + window title. Prefer an
  existing npm dependency already in the tree; else a minimal native/PowerShell call
  (repo precedent: `resources/windows-fast-paste.c`).
- Prompt integration: substitute `{activeApp}` in the user's Prompt Studio template
  before the reasoning call. Per-app tone rules live in the prompt text itself
  ("Slack → casual, Outlook → formal, VS Code → verbatim/no prose"), so no new
  settings UI.
- Windows-only for now; placeholder resolves to empty string on other platforms.

**Acceptance:** the same sentence dictated in Slack vs Outlook produces casual vs
formal output per the prompt rules.

## Phase 3 — personal data flywheel

Goal: collect supervised pairs (audio, corrected final text) from real usage to
fine-tune on.

- Add an opt-in "retain audio locally" setting: keep the WAV of each dictation
  alongside the transcription history (SQLite already stores text history).
- Corrected text = the final text after LLM cleanup, plus any manual edits the user
  makes in the history view. Export command produces a HuggingFace-style dataset
  (audio path + text manifest).
- Target: 5–10 hours of personal audio (a few weeks of daily dictation) — enough for
  effective LoRA speaker adaptation per published results (12h Common Voice LoRA
  matched full fine-tuning).
- All data stays on disk under the user's control; nothing uploaded.

## Phase 4 — fine-tune the STT model

Honest scope: training a frontier STT model from scratch is out of reach (Whisper
trained on ~680k hours). "Wispr Flow level or better" is achieved as: **lower WER on
the user's own held-out speech than stock large-v3-turbo** — general cloud models
lose to speaker-adapted local models on the speaker's own voice.

- Base model: `openai/whisper-large-v3-turbo` (multilingual, strong accent handling,
  ~6GB VRAM class). Alternative if English-only speed matters: NVIDIA
  Parakeet-TDT-0.6B-v3 via NeMo.
- Method: LoRA via HuggingFace `transformers` + `peft`, following the established
  fast-whisper-finetuning recipe (int8 base + LoRA + gradient checkpointing fits
  8GB-class GPUs; published: whisper-large-v2 LoRA on 12h data trained in 6–8h on
  an 8GB GPU).
- Compute: try the RTX 3070 (8GB) first; fall back to a GCP spot L4/A100 for a few
  dollars if it doesn't fit. Training code lives in the fork under `training/`.
- Data mix: personal dataset from Phase 3 + a slice of Common Voice as regularizer
  to prevent overfitting to one speaker.
- Evaluation: WER on a held-out personal test set, fine-tuned vs stock
  large-v3-turbo. Ship only if WER improves.
- Deployment: merge LoRA into base weights → convert to whisper.cpp GGML/GGUF
  (upstream `convert-h5-to-ggml.py`) → drop into OpenWhispr as a custom local model.

**Acceptance:** fine-tuned model beats stock large-v3-turbo WER on the personal
held-out set and runs in the app via whisper.cpp.

## Publishing

- Push the fork to the user's GitHub (`rushikesh*/openwhispr`, branch
  `private-local` or renamed default). MIT license permits this; keep upstream
  attribution.
- The published repo contains code only — no personal audio, dataset, or fine-tuned
  weights (gitignored). Weights may be published separately later if desired.

## Error handling

- Ollama unreachable → paste the raw transcript (verify OpenWhispr's existing
  fallback; add if missing).
- Foreground-app detection failure → `{activeApp}` resolves to empty string; cleanup
  proceeds app-agnostic.

## Testing

- One unit test for the foreground-app detection helper (mirrors existing test style
  in `test/`).
- Manual end-to-end smoke: dictation in Slack, VS Code, browser; offline test;
  Ollama-down fallback test.

## Non-goals

- Training an STT model from scratch (compute/data infeasible for an individual).
- Publishing personal audio data or fine-tuned weights alongside the code.
- macOS/Linux app-awareness.
- Meeting transcription, notes, chat, workspace features (already in OpenWhispr;
  unused, untouched).
