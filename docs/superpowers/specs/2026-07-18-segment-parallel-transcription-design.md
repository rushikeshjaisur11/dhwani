# Segment-Parallel Transcription (local whisper, uploaded files)

## Context

`UploadAudioView.tsx`'s local-file path (`handleTranscribe()`,
`src/components/notes/UploadAudioView.tsx:350-354`) sends the whole file to
`transcribeAudioFile` IPC in one call, which hits
`whisperManager.transcribeLocalWhisper()` (`src/helpers/whisper.js:255`) →
`transcribeViaServer()` (`whisper.js:288`) → the single persistent
`WhisperServerManager` instance (`whisper.js:40`). One process, one decode
request at a time — a long file transcribes serially even though whisper.cpp
itself can run additional model instances fine if given their own process
and port.

The cloud upload path already solves the exact same shape of problem for
large files: `chunkedCloudTranscribe()` (`src/helpers/ipcHandlers.js:194`)
splits the input with `splitAudioFile()` (`src/helpers/ffmpegUtils.js:240`,
hard cuts via ffmpeg's `-f segment` muxer, no overlap) and transcribes chunks
through a `Set`-based concurrency pool (`ipcHandlers.js:252-266`,
`concurrencyLimit = CLOUD_CHUNK_CONCURRENCY = 5`) hitting one shared HTTP
API. `UploadAudioView.tsx` already renders per-chunk progress for this path
via `chunkProgress` state (`UploadAudioView.tsx:66`) and the
`onUploadTranscriptionProgress` callback (`UploadAudioView.tsx:316`), gated
today on `isOpenWhisprCloud && isLargeFile` (`UploadAudioView.tsx:312`).

Local whisper has no chunking today. The gap isn't "no chunker exists" —
it's that the local path's one worker (one whisper-server process) can't be
handed more than one chunk at once. Fixing that means running a second
whisper-server process (its own port, its own copy of the model in RAM) so
two chunks can decode concurrently.

## Goal

Cut wall-clock time for local-whisper transcription of long uploaded audio
files by splitting into segments and decoding two at a time across two
whisper-server processes, reusing the existing splitter, concurrency-pool
pattern, and chunk-progress UI wholesale rather than inventing parallel
mechanisms.

## Scope

- Local whisper only. Live dictation, meeting recordings, and Parakeet are
  untouched — `parakeetServer.js`'s concurrency model hasn't been
  investigated and is out of scope for this round.
- `UploadAudioView.tsx`'s local-file branch (`useLocalWhisper`,
  `UploadAudioView.tsx:350`) and the `transcribe-audio-file` IPC handler
  (`ipcHandlers.js:1555`) are the only call sites that change.
- Fixed at 2 worker processes. Not CPU-scaled, not user-configurable.
- No overlap/stitch-trim logic — segments are hard-cut exactly like the
  cloud path already does, and reassembled by segment index (not completion
  order).
- Short files stay on today's single-call path — no splitting overhead for
  a file that wouldn't benefit from it.

## Design

### When to segment

Probe duration first (`ffprobe`, already bundled alongside ffmpeg). If
duration is at or below a threshold (2x the segment length, so a split
would produce at most one full segment) skip segmentation entirely and call
`transcribeLocalWhisper()` exactly as today. This keeps the existing
single-file behavior and its tests untouched for the common short-recording
case.

### Splitting

Reuse `splitAudioFile(inputPath, outputDir, { segmentDuration })` as-is
(`ffmpegUtils.js:240`) — no new split code. Segment length is a separate
constant from the cloud path's 240s (that value is sized for a cloud API
request-size limit that doesn't apply locally); pick something that gives
real parallelism on typical note-length recordings, e.g. 60s
(`LOCAL_CHUNK_SEGMENT_SECONDS`).

### Two worker processes

- The existing persistent `WhisperServerManager` (owned by `WhisperManager`,
  `whisper.js:40`) is worker 1 — already warm, already loaded with the
  active model.
- Spin up a second, transient `WhisperServerManager` instance for the
  duration of this transcription job only: `new WhisperServerManager()`,
  `.start(modelPath, options)` (same call `transcribeViaServer` already
  makes on the persistent one, `whisper.js:298`), and `.stop()` in a
  `finally` block once the job completes or fails. It gets its own port via
  the manager's existing port-range scan (`whisperServer.js:369`) — no new
  port logic needed.
- Transient, not kept warm: this avoids permanently doubling idle RAM for a
  feature that only matters for occasional long uploads.

### VRAM headroom guard (CUDA only)

A transient second server only risks anything when the primary is actually
running on GPU (`this.serverManager.useCuda`, `whisper.js:301`) — a CPU-only
setup has no VRAM to double, so the guard only runs in the CUDA case.

- `gpuDetection.js` today only exposes `memory.total` (cached at first call,
  `gpuDetection.js:16`). Add a small uncached query,
  `getFreeVramMb()`, using `nvidia-smi --query-gpu=memory.free
  --format=csv,noheader,nounits` (same `execFile` pattern, not cached —
  free VRAM changes moment to moment).
- Before starting the transient worker: if CUDA is active, call
  `getFreeVramMb()` and compare against the model file's size on disk
  (`fs.statSync(modelPath).size`) plus the same flat
  `RUNTIME_OVERHEAD_GB`-style buffer already used in
  `modelRecommender.js` for this exact kind of headroom math.
- If free VRAM is insufficient (or `nvidia-smi` fails/returns nothing),
  skip segmentation and fall back to today's single-call
  `transcribeLocalWhisper()` path — same fallback used for short files.

### Assigning segments to workers

Mirror the existing pool shape in `chunkedCloudTranscribe`
(`ipcHandlers.js:252-266`) almost exactly, but instead of every chunk
hitting the same HTTP endpoint, alternate which of the two
`WhisperServerManager` instances a given index is sent to (`index % 2`).
`concurrencyLimit` is effectively 2 (one in flight per worker) rather than
the cloud path's 5, since each worker is a whole local process/model
instance, not a stateless remote request.

### Reassembly

Results collected into a `results[index]` array sized to `chunkPaths.length`
(same shape as `ipcHandlers.js:227`), joined with a single space in index
order once all segments resolve. No de-duplication step, since there's no
overlap to trim.

### Progress UI

Extend the existing `onProgress` callback shape
(`{ stage, chunksTotal, chunksCompleted }`, already emitted by
`chunkedCloudTranscribe`) to also fire over the `transcribe-audio-file`
handler when segmenting occurs, wired to the same
`upload-transcription-progress` IPC channel
(`ipcHandlers.js:6291`) and the same renderer-side `chunkProgress` state and
`useChunkProgress` gate (`UploadAudioView.tsx:66,312,316`) — extending that
gate's condition to also cover the local-whisper segmented case, so no new
UI component is needed.

### Failure handling

If either worker throws (segment transcription error, or the transient
server fails to start), abort the whole job and surface one error — same
behavior as today's single-process failure path. No partial results.

## Out of scope

- Parakeet parallelism (needs its own investigation of
  `parakeetServer.js`'s process model).
- Configurable worker count.
- Silence-aware splitting or cross-segment overlap/stitching.
- Live dictation and meeting recordings (this only touches the upload-a-file
  note flow).
