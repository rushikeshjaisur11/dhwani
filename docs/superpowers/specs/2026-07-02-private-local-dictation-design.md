# Private Local Dictation (Wispr Flow replacement) — Design

**Date:** 2026-07-02
**Status:** Approved
**Base:** OpenWhispr fork (local clone, branch `private-local`, upstream commit `38f2688`)

## Goal

A fully private, on-device replacement for Wispr Flow on Windows 11: hold a hotkey,
speak, release — cleaned-up text appears at the cursor in any app. No audio or text
leaves the machine.

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

- Publishing the fork; it stays a private local branch.
- macOS/Linux app-awareness.
- Meeting transcription, notes, chat, workspace features (already in OpenWhispr;
  unused, untouched).
