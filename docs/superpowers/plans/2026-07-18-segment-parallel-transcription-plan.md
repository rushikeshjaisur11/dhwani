# Segment-Parallel Transcription (local whisper) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut wall-clock time for local-whisper transcription of long uploaded audio files by splitting them into segments and decoding two at a time across two whisper-server processes, with a CUDA VRAM headroom guard that falls back to today's serial path when unsafe.

**Architecture:** Reuse the existing `splitAudioFile()` ffmpeg splitter and the existing persistent `WhisperServerManager` as worker 1; spin up a second, transient `WhisperServerManager` as worker 2 for the duration of one transcription job. A small pure decision module (`transcriptionSegmentPlan.js`) holds the segment/no-segment threshold, round-robin worker assignment, and VRAM-headroom math so it's unit-testable without spawning real processes or GPUs. The orchestration glue (spawning, splitting, pooling, cleanup) lives in a new `WhisperManager` method and is exercised manually (no `nvidia-smi`/ffmpeg mocking infra exists in this repo today).

**Tech Stack:** Node.js (CommonJS, `src/helpers/*.js`), `node:test` + `node:assert/strict` for unit tests, existing `ffmpeg-static` binary, existing `whisper-server` binary via `WhisperServerManager`.

## Global Constraints

- Local whisper only — Parakeet, live dictation, and meeting recordings are untouched.
- Fixed at 2 worker processes. Not CPU-scaled, not user-configurable.
- No overlap/stitch-trim logic — hard segment cuts, reassembled by index.
- Any worker/segment error aborts the whole job with one surfaced error (no partial results).
- CUDA VRAM headroom must be checked before starting the transient second worker when the primary server is running on CUDA; insufficient headroom (or an undetectable GPU) falls back to the existing single-call path.
- Short files (duration ≤ 2x the segment length) skip segmentation entirely.
- Node 24 lockfile — no new npm dependencies are needed for this feature (ffmpeg-static and whisper-server are already bundled).

---

## File Structure

- **Modify:** `src/helpers/ffmpegUtils.js` — add `parseDurationSeconds()` (pure) and `getAudioDurationSeconds()` (spawns ffmpeg, parses stderr).
- **Modify:** `src/utils/gpuDetection.js` — add `parseFreeVramMb()` (pure) and `getFreeVramMb()` (uncached `nvidia-smi` query — free VRAM changes moment to moment, unlike the existing cached `memory.total` query).
- **Create:** `src/helpers/transcriptionSegmentPlan.js` — pure decision helpers: `shouldSegmentAudio()`, `assignSegmentWorker()`, `hasVramHeadroom()`.
- **Create:** `test/helpers/ffmpegUtilsDuration.test.js`, `test/utils/gpuDetectionFreeVram.test.js`, `test/helpers/transcriptionSegmentPlan.test.js`.
- **Modify:** `src/helpers/whisper.js` — add `transcribeLocalWhisperSegmented(filePath, options)` method to `WhisperManager`.
- **Modify:** `src/helpers/ipcHandlers.js` — `transcribe-audio-file` handler (`ipcHandlers.js:1555`) calls the new method for the whisper branch, wiring `onSegmentProgress` to the existing `upload-transcription-progress` IPC channel.
- **Modify:** `src/components/notes/UploadAudioView.tsx` — extend the `useChunkProgress` gate (`UploadAudioView.tsx:312`) to also cover local whisper, reusing the existing chunk-progress state and listener as-is.

No new IPC channels, no new preload methods, no new i18n strings (the existing `notes.upload.chunkProgress` translation key already covers "X of Y" progress text for any provider).

---

### Task 1: Audio duration probing

**Files:**
- Modify: `src/helpers/ffmpegUtils.js`
- Test: `test/helpers/ffmpegUtilsDuration.test.js`

**Interfaces:**
- Produces: `parseDurationSeconds(stderrText: string): number | null`, `getAudioDurationSeconds(inputPath: string): Promise<number>` (rejects if ffmpeg is missing or no `Duration:` line is found).

