# Dhwani Phase 2: App-Aware Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect the foreground Windows application at dictation time and expose it as an `{{activeApp}}` placeholder in cleanup/agent prompt templates, so one Prompt Studio prompt can vary tone per app.

**Architecture:** A main-process helper shells a PowerShell one-shot (user32 GetForegroundWindow) — no compiler, no new npm dependency. The renderer fires the lookup concurrently with transcription (its latency hides behind Whisper), then `resolveReasoningRoute()` resolves the system prompt with `activeApp` through the existing `resolvePrompt()` substitution pipeline that already handles `{{agentName}}`.

**Tech Stack:** Electron main/renderer IPC (existing patterns in `ipcHandlers.js`/`preload.js`), `node --test` for unit tests.

## Global Constraints

- Repo: `C:\Users\rushi\dhwani`, branch `main`. Node 24 for any npm operations.
- Windows-only feature: on other platforms `getForegroundApp()` resolves to `null` and `{{activeApp}}` substitutes to empty string (spec requirement).
- If detection fails or the foreground app is Dhwani itself, `{{activeApp}}` resolves to empty string; cleanup proceeds app-agnostic (spec error-handling requirement).
- Test baseline: 132 pass + 1 pre-existing failure (`extractArchive` on Windows). No new failures.
- `node scripts/check-brand.js` must stay green.
- All git commits end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Foreground-app helper (main process) with parser test

**Files:**
- Create: `src/helpers/foregroundApp.js`
- Test: `test/helpers/foregroundApp.test.js`

**Interfaces:**
- Produces: `getForegroundApp(): Promise<{ app: string, title: string } | null>` and pure `parseForegroundOutput(stdout, ownProcessNames): { app, title } | null` (exported for tests). Task 2 wires `getForegroundApp` to IPC.

- [ ] **Step 1: Write the failing test**

`test/helpers/foregroundApp.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert");
const { parseForegroundOutput } = require("../../src/helpers/foregroundApp");

test("parses process name and window title", () => {
  const result = parseForegroundOutput("Code\tsettings.json - dhwani - Visual Studio Code");
  assert.deepStrictEqual(result, {
    app: "Code",
    title: "settings.json - dhwani - Visual Studio Code",
  });
});

test("title may contain tabs - only first tab splits", () => {
  const result = parseForegroundOutput("chrome\tA\tB");
  assert.deepStrictEqual(result, { app: "chrome", title: "A\tB" });
});

test("returns null for own process (electron dev)", () => {
  assert.strictEqual(parseForegroundOutput("electron\tDhwani"), null);
});

test("returns null for own process (packaged)", () => {
  assert.strictEqual(parseForegroundOutput("Dhwani\tDhwani"), null);
});

test("returns null on empty or malformed output", () => {
  assert.strictEqual(parseForegroundOutput(""), null);
  assert.strictEqual(parseForegroundOutput("\t"), null);
  assert.strictEqual(parseForegroundOutput("justonefield"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/helpers/foregroundApp.test.js`
Expected: FAIL with "Cannot find module '../../src/helpers/foregroundApp'"

- [ ] **Step 3: Write the implementation**

`src/helpers/foregroundApp.js`:

```javascript
const { spawn } = require("child_process");
const debugLogger = require("./debugLogger");

// Process names that mean the foreground window is Dhwani itself.
const OWN_PROCESS_NAMES = ["electron", "dhwani"];

// ponytail: PowerShell one-shot costs ~0.5-1s per call (Add-Type compile), but the
// caller fires it concurrently with Whisper transcription so nothing waits on it.
// Upgrade path if it ever matters: emit foreground info from the long-running
// windows-key-listener native binary instead.
const PS_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FG {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder t, int c);
}
"@
$h=[FG]::GetForegroundWindow(); $procId=0; [FG]::GetWindowThreadProcessId($h,[ref]$procId) | Out-Null
$sb=New-Object System.Text.StringBuilder 512; [FG]::GetWindowText($h,$sb,512) | Out-Null
$p=Get-Process -Id $procId -ErrorAction SilentlyContinue
Write-Output ($p.ProcessName + [char]9 + $sb.ToString())
`;

