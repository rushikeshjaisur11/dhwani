# Live Typing — Text Appears at the Cursor While You Speak

**Date:** 2026-07-03
**Goal:** With local transcription, dictated text starts appearing in the target
app while the user is still talking, committed at natural pauses so already-typed
text never needs correction.

## Approach (reuse the dictation-preview pipeline)

The realtime local pipeline already exists for the transcription preview
overlay: renderer AudioWorklet streams 16 kHz Int16 PCM to main
(`dictation-preview-audio`), main decodes buffered PCM every 1.5 s with the
warm whisper-server/parakeet and appends the text to the overlay. Live typing
adds a second sink to that same pipeline: type each committed chunk at the
cursor via Win32 `SendInput` unicode events.

Chunks are cut at **silence boundaries** (trailing low-RMS window), never
mid-speech, so independently decoded chunks don't split words. If no pause
occurs, force a cut at 12 s. Typed text is append-only — no backspacing in the
target app, ever. On stop, the remaining buffer is flushed and typed, and the
existing full-quality transcription still runs for history/flywheel, but the
final paste is skipped.

## Changes

1. `resources/windows-fast-paste.c` — new `--type` mode: read UTF-8 from
   stdin, convert to UTF-16, inject via `SendInput` with `KEYEVENTF_UNICODE`
   (LF → VK_RETURN, CR skipped). Windows-only feature.
2. `src/helpers/liveTypingCut.js` — pure `findSilenceCut(int16Samples, opts)`:
   index of the last ≥250 ms window whose RMS < threshold, or null. Unit
   tested (`test/helpers/liveTypingCut.test.js`).
3. `src/helpers/clipboard.js` — `typeText(text)`: spawn
   `windows-fast-paste.exe --type`, write UTF-8 to stdin, serialized on the
   paste queue. No-op (returns false) off-Windows or if binary missing.
4. `src/helpers/ipcHandlers.js` — preview pipeline gains `liveTyping` and
   `overlay` options: silence-aware chunking when live typing (buffer is put
   back if no pause and <12 s), decoded chunk text typed via
   `clipboardManager.typeText` with smart spacing against previously typed
   text; overlay calls gated on `overlay`. `stop` flushes with force-cut.
5. `src/helpers/audioManager.js` — start the preview worklet when
   `showTranscriptionPreview || liveTyping` (local dictation, not voice-agent);
   pass `{ liveTyping, overlay }`; mark the session so the final result carries
   `liveTyped: true`.
6. `src/hooks/useAudioRecording.js` — when `result.liveTyped`, skip the final
   auto-paste (text is already in the app); history/cleanup unchanged.
7. Settings — `liveTypingEnabled` (default off) in settingsStore +
   dictation settings toggle (shown on Windows only) + i18n keys in all 10
   locales.

## Ceilings (deliberate)

- Chunk-wise decoding: each chunk is transcribed without cross-chunk audio
  context; punctuation/casing across chunk boundaries is best-effort. The
  history entry still comes from the full-audio pass.
- Typed text may differ slightly from the (higher-quality) final pass — the
  final pass is not retro-applied to the target app.
- LLM cleanup does not run on typed text (it still runs for history).
- Windows-only injection; macOS/Linux keep paste-at-end.

## Acceptance

- With the toggle on, dictating into Notepad/VS Code/browser shows phrases
  appearing at the cursor at each natural pause (~1.5–3 s behind speech), with
  no mid-word garbling and no duplicate paste at the end.
- Toggle off → behavior identical to before.
- `node --test test/helpers/liveTypingCut.test.js` passes; typecheck, lint,
  i18n check, brand check pass.
