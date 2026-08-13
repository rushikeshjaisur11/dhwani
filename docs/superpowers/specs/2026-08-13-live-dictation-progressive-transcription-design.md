# Live-Dictation Progressive Transcription (all providers)

## Context

Live dictation today is fully batch, for every provider: `MediaRecorder`
collects audio chunks in an array for the whole recording, and only on
hotkey release is a single Blob assembled and sent for transcription
(`whisperServer.js` for local, a single `/audio/transcriptions` POST for
cloud/custom REST providers). The entire transcription round trip — local
model decode, or network upload + provider processing — starts only after
the user stops talking. This is the reported "even cloud is slow" latency:
nothing overlaps with the time already spent recording.

Wispr Flow avoids this by opening a WebSocket at recording start and
streaming 16kHz PCM continuously, so by the time the hotkey is released,
most of the audio is already transcribed and only a short tail remains
(researched live: WebSocket + PCM16 streaming, interim + final results,
end-to-end pipeline under 700ms p99 *after* release).

Dhwani already has this exact mechanism half-built and completely dead:
`audioManager.js`'s streaming block (~line 2660: `AudioWorkletNode` +
`pcm-streaming-processor`, WebSocket connect, interim/final text handling,
pre-connect warmup) only activates when `sttConfig.dictation?.mode ===
"streaming"` (`audioManager.js:2510`), and `sttConfig` is populated
exclusively by `get-stt-config` (`ipcHandlers.js:6431`), which requires an
OpenWhispr Cloud auth header that no sign-in UI currently provides
(confirmed in `CLAUDE.md`: "There is currently no sign-in UI to reach it").
Every real dictation path — local whisper/parakeet, BYOK cloud, and custom
OpenAI-compatible endpoints (e.g. a user's own gateway on `localhost:20128`)
— falls through to the batch path regardless of what the provider itself is
capable of.

Separately, a related-but-distinct prior spec
(`2026-07-18-segment-parallel-transcription-design.md`) already chunks
*uploaded files* for local whisper using two parallel `WhisperServerManager`
processes, and `chunkedCloudTranscribe` (`ipcHandlers.js:194`) already
chunks *uploaded files* for cloud providers using a concurrency pool
(`ipcHandlers.js:252-266`, index-ordered reassembly). Both are explicitly
scoped to post-hoc file uploads, not live dictation. This spec reuses their
proven patterns (pool shape, index-ordered reassembly) but applies them
*live*, gated on natural speech pauses instead of fixed-time file splitting.

An earlier attempt at making local dictation feel instant
(`2026-07-16-instant-paste-cleanup-design.md`) took a different approach —
paste the raw transcript immediately, then silently replace it with cleaned
text via backspace-and-repaste once cleanup finished. That mechanism was
built, shipped, and then removed (see `useAudioRecording.js:268-272`): "that
delete-then-repaste was visibly janky in some target apps... it's gone."
This spec does not touch paste behavior at all — dictation still pastes
exactly once, after the full pipeline completes, as it does today. The only
thing that changes is how much of the transcription work is already done by
the time that single paste happens.

## Goal

Reduce the wall-clock time between hotkey-release and paste, for every
transcription provider, by starting transcription work during the
recording instead of waiting until it stops — without changing the
single-paste behavior, the cleanup pipeline, or requiring any new user
setting.

## Scope

- Live dictation only (the hotkey-driven flow in `useAudioRecording.js` /
  `audioManager.js`). Meeting/note recordings and file uploads are untouched
  — they already have their own chunking stories (streaming-mode for notes,
  the two upload-chunking mechanisms referenced above).
- Applies to local whisper, local parakeet, any cloud provider using the
  standard `/audio/transcriptions` REST contract (including custom
  OpenAI-compatible endpoints), and any BYOK provider flagged
  `streaming: true` in the model registry.
- No new setting. Transport selection is automatic from existing provider
  capability data.
- No live partial-text preview in the UI. The flowbar looks the same as
  today during recording; only the time-to-final-result changes.
- Cleanup LLM step and paste step are unchanged — both still operate on one
  complete, ordered transcript exactly as today.

## Design

### VAD-gated segmentation

Recording already runs VAD for silence detection. `SegmentScheduler` (new,
renderer-side, alongside `audioManager.js`'s existing VAD wiring) treats
each VAD-detected pause as a segment boundary: it cuts the audio captured
since the previous boundary, assigns it a monotonic sequence index, and
hands it to the active transport. On hotkey release, whatever audio has
accumulated since the last boundary is forced into a final segment
immediately (no waiting for a pause that won't come).

VAD-gated over fixed-time windows: never risks cutting a word mid-segment,
so no overlap/stitch-trim logic is needed (unlike time-boxed splitting,
which would need to handle a word straddling two chunks).

### Transport selection (per dictation, automatic)

Chosen once at recording start from existing provider/model data — no new
setting:

1. **`WebSocketStreamTransport`** — if the selected model has
   `streaming: true` in the registry (already true today for GPT-4o
   Transcribe, GPT-4o Mini Transcribe, Corti, Tinfoil Voxtral). Connects
   directly using the user's own BYOK key, reusing the existing
   WebSocket/PCM pipeline in `audioManager.js` (~line 2660) but with a new
   connection path that does not depend on `sttConfig`/OpenWhispr Cloud
   auth — that gate stays as-is for the notes/meeting streaming feature,
   this is a parallel, auth-independent path for dictation specifically.
2. **`RestChunkTransport`** — for any other cloud/custom provider that
   speaks the standard `/audio/transcriptions` multipart contract
   (including local-network gateways like a user's own OpenAI-compatible
   server). Each finished segment is POSTed as its own request the moment
   it's ready. No server-side changes required — this works against any
   endpoint that already accepts the batch contract, since each "chunk" is
   just a normal, smaller batch request.
3. **`LocalPipelineTransport`** — for local whisper/parakeet. Segments queue
   to the existing persistent `WhisperServerManager` one at a time
   (sequential, not parallel — matches this spec's decision to avoid the
   VRAM/extra-process complexity that the file-upload parallel spec had to
   solve, since dictation segments are short and mostly finish well before
   the next one is ready). Each call passes the previous segment's
   transcribed text as the whisper prompt, for continuity across the cut —
   otherwise segment N loses the sentence context segment N-1 established.

### Stitching

`SegmentStitcher` collects `{ index, text }` results and assembles the
final transcript in index order once every index up to the final segment
has resolved — never in arrival order, since `RestChunkTransport` requests
can complete out of sequence under real network conditions (same
reassembly principle `chunkedCloudTranscribe` already uses for file
uploads, `ipcHandlers.js:227`). The assembled text is handed to the
existing cleanup pipeline exactly as today's single-shot transcript is —
no change downstream of this point.

### Fallback (single mechanism for every failure mode)

`FallbackBufferRecorder` — a parallel full-session audio buffer, always
running regardless of which transport is active, mirroring the existing
`streamingFallbackRecorder` pattern already in `audioManager.js`. Any of
the following discards in-flight segment state for that dictation and
resends the full buffer as one ordinary batch call (today's existing,
unmodified code path):

- WebSocket connection drops or errors.
- A REST chunk request exhausts the existing retry/backoff
  (`src/utils/retry.ts`, already shipped) after one retry.
- A local segment fails past `whisperServer.js`'s own reuse-guard/restart
  handling.
- Stitching times out waiting for a straggler segment (bounded by the same
  timeout a normal single-request batch call would use today).

This degrades silently to today's exact behavior and timing — never an
error toast, never a lost dictation, just no speed benefit for that one
take.

## Out of scope

- Live partial-text preview in the flowbar UI.
- Parallel local transcription (multiple concurrent whisper-server
  processes for one dictation) — sequential pipelining only.
- Meeting/note recordings and file uploads — already have their own
  chunking mechanisms, untouched by this spec.
- A manual streaming on/off setting — transport selection stays fully
  automatic.
- Cost/rate-limit accounting for providers that bill per request (chunked
  REST calls mean more requests per dictation than today's one call) — not
  investigated in this pass, flagged here for awareness before rollout to
  paid-per-request cloud providers.