function parseForegroundOutput(stdout, ownProcessNames = OWN_PROCESS_NAMES) {
  const line = (stdout || "").trim();
  const tab = line.indexOf("\t");
  if (tab < 1) return null;
  const app = line.slice(0, tab).trim();
  const title = line.slice(tab + 1).trim();
  if (!app) return null;
  if (ownProcessNames.some((n) => app.toLowerCase().includes(n))) return null;
  return { app, title };
}

function getForegroundApp() {
  if (process.platform !== "win32") return Promise.resolve(null);
  return new Promise((resolve) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", PS_SCRIPT],
      { windowsHide: true, timeout: 5000 }
    );
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("error", (error) => {
      debugLogger.error("Foreground app detection failed", { error: error.message }, "foreground-app");
      resolve(null);
    });
    child.on("close", () => resolve(parseForegroundOutput(out)));
  });
}

module.exports = { getForegroundApp, parseForegroundOutput };
```

Before writing, check how `debugLogger` is imported in a neighboring helper (e.g. `src/helpers/audioStorage.js`) and match that import style exactly; drop the logger line if the module pattern differs rather than inventing one.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/helpers/foregroundApp.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Manual sanity check of the PowerShell path**

Run: `node -e "require('./src/helpers/foregroundApp').getForegroundApp().then(r => console.log(r))"`
Expected: prints `{ app: 'WindowsTerminal', title: '...' }` (or whichever terminal hosts the shell) — NOT null, NOT a hang.

- [ ] **Step 6: Commit**

```bash
git add src/helpers/foregroundApp.js test/helpers/foregroundApp.test.js
git commit -m "feat: foreground app detection helper for app-aware cleanup"
```

---

### Task 2: IPC wiring (main → renderer)

**Files:**
- Modify: `src/helpers/ipcHandlers.js` (register handler; find the block of simple `ipcMain.handle` registrations and follow the local pattern)
- Modify: `preload.js` (expose `getForegroundApp`)

**Interfaces:**
- Consumes: `getForegroundApp()` from Task 1.
- Produces: `window.electronAPI.getForegroundApp(): Promise<{ app, title } | null>` for Task 3.

- [ ] **Step 1: Register the IPC handler**

In `src/helpers/ipcHandlers.js`, add near other simple handlers (match surrounding style):

```javascript
const { getForegroundApp } = require("./foregroundApp");

ipcMain.handle("get-foreground-app", async () => {
  return await getForegroundApp();
});
```

- [ ] **Step 2: Expose in preload**

In `preload.js`, add alongside the other `invoke` wrappers (match exact local naming/style):

```javascript
getForegroundApp: () => ipcRenderer.invoke("get-foreground-app"),
```

- [ ] **Step 3: Verify wiring in the running app**

Run `npm run dev`, open DevTools on the main window (Ctrl+Shift+I), focus another window, then in the console:
`await window.electronAPI.getForegroundApp()`
Expected: `null` (DevTools focus = own app) — then click Notepad and within 5s run it via a `setTimeout` snippet; expected `{ app: "notepad", ... }`. Any result other than an exception proves the wiring.

- [ ] **Step 4: Regression + commit**

```bash
node --test "test/**/*.test.js"   # baseline: 132 pass + 1 pre-existing fail
git add src/helpers/ipcHandlers.js preload.js
git commit -m "feat: expose foreground app detection over IPC"
```

---

### Task 3: `{{activeApp}}` substitution + concurrent capture in the dictation flow

**Files:**
- Modify: `src/config/prompts/index.ts` (option + substitution)
- Modify: `src/config/prompts.ts:7-14` (`getCleanupSystemPrompt` signature)
- Modify: `src/helpers/audioManager.js` (capture at processing start; pass `activeApp` into `resolveReasoningRoute`; set cleanup `systemPrompt`)

**Interfaces:**
- Consumes: `window.electronAPI.getForegroundApp()` from Task 2.
- Produces: `resolvePrompt(kind, { ..., activeApp })` substitutes `{{activeApp}}`; `resolveReasoningRoute(text, settings, agentName, voiceAgentRequested, activeApp)` sets `config.systemPrompt` for both `agent` and `cleanup` routes.

- [ ] **Step 1: Add the option and substitution in `src/config/prompts/index.ts`**

```typescript
export interface ResolvePromptOptions {
  agentName: string | null;
  uiLanguage?: string;
  language?: string;
  customDictionary?: string[];
  activeApp?: string;
}
```

In `applySubstitutions`, after the `{{agentName}}` replace:

```typescript
  prompt = prompt.replace(/\{\{activeApp\}\}/g, opts.activeApp?.trim() || "");