- [ ] **Step 1: Write the failing test**

```js
// test/helpers/ffmpegUtilsDuration.test.js
const test = require("node:test");
const assert = require("node:assert/strict");

const { parseDurationSeconds } = require("../../src/helpers/ffmpegUtils");

test("parseDurationSeconds extracts HH:MM:SS.ms from ffmpeg stderr", () => {
  const stderr =
    "Input #0, wav, from 'file.wav':\n" +
    "  Duration: 00:02:05.43, start: 0.000000, bitrate: 256 kb/s\n";
  assert.equal(parseDurationSeconds(stderr), 125.43);
});

test("parseDurationSeconds handles hour-long durations", () => {
  const stderr = "  Duration: 01:00:00.00, start: 0.000000, bitrate: 128 kb/s\n";
  assert.equal(parseDurationSeconds(stderr), 3600);
});

test("parseDurationSeconds returns null when no Duration line is present", () => {
  assert.equal(parseDurationSeconds("no duration info here"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/helpers/ffmpegUtilsDuration.test.js`
Expected: FAIL with something like "parseDurationSeconds is not a function" (not yet exported).

- [ ] **Step 3: Implement `parseDurationSeconds` and `getAudioDurationSeconds`**

In `src/helpers/ffmpegUtils.js`, add after `splitAudioFile` (before `clearCache`):

```js
function parseDurationSeconds(ffmpegStderr) {
  const match = ffmpegStderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!match) return null;
  const [, hh, mm, ss] = match;
  return parseInt(hh, 10) * 3600 + parseInt(mm, 10) * 60 + parseFloat(ss);
}

function getAudioDurationSeconds(inputPath) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFFmpegPath();
    if (!ffmpegPath) {
      reject(new Error("FFmpeg not found - required for audio duration probing"));
      return;
    }

    // ffmpeg with -i and no output always exits non-zero; the duration is in
    // stderr regardless, so the exit code is intentionally not checked here.
    const proc = spawn(ffmpegPath, ["-i", inputPath], {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });

    let stderr = "";
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("error", (error) => {
      reject(new Error(`FFmpeg duration probe error: ${error.message}`));
    });

    proc.on("close", () => {
      const duration = parseDurationSeconds(stderr);
      if (duration === null) {
        reject(new Error("Could not determine audio duration from FFmpeg output"));
        return;
      }
      resolve(duration);
    });
  });
}
```

Update the `module.exports` block at the bottom of the file to include both:

```js
module.exports = {
  getFFmpegPath,
  isWavFormat,
  convertToWav,
  splitAudioFile,
  parseDurationSeconds,
  getAudioDurationSeconds,
  wavToFloat32Samples,
  computeFloat32RMS,
  clearCache,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/helpers/ffmpegUtilsDuration.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/helpers/ffmpegUtils.js test/helpers/ffmpegUtilsDuration.test.js
git commit -m "feat: add ffmpeg audio duration probing"
```

---

### Task 2: Free VRAM probing

**Files:**
- Modify: `src/utils/gpuDetection.js`
- Test: `test/utils/gpuDetectionFreeVram.test.js`

**Interfaces:**
- Produces: `parseFreeVramMb(csvOutput: string): number | null`, `getFreeVramMb(): Promise<number | null>` (resolves `null` on macOS, on `nvidia-smi` failure, or on unparseable output — never rejects).

- [ ] **Step 1: Write the failing test**

```js
// test/utils/gpuDetectionFreeVram.test.js
const test = require("node:test");
const assert = require("node:assert/strict");

const { parseFreeVramMb } = require("../../src/utils/gpuDetection");

test("parseFreeVramMb parses a single numeric CSV value", () => {
  assert.equal(parseFreeVramMb("8192\n"), 8192);
});

test("parseFreeVramMb trims whitespace around the value", () => {
  assert.equal(parseFreeVramMb("  4096  \n"), 4096);
});

test("parseFreeVramMb returns null for empty output", () => {
  assert.equal(parseFreeVramMb(""), null);
});

test("parseFreeVramMb returns null for non-numeric output", () => {
  assert.equal(parseFreeVramMb("not-a-number\n"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/utils/gpuDetectionFreeVram.test.js`
