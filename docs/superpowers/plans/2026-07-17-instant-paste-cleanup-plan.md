# Instant Paste for Local Dictation Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste the raw local-ASR transcript the instant it's ready, then silently replace it in place with the cleaned-up version once the cleanup LLM call finishes — so local dictation feels instant instead of waiting for transcribe+cleanup combined.

**Architecture:** `AudioManager` gains a new `onRawTranscriptReady` callback fired from `processWithLocalWhisper`/`processWithLocalParakeet` right after ASR succeeds, but only when the dictation is sync-predicted to land on the `cleanup` reasoning route (never `agent`). The renderer hook (`useAudioRecording.js`) pastes the raw text immediately on that callback and remembers a "pending replace" record (raw text, a per-dictation id, and the foreground app at paste time). When the existing `onTranscriptionComplete` callback later delivers the cleaned text, a new pure decision function decides — using four guardrails — whether to replace the already-pasted raw text via backspace-then-paste, or leave it as final.

**Tech Stack:** Existing Electron IPC (`preload.js` / `ipcHandlers.js`), existing per-platform clipboard/key-injection code in `src/helpers/clipboard.js` (PowerShell SendKeys on Windows, `osascript` on macOS, `xdotool`/`wtype`/`ydotool` on Linux) — no new native binaries, no new dependencies.

## Global Constraints

