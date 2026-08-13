# Live-Dictation Progressive Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the time between hotkey-release and paste, for every transcription provider, by transcribing audio in VAD-gated segments as the user talks instead of waiting for the whole recording to finish before sending anything.

**Architecture:** A new pure `SegmentBoundaryDetector` reuses the RMS/peak energy values `audioManager.js` already computes every 100ms during recording (`localSpeechGate.js`'s sibling mechanism) to fire pause-boundary events. A `SegmentScheduler` in `audioManager.js` cuts audio into segments on those boundaries and routes each to one of three transports — `LocalPipelineTransport` (sequential local whisper-server calls), `RestChunkTransport` (one `/audio/transcriptions` POST per segment), or `WebSocketStreamTransport` (BYOK-direct WebSocket PCM streaming, reusing the existing but currently OpenWhispr-Cloud-gated streaming block) — chosen automatically from existing model-registry capability data. A pure `SegmentStitcher` reassembles results in index order regardless of arrival order. A `FallbackBufferRecorder` always records the full session in parallel; any transport failure discards in-flight segment state and resends that full buffer as one ordinary batch call, unchanged from today's behavior.

**Tech Stack:** Existing Electron IPC (`preload.js`/`ipcHandlers.js`), Web Audio API (`AnalyserNode`, `AudioWorkletNode`), existing `src/utils/retry.ts` retry/backoff, existing `whisperServer.js` local transcription IPC, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-13-live-dictation-progressive-transcription-design.md`

## Global Constraints

- Live dictation only (`useAudioRecording.js`/`audioManager.js`). Meeting/note recordings, file uploads, and the Auto-Apply-Transform overlay path are untouched.
- No new user-facing setting. Transport selection is fully automatic.
- No live partial-text preview in the UI during this pass.
- Cleanup LLM step and the single-paste behavior in `useAudioRecording.js` are unchanged — both still operate on one complete, ordered transcript exactly as today.
- Any transport failure falls back silently to today's exact single-batch-call behavior — never an error toast, never a lost dictation.
- `npm run typecheck`, `npm run test:main`, `npm run test:ui`, and `npm run lint` must stay green after every task.
- Pure logic modules (`test/helpers/*.test.js`, `node --test`) follow the existing style in `test/helpers/localSpeechGate.test.js`: `require("node:test")`/`require("node:assert/strict")`, `await import("../../src/helpers/<file>.js")` for the ESM source under test.

---

### Task 1: SegmentStitcher (pure ordering module)

**Files:**
- Create: `src/helpers/segmentStitcher.js`
- Test: `test/helpers/segmentStitcher.test.js`

**Interfaces:**
- Produces: `createSegmentStitcher()` → `{ addResult(index, text), isComplete(expectedCount), getStitchedText() }`. `addResult` accepts results in any arrival order. `isComplete(expectedCount)` returns `true` only when every index from `0` to `expectedCount - 1` has been added — a gap (e.g. index 2 missing while 0,1,3 are present) keeps it `false`. `getStitchedText()` joins all held segments in index order with a single space, trimming each segment's own whitespace first.

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/segmentStitcher.js");

test("stitches segments added in scrambled arrival order", async () => {
  const { createSegmentStitcher } = await load();
  const stitcher = createSegmentStitcher();

  stitcher.addResult(2, "world.");
  stitcher.addResult(0, "Hello");
  stitcher.addResult(1, "there,");

  assert.equal(stitcher.isComplete(3), true);
  assert.equal(stitcher.getStitchedText(), "Hello there, world.");
});

test("is not complete while an index is missing", async () => {
  const { createSegmentStitcher } = await load();
  const stitcher = createSegmentStitcher();

  stitcher.addResult(0, "Hello");
  stitcher.addResult(2, "world.");

  assert.equal(stitcher.isComplete(3), false);
});

test("trims whitespace on each segment before joining", async () => {
  const { createSegmentStitcher } = await load();
  const stitcher = createSegmentStitcher();

  stitcher.addResult(0, "  Hello  ");
  stitcher.addResult(1, " world.  ");

  assert.equal(stitcher.getStitchedText(), "Hello world.");
});

test("single segment stitches to itself", async () => {
  const { createSegmentStitcher } = await load();
  const stitcher = createSegmentStitcher();

  stitcher.addResult(0, "Just this.");

  assert.equal(stitcher.isComplete(1), true);
  assert.equal(stitcher.getStitchedText(), "Just this.");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/helpers/segmentStitcher.test.js`
Expected: FAIL — cannot find module `src/helpers/segmentStitcher.js`

- [ ] **Step 3: Write minimal implementation**

```js
export function createSegmentStitcher() {
  const results = new Map();

  return {
    addResult(index, text) {
      results.set(index, typeof text === "string" ? text.trim() : "");
    },
    isComplete(expectedCount) {
      for (let i = 0; i < expectedCount; i += 1) {
        if (!results.has(i)) return false;
      }
      return true;
    },
    getStitchedText() {
      const ordered = [...results.entries()].sort((a, b) => a[0] - b[0]);
      return ordered
        .map(([, text]) => text)
        .filter((text) => text.length > 0)
        .join(" ");
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/helpers/segmentStitcher.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/helpers/segmentStitcher.js test/helpers/segmentStitcher.test.js
git commit -m "feat: add pure segment-stitching module for progressive transcription"
```

---

### Task 2: SegmentBoundaryDetector (pure pause detection)

**Files:**
- Create: `src/helpers/segmentBoundaryDetector.js`
- Test: `test/helpers/segmentBoundaryDetector.test.js`

**Context:** `audioManager.js`'s `startRecording()` (around line 500-575) already creates an `AnalyserNode` on a 100ms `setInterval` and computes `rms`/`peak` per window, feeding `recordLocalSpeechWindow` from `src/helpers/localSpeechGate.js` for a whole-recording skip/keep decision. This task adds a sibling, single-purpose module for a different question — "has a mid-recording pause happened" — using the same per-window `rms`/`peak` shape so Task 3 can feed both from the same interval callback without adding a second `AnalyserNode`.

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `createSegmentBoundaryState()` → fresh state object. `recordBoundaryWindow(state, rms)` → call once per 100ms window; returns `true` exactly once when a pause boundary is crossed (a run of `SILENT_WINDOWS_FOR_BOUNDARY` consecutive windows below `BOUNDARY_SILENCE_RMS_THRESHOLD`, then resets so the next boundary requires a fresh run of silent windows after speech resumes). `resetBoundaryState(state)` → clears the run counter after a boundary is consumed, called by `SegmentScheduler` once it has cut a segment.

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/segmentBoundaryDetector.js");

test("fires a boundary after a sustained silent run", async () => {
  const { createSegmentBoundaryState, recordBoundaryWindow } = await load();
  const state = createSegmentBoundaryState();

  // speech, then 5 consecutive silent 100ms windows (500ms pause)
  assert.equal(recordBoundaryWindow(state, 0.02), false);
  assert.equal(recordBoundaryWindow(state, 0.0005), false);
  assert.equal(recordBoundaryWindow(state, 0.0005), false);
  assert.equal(recordBoundaryWindow(state, 0.0005), false);
  assert.equal(recordBoundaryWindow(state, 0.0005), false);
  assert.equal(recordBoundaryWindow(state, 0.0005), true);
});

test("does not fire on a brief dip below threshold", async () => {
  const { createSegmentBoundaryState, recordBoundaryWindow } = await load();
  const state = createSegmentBoundaryState();

  assert.equal(recordBoundaryWindow(state, 0.02), false);
  assert.equal(recordBoundaryWindow(state, 0.0005), false);
  assert.equal(recordBoundaryWindow(state, 0.0005), false);
  // speech resumes before the silent run is long enough to fire
  assert.equal(recordBoundaryWindow(state, 0.02), false);
  assert.equal(recordBoundaryWindow(state, 0.0005), false);
  assert.equal(recordBoundaryWindow(state, 0.0005), false);
  assert.equal(recordBoundaryWindow(state, 0.0005), false);
  assert.equal(recordBoundaryWindow(state, 0.0005), false);
});

test("resetBoundaryState requires a fresh silent run before firing again", async () => {
  const { createSegmentBoundaryState, recordBoundaryWindow, resetBoundaryState } = await load();
  const state = createSegmentBoundaryState();

  for (let i = 0; i < 4; i += 1) recordBoundaryWindow(state, 0.0005);
  assert.equal(recordBoundaryWindow(state, 0.0005), true);

  resetBoundaryState(state);

  // still silent, but the run was reset — must count from zero again
  assert.equal(recordBoundaryWindow(state, 0.0005), false);
  assert.equal(recordBoundaryWindow(state, 0.0005), false);
  assert.equal(recordBoundaryWindow(state, 0.0005), false);
  assert.equal(recordBoundaryWindow(state, 0.0005), false);
  assert.equal(recordBoundaryWindow(state, 0.0005), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/helpers/segmentBoundaryDetector.test.js`
Expected: FAIL — cannot find module `src/helpers/segmentBoundaryDetector.js`

- [ ] **Step 3: Write minimal implementation**

```js
// A pause boundary is a run of consecutive near-silent 100ms analyser
// windows. 5 windows (~500ms) avoids cutting on a natural breath between
// words while still being short enough that most of a sentence is already
// transcribing well before the user releases the hotkey.
const BOUNDARY_SILENCE_RMS_THRESHOLD = 0.002;
const SILENT_WINDOWS_FOR_BOUNDARY = 5;

export function createSegmentBoundaryState() {
  return { consecutiveSilentWindows: 0 };
}

export function recordBoundaryWindow(state, rms) {
  if (rms < BOUNDARY_SILENCE_RMS_THRESHOLD) {
    state.consecutiveSilentWindows += 1;
  } else {
    state.consecutiveSilentWindows = 0;
    return false;
  }
  return state.consecutiveSilentWindows === SILENT_WINDOWS_FOR_BOUNDARY;
}

export function resetBoundaryState(state) {
  state.consecutiveSilentWindows = 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/helpers/segmentBoundaryDetector.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/helpers/segmentBoundaryDetector.js test/helpers/segmentBoundaryDetector.test.js
git commit -m "feat: add pure pause-boundary detector for segment cutting"
```

---

### Task 3: LocalPipelineTransport

**Files:**
- Create: `src/helpers/transports/localPipelineTransport.js`
- Test: `test/helpers/localPipelineTransport.test.js`

**Context:** Local transcription today goes through `window.electronAPI.transcribeLocalWhisper(arrayBuffer, options)` from the renderer (`audioManager.js`'s `processWithLocalWhisper`, options include `{ model, language?, translate?, initialPrompt? }`) which calls into `whisperServer.js` — `initialPrompt` becomes the whisper `prompt` field (`whisperServer.js` around line 701/740, already used for the custom-dictionary feature). This task reuses that exact same IPC call per segment, chaining `initialPrompt` from one segment's result into the next call for cross-segment continuity, instead of adding any new IPC handler.

**Interfaces:**
- Consumes: nothing from other tasks (calls `window.electronAPI.transcribeLocalWhisper` directly, same as `audioManager.js` does today).
- Produces: `createLocalPipelineTransport({ model, baseOptions, transcribeLocalWhisper })` → `{ submitSegment(index, arrayBuffer) }`. `transcribeLocalWhisper` is injected (defaults to `window.electronAPI.transcribeLocalWhisper`) so tests can stub it. `submitSegment` returns a `Promise<{ index, text }>`; segments submitted out of call-order still resolve in submission order internally (queued), matching the "sequential pipeline, single server" decision in the spec — a second `submitSegment` call does not start its whisper request until the first one's response has been received. On a whisper error, `submitSegment`'s promise rejects with the original error — callers (Task 8) decide the fallback, this transport does not catch and swallow.

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/transports/localPipelineTransport.js");

test("submits segments sequentially, not concurrently", async () => {
  const { createLocalPipelineTransport } = await load();

  const callOrder = [];
  let resolveFirst;
  const firstPending = new Promise((resolve) => {
    resolveFirst = resolve;
  });

  const transcribeLocalWhisper = async (buffer, options) => {
    callOrder.push(options.model);
    if (callOrder.length === 1) {
      await firstPending;
    }
    return { success: true, text: `segment-${callOrder.length}` };
  };

  const transport = createLocalPipelineTransport({
    model: "base",
    baseOptions: {},
    transcribeLocalWhisper,
  });

  const p1 = transport.submitSegment(0, new ArrayBuffer(4));
  const p2 = transport.submitSegment(1, new ArrayBuffer(4));

  // Let queued microtasks run so the first call actually starts before we
  // inspect callOrder — right after the two synchronous calls above,
  // nothing has run yet (the .then callbacks are still queued).
  await new Promise((resolve) => setImmediate(resolve));

  // second call must not have started while the first is still pending
  assert.equal(callOrder.length, 1);

  resolveFirst();
  const [r1, r2] = await Promise.all([p1, p2]);

  assert.deepEqual(r1, { index: 0, text: "segment-1" });
  assert.deepEqual(r2, { index: 1, text: "segment-2" });
});

test("chains prior segment text into the next call's initialPrompt", async () => {
  const { createLocalPipelineTransport } = await load();

  const seenPrompts = [];
  const transcribeLocalWhisper = async (buffer, options) => {
    seenPrompts.push(options.initialPrompt || null);
    return { success: true, text: `text-for-${seenPrompts.length}` };
  };

  const transport = createLocalPipelineTransport({
    model: "base",
    baseOptions: {},
    transcribeLocalWhisper,
  });

  await transport.submitSegment(0, new ArrayBuffer(4));
  await transport.submitSegment(1, new ArrayBuffer(4));

  assert.deepEqual(seenPrompts, [null, "text-for-1"]);
});

test("rejects when the underlying transcription call fails", async () => {
  const { createLocalPipelineTransport } = await load();

  const transcribeLocalWhisper = async () => {
    throw new Error("whisper-server unavailable");
  };

  const transport = createLocalPipelineTransport({
    model: "base",
    baseOptions: {},
    transcribeLocalWhisper,
  });

  await assert.rejects(
    transport.submitSegment(0, new ArrayBuffer(4)),
    /whisper-server unavailable/
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/helpers/localPipelineTransport.test.js`
Expected: FAIL — cannot find module `src/helpers/transports/localPipelineTransport.js`

- [ ] **Step 3: Write minimal implementation**

```js
export function createLocalPipelineTransport({
  model,
  baseOptions = {},
  transcribeLocalWhisper = window.electronAPI?.transcribeLocalWhisper,
}) {
  let queue = Promise.resolve();
  let lastText = null;

  function submitSegment(index, arrayBuffer) {
    const resultPromise = queue.then(async () => {
      const options = { ...baseOptions, model };
      if (lastText) {
        options.initialPrompt = lastText;
      }
      const result = await transcribeLocalWhisper(arrayBuffer, options);
      if (!result?.success) {
        throw new Error(result?.message || result?.error || "Local transcription failed");
      }
      lastText = result.text;
      return { index, text: result.text };
    });

    // Chain the queue to this segment's completion (success or failure)
    // regardless of outcome, so the next submitSegment still waits its turn.
    queue = resultPromise.catch(() => {});

    return resultPromise;
  }

  return { submitSegment };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/helpers/localPipelineTransport.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/helpers/transports/localPipelineTransport.js test/helpers/localPipelineTransport.test.js
git commit -m "feat: add sequential local-whisper segment transport"
```

---

### Task 4: RestChunkTransport

**Files:**
- Create: `src/helpers/transports/restChunkTransport.js`
- Test: `test/helpers/restChunkTransport.test.js`

**Context:** Cloud/custom REST transcription today builds its endpoint via `buildApiUrl(normalizedBase, "/audio/transcriptions")` (`audioManager.js` around line 2260-2300) and posts a multipart body. This task reuses that same endpoint-resolution shape (injected, not reimplemented) and the existing retry/backoff utility (`src/utils/retry.ts`'s `createApiRetryStrategy()`/`httpError()`, already shipped for the non-chunked cloud path) — one retry per chunk before giving up, matching the spec's "exhausts the existing retry/backoff after one retry" fallback trigger.

**Interfaces:**
- Consumes: `withRetry`, `createApiRetryStrategy`, `httpError` from `../../utils/retry` — the exact same import `audioManager.js` already uses (`import { withRetry, createApiRetryStrategy, httpError } from "../utils/retry";` at its top, one directory closer since `audioManager.js` lives in `src/helpers/` and this new file lives in `src/helpers/transports/`). `createApiRetryStrategy()` returns `{ shouldRetry }` only — the actual retry loop is the standalone `withRetry(fn, options)` function; pass `{ shouldRetry: strategy.shouldRetry, maxRetries: 1 }` into it (one retry, per the spec's "exhausts the existing retry/backoff after one retry"). Errors from a non-ok response must be thrown via `httpError(status, message)` so `shouldRetry` can classify them by status — a bare `new Error(...)` has no `.status` and `shouldRetry` treats it as a retryable network error, which is wrong for e.g. a 400.
- Produces: `createRestChunkTransport({ endpoint, buildFormData, fetchImpl })` → `{ submitSegment(index, arrayBuffer) }`. `buildFormData(arrayBuffer)` is injected (caller supplies the exact multipart shape — model, language, API key header, etc. — already used by the non-chunked path) so this module has zero provider-specific knowledge. Returns `Promise<{ index, text }>`.

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/transports/restChunkTransport.js");

test("posts each segment independently and returns indexed text", async () => {
  const { createRestChunkTransport } = await load();

  const calls = [];
  const fetchImpl = async (endpoint, opts) => {
    calls.push({ endpoint, opts });
    return {
      ok: true,
      json: async () => ({ text: `chunk-${calls.length}` }),
    };
  };

  const transport = createRestChunkTransport({
    endpoint: "http://localhost:20128/v1/audio/transcriptions",
    buildFormData: (buf) => new FormData(),
    fetchImpl,
  });

  const [r0, r1] = await Promise.all([
    transport.submitSegment(0, new ArrayBuffer(4)),
    transport.submitSegment(1, new ArrayBuffer(4)),
  ]);

  assert.deepEqual(
    [r0, r1].sort((a, b) => a.index - b.index),
    [
      { index: 0, text: "chunk-1" },
      { index: 1, text: "chunk-2" },
    ]
  );
  assert.equal(calls.length, 2);
});

test("retries once on a failed request before succeeding", async () => {
  const { createRestChunkTransport } = await load();

  let attempt = 0;
  const fetchImpl = async () => {
    attempt += 1;
    if (attempt === 1) {
      return { ok: false, status: 503, statusText: "Service Unavailable" };
    }
    return { ok: true, json: async () => ({ text: "recovered" }) };
  };

  const transport = createRestChunkTransport({
    endpoint: "http://localhost:20128/v1/audio/transcriptions",
    buildFormData: () => new FormData(),
    fetchImpl,
  });

  const result = await transport.submitSegment(0, new ArrayBuffer(4));
  assert.deepEqual(result, { index: 0, text: "recovered" });
  assert.equal(attempt, 2);
});

test("rejects after exhausting retries", async () => {
  const { createRestChunkTransport } = await load();

  const fetchImpl = async () => ({ ok: false, status: 500, statusText: "Server Error" });

  const transport = createRestChunkTransport({
    endpoint: "http://localhost:20128/v1/audio/transcriptions",
    buildFormData: () => new FormData(),
    fetchImpl,
  });

  await assert.rejects(transport.submitSegment(0, new ArrayBuffer(4)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/helpers/restChunkTransport.test.js`
Expected: FAIL — cannot find module `src/helpers/transports/restChunkTransport.js`

- [ ] **Step 3: Write minimal implementation**

```js
import { withRetry, createApiRetryStrategy, httpError } from "../../utils/retry";

export function createRestChunkTransport({ endpoint, buildFormData, fetchImpl = fetch }) {
  const { shouldRetry } = createApiRetryStrategy();

  async function postOnce(arrayBuffer) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      body: buildFormData(arrayBuffer),
    });
    if (!response.ok) {
      throw httpError(response.status, `Transcription chunk failed: ${response.status} ${response.statusText}`);
    }
    const payload = await response.json();
    return payload.text || "";
  }

  async function submitSegment(index, arrayBuffer) {
    // A short initialDelay, not the shared default multi-second backoff:
    // this is a live-dictation chunk, not a background API call, so a
    // one-off retry should stay fast or the speed benefit of chunking is
    // lost to the retry itself.
    const text = await withRetry(() => postOnce(arrayBuffer), {
      shouldRetry,
      maxRetries: 1,
      initialDelay: 200,
    });
    return { index, text };
  }

  return { submitSegment };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/helpers/restChunkTransport.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/helpers/transports/restChunkTransport.js test/helpers/restChunkTransport.test.js
git commit -m "feat: add per-segment REST chunk transport with retry"
```

---

### Task 5: WebSocketStreamTransport (BYOK, auth-independent)

**Files:**
- Modify: `src/helpers/audioManager.js` (add a new connection entry point alongside the existing streaming block, ~line 2660-2750)
- Test: `test/helpers/webSocketStreamTransport.test.js` (new, testing only the pure connection-URL/message-framing logic extracted for this task — not a live-socket integration test)
- Create: `src/helpers/transports/streamConnectionUrl.js` (pure URL-building logic extracted so it's testable without a real WebSocket)

**Context:** `audioManager.js`'s existing streaming block only connects when `this.sttConfig?.dictation?.mode === "streaming"`, and `sttConfig` is populated exclusively by the OpenWhispr-Cloud-authenticated `get-stt-config` IPC handler (`ipcHandlers.js` around line 6431) — dead for every user without a signed-in OpenWhispr Cloud account. This task does not touch that existing gated path (it stays as-is for the notes/meeting streaming feature). Instead it adds a second, independent way to reach the same `AudioWorkletNode`/`pcm-streaming-processor` PCM pipeline, connecting directly to a `streaming: true`-flagged provider's own WebSocket endpoint using the user's configured API key — no `sttConfig`, no OpenWhispr auth.

**Interfaces:**
- Produces (`streamConnectionUrl.js`): `buildStreamConnectionUrl({ provider, model, apiKey })` → a `wss://` URL string, pure and testable without opening a socket. Only `openai` is implemented in this task (the two `streaming: true` OpenAI models — `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`); an unsupported provider throws. Task 7's `selectTranscriptionTransportKind` takes an `isByokStreamingImplemented` predicate for exactly this reason — it returns `false` for Corti/Tinfoil Voxtral (both `streaming: true` in the registry but not wired here), so those fall back to `RestChunkTransport` instead of hitting this throw at runtime.

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/transports/streamConnectionUrl.js");

test("builds an OpenAI realtime transcription URL with the model and key", async () => {
  const { buildStreamConnectionUrl } = await load();

  const url = buildStreamConnectionUrl({
    provider: "openai",
    model: "gpt-4o-transcribe",
    apiKey: "sk-test-key",
  });

  assert.equal(
    url,
    "wss://api.openai.com/v1/realtime?intent=transcription&model=gpt-4o-transcribe"
  );
});

test("throws for a provider with no direct streaming URL implemented yet", async () => {
  const { buildStreamConnectionUrl } = await load();

  assert.throws(
    () => buildStreamConnectionUrl({ provider: "corti", model: "corti-transcribe", apiKey: "k" }),
    /not supported/i
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/helpers/webSocketStreamTransport.test.js`
Expected: FAIL — cannot find module `src/helpers/transports/streamConnectionUrl.js`

- [ ] **Step 3: Write minimal implementation**

```js
export function buildStreamConnectionUrl({ provider, model, apiKey }) {
  if (provider === "openai") {
    return `wss://api.openai.com/v1/realtime?intent=transcription&model=${encodeURIComponent(model)}`;
  }
  throw new Error(`Direct BYOK streaming not supported for provider: ${provider}`);
}
```

Note: the OpenAI Realtime WebSocket handshake requires the API key as a
protocol header (`Authorization: Bearer <key>` via the `Sec-WebSocket-Protocol`
subprotocol convention, since browser `WebSocket` cannot set arbitrary
headers) — read OpenAI's current Realtime API docs for the exact
subprotocol string before wiring the real connection in Step 5 below; do not
guess the header-passing mechanism.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/helpers/webSocketStreamTransport.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire into `audioManager.js`**

Read `audioManager.js`'s existing streaming block in full first (the code
around line 2660-2750 that sets up `AudioWorkletNode`, connects
`this.streamingProcessor.port.onmessage`, and handles
`streamingFinalText`/`streamingPartialText`). Add a new method,
`_startByokStream({ provider, model, apiKey })`, that reuses the same
`AudioWorkletNode` setup and message-port wiring but opens its WebSocket via
`buildStreamConnectionUrl` instead of going through `sttConfig`. This step
has no isolated unit test (it requires a live `AudioContext`/`WebSocket`,
which is why `streamConnectionUrl.js` was extracted as the testable piece);
verify it manually in Task 9's end-to-end check instead.

- [ ] **Step 6: Commit**

```bash
git add src/helpers/transports/streamConnectionUrl.js test/helpers/webSocketStreamTransport.test.js src/helpers/audioManager.js
git commit -m "feat: add BYOK-direct WebSocket streaming transport, independent of OpenWhispr Cloud auth"
```

---

### Task 6: FallbackBufferRecorder

**Files:**
- Create: `src/helpers/fallbackBufferRecorder.js`
- Test: `test/helpers/fallbackBufferRecorder.test.js`

**Context:** Mirrors the existing `streamingFallbackRecorder` pattern already in `audioManager.js` (a parallel `MediaRecorder` capturing the whole session, used today only for the dead streaming-mode path). This task extracts that pattern into a standalone, reusable module so it can back every transport (local, REST, WebSocket), not just the notes-streaming path.

**Interfaces:**
- Produces: `createFallbackBufferRecorder({ mediaRecorderFactory })` → `{ start(stream), stop() }`. `start(stream)` begins recording into an internal chunk array (`mediaRecorderFactory` defaults to `(stream) => new MediaRecorder(stream)`, injected for testing). `stop()` returns `Promise<Blob>` resolving with the full-session audio once the recorder's `stop` event fires — same shape as `audioManager.js`'s existing `lastAudioBlob` assembly.

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/fallbackBufferRecorder.js");

test("start/stop resolves with a Blob built from recorded chunks", async () => {
  const { createFallbackBufferRecorder } = await load();

  let dataAvailableCb;
  let stopCb;
  const fakeRecorder = {
    start() {},
    stop() {
      stopCb();
    },
    set ondataavailable(cb) {
      dataAvailableCb = cb;
    },
    set onstop(cb) {
      stopCb = cb;
    },
    mimeType: "audio/webm",
  };

  const recorder = createFallbackBufferRecorder({
    mediaRecorderFactory: () => fakeRecorder,
  });

  recorder.start({});
  dataAvailableCb({ data: new Blob(["chunk-a"]), size: 7 });
  dataAvailableCb({ data: new Blob(["chunk-b"]), size: 7 });

  const blobPromise = recorder.stop();
  const blob = await blobPromise;

  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, "audio/webm");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/helpers/fallbackBufferRecorder.test.js`
Expected: FAIL — cannot find module `src/helpers/fallbackBufferRecorder.js`

- [ ] **Step 3: Write minimal implementation**

```js
export function createFallbackBufferRecorder({
  mediaRecorderFactory = (stream) => new MediaRecorder(stream),
} = {}) {
  let recorder = null;
  let chunks = [];

  function start(stream) {
    chunks = [];
    recorder = mediaRecorderFactory(stream);
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.start();
  }

  function stop() {
    return new Promise((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.stop();
    });
  }

  return { start, stop };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/helpers/fallbackBufferRecorder.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/helpers/fallbackBufferRecorder.js test/helpers/fallbackBufferRecorder.test.js
git commit -m "feat: extract reusable full-session fallback buffer recorder"
```

---

### Task 7: Transport selection

**Files:**
- Create: `src/helpers/transports/selectTranscriptionTransport.js`
- Test: `test/helpers/selectTranscriptionTransport.test.js`

**Context:** Picks a transport once per dictation, automatically, from data that already exists: `useLocalWhisper`/`localTranscriptionProvider` settings (local case) and the model registry's `streaming` flag (`src/models/modelRegistryData.json`, read via `getTranscriptionProvider`/model lookup already used elsewhere in `TranscriptionModelPicker.tsx`). This is pure selection logic — it returns a transport *kind* string, not a constructed transport instance, so Task 8 can build the real transport (which needs live IPC/fetch/WebSocket dependencies this pure function must not touch).

**Interfaces:**
- Consumes: nothing from other tasks (pure decision logic operating on plain data).
- Produces: `selectTranscriptionTransportKind({ useLocalWhisper, localTranscriptionProvider, cloudModel, isModelStreamingCapable, isByokStreamingImplemented })` → `"local" | "websocket" | "rest"`. `isModelStreamingCapable` and `isByokStreamingImplemented` are injected booleans/predicates (not read from the registry directly here) so the pure decision table is testable without importing the registry.

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/transports/selectTranscriptionTransport.js");

test("picks local transport when local whisper is active", async () => {
  const { selectTranscriptionTransportKind } = await load();

  const kind = selectTranscriptionTransportKind({
    useLocalWhisper: true,
    localTranscriptionProvider: "whisper",
    cloudModel: null,
    isModelStreamingCapable: () => false,
    isByokStreamingImplemented: () => false,
  });

  assert.equal(kind, "local");
});

test("picks websocket transport for a streaming-capable, implemented cloud model", async () => {
  const { selectTranscriptionTransportKind } = await load();

  const kind = selectTranscriptionTransportKind({
    useLocalWhisper: false,
    localTranscriptionProvider: null,
    cloudModel: "gpt-4o-transcribe",
    isModelStreamingCapable: (model) => model === "gpt-4o-transcribe",
    isByokStreamingImplemented: (model) => model === "gpt-4o-transcribe",
  });

  assert.equal(kind, "websocket");
});

test("falls back to rest for a streaming-flagged model with no implemented connection yet", async () => {
  const { selectTranscriptionTransportKind } = await load();

  const kind = selectTranscriptionTransportKind({
    useLocalWhisper: false,
    localTranscriptionProvider: null,
    cloudModel: "corti-transcribe",
    isModelStreamingCapable: (model) => model === "corti-transcribe",
    isByokStreamingImplemented: () => false,
  });

  assert.equal(kind, "rest");
});

test("picks rest transport for a plain non-streaming cloud model", async () => {
  const { selectTranscriptionTransportKind } = await load();

  const kind = selectTranscriptionTransportKind({
    useLocalWhisper: false,
    localTranscriptionProvider: null,
    cloudModel: "whisper-1",
    isModelStreamingCapable: () => false,
    isByokStreamingImplemented: () => false,
  });

  assert.equal(kind, "rest");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/helpers/selectTranscriptionTransport.test.js`
Expected: FAIL — cannot find module `src/helpers/transports/selectTranscriptionTransport.js`

- [ ] **Step 3: Write minimal implementation**

```js
export function selectTranscriptionTransportKind({
  useLocalWhisper,
  localTranscriptionProvider,
  cloudModel,
  isModelStreamingCapable,
  isByokStreamingImplemented,
}) {
  if (useLocalWhisper) {
    return "local";
  }
  if (isModelStreamingCapable(cloudModel) && isByokStreamingImplemented(cloudModel)) {
    return "websocket";
  }
  return "rest";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/helpers/selectTranscriptionTransport.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/helpers/transports/selectTranscriptionTransport.js test/helpers/selectTranscriptionTransport.test.js
git commit -m "feat: add pure transport-selection decision logic"
```

---

### Task 8: Wire SegmentScheduler into `audioManager.js`

**Files:**
- Modify: `src/helpers/audioManager.js` — constructor (~line 211-270), `startRecording()` (~line 500-575), `processAudio()` (~line 730-760)
- Test: `test/helpers/segmentDispatchCoordinator.test.js` (new — tests the scheduling glue logic in isolation via dependency injection, not a full `AudioManager` integration test)

**Context:** This is the integration task that connects Tasks 1-7. Read `audioManager.js`'s current `startRecording()` and `processAudio()` in full before editing (line numbers above are approximate — this file has changed shape across recent sessions; confirm current line numbers rather than trusting these). The existing `_silenceInterval` callback (inside `startRecording()`) already computes `rms`/`peak` per 100ms window and calls `recordLocalSpeechWindow(this._localSpeechGateState, rms, peak)` — add a second call in that same callback, `recordBoundaryWindow(this._segmentBoundaryState, rms)` (Task 2), and when it returns `true`, cut a segment from the audio captured since the last cut and hand it to the active transport (selected once at recording start via Task 7's `selectTranscriptionTransportKind`, then constructed via Task 3/4/5's `create*Transport`). `FallbackBufferRecorder` (Task 6) starts alongside the primary `MediaRecorder` in the same method, on the same `stream`.

On hotkey release (`stopRecording()`), force-cut whatever's left since the last boundary as the final segment, then wait for `SegmentStitcher.isComplete()` (bounded by the existing single-request timeout already used for non-chunked calls) before calling into `processTranscription` exactly as today. Any transport rejection at any point: stop cutting further segments, call `FallbackBufferRecorder.stop()`, and route that Blob through the existing non-chunked `processWithLocalWhisper`/cloud call — the same method already used today, unmodified.

**Interfaces:**
- Consumes: `createSegmentStitcher` (Task 1), `createSegmentBoundaryState`/`recordBoundaryWindow`/`resetBoundaryState` (Task 2), `createLocalPipelineTransport`/`createRestChunkTransport` (Tasks 3-4), `selectTranscriptionTransportKind` (Task 7), `createFallbackBufferRecorder` (Task 6).
- Produces: no new public API — this task's deliverable is `audioManager.js` producing the same `onTranscriptionComplete` shape it does today, just faster.

- [ ] **Step 1: Write the failing test**

Test the scheduling glue as a standalone function extracted for this purpose — do not attempt to test the full `AudioManager` class end-to-end (it depends on live `MediaRecorder`/`AudioContext`, which Task 5 already established isn't unit-testable). Extract the cut-and-dispatch decision into a small pure-ish coordinator function first:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/segmentDispatchCoordinator.js");

test("dispatches a segment to the transport and records the result in the stitcher", async () => {
  const { createSegmentDispatchCoordinator } = await load();
  const { createSegmentStitcher } = await import("../../src/helpers/segmentStitcher.js");

  const stitcher = createSegmentStitcher();
  const dispatched = [];
  const transport = {
    submitSegment: async (index, buffer) => {
      dispatched.push(index);
      return { index, text: `text-${index}` };
    },
  };

  const coordinator = createSegmentDispatchCoordinator({ stitcher, transport });

  await coordinator.dispatchSegment(new ArrayBuffer(4));
  await coordinator.dispatchSegment(new ArrayBuffer(4));

  assert.deepEqual(dispatched, [0, 1]);
  assert.equal(stitcher.isComplete(2), true);
  assert.equal(stitcher.getStitchedText(), "text-0 text-1");
});

test("propagates a transport rejection so the caller can trigger fallback", async () => {
  const { createSegmentDispatchCoordinator } = await load();
  const { createSegmentStitcher } = await import("../../src/helpers/segmentStitcher.js");

  const stitcher = createSegmentStitcher();
  const transport = {
    submitSegment: async () => {
      throw new Error("transport down");
    },
  };

  const coordinator = createSegmentDispatchCoordinator({ stitcher, transport });

  await assert.rejects(coordinator.dispatchSegment(new ArrayBuffer(4)), /transport down/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/helpers/segmentDispatchCoordinator.test.js`
Expected: FAIL — cannot find module `src/helpers/segmentDispatchCoordinator.js`

- [ ] **Step 3: Write minimal implementation**

```js
export function createSegmentDispatchCoordinator({ stitcher, transport }) {
  let nextIndex = 0;

  async function dispatchSegment(arrayBuffer) {
    const index = nextIndex;
    nextIndex += 1;
    const result = await transport.submitSegment(index, arrayBuffer);
    stitcher.addResult(result.index, result.text);
    return result;
  }

  return { dispatchSegment };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/helpers/segmentDispatchCoordinator.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire into `audioManager.js`**

With `segmentDispatchCoordinator.js` as the tested glue, now edit
`startRecording()`/`processAudio()`/`stopRecording()` in `audioManager.js`:

1. In `startRecording()`, after building the audio `stream`, construct the
   transport via `selectTranscriptionTransportKind(...)` plus the matching
   `create*Transport(...)`, create a `createSegmentStitcher()` and
   `createSegmentDispatchCoordinator({ stitcher, transport })`, and start
   `createFallbackBufferRecorder().start(stream)` alongside the primary
   `MediaRecorder`.
2. In the existing `_silenceInterval` callback, after the existing
   `recordLocalSpeechWindow(...)` call, add
   `recordBoundaryWindow(this._segmentBoundaryState, rms)`; on `true`, slice
   the accumulated `audioChunks` since the last cut into a Blob, convert to
   `ArrayBuffer`, call `coordinator.dispatchSegment(arrayBuffer)`, and
   `resetBoundaryState(this._segmentBoundaryState)`.
3. In `stopRecording()`'s existing `onstop` handler, force-cut any
   remaining audio as the final segment, await
   `stitcher.isComplete(finalSegmentCount)`, then call
   `processTranscription(stitcher.getStitchedText(), source)` — the exact
   function already used today — instead of the current full-Blob
   transcription call.
4. Wrap the whole per-dictation transport lifecycle in a `try`/`catch`: on
   any rejection from `dispatchSegment`, stop cutting further segments, call
   `fallbackRecorder.stop()`, and route that Blob through today's existing
   `processWithLocalWhisper`/cloud call unchanged.

This step has no new isolated unit test beyond Step 1's coordinator test —
verify it manually in Task 9.

- [ ] **Step 6: Run the full test suite**

Run: `npm run test:main && npm run test:ui && npm run typecheck && npm run lint`
Expected: all green, no regressions in existing `audioManager`-adjacent tests.

- [ ] **Step 7: Commit**

```bash
git add src/helpers/segmentDispatchCoordinator.js test/helpers/segmentDispatchCoordinator.test.js src/helpers/audioManager.js
git commit -m "feat: wire VAD-gated progressive transcription into the dictation recording flow"
```

---

### Task 9: End-to-end verification

**Files:** none created — verification only.

- [ ] **Step 1: Automated suite**

Run: `npm run test:main && npm run test:ui && npm run typecheck && npm run lint && npm run build:renderer`
Expected: all green.

- [ ] **Step 2: Manual — local whisper**

`npm run dev`, select local whisper, dictate a 2-3 sentence phrase with a
natural pause in the middle. Confirm: pasted text matches what a non-chunked
dictation of the same phrase would produce (accuracy parity — compare
against dictating the same phrase before this change if unsure), and that
debug logs (`OPENWHISPR_LOG_LEVEL=debug`) show more than one
`transcribeLocalWhisper` IPC call for that single dictation, with the second
call's `initialPrompt` containing the first segment's text.

- [ ] **Step 3: Manual — custom REST endpoint**

Configure a custom OpenAI-compatible transcription endpoint (matches the
original bug report's setup). Dictate the same test phrase. Confirm the
network tab (or debug logs) shows multiple `/audio/transcriptions` POSTs for
one dictation, and the final pasted text is correctly ordered and complete.

- [ ] **Step 4: Manual — fallback path**

While dictating against the custom REST endpoint, stop the local server
mid-dictation (or point the endpoint at an unreachable port) to force a
chunk failure. Confirm: no error toast appears, the dictation still
completes via the fallback full-buffer resend, and the pasted text is
correct (just not faster than today for that one take).

- [ ] **Step 5: Timing comparison**

Using the existing `[startup]`/pipeline timing debug logs
(`docs/optimization.md`'s established baseline-recording convention),
record hotkey-release-to-paste latency for a ~10-second local-whisper
dictation before and after this change, and add the result to
`docs/optimization.md`'s backlog/results section alongside the existing
prewarm baseline entry.

- [ ] **Step 6: Update CLAUDE.md**

`CLAUDE.md`'s "whisper.cpp Integration" section currently describes local
transcription as one call per recording. Add a short note (matching this
file's existing terse, factual style — see how the VAD-prewarm fix was
documented there) describing that dictation now transcribes in VAD-gated
segments across three transport kinds, so future sessions don't rediscover
this architecture from scratch the way the streaming-mode dead-code gate
had to be rediscovered this session.
