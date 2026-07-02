# Dhwani Phase 3: Data Flywheel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export accumulated dictations as a HuggingFace-style dataset (audio files + JSONL manifest) for Phase 4 fine-tuning.

**Architecture:** OpenWhispr already ships the hard parts: per-dictation audio retention (`audioRetentionDays` setting, files in `userData/audio/`), a transcriptions DB with `raw_text` (STT output) + `text` (cleaned/user-edited), and history editing. Phase 3 is one export script that joins DB rows to audio files and emits `manifest.jsonl` + copied audio. It runs under `ELECTRON_RUN_AS_NODE=1 electron` because better-sqlite3 is compiled for Electron's ABI; its pure row/matching logic is exported for plain-Node unit tests (better-sqlite3 is lazy-required inside `main()`).

**Tech Stack:** Node script, better-sqlite3 (existing dep), `node --test`.

## Global Constraints

- Repo: `C:\Users\rushi\dhwani`, branch `main`.
- Both raw and cleaned text go into the manifest — Phase 4 chooses the label column (raw for verbatim STT, cleaned for fused transcribe+cleanup behavior).
- Manifest audio paths are relative to the output dir (HF-friendly, survives moves).
- Only rows with `has_audio = 1 AND status = 'completed'` and an existing audio file export.
- Dataset output dir is gitignored (spec: no personal audio in the repo).
- Test baseline: 137 pass + 1 pre-existing failure. `node scripts/check-brand.js` green.
- User config (no code): Settings → set audio retention high (e.g. 365 days) so the flywheel accumulates.
- All git commits end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Export script with tested pure logic

**Files:**
- Create: `scripts/export-dataset.js`
- Test: `test/scripts/exportDataset.test.js`
- Modify: `package.json` (add `export:dataset` script)
- Modify: `.gitignore` (add `dataset/`)

**Interfaces:**
- Produces: `npm run export:dataset [-- --out <dir>] [-- --userdata <path>]` → `<out>/manifest.jsonl` + `<out>/audio/*.webm`. Pure exports for tests: `findAudioFile(files, id)`, `buildManifestRow(row, audioRelPath)`.

Steps: failing test → verify fail → implement → verify pass → live run against the real dev DB → commit. (Code specified in implementation; matches the interfaces above.)

- [ ] Test written and failing
- [ ] Implementation passes tests
- [ ] Live run exports real dictations (manifest lines == DB rows with audio)
- [ ] `.gitignore` + npm script added
- [ ] Commit + push

**Acceptance (spec Phase 3):** export command produces a HF-style dataset; user sets retention high; all data stays on disk.