- Applies only to the `cleanup` reasoning route, for local whisper and local parakeet dictation. Never the `agent` route or the Auto-Apply-Transform overlay path.
- On by default wherever cleanup is enabled and auto-paste is enabled. No new setting, no new i18n strings.
- Requires `autoPasteEnabled`. If off, behavior is unchanged (today's clipboard-only path).
- No new native binaries — backspace injection reuses each platform's existing shell-level key-injection tool (PowerShell SendKeys, `osascript`, `xdotool`/`wtype`/`ydotool`), not the compiled fast-paste binaries.
- `npm run typecheck`, `npm test`, `npm run lint` must stay green after every task.

---

## File Structure

- **Create** `src/helpers/instantPasteDecision.js` — one pure function, `shouldAttemptReplace(...)`, no I/O.
- **Create** `test/helpers/instantPasteDecision.test.js` — unit tests for that function.
- **Modify** `src/helpers/audioManager.js` — extract a sync route-kind pre-check, add a `dictationId` counter, add the `onRawTranscriptReady` callback, wire it into both local-ASR methods.
- **Modify** `src/helpers/clipboard.js` — add `sendBackspaces(count)`, cross-platform, mirroring existing paste code style.
- **Modify** `preload.js` — bridge `sendBackspaces`.
- **Modify** `src/types/electron.ts` — type for `sendBackspaces`.
- **Modify** `src/helpers/ipcHandlers.js` — add `send-backspaces` IPC handler.
- **Modify** `src/hooks/useAudioRecording.js` — wire `onRawTranscriptReady`, hold the pending-replace ref, do the replace-or-leave decision when the cleaned result arrives.

---

### Task 1: Pure replace-decision function

**Files:**
- Create: `src/helpers/instantPasteDecision.js`
- Test: `test/helpers/instantPasteDecision.test.js`

**Interfaces:**
- Produces: `shouldAttemptReplace({ autoPasteEnabled, textChanged, dictationIdMatches, foregroundAppMatches }) => boolean` — all four params required booleans, all four must be `true` for a `true` result.

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/instantPasteDecision.js");

test("replaces when every guardrail passes", async () => {
  const { shouldAttemptReplace } = await load();
  assert.equal(
    shouldAttemptReplace({
      autoPasteEnabled: true,
      textChanged: true,
      dictationIdMatches: true,
      foregroundAppMatches: true,
    }),
    true
  );
});

test("skips replace when auto-paste is off", async () => {
  const { shouldAttemptReplace } = await load();
  assert.equal(
    shouldAttemptReplace({
      autoPasteEnabled: false,
      textChanged: true,
      dictationIdMatches: true,
      foregroundAppMatches: true,
    }),
    false
  );
});

test("skips replace when cleanup made no change", async () => {
  const { shouldAttemptReplace } = await load();
  assert.equal(
    shouldAttemptReplace({
      autoPasteEnabled: true,
      textChanged: false,
      dictationIdMatches: true,
      foregroundAppMatches: true,
    }),
    false
  );
});

test("skips replace when a newer dictation has started (stale result)", async () => {
  const { shouldAttemptReplace } = await load();
  assert.equal(
    shouldAttemptReplace({
      autoPasteEnabled: true,
      textChanged: true,
      dictationIdMatches: false,
      foregroundAppMatches: true,
    }),
    false
  );
});

test("skips replace when the foreground app changed since the raw paste", async () => {
  const { shouldAttemptReplace } = await load();
  assert.equal(
    shouldAttemptReplace({
      autoPasteEnabled: true,
      textChanged: true,
      dictationIdMatches: true,
      foregroundAppMatches: false,
    }),
    false
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/helpers/instantPasteDecision.test.js`
Expected: FAIL — cannot find module `src/helpers/instantPasteDecision.js`

- [ ] **Step 3: Write minimal implementation**

```js
// src/helpers/instantPasteDecision.js
// Guardrails before replacing an already-pasted raw transcript with the
// cleaned-up version. All four must hold; if any fails, the raw paste
// simply stays as the final pasted text.
function shouldAttemptReplace({
  autoPasteEnabled,
  textChanged,
  dictationIdMatches,
  foregroundAppMatches,
}) {
  return !!(autoPasteEnabled && textChanged && dictationIdMatches && foregroundAppMatches);
}

module.exports = { shouldAttemptReplace };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/helpers/instantPasteDecision.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/helpers/instantPasteDecision.js test/helpers/instantPasteDecision.test.js
git commit -m "feat: add pure decision function for instant-paste replace guardrails"
```

---

### Task 2: Sync route-kind pre-check + dictationId in AudioManager

**Files:**
- Modify: `src/helpers/audioManager.js:56-122` (resolveReasoningRoute), `:195-252` (constructor), `:307-319` (setCallbacks), `:694` (processAudio)

**Interfaces:**
- Produces: `AudioManager#onRawTranscriptReady` callback field, settable via `setCallbacks({ onRawTranscriptReady })`. Called as `onRawTranscriptReady({ text, dictationId, foregroundApp })` where `foregroundApp` is the raw object from `getForegroundApp()` (has `.app`), not the formatted string.
- Produces: `AudioManager#_dictationSeq` (number, starts at 0) and a `dictationId` value (the post-increment value) threaded into `processWithLocalWhisper`/`processWithLocalParakeet` and included in their returned result objects as `result.dictationId`.
- Produces: exported pure function `computeSyncRouteKind(text, settings, agentName, voiceAgentRequested)` returning `"agent" | "cleanup" | "skip"`, used both by the new pre-check and refactored into `resolveReasoningRoute`.
- Consumes: existing `resolveDictationRouteKind`, `dictationAgentReachable`, `detectAgentName`, `isCloudCleanupMode` (already imported in this file).

This task has no isolated unit test of its own (it's a refactor + wiring inside a class that already has no direct test file) — verified via the existing `node --test` suite staying green and via Task 4's manual smoke check. Task 1's function is what's independently testable.

- [ ] **Step 1: Extract `computeSyncRouteKind` and refactor `resolveReasoningRoute` to use it**

Replace lines 56-75 of `src/helpers/audioManager.js` (the top of `resolveReasoningRoute`, up to and including the `resolveDictationRouteKind(...)` call) with:

```js
// Pure, synchronous route-kind decision — no prompt-building, no async model
// lookups. Shared by resolveReasoningRoute (full config-building) and the
// instant-paste eligibility pre-check in processWithLocalWhisper/Parakeet,
// which needs to know "will this be cleanup?" before the async
// isReasoningAvailable() check even runs.
export function computeSyncRouteKind(text, settings, agentName, voiceAgentRequested) {
  const cleanupReachable =
    !!settings.useCleanupModel && (!!settings.cleanupModel?.trim() || isCloudCleanupMode());
  const agentModel = settings.dictationAgentModel?.trim() || "";
  const isCloudAgent = isCloudDictationAgentMode();
  const isSelfHostedAgent =
    settings.dictationAgentMode === "self-hosted" && !!settings.dictationAgentRemoteUrl?.trim();
  const agentReachable = resolveDictationAgentReachability({
    useDictationAgent: settings.useDictationAgent,
    dictationAgentModel: agentModel,
    isCloudAgent,
    isSelfHostedAgent,
  });
  return resolveDictationRouteKind({
    cleanupReachable,
    agentReachable,
    agentInvoked: !!agentName && detectAgentName(text, agentName),
    voiceAgentRequested,
  });
}

function resolveReasoningRoute(text, settings, agentName, voiceAgentRequested, activeApp) {
  const cleanupReachable =
    !!settings.useCleanupModel && (!!settings.cleanupModel?.trim() || isCloudCleanupMode());
  const agentModel = settings.dictationAgentModel?.trim() || "";
  const isCloudAgent = isCloudDictationAgentMode();
  const isSelfHostedAgent =
    settings.dictationAgentMode === "self-hosted" && !!settings.dictationAgentRemoteUrl?.trim();
  const kind = computeSyncRouteKind(text, settings, agentName, voiceAgentRequested);
```

(The rest of `resolveReasoningRoute`, from the `if (kind === "agent")` line onward at the old line 76, is unchanged — it still reads `agentModel`, `isCloudAgent`, `isSelfHostedAgent` from the local `const`s above, which are still declared here since the config-building branches need them.)

- [ ] **Step 2: Add `_dictationSeq` field**

In the constructor (`src/helpers/audioManager.js:195-252`), add one line after `this._localSpeechGateState = null;` (the last line of the constructor body):

```js
    this._localSpeechGateState = null;
    this._dictationSeq = 0;
```

- [ ] **Step 3: Add the `onRawTranscriptReady` callback field and setter**

In the constructor, next to `this.onPartialTranscript = null;` (line 204):

```js
    this.onPartialTranscript = null;
    this.onRawTranscriptReady = null;
```

In `setCallbacks` (lines 307-319), add the param and assignment:

```js
  setCallbacks({
    onStateChange,
    onError,
    onTranscriptionComplete,
    onPartialTranscript,
    onRawTranscriptReady,
    onStreamingCommit,
  }) {
    this.onStateChange = onStateChange;
    this.onError = onError;
    this.onTranscriptionComplete = onTranscriptionComplete;
    this.onPartialTranscript = onPartialTranscript;
    this.onRawTranscriptReady = onRawTranscriptReady;
    this.onStreamingCommit = onStreamingCommit;
  }
```

- [ ] **Step 4: Assign a `dictationId` per dictation in `processAudio`**

In `processAudio` (`src/helpers/audioManager.js:694`), find the branch that dispatches to the local methods (originally lines 744-751):

```js
      let result;
      let activeModel;
      if (useLocalWhisper) {
        if (localProvider === "nvidia") {
          activeModel = parakeetModel;
          result = await this.processWithLocalParakeet(audioBlob, parakeetModel, metadata);
        } else {
          activeModel = whisperModel;
          result = await this.processWithLocalWhisper(audioBlob, whisperModel, metadata);
        }
      } else if (isOpenWhisprCloudMode) {
```

Replace with (adds one `dictationId` line and threads it through):

```js
      const dictationId = ++this._dictationSeq;

      let result;
      let activeModel;
      if (useLocalWhisper) {
        if (localProvider === "nvidia") {
          activeModel = parakeetModel;
          result = await this.processWithLocalParakeet(audioBlob, parakeetModel, metadata, dictationId);
        } else {
          activeModel = whisperModel;
          result = await this.processWithLocalWhisper(audioBlob, whisperModel, metadata, dictationId);
        }
      } else if (isOpenWhisprCloudMode) {
```

- [ ] **Step 5: Fire `onRawTranscriptReady` from `processWithLocalWhisper`**

In `processWithLocalWhisper` (`src/helpers/audioManager.js:837`), change the signature and the block that computes `rawText`:

```js
  async processWithLocalWhisper(audioBlob, model = "base", metadata = {}, dictationId = null) {
```

Then replace this block (originally lines 880-893):

```js
      if (result.success && result.text) {
        if (this.isDictionaryEcho(result.text)) {
          throw new Error("No audio detected");
        }
        const rawText = result.text;
        const reasoningStart = performance.now();
        const text = await this.processTranscription(result.text, "local");
        timings.reasoningProcessingDurationMs = Math.round(performance.now() - reasoningStart);

        if (text !== null && text !== undefined) {
          return { success: true, text: text || result.text, rawText, source: "local", timings };
        } else {
          throw new Error("No text transcribed");
        }
      } else if (result.success === false && result.message === "No audio detected") {
```

with:

```js
      if (result.success && result.text) {
        if (this.isDictionaryEcho(result.text)) {
          throw new Error("No audio detected");
        }
        const rawText = result.text;
        const instantPasteEligible = await this._maybeFireInstantPaste(rawText, dictationId);
        const reasoningStart = performance.now();
        const text = await this.processTranscription(result.text, "local");
        timings.reasoningProcessingDurationMs = Math.round(performance.now() - reasoningStart);

        if (text !== null && text !== undefined) {
          return {
            success: true,
            text: text || result.text,
            rawText,
            source: "local",
            timings,
            dictationId,
            instantPasteEligible,
          };
        } else {
          throw new Error("No text transcribed");
        }
      } else if (result.success === false && result.message === "No audio detected") {
```

- [ ] **Step 6: Same wiring for `processWithLocalParakeet`**

In `processWithLocalParakeet` (`src/helpers/audioManager.js:921`), change the signature:

```js
  async processWithLocalParakeet(audioBlob, model = "parakeet-tdt-0.6b-v3", metadata = {}, dictationId = null) {
```

Replace this block (originally lines 952-966):

```js
      if (result.success && result.text) {
        const rawText = result.text;
        const reasoningStart = performance.now();
        const text = await this.processTranscription(result.text, "local-parakeet");
        timings.reasoningProcessingDurationMs = Math.round(performance.now() - reasoningStart);

        if (text !== null && text !== undefined) {
          return {
            success: true,
            text: text || result.text,
            rawText,
            source: "local-parakeet",
            timings,
          };
        } else {
          throw new Error("No text transcribed");
        }
      } else if (result.success === false && result.message === "No audio detected") {
```

with:

```js
      if (result.success && result.text) {
        const rawText = result.text;
        const instantPasteEligible = await this._maybeFireInstantPaste(rawText, dictationId);
        const reasoningStart = performance.now();
        const text = await this.processTranscription(result.text, "local-parakeet");
        timings.reasoningProcessingDurationMs = Math.round(performance.now() - reasoningStart);

        if (text !== null && text !== undefined) {
          return {
            success: true,
            text: text || result.text,
            rawText,
            source: "local-parakeet",
            timings,
            dictationId,
            instantPasteEligible,
          };
        } else {
          throw new Error("No text transcribed");
        }
      } else if (result.success === false && result.message === "No audio detected") {
```

- [ ] **Step 7: Add the shared `_maybeFireInstantPaste` helper**

Add this method right above `processWithLocalWhisper` (before line 837):

```js
  // Fires onRawTranscriptReady when this dictation is eligible for the
  // instant-paste flow (auto-paste on, and — cheaply, synchronously —
  // predicted to land on the cleanup route rather than agent/skip). Returns
  // whether it fired, so the caller can tag its result for the renderer.
  async _maybeFireInstantPaste(rawText, dictationId) {
    if (dictationId == null || !this.onRawTranscriptReady) return false;
    const settings = getSettings();
    if (!settings.autoPasteEnabled) return false;

    const agentName =
      typeof window !== "undefined" && window.localStorage
        ? localStorage.getItem("agentName") || null
        : null;
    const kind = computeSyncRouteKind(rawText, settings, agentName, this.voiceAgentRequested);
    if (kind !== "cleanup") return false;

    const foregroundApp = (await this.foregroundAppPromise) || null;
    this.onRawTranscriptReady({ text: rawText, dictationId, foregroundApp });
    return true;
  }

  async processWithLocalWhisper(audioBlob, model = "base", metadata = {}, dictationId = null) {
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS — existing suites (145 node tests + 4 vitest) unaffected; new `computeSyncRouteKind` export doesn't change any existing behavior since `resolveReasoningRoute`'s external behavior is identical.

- [ ] **Step 9: Commit**

```bash
git add src/helpers/audioManager.js
git commit -m "feat: add dictationId tracking and instant-paste eligibility hook to AudioManager"
```

---

### Task 3: Cross-platform backspace injection

**Files:**
- Modify: `src/helpers/clipboard.js` (add `sendBackspaces` near the existing `pasteText`/`_pasteText` methods, e.g. after line 827)
- Modify: `preload.js:33` (add bridge next to `pasteText`)
- Modify: `src/types/electron.ts:481-488` (add type next to `pasteText`)
- Modify: `src/helpers/ipcHandlers.js:1575` (add `send-backspaces` handler next to `paste-text`)

**Interfaces:**
- Produces: `ClipboardManager#sendBackspaces(count)` → `Promise<void>`, resolves once the backspace keystrokes have been dispatched (best-effort — does not reject on failure, only logs, matching the spec's "log a warning, do not retry" error-handling rule).
- Produces: `window.electronAPI.sendBackspaces(count: number) => Promise<void>` renderer bridge.

- [ ] **Step 1: Add `sendBackspaces` to `ClipboardManager`**

Add this method in `src/helpers/clipboard.js` right after the closing brace of `_pasteText` (after line 827):

```js
  // Best-effort backspace injection for the instant-paste replace flow.
  // Reuses each platform's existing shell-level key-injection tool (not the
  // compiled fast-paste binaries, which only know how to send Ctrl+V/Cmd+V) —
  // no new native binaries. Never throws: a failed replace just leaves the
  // raw-pasted text in place, per the design's error-handling rule.
  async sendBackspaces(count) {
    if (!count || count <= 0) return;
    const platform = process.platform;
    try {
      if (platform === "darwin") {
        await this._sendBackspacesMacOS(count);
      } else if (platform === "win32") {
        await this._sendBackspacesWindows(count);
      } else {
        await this._sendBackspacesLinux(count);
      }
    } catch (error) {
      this.safeLog("âŒ sendBackspaces failed", { platform, count, error: error.message });
    }
  }

  _sendBackspacesMacOS(count) {
    return new Promise((resolve, reject) => {
      const script = `tell application "System Events"\n repeat ${count} times\n key code 51\n end repeat\nend tell`;
      const proc = spawn("osascript", ["-e", script]);
      let stderr = "";
      proc.stderr.on("data", (d) => (stderr += d.toString()));
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`osascript backspace exited ${code}: ${stderr.trim()}`));
      });
      proc.on("error", reject);
    });
  }

  _sendBackspacesWindows(count) {
    return new Promise((resolve, reject) => {
      const proc = spawn("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');[System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE ${count}}')`,
      ]);
      let stderr = "";
      proc.stderr.on("data", (d) => (stderr += d.toString()));
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`PowerShell backspace exited ${code}: ${stderr.trim()}`));
      });
      proc.on("error", reject);
    });
  }

  _sendBackspacesLinux(count) {
    return new Promise((resolve, reject) => {
      let cmd;
      let args;
      if (this.commandExists("xdotool")) {
        cmd = "xdotool";
        args = ["key", "--repeat", String(count), "--delay", "0", "BackSpace"];
      } else if (this.commandExists("wtype")) {
        cmd = "wtype";
        args = Array(count).fill(["-k", "BackSpace"]).flat();
      } else if (this.commandExists("ydotool") && this._isYdotoolDaemonRunning()) {
        cmd = "ydotool";
        args = ["key", ...Array(count).fill("14:1", "14:0").flat()];
      } else {
        reject(new Error("No Linux key-injection tool available for backspace"));
        return;
      }
      const proc = spawn(cmd, args);
      let stderr = "";
      proc.stderr.on("data", (d) => (stderr += d.toString()));
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${cmd} backspace exited ${code}: ${stderr.trim()}`));
      });
      proc.on("error", reject);
    });
  }
```

- [ ] **Step 2: Add the preload bridge**

In `preload.js`, next to line 33:

```js
  pasteText: (text, options) => ipcRenderer.invoke("paste-text", text, options),
  sendBackspaces: (count) => ipcRenderer.invoke("send-backspaces", count),
```

- [ ] **Step 3: Add the type**

In `src/types/electron.ts`, next to the `pasteText` type (after line 488):

```ts
      sendBackspaces: (count: number) => Promise<void>;
```

- [ ] **Step 4: Add the IPC handler**

In `src/helpers/ipcHandlers.js`, right after the `paste-text` handler closes (after line 1625):

```js
    ipcMain.handle("send-backspaces", async (_event, count) => {
      await this.clipboardManager.sendBackspaces(count);
    });
```

- [ ] **Step 5: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/helpers/clipboard.js preload.js src/types/electron.ts src/helpers/ipcHandlers.js
git commit -m "feat: add cross-platform backspace injection for instant-paste replace"
```

---

### Task 4: Wire the renderer hook

**Files:**
- Modify: `src/hooks/useAudioRecording.js:185-292` (the `setCallbacks` block)

**Interfaces:**
- Consumes: `AudioManager#setCallbacks({ onRawTranscriptReady })` from Task 2; `window.electronAPI.sendBackspaces(count)` and `window.electronAPI.pasteText(text, options)` from Task 3; `shouldAttemptReplace(...)` from Task 1.

- [ ] **Step 1: Add a pending-replace ref and the `onRawTranscriptReady` callback**

Near the top of the component/hook body (wherever other `useRef`s for this hook are declared, alongside `audioManagerRef`), add:

```js
  const pendingInstantPasteRef = useRef(null);
```

In the `setCallbacks({...})` call (`src/hooks/useAudioRecording.js:185`), add the new callback alongside the existing ones:

```js
      onRawTranscriptReady: async ({ text, dictationId, foregroundApp }) => {
        pendingInstantPasteRef.current = { rawText: text, dictationId, foregroundApp };
        try {
          await audioManagerRef.current.safePaste(text, {
            restoreClipboard: !getSettings().keepTranscriptionInClipboard,
            allowClipboardFallback: isAccessibilitySkipped(),
          });
        } catch (error) {
          logger.warn("Instant raw paste failed", { error: error?.message }, "clipboard");
        }
      },
      onTranscriptionComplete: async (result) => {
```

(This sits as a sibling key inside the same object literal passed to `setCallbacks`, right before the existing `onTranscriptionComplete: async (result) => {` at line 185 — the existing callback keeps its original body from here, modified in Step 2.)

- [ ] **Step 2: Handle the replace-or-fall-through branch in `onTranscriptionComplete`**

Replace the existing auto-paste block (originally lines 256-274):

```js
          if (autoPasteEnabled) {
            const pasteStart = performance.now();
            await audioManagerRef.current.safePaste(result.text, {
              ...(isStreaming ? { fromStreaming: true } : {}),
              restoreClipboard: !keepTranscriptionInClipboard,
              allowClipboardFallback: isAccessibilitySkipped(),
            });
            logger.info(
              "Paste timing",
              {
                pasteMs: Math.round(performance.now() - pasteStart),
                source: result.source,
                textLength: result.text.length,
              },
              "streaming"
            );
          } else if (keepTranscriptionInClipboard) {
            await writeClipboard(result.text);
          }
```

with:

```js
          const pending = pendingInstantPasteRef.current;
          const wasInstantPasted =
            result.instantPasteEligible && pending && pending.dictationId === result.dictationId;

          if (wasInstantPasted) {
            pendingInstantPasteRef.current = null;
            const textChanged = result.text !== pending.rawText;
            let foregroundAppMatches = true;
            try {
              const currentApp = await window.electronAPI?.getForegroundApp?.();
              foregroundAppMatches = (currentApp?.app ?? null) === (pending.foregroundApp?.app ?? null);
            } catch {
              foregroundAppMatches = false;
            }

            const shouldReplace = shouldAttemptReplace({
              autoPasteEnabled,
              textChanged,
              dictationIdMatches: true,
              foregroundAppMatches,
            });

            if (shouldReplace) {
              try {
                await window.electronAPI?.sendBackspaces?.(pending.rawText.length);
                await audioManagerRef.current.safePaste(result.text, {
                  ...(isStreaming ? { fromStreaming: true } : {}),
                  restoreClipboard: !keepTranscriptionInClipboard,
                  allowClipboardFallback: isAccessibilitySkipped(),
                });
              } catch (error) {
                logger.warn("Instant-paste replace failed", { error: error?.message }, "clipboard");
              }
            }
            // Guardrails failed, or cleanup made no change: the raw paste
            // already delivered the final text — nothing further to do.
          } else if (autoPasteEnabled) {
            const pasteStart = performance.now();
            await audioManagerRef.current.safePaste(result.text, {
              ...(isStreaming ? { fromStreaming: true } : {}),
              restoreClipboard: !keepTranscriptionInClipboard,
              allowClipboardFallback: isAccessibilitySkipped(),
            });
            logger.info(
              "Paste timing",
              {
                pasteMs: Math.round(performance.now() - pasteStart),
                source: result.source,
                textLength: result.text.length,
              },
              "streaming"
            );
          } else if (keepTranscriptionInClipboard) {
            await writeClipboard(result.text);
          }
```

- [ ] **Step 3: Import `shouldAttemptReplace`**

At the top of `src/hooks/useAudioRecording.js`, alongside the other local imports:

```js
import { shouldAttemptReplace } from "../helpers/instantPasteDecision";
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Manual verification (cannot be automated)**

- Enable local whisper or parakeet + cleanup model. Dictate a sentence. Confirm the raw transcript appears in the target app almost immediately, then is silently replaced by the cleaned version a moment later with no visible flicker/selection artifact.
- Dictate, then immediately switch to a different app before cleanup finishes. Confirm the replace is skipped (raw text stays in the first app; nothing is typed into the second app).
- Dictate twice in quick succession (start a second recording before the first's cleanup finishes). Confirm the first dictation's stale cleanup result does not corrupt the second dictation's already-pasted text.
- Trigger the voice-agent hotkey (agent route) and confirm behavior is unchanged from before this feature — no raw-then-replace, still waits for the full agent result.
- Disable auto-paste (clipboard-only mode) and confirm dictation still works exactly as before (single clipboard write, no instant paste).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useAudioRecording.js
git commit -m "feat: wire instant-paste raw-then-replace flow into the dictation hook"
```

---

## Self-Review Notes

- **Spec coverage**: Context/Goal → Tasks 2 & 4 (raw paste + background cleanup + replace). Scope (cleanup-only, on by default, requires auto-paste) → Task 2 Step 7 (`_maybeFireInstantPaste` gates on `autoPasteEnabled` and `kind === "cleanup"`). Data flow → Tasks 2 & 4 end to end. Replace mechanism (backspace × N) → Task 3. Guardrails (4 conditions) → Task 1 (pure function) + Task 4 Step 2 (wiring). Error handling (raw paste fails → skip backspace, single fallback paste; replace fails → log, no retry) → Task 4 Step 2's try/catch around the raw paste, and Task 3's `sendBackspaces` never throwing. Testing → Task 1's unit tests + Task 4 Step 5's manual checks.
- **Out of scope items** (Parakeet/Nemotron streaming, whisper.cpp streaming) are untouched by every task above — confirmed no task references `STREAMING_PROVIDERS` or sherpa-onnx's online recognizer.
- **Type/name consistency checked**: `dictationId` (not `recordingId`/`sessionId`) used identically in Tasks 2 and 4; `instantPasteEligible` (not `instantPasted`) used identically in Tasks 2 and 4; `shouldAttemptReplace` signature in Task 1 matches the call in Task 4 Step 2 exactly (same four keys).
