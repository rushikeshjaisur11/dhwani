# Instant Paste for Local Dictation Cleanup

## Context

Local batch dictation (whisper.cpp / parakeet) blocks the paste on two sequential
steps: ASR transcription, then the cleanup LLM rewrite pass (`processTranscription`
in `src/helpers/audioManager.js`). Users perceive "dictation is slow" even when ASR
itself is fast, because the cleanup round-trip is invisible latency stacked in front
of every paste.

This is sub-project #1 of a larger "make dictation feel instant" effort. Two related
but independent sub-projects — local streaming ASR for Parakeet/Nemotron (upstream
already has groundwork: `e4e5d19d` on `upstream/main`, not yet synced into this fork),
and whisper.cpp's own streaming mode — are explicitly out of scope here and will get
their own specs later.

## Goal

Paste the raw ASR result the instant transcription finishes. Let the cleanup LLM call
keep running in the background. When cleanup finishes and actually changed the text,
replace the already-pasted raw text in place with the cleaned version. Net effect:
same final output as today, but the user sees text land immediately instead of after
transcribe+cleanup combined.

## Scope

- **Applies to**: the `cleanup` reasoning route only (`resolveReasoningRoute` in
  `audioManager.js`), for local whisper and local parakeet dictation.
- **Does not apply to**: the `agent` route (voice-agent dictation) or the
  Auto-Apply-Transform overlay path. Both produce text structurally different from
  the raw transcript (a command result, a reformatted list) — pasting raw then
  replacing would read as a glitch, not a polish, for those paths. They keep today's
  blocking behavior.
- **Rollout**: on by default wherever cleanup is enabled and auto-paste is enabled.
  No new setting. It is strictly faster with no change to final output, so there is
  nothing to opt into.
- Requires auto-paste to be on. If the user has auto-paste disabled (clipboard-only
  mode), there is nothing to paste-then-replace, so this whole path is skipped and
  behavior is unchanged (cleanup still runs before the clipboard is written, as today).

## Data flow

```
ASR finishes → rawText available
   → paste rawText immediately (autoPasteEnabled only)
     + remember { rawText, dictationId, foregroundApp } as "pending replace"
   → cleanup LLM call runs concurrently (unchanged call, unchanged prompt)
   → cleanup result ready
       → if cleaned text differs from rawText AND guardrails pass:
             send backspace × length(rawText as sent to pasteText)
             → paste cleaned text
             → re-apply clipboard-restore behavior if keepTranscriptionInClipboard is off
       → else (cleanup failed, was skipped, or produced identical text):
             leave the raw paste as final — matches today's existing
             "cleanup failed → fall back to raw" behavior
```

`rawText` is already computed before the cleanup call in both
`processWithLocalWhisper` and `processWithLocalParakeet` (see the existing
`{ success: true, text, rawText, source, timings }` return shape) — no new
computation needed, just surfacing it earlier via a new callback that mirrors the
existing `onPartialTranscript` pattern cloud streaming providers already use.

The transcriptions table already has separate `original_text`/`processed_text`
columns, so history/DB storage needs no changes.

## Replace mechanism

Backspace × N, then paste the cleaned text. N = the exact character length of what
was sent to `pasteText` for the raw paste (not any display-formatted version).
Reuses the existing cross-platform key-injection paths already used for paste
(SendInput on Windows, AppleScript on macOS, xdotool/wtype/ydotool on Linux) — no new
native binaries.

**Known limitation, accepted**: if the target app auto-corrects/reformats the raw
text after paste (smart quotes, autocapitalize, link detection), the actual character
count in the app can drift from N, and the backspace could remove more or less than
intended. Mitigated but not eliminated by the guardrails below.

## Guardrails (implementation details, not user-facing settings)

Before attempting the backspace+replace, all of the following must hold:
1. Auto-paste is enabled (otherwise this whole path is skipped from the start).
2. Cleanup actually changed the text (no-op replace is pointless and adds risk for
   zero benefit).
3. The same dictation is still the most recent one — no new recording has started
   since the raw paste (stale-result race guard).
4. The foreground app at replace-time matches the foreground app captured at
   raw-paste-time (best-effort; avoids backspacing into the wrong window if the user
   switched apps in the interim).

If any guardrail fails, skip the replace silently — the raw text simply stays as the
final pasted text, and the cleaned version is still saved to transcription history
(`processed_text`) for reference.

## Error handling

- Raw paste fails (accessibility permission, clipboard error): today's existing
  paste-error toast fires. Cleanup still finishes in the background, but since
  nothing was actually pasted, skip the backspace step entirely and attempt one
  plain paste of the cleaned text instead — same as today's single-paste fallback.
- Replace-paste fails (app closed, focus moved mid-backspace): log a warning, do not
  retry. Raw text remains in the target app.
- No new user-facing error states. No new i18n strings (no new setting).

## Testing

- New pure decision function — "should we attempt the replace?" — taking
  `{ autoPasteEnabled, textChanged, dictationIdMatches, foregroundAppMatches }` and
  returning a boolean. Small and branchy, worth a unit test in the same style as
  `test/helpers/dictationRouting.test.js`.
- Manual verification (cannot be automated): dictate with cleanup enabled, confirm
  raw text appears immediately and is replaced moments later; dictate, then
  immediately type past the raw paste before cleanup finishes, confirm the
  stale-dictation/foreground-app guardrails skip the replace instead of corrupting
  what was typed.
- Existing `npm test` / `npm run typecheck` / `npm run lint` gates apply unchanged.

## Out of scope (future specs)

- Local streaming ASR for Parakeet/Nemotron (sync upstream's `e4e5d19d` sherpa-onnx
  online recognizer, wire it into the existing `STREAMING_PROVIDERS` pattern as a
  new local provider).
- Whisper.cpp streaming mode (sliding-window re-decode; real accuracy tradeoff, no
  upstream groundwork to lean on).