Expected: FAIL with "parseFreeVramMb is not a function".

- [ ] **Step 3: Implement `parseFreeVramMb` and `getFreeVramMb`**

In `src/utils/gpuDetection.js`, add after `detectNvidiaGpu` (before `let cachedGpuList`):

```js
function parseFreeVramMb(csvOutput) {
  const trimmed = (csvOutput || "").trim();
  if (!trimmed) return null;
  const value = parseInt(trimmed.split(",")[0].trim(), 10);
  return Number.isFinite(value) ? value : null;
}

// Not cached like detectNvidiaGpu's memory.total — free VRAM changes with
// every model load/unload, so a stale cache here would defeat the guard.
function getFreeVramMb() {
  if (process.platform === "darwin") return Promise.resolve(null);

  return new Promise((resolve) => {
    execFile(
      "nvidia-smi",
      ["--query-gpu=memory.free", "--format=csv,noheader,nounits"],
      { timeout: 5000 },
      (error, stdout) => {
        if (error || !stdout) {
          resolve(null);
          return;
        }
        resolve(parseFreeVramMb(stdout));
      }
    );
  });
}
```

Update `module.exports` at the bottom of the file:

```js
module.exports = { detectNvidiaGpu, listNvidiaGpus, parseFreeVramMb, getFreeVramMb };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/utils/gpuDetectionFreeVram.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/gpuDetection.js test/utils/gpuDetectionFreeVram.test.js
git commit -m "feat: add free VRAM probing for segment-parallel transcription guard"
```

---

### Task 3: Pure segmentation decision helpers

**Files:**
- Create: `src/helpers/transcriptionSegmentPlan.js`
- Test: `test/helpers/transcriptionSegmentPlan.test.js`