```

- [ ] **Step 2: Thread through `getCleanupSystemPrompt` in `src/config/prompts.ts`**

```typescript
export function getCleanupSystemPrompt(
  agentName: string | null,
  customDictionary?: string[],
  language?: string,
  uiLanguage?: string,
  activeApp?: string
): string {
  return resolvePrompt("cleanup", { agentName, language, customDictionary, uiLanguage, activeApp });
}
```

- [ ] **Step 3: Capture + route in `src/helpers/audioManager.js`**

(a) `resolveReasoningRoute` (line ~49): add 5th param `activeApp`, pass it into the existing `resolvePrompt("dictationAgent", {...})` options, and change the cleanup branch to resolve the prompt explicitly:

```javascript
  if (kind === "cleanup") {
    return {
      kind: "cleanup",
      config: {
        disableThinking: settings.cleanupDisableThinking,
        systemPrompt: resolvePrompt("cleanup", {
          agentName,
          language: settings.preferredLanguage,
          customDictionary: getDictionaryHintWords(settings),
          uiLanguage: settings.uiLanguage,
          activeApp,
        }),
      },
    };
  }
```

(This is behavior-preserving: providers use `config.systemPrompt || ctx.getSystemPrompt(agentName)`, and `getSystemPrompt` resolves the identical `"cleanup"` template — now it just happens earlier, with `activeApp`.)

(b) At the start of each transcription-processing flow that later calls `resolveReasoningRoute` (three call sites: ~1271, ~1522, ~2931 — find the beginning of each enclosing function), fire the capture WITHOUT awaiting:

```javascript
    const foregroundAppPromise = window.electronAPI
      .getForegroundApp?.()
      .catch(() => null);
```

(c) Just before each `resolveReasoningRoute(...)` call, await it and pass it:

```javascript
      const foregroundApp = await foregroundAppPromise;
      const route = resolveReasoningRoute(
        processedText,
        settings,
        agentName,
        this.voiceAgentRequested,
        foregroundApp?.app
      );
```

Read each of the three call sites first; if two share one enclosing function, one capture serves both. `?.` on `getForegroundApp` keeps old preload builds from crashing the dictation path.

- [ ] **Step 4: Regression tests + brand guard**

```bash
node --test "test/**/*.test.js"   # 132 pass + 1 pre-existing fail, +5 from Task 1
node scripts/check-brand.js       # brand check ok
```

- [ ] **Step 5: Commit**

```bash
git add src/config/prompts/index.ts src/config/prompts.ts src/helpers/audioManager.js
git commit -m "feat: app-aware cleanup via {{activeApp}} prompt placeholder"
```

---

### Task 4: End-to-end verification + docs + acceptance

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-private-local-dictation-design.md` (Phase 2 status)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Set an app-aware test prompt (user, in Prompt Studio)**

```
You clean up dictated speech. Remove filler words (um, uh, like, you know),
fix grammar and punctuation, keep the speaker's meaning and wording as close
as possible. Never add content. Output only the cleaned text.

The text will be typed into: {{activeApp}}.
If it is Slack or a chat app: keep it casual, lowercase is fine.
If it is Outlook or an email app: formal complete sentences.
If it is Code or a terminal: output verbatim with no rephrasing.
```

- [ ] **Step 2: Acceptance test (user)**

Restart the dev app. Dictate the same filler-heavy sentence into (a) a chat/browser window and (b) VS Code.
Expected: chat output is casual-cleaned; VS Code output is near-verbatim. History view shows both.

- [ ] **Step 3: Mark Phase 2 accepted in the spec**

Append to the spec's Phase 2 section: `**Status: ACCEPTED <date>** — {{activeApp}} placeholder verified: same dictation produced app-appropriate output in chat vs VS Code.`

- [ ] **Step 4: Final checks + commit + push**

```bash
node --test "test/**/*.test.js"
node scripts/check-brand.js
git add docs/superpowers/specs/2026-07-02-private-local-dictation-design.md
git commit -m "docs: Phase 2 accepted - app-aware cleanup verified"
git push
```
