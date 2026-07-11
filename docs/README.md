# Dhwani Docs

Technical documentation for Dhwani, a local-first Electron dictation app forked from
[OpenWhispr](https://github.com/OpenWhispr/openwhispr). For a single-file AI-assistant-oriented reference,
see [`CLAUDE.md`](../CLAUDE.md) at the repo root — it stays more current day-to-day. These docs go deeper on
specific areas.

## Contents

- [architecture.md](architecture.md) — process model, window architecture, module map, storage layers
- [data-flow.md](data-flow.md) — the dictation pipeline end to end: hotkey → audio → transcription →
  cleanup → paste, plus live typing, meeting detection, and semantic search
- [features.md](features.md) — hotkey slots, custom dictionary, snippets/style/transforms/scratchpad,
  paste-last-transcript, semantic search
- [build-and-deploy.md](build-and-deploy.md) — Windows build, native-helper compilation, sidecar binaries,
  CI workflows, release/auto-update
- [ipc-reference.md](ipc-reference.md) — categorized map of the ~380 main↔renderer IPC channels

## Other docs in this repo

- [REBRANDING.md](REBRANDING.md) — the OpenWhispr → Dhwani rename record (user-facing strings, paths, kept
  upstream identifiers)
- [training/](training/) — background/learning notes (ASR fundamentals, etc.) — not API reference

## Scope note

This documents the app as of the 2026-07-11 UI/branding/CI pass (Wispr-parity control panel, expanded
tray menu, Windows-only CI). It does not re-derive facts already covered by `CLAUDE.md`'s "Key
Implementation Details" section — read that first for anything not covered here.