**Interfaces:**
- Consumes: nothing (pure module, no other task's code).
- Produces: `LOCAL_CHUNK_SEGMENT_SECONDS` (number, 60), `RUNTIME_OVERHEAD_GB` (number, 0.5), `shouldSegmentAudio(durationSeconds: number|null, segmentDurationSeconds?: number): boolean`, `assignSegmentWorker(index: number): 0 | 1`, `hasVramHeadroom(freeVramMb: number|null, modelFileSizeBytes: number): boolean`. Task 4 imports all five names from this module.

- [ ] **Step 1: Write the failing test**

```js
// test/helpers/transcriptionSegmentPlan.test.js
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  LOCAL_CHUNK_SEGMENT_SECONDS,
  RUNTIME_OVERHEAD_GB,
  shouldSegmentAudio,
  assignSegmentWorker,
  hasVramHeadroom,
} = require("../../src/helpers/transcriptionSegmentPlan");

test("constants are sane", () => {
  assert.equal(LOCAL_CHUNK_SEGMENT_SECONDS, 60);
  assert.equal(RUNTIME_OVERHEAD_GB, 0.5);
});

test("shouldSegmentAudio is false for a short file", () => {
  assert.equal(shouldSegmentAudio(90), false); // 90s <= 2 * 60s
});

test("shouldSegmentAudio is true for a long file", () => {
  assert.equal(shouldSegmentAudio(600), true); // 600s > 2 * 60s
});

test("shouldSegmentAudio is false right at the 2x threshold", () => {
  assert.equal(shouldSegmentAudio(120), false); // exactly 2 * 60s, not >
});

test("shouldSegmentAudio is false when duration is unknown", () => {
  assert.equal(shouldSegmentAudio(null), false);
  assert.equal(shouldSegmentAudio(undefined), false);
  assert.equal(shouldSegmentAudio(NaN), false);
});

test("assignSegmentWorker alternates 0/1 by index", () => {
  assert.equal(assignSegmentWorker(0), 0);
  assert.equal(assignSegmentWorker(1), 1);
  assert.equal(assignSegmentWorker(2), 0);
  assert.equal(assignSegmentWorker(3), 1);
});

test("hasVramHeadroom is true when free VRAM comfortably covers model + overhead", () => {
  // 3GB model -> needs (3 + 0.5) * 1000 = 3500MB
  assert.equal(hasVramHeadroom(4000, 3_000_000_000), true);
});

test("hasVramHeadroom is false when free VRAM is short", () => {
  assert.equal(hasVramHeadroom(3000, 3_000_000_000), false);
});

test("hasVramHeadroom is false when free VRAM is unknown", () => {
  assert.equal(hasVramHeadroom(null, 3_000_000_000), false);
  assert.equal(hasVramHeadroom(undefined, 3_000_000_000), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/helpers/transcriptionSegmentPlan.test.js`
Expected: FAIL with "Cannot find module '../../src/helpers/transcriptionSegmentPlan'".

- [ ] **Step 3: Implement the module**

```js
// src/helpers/transcriptionSegmentPlan.js
const LOCAL_CHUNK_SEGMENT_SECONDS = 60;

// ponytail: flat runtime/KV-cache overhead buffer, same rough-estimate
// pattern as modelRecommender.js's RUNTIME_OVERHEAD_GB — tune here if
// real-world headroom checks prove too tight or too loose.
const RUNTIME_OVERHEAD_GB = 0.5;

function shouldSegmentAudio(durationSeconds, segmentDurationSeconds = LOCAL_CHUNK_SEGMENT_SECONDS) {
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds)) return false;
  return durationSeconds > segmentDurationSeconds * 2;
}

function assignSegmentWorker(index) {
  return index % 2;
}

function hasVramHeadroom(freeVramMb, modelFileSizeBytes) {
  if (typeof freeVramMb !== "number" || !Number.isFinite(freeVramMb)) return false;
  const modelGb = modelFileSizeBytes / 1e9;
  const neededMb = (modelGb + RUNTIME_OVERHEAD_GB) * 1000;
  return freeVramMb >= neededMb;
}

module.exports = {
  LOCAL_CHUNK_SEGMENT_SECONDS,
  RUNTIME_OVERHEAD_GB,
  shouldSegmentAudio,
  assignSegmentWorker,
  hasVramHeadroom,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/helpers/transcriptionSegmentPlan.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/helpers/transcriptionSegmentPlan.js test/helpers/transcriptionSegmentPlan.test.js
git commit -m "feat: add pure segment/worker/VRAM decision helpers"
```

---

### Task 4: `transcribeLocalWhisperSegmented` on `WhisperManager`

**Files:**
- Modify: `src/helpers/whisper.js`

**Interfaces:**
- Consumes: `parseDurationSeconds`/`getAudioDurationSeconds` (Task 1), `parseFreeVramMb`/`getFreeVramMb` (Task 2), `shouldSegmentAudio`/`assignSegmentWorker`/`hasVramHeadroom`/`LOCAL_CHUNK_SEGMENT_SECONDS` (Task 3), `splitAudioFile` (existing, `ffmpegUtils.js:240`), `WhisperServerManager` (existing, already required at `whisper.js:12`), this class's own existing `getModelPath()`, `getVadModelPath()`, `parseWhisperResult()`, `normalizeWhitespace()`, and `transcribeLocalWhisper()` (all existing methods on `WhisperManager`).
- Produces: `WhisperManager.prototype.transcribeLocalWhisperSegmented(filePath: string, options?: { model?: string, language?: string, initialPrompt?: string, vadEnabled?: boolean, vadConfig?: object, onSegmentProgress?: (payload: { stage: string, chunksTotal: number, chunksCompleted: number }) => void }): Promise<{ success: true, text: string } | { success: false, error: string }>`. Task 5 calls this method directly.

No new automated test for this task — it's IO-heavy orchestration (spawns real ffmpeg and whisper-server processes) and this repo has no fixture audio files or process-mocking harness for whisper.js today (confirmed: no `test/helpers/whisper*.test.js` beyond VAD-arg-building tests). It's covered by Task 4's own manual smoke step and Task 5's manual end-to-end smoke step instead.

- [ ] **Step 1: Add the method**

In `src/helpers/whisper.js`, add this method to the `WhisperManager` class, directly after `transcribeLocalWhisper` (after line 286, before `transcribeViaServer`):

```js
  async transcribeLocalWhisperSegmented(filePath, options = {}) {
    const { getAudioDurationSeconds, splitAudioFile } = require("./ffmpegUtils");
    const {
      shouldSegmentAudio,
      assignSegmentWorker,
      hasVramHeadroom,
      LOCAL_CHUNK_SEGMENT_SECONDS,
    } = require("./transcriptionSegmentPlan");

    let durationSeconds = null;
    try {
      durationSeconds = await getAudioDurationSeconds(filePath);
    } catch (error) {
      debugLogger.debug("Could not probe audio duration, using single-call path", {
        error: error.message,
      });
    }

    if (!shouldSegmentAudio(durationSeconds)) {
      const audioBuffer = fs.readFileSync(filePath);
      return await this.transcribeLocalWhisper(audioBuffer, options);
    }

    const model = options.model || "base";
    const modelPath = this.getModelPath(model);

    if (this.serverManager.useCuda) {
      const { getFreeVramMb } = require("../utils/gpuDetection");
      const modelSizeBytes = fs.existsSync(modelPath) ? fs.statSync(modelPath).size : 0;
      const freeVramMb = await getFreeVramMb();
      if (!hasVramHeadroom(freeVramMb, modelSizeBytes)) {
        debugLogger.debug(
          "Insufficient VRAM headroom for a second whisper worker, falling back to serial",
          { freeVramMb }
        );
        const audioBuffer = fs.readFileSync(filePath);
        return await this.transcribeLocalWhisper(audioBuffer, options);
      }
    }

    if (!fs.existsSync(modelPath)) {
      throw new Error(`Whisper model "${model}" not downloaded. Please download it from Settings.`);
    }

    const vadEnabled = options.vadEnabled === true;
    const vadModelPath = vadEnabled ? this.getVadModelPath() : null;

    await this.serverManager.start(modelPath, {
      useCuda: this.serverManager.useCuda || process.env.WHISPER_CUDA_ENABLED === "true",
      vadEnabled,
      vadModelPath,
      vadConfig: options.vadConfig || null,
    });
    this.currentServerModel = model;

    const os = require("os");
    const crypto = require("crypto");
    const WhisperServerManager = require("./whisperServer");

    const jobId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const chunkDir = path.join(os.tmpdir(), `dhwani-local-chunks-${jobId}`);
    fs.mkdirSync(chunkDir, { recursive: true });

    // Transient: spun up only for this job's duration, never kept warm — a
    // permanently-doubled idle model would cost RAM for a feature that only
    // matters on occasional long uploads.
    const transientServer = new WhisperServerManager();

    try {
      const chunkPaths = await splitAudioFile(filePath, chunkDir, {
        segmentDuration: LOCAL_CHUNK_SEGMENT_SECONDS,
      });
      const totalChunks = chunkPaths.length;

      await transientServer.start(modelPath, {
        useCuda: false,
        vadEnabled,
        vadModelPath,
        vadConfig: options.vadConfig || null,
      });

      const results = new Array(totalChunks).fill(null);
      let completedCount = 0;
      let nextIndex = 0;

      options.onSegmentProgress?.({
        stage: "transcribing",
        chunksTotal: totalChunks,
        chunksCompleted: 0,
      });

      const runWorker = async (server) => {
        while (nextIndex < totalChunks) {
          const index = nextIndex++;
          const chunkBuffer = fs.readFileSync(chunkPaths[index]);
          const raw = await server.transcribe(chunkBuffer, {
            language: options.language || null,
            initialPrompt: options.initialPrompt || null,
          });
          const parsed = this.parseWhisperResult(raw);
          if (!parsed.success) {
            throw new Error(parsed.error || `Segment ${index} transcription failed`);
          }
          results[index] = parsed.text;
          completedCount++;
          options.onSegmentProgress?.({
            stage: "transcribing",
            chunksTotal: totalChunks,
            chunksCompleted: completedCount,
          });
        }
      };

      await Promise.all([runWorker(this.serverManager), runWorker(transientServer)]);

      return { success: true, text: this.normalizeWhitespace(results.join(" ")) };
    } finally {
      await transientServer.stop();
      try {
        for (const chunkFile of fs.readdirSync(chunkDir)) {
          fs.unlinkSync(path.join(chunkDir, chunkFile));
        }
        fs.rmdirSync(chunkDir);
      } catch (cleanupError) {
        debugLogger.debug("Segment chunk cleanup failed", { error: cleanupError.message });
      }
    }
  }
```

- [ ] **Step 2: Manual smoke test**

With a whisper model already downloaded (Settings → AI Models), run the app in dev (`npm run dev`), open a note, use "Upload Audio" with a local audio file longer than 120s (2x the 60s segment threshold) with local whisper selected as the transcription provider. Confirm:
- The file transcribes successfully and the full text appears (not just one segment's worth).
- `debugLogger` output (`OPENWHISPR_LOG_LEVEL=debug`) shows two whisper-server processes handling segments (persistent server's existing port, plus a second port from the transient instance).
- Uploading a short file (<120s) still transcribes via the original single-call path (no chunk directory created under the OS temp dir).

- [ ] **Step 3: Commit**

```bash
git add src/helpers/whisper.js
git commit -m "feat: add segment-parallel local whisper transcription for long uploads"
```

---

### Task 5: Wire the IPC handler

**Files:**
- Modify: `src/helpers/ipcHandlers.js:1555-1573`

**Interfaces:**
- Consumes: `WhisperManager.prototype.transcribeLocalWhisperSegmented` (Task 4).
- Produces: no new IPC channel — reuses the existing `transcribe-audio-file` handle and the existing `upload-transcription-progress` send channel (already used by the cloud path at `ipcHandlers.js:6291`), so no preload.js or `electron.ts` changes are needed.

- [ ] **Step 1: Replace the handler body**

Replace the existing handler (`ipcHandlers.js:1555-1573`):

```js
    ipcMain.handle("transcribe-audio-file", async (event, filePath, options = {}) => {
      const fs = require("fs");
      try {
        const audioBuffer = fs.readFileSync(filePath);
        if (options.provider === "nvidia") {
          const result = await this.parakeetManager.transcribeLocalParakeet(audioBuffer, options);
          return result;
        }
        const vadOptions = this._resolveWhisperVadOptions("noteRecording");
        const result = await this.whisperManager.transcribeLocalWhisper(audioBuffer, {
          ...options,
          ...vadOptions,
        });
        return result;
      } catch (error) {
        debugLogger.error("Audio file transcription error", { error: error.message });
        return { success: false, error: error.message };
      }
    });
```

with:

```js
    ipcMain.handle("transcribe-audio-file", async (event, filePath, options = {}) => {
      const fs = require("fs");
      try {
        if (options.provider === "nvidia") {
          const audioBuffer = fs.readFileSync(filePath);
          const result = await this.parakeetManager.transcribeLocalParakeet(audioBuffer, options);
          return result;
        }
        const vadOptions = this._resolveWhisperVadOptions("noteRecording");
        const result = await this.whisperManager.transcribeLocalWhisperSegmented(filePath, {
          ...options,
          ...vadOptions,
          onSegmentProgress: (payload) => event.sender.send("upload-transcription-progress", payload),
        });
        return result;
      } catch (error) {
        debugLogger.error("Audio file transcription error", { error: error.message });
        return { success: false, error: error.message };
      }
    });
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npm run typecheck && npx eslint src/helpers/ipcHandlers.js`
Expected: both pass with no new errors.

- [ ] **Step 3: Manual smoke test**

Repeat the Task 4 manual smoke test (upload a long local-whisper file), this time watching the Notes UI's upload progress area rather than debug logs — confirm no UI regression from routing through `transcribeLocalWhisperSegmented` instead of `transcribeLocalWhisper` for the nvidia branch (unaffected) and the whisper branch.

- [ ] **Step 4: Commit**

```bash
git add src/helpers/ipcHandlers.js
git commit -m "feat: route local whisper file transcription through segment-parallel path"
```

---

### Task 6: Chunk-progress UI for local whisper uploads

**Files:**
- Modify: `src/components/notes/UploadAudioView.tsx:312`

**Interfaces:**
- Consumes: the existing `chunkProgress` state (`UploadAudioView.tsx:66`), the existing `onUploadTranscriptionProgress` listener wiring (`UploadAudioView.tsx:316-324`), the existing `useLocalWhisper` and `localTranscriptionProvider` variables already in scope in this component.
- Produces: no new exports — this is a UI-only gating change.

- [ ] **Step 1: Change the gate**

Replace (`UploadAudioView.tsx:312`):

```tsx
    const useChunkProgress = isOpenWhisprCloud && isLargeFile;
```

with:

```tsx
    const useChunkProgress =
      (isOpenWhisprCloud && isLargeFile) ||
      (useLocalWhisper && localTranscriptionProvider !== "nvidia");
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS, no new errors.

- [ ] **Step 3: Manual smoke test**

Upload a long (>120s) local-whisper audio file from the Notes → Upload Audio view. Confirm the chunk-progress UI (`notes.upload.chunkProgress` text, e.g. "1 of 3 segments") appears and updates as segments complete, instead of the generic randomized progress bar. Upload a short file and confirm it still shows the generic progress bar (no chunk info, since the backend never segments it and `chunkProgress` stays `null`).

- [ ] **Step 4: Commit**

```bash
git add src/components/notes/UploadAudioView.tsx
git commit -m "feat: show segment progress for local whisper uploads"
```

---

## Self-Review

**Spec coverage:**
- "When to segment" (duration probe, 2x threshold, short-file fallback) → Task 1 + Task 3 (`shouldSegmentAudio`) + Task 4.
- "Splitting" (reuse `splitAudioFile`, new `LOCAL_CHUNK_SEGMENT_SECONDS` constant) → Task 3 + Task 4.
- "Two worker processes" (persistent + transient, `.start()`/`.stop()`, own port via existing scan) → Task 4.
- "Assigning segments to workers" (round-robin, index-based) → Task 3 (`assignSegmentWorker`) + Task 4 (implemented as two pull-based workers, functionally equivalent round-robin since both workers pull from the same shared `nextIndex` cursor in order).
- "Reassembly" (index order, no dedup) → Task 4 (`results` array + `join(" ")`).
- "Progress UI" (reuse `chunkProgress`/`onUploadTranscriptionProgress`) → Task 5 (wiring) + Task 6 (UI gate).
- "Failure handling" (abort whole job, one error) → Task 4 (`throw` inside `runWorker` propagates through `Promise.all`, caught by the IPC handler's existing try/catch in Task 5).
- "VRAM headroom guard" (CUDA-only, uncached free-VRAM query, model-size + overhead comparison, fallback to serial) → Task 2 + Task 3 (`hasVramHeadroom`) + Task 4.
- "Out of scope" items (Parakeet, configurable workers, overlap/stitching, live dictation) — no task touches any of these; confirmed by file list above.

**Placeholder scan:** No TBD/TODO markers; every step has complete, runnable code or an explicit manual-check procedure with concrete pass/fail criteria.

**Type consistency:** `shouldSegmentAudio`, `assignSegmentWorker`, `hasVramHeadroom`, `LOCAL_CHUNK_SEGMENT_SECONDS` are named identically across Task 3's implementation, Task 3's test, and Task 4's `require(...)` destructuring. `transcribeLocalWhisperSegmented`'s signature in Task 4 matches exactly how Task 5 calls it (`filePath`, then an options object including `onSegmentProgress`).
