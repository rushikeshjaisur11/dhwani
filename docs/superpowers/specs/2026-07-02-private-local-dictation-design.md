# Local Dictation Product with Own STT Model Family — Design

**Date:** 2026-07-02
**Status:** Approved (rev 3 — product pivot)
**Base:** OpenWhispr fork (local clone, branch `private-local`, upstream commit `38f2688`)

## Goal

A commercial-ready, fully on-device dictation product (Wispr Flow competitor): hold a
hotkey, speak, release — cleaned-up text appears at the cursor in any app. No audio or
text leaves the machine. The product ships with **its own branded multilingual STT
model family** (small/medium/large tiers), fine-tuned by the user on
commercially-licensed public datasets plus personal flywheel data, with full
documentation of the training and evaluation process so the user understands and owns
the entire pipeline.

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

**Status: ACCEPTED 2026-07-03** — offline dictation verified (turbo model on GPU),
Ollama cleanup via llama3.2:3b with OLLAMA_KEEP_ALIVE=1h, Ollama-down fallback
pastes raw transcript. Deep rebrand to Dhwani shipped alongside
(docs/REBRANDING.md, scripts/check-brand.js guard).

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

**Status: ACCEPTED 2026-07-03** — implemented as `{{activeApp}}` (double-brace,
matching the codebase's `{{agentName}}` convention). Foreground app captured at
recording-stop via PowerShell/user32 one-shot, concurrent with transcription.
Verified: same dictation produced casual output in chat vs near-verbatim in
VS Code.

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

## Phase 4 — the model family (train, evaluate, ship)

Honest scope: training a frontier STT model from scratch is out of reach (Whisper
trained on ~680k hours; millions of GPU-hours). The product's model family is built
by **fine-tuning strong multilingual open bases** on commercially-licensed data, then
branding and shipping the results — the same pattern as distil-whisper and most
commercial "own model" offerings.

### Model tiers

| Tier | Base model | Params | Target use |
|------|-----------|--------|------------|
| small | `whisper-small` (or Parakeet-TDT-0.6B-v3, CC-BY-4.0) | 244M–0.6B | low-end laptops, fastest |
| medium | `whisper-large-v3-turbo` | 809M | default tier, best speed/accuracy balance |
| large | `whisper-large-v3` | 1.5B | max accuracy, GPU machines |

All Whisper bases are MIT/Apache — commercial use permitted. Each tier gets the same
fine-tuning treatment and a product-branded name.

### Training data (commercial-safe multilingual stack)

| Dataset | Hours | License |
|---------|-------|---------|
| Mozilla Common Voice | ~20.8k validated, 100+ langs | CC0 |
| Multilingual LibriSpeech | ~50k, 8 langs | public domain / CC-BY-4.0 |
| VoxPopuli (transcribed) | 1.8k, 15 langs | CC0 (data) |
| NVIDIA Granary | 166k pseudo-labeled | check per-subset before use |
| YODAS (CC subsets) | 500k+, 100 langs | CC — filter to commercial-safe subsets |
| Personal flywheel (Phase 3) | grows over time | owned |

License verification of each subset is a required step before training, recorded in
the data documentation.

### Method & compute

- LoRA fine-tuning via HuggingFace `transformers` + `peft` (int8 base + gradient
  checkpointing). Small tier trains on the RTX 3070 (8GB); medium/large tiers on GCP
  spot GPUs (L4/A100) — hours-to-days per tier at a curated data scale (hundreds to
  low thousands of hours, sampled across languages), not the full corpus.
- Training code in the fork under `training/`; configs per tier; runs reproducible
  from a single command.

### Evaluation (how models are compared)

Follow the Open ASR Leaderboard methodology (arXiv 2510.06961) so numbers are
comparable to published models:

- **WER** with the standard Whisper text normalizer, per language.
- **Test sets:** FLEURS (multilingual), MLS test, Common Voice test, LibriSpeech
  test-clean/other (English), plus the personal held-out set.
- **RTFx** (speed) measured on the 3070 and on CPU, per tier.
- Every tier is compared against its stock base and against Whisper large-v3 as the
  reference ceiling. A tier ships only if it beats its stock base on the target
  languages without regressing others beyond a stated tolerance.

### Deployment

Merge LoRA into base weights → convert to whisper.cpp GGML/GGUF (upstream
`convert-h5-to-ggml.py`) → ship as selectable models in the app's model picker.

**Acceptance:** each shipped tier beats its stock base's WER on target languages on
the public test sets above, runs in the app via whisper.cpp, and has its eval numbers
published in the docs.

## Phase 5 — training & evaluation documentation

Full educational documentation in the repo under `docs/training/` — written so the
user (and future contributors) understand the entire pipeline, not just run it:

1. `01-asr-fundamentals.md` — how Whisper-class models work (encoder-decoder,
   log-mel features, tokenization, why fine-tuning works), with worked examples.
2. `02-datasets.md` — each dataset above: contents, license verification record,
   download/preparation steps, sampling strategy across languages.
3. `03-training-guide.md` — LoRA theory (what the low-rank adapters do, rank/alpha
   trade-offs), hyperparameters, VRAM math, step-by-step runbook for each tier,
   troubleshooting (overfitting, catastrophic forgetting, regularization mix).
4. `04-evaluation-guide.md` — WER/CER definitions with hand-computed examples, text
   normalization pitfalls, RTFx, how to run the eval harness, how to read results,
   comparison tables template.
5. `05-model-family.md` — the product model card: tiers, training data statement,
   eval results, limitations.

Every doc includes concrete worked examples (numbers, commands, code).

## Publishing

- Product name: **Dhwani** (Sanskrit: sound/resonance). Public repo:
  `rushikeshjaisur11/dhwani`, default branch `main`, upstream remote kept for future
  merges. MIT license permits this; upstream attribution kept in README and LICENSE.
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
