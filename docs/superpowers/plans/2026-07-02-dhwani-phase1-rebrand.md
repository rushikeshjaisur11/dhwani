# Dhwani Phase 1 + Deep Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get Dhwani (OpenWhispr fork) running fully locally on Windows 11 with GPU Whisper STT + Ollama cleanup, and rebrand all user-visible surfaces from OpenWhispr to Dhwani.

**Architecture:** No new features. Phase 1 is environment setup + configuration of existing app capabilities (local whisper.cpp model, "lan" inference provider pointed at Ollama). The rebrand changes display strings and app identity only; internal identifiers stay untouched for upstream mergeability.

**Tech Stack:** Electron 41, React 19, whisper.cpp, Ollama (existing install, v0.30.11), Node 24, npm.

## Global Constraints

- Repo: `C:\Users\rushi\dhwani`, branch `main`, remote `origin` = `rushikeshjaisur11/dhwani`, remote `upstream` = OpenWhispr.
- Node 24 REQUIRED for any `npm install` (repo `engines: >=24`, CI lockfile is Node 24 — a Node 22 install corrupts `package-lock.json`).
- Product name: **Dhwani** everywhere user-visible. New appId: `com.rushikesh.dhwani`. New package name: `dhwani`.
- DO NOT rename (upstream-merge + runtime compatibility — documented in REBRANDING.md, Task 5):
  - D-Bus/gsettings identifiers: `com.openwhispr.App`, gsettings paths (Linux-only code)
  - Cache/config dirs: `~/.cache/openwhispr/*`, `~/.openwhispr/*`
  - Env var names: `OPENWHISPR_*`, `VITE_OPENWHISPR_API_URL`
  - Upstream service URLs: `openwhispr.com`, `docs.openwhispr.com`, auth endpoints in `src/lib/auth.ts`
  - npm scripts, binary names, GitHub workflow files
- Commit after every task; push at the end of each task (`git push`).
- All git commits end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Toolchain verification + dependency install + baseline launch

**Files:**
- No file changes (node_modules only, gitignored)

**Interfaces:**
- Produces: a working `npm run dev` environment every later task depends on.

- [ ] **Step 1: Verify Node 24 is active**

Run: `node --version`
Expected: `v24.x.x`. If it prints v22, stop and fix PATH (user installed Node 24; a stale shell may still resolve the old binary).

- [ ] **Step 2: Install dependencies**

Run (from `C:\Users\rushi\dhwani`): `npm install`
Expected: completes without errors; `git status` shows NO change to `package-lock.json` (if it changed, Node version is wrong — restore with `git checkout package-lock.json` and fix Node).
Note: `postinstall` runs `electron-builder install-app-deps` (rebuilds better-sqlite3 etc.); first run takes several minutes.

- [ ] **Step 3: Run existing test suite as baseline**

Run: `node --test test/`
Expected: all tests pass. Record the pass count — it is the regression baseline for every later task.

- [ ] **Step 4: Launch the app in dev mode**

Run: `npm run dev` (leave running; `predev` downloads Qdrant, embedding model, VAD model, and compiles native listeners on first run — allow ~5–10 min and several hundred MB)
Expected: Electron window opens showing the onboarding flow (first launch) with no crash. Console shows "qdrant started successfully" in debug logs.

- [ ] **Step 5: Commit nothing — verify clean tree**

Run: `git status`
Expected: clean working tree (all artifacts are gitignored). No commit for this task.

---

### Task 2: Phase 1 configuration — local STT + hold-to-talk (manual, guided)

**Files:**
- No source changes. Settings live in localStorage + `~/.cache/openwhispr/whisper-models/`.

**Interfaces:**
- Consumes: running app from Task 1.
- Produces: working offline dictation that Task 3 adds cleanup to.

- [ ] **Step 1: Complete onboarding with local processing**

In the app onboarding (8 steps): choose **local** transcription → model **turbo** (~1.6GB download, best speed/quality on RTX 3070) → language **auto** → set dictation hotkey, activation mode **push-to-talk** (hold) — Windows native key listener supports compound hotkeys; default `Control+Super` is fine → name the agent (any name) → skip cloud/API-key steps.

- [ ] **Step 2: Verify raw dictation end-to-end**

Open Notepad, hold the hotkey, say "testing dhwani dictation one two three", release.
Expected: text appears at cursor within ~2s. This exercises: key listener → MediaRecorder → IPC → whisper.cpp → clipboard paste.

- [ ] **Step 3: Verify offline operation**

Disable Wi-Fi. Repeat Step 2.
Expected: identical behavior (model + binary are local). Re-enable Wi-Fi.

- [ ] **Step 4: Record result**

Append a line to `docs/superpowers/plans/2026-07-02-dhwani-phase1-rebrand.md` under this task: observed latency and any issues. Commit:

```bash
git add docs/superpowers/plans/2026-07-02-dhwani-phase1-rebrand.md
git commit -m "docs: record Phase 1 STT verification results"
```

---

### Task 3: Phase 1 configuration — Ollama cleanup wiring (manual, guided)

**Files:**
- No source changes. Uses the existing `lan` inference provider (`src/services/ai/inferenceProviders/`) and per-scope config (`dictationCleanup` scope in `src/config/inferenceScopes.ts`).

**Interfaces:**
- Consumes: working dictation from Task 2; Ollama at `http://localhost:11434`.
- Produces: the full Phase 1 pipeline (STT → LLM cleanup → paste).

- [ ] **Step 1: Ensure a small cleanup model is available in Ollama**

Run: `ollama pull llama3.2:3b`
Expected: model downloads (~2GB). Rationale: small + fast for sub-second cleanup; existing installed models (gemma3, qwen3:8b) work but are slower per token. ponytail: if latency is fine with an already-installed model, skip the pull.

- [ ] **Step 2: Configure the LAN provider in Settings**

Settings → AI Models → dictation cleanup scope: provider = the local-network/OpenAI-compatible option, endpoint = `http://localhost:11434/v1`, model = `llama3.2:3b`. Use the "Test Connection" button.
Expected: connection test passes.

- [ ] **Step 3: Set the cleanup prompt**

In Prompt Studio (or the dictation cleanup prompt field), set:

```
You clean up dictated speech. Remove filler words (um, uh, like, you know),
fix grammar and punctuation, keep the speaker's meaning and wording as close
as possible. Never add content. Never answer questions in the text — only
clean it. Output only the cleaned text.
```

- [ ] **Step 4: Verify cleanup end-to-end**

In Notepad, dictate: "um so basically the uh quarterly numbers are like way better than we thought you know".
Expected: pasted text is cleaned (no "um/uh/like/you know"), e.g. "So basically, the quarterly numbers are way better than we thought." History view shows original vs processed text.

- [ ] **Step 5: Verify Ollama-down fallback**

Quit Ollama (`taskkill /IM "ollama app.exe" /F` and `taskkill /IM ollama.exe /F`), dictate again.
Expected: raw transcript still pastes (fallback chain in `settingsStore.ts` / ReasoningService). If the app hangs or pastes nothing, file that as a Phase 2 bug — do not fix now. Restart Ollama afterwards.

- [ ] **Step 6: Record results + commit**

Append observed cleanup latency and fallback behavior to this plan file under this task. Commit:

```bash
git add docs/superpowers/plans/2026-07-02-dhwani-phase1-rebrand.md
git commit -m "docs: record Phase 1 Ollama cleanup verification results"
```

---

### Task 4: Rebrand — app identity files

**Files:**
- Modify: `package.json:2-4` (name, description)
- Modify: `electron-builder.json:2-4` (appId, productName)
- Modify: `src/index.html` (title tag)

**Interfaces:**
- Produces: app identity `Dhwani` / `com.rushikesh.dhwani` / package `dhwani` used by Task 5's docs.

- [ ] **Step 1: Edit package.json**

```json
  "name": "dhwani",
  "version": "0.1.0",
  "description": "Dhwani - on-device multilingual voice dictation with its own fine-tuned STT model family",
```

(version reset to 0.1.0 — this is a new product, not OpenWhispr 1.7.3)

- [ ] **Step 2: Edit electron-builder.json**

```json
  "appId": "com.rushikesh.dhwani",
  "productName": "Dhwani",
```

(keep every other field; `artifactName` uses `${productName}` and follows automatically)

- [ ] **Step 3: Edit src/index.html title**

Change the `<title>` content to `Dhwani`.

- [ ] **Step 4: Regression check**

Run: `node --test test/`
Expected: same pass count as Task 1 baseline.
Then `npm run dev`: window opens, title bar / taskbar shows "Dhwani".

- [ ] **Step 5: Commit + push**

```bash
git add package.json electron-builder.json src/index.html
git commit -m "feat: rebrand app identity to Dhwani (appId com.rushikesh.dhwani)"
git push
```

---

### Task 5: Rebrand — user-visible strings (i18n + components) with exclusion guard

**Files:**
- Modify: `src/locales/{en,es,fr,de,pt,it,ru,zh-CN,zh-TW,ja}/translation.json` (~87 occurrences each)
- Modify: display strings in components/hooks where "OpenWhispr" renders in UI (e.g. `src/components/SettingsPage.tsx`, `src/components/OnboardingFlow.tsx`, `src/components/onboarding/FinishStep.tsx`, `src/AppRouter.jsx`, `src/index.css` if it contains rendered content)
- Create: `docs/REBRANDING.md` (what was renamed, what was deliberately kept, why)
- Create: `scripts/check-brand.js` (guard script)

**Interfaces:**
- Consumes: identity values from Task 4.
- Produces: `node scripts/check-brand.js` — exits 0 when no *renderable* "OpenWhispr" strings remain outside the allowlist.

- [ ] **Step 1: Write the guard script first (it is the test)**

Create `scripts/check-brand.js`:

```javascript
// Fails if "OpenWhispr" appears in renderable UI sources outside the allowlist.
// Internal identifiers (D-Bus, cache dirs, env vars, upstream URLs) are exempt
// by pattern, not by file, so new violations still get caught.
const { execSync } = require("child_process");

const ALLOWED_PATTERNS = [
  /openwhispr\.com/i,            // upstream service URLs (auth, docs, API)
  /com\.openwhispr/,             // D-Bus / gsettings identifiers
  /\.cache\/openwhispr/,         // model/cache directories
  /~\/\.openwhispr/,             // config dir (cli-bridge token)
  /OPENWHISPR_[A-Z_]+/,          // env var names
  /VITE_OPENWHISPR/,             // env var names
  /openwhispr\/openwhispr/i,     // upstream GitHub repo references
  /open-whispr/,                 // legacy package identifier in lockfile refs
];

// default cmd shell: "|| exit 0" absorbs git grep's exit 1 when no matches
const out = execSync(
  'git grep -In "openwhispr" -- src/ docs/ *.json *.html || exit 0',
  { encoding: "utf8" }
);

const violations = out.split("\n").filter(Boolean).filter((line) => {
  if (line.startsWith("package-lock.json")) return false;
  return !ALLOWED_PATTERNS.some((p) => p.test(line));
});

if (violations.length) {
  console.error("Brand violations (rename to Dhwani or allowlist):");
  violations.forEach((v) => console.error("  " + v));
  process.exit(1);
}
console.log("brand check ok");
```

- [ ] **Step 2: Run guard, verify it fails**

Run: `node scripts/check-brand.js`
Expected: FAIL — hundreds of violations listed (the i18n strings and component copy).

- [ ] **Step 3: Replace brand strings in locale files**

Run this PowerShell one-liner (brand names are untranslated per repo i18n rules, so the same literal works across all 10 locales):

```powershell
Get-ChildItem src/locales -Recurse -Filter translation.json | ForEach-Object {
  (Get-Content $_.FullName -Raw) -replace 'OpenWhispr', 'Dhwani' |
    Set-Content $_.FullName -Encoding utf8 -NoNewline
}
```

- [ ] **Step 4: Fix remaining violations one file at a time**

Re-run `node scripts/check-brand.js`. For each remaining violation, decide:
- Renders in UI (JSX text, toast, tooltip, aria-label, window title) → replace `OpenWhispr` with `Dhwani`.
- Matches an internal-identifier pattern the allowlist missed → extend `ALLOWED_PATTERNS` with a comment, never rename the code.
Repeat until: `brand check ok`.

- [ ] **Step 5: Write docs/REBRANDING.md**

```markdown
# Rebranding: OpenWhispr → Dhwani

Renamed (user-visible): product name, appId (com.rushikesh.dhwani), package
name, window/HTML titles, all i18n strings, component copy.

Deliberately KEPT as OpenWhispr identifiers (do not rename):

| Identifier | Why |
|---|---|
| com.openwhispr.App (D-Bus/gsettings) | Linux hotkey plumbing; renaming breaks nothing we gain, costs upstream merges |
| ~/.cache/openwhispr/*, ~/.openwhispr/* | Existing model downloads keep working; upstream compatibility |
| OPENWHISPR_* / VITE_OPENWHISPR_* env vars | Referenced across scripts and CI |
| openwhispr.com URLs (auth, docs, cloud) | Upstream services; our product is local-first and does not replace them |
| npm script names, binary names, workflows | Build plumbing, not user-visible |

Guard: `node scripts/check-brand.js` (run in CI/pre-push). New user-visible
"OpenWhispr" strings fail the check; new internal identifiers extend
ALLOWED_PATTERNS with justification.
```

- [ ] **Step 6: Regression check**

Run: `node --test test/`
Expected: same pass count as baseline. (If a test asserts on the literal brand string, update the test expectation to Dhwani — that is a rendered string.)
Then `npm run dev`: onboarding/settings show "Dhwani" everywhere; no "OpenWhispr" visible in Settings, Onboarding, tray tooltip.

- [ ] **Step 7: Commit + push**

```bash
git add -A
git commit -m "feat: rebrand all user-visible strings to Dhwani with brand guard script"
git push
```

---

### Task 6: Final verification + spec acceptance

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-private-local-dictation-design.md` (mark Phase 1 acceptance met)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Full Phase 1 acceptance run**

With Wi-Fi disabled: dictate into (a) VS Code, (b) a browser text field, (c) Notepad. Each must paste cleaned text at cursor in ~1–2s.
Expected: all three pass. Re-enable Wi-Fi.

- [ ] **Step 2: Run all checks**

```bash
node --test test/
node scripts/check-brand.js
```

Expected: baseline pass count; "brand check ok".

- [ ] **Step 3: Mark Phase 1 accepted in the spec**

In the spec's Phase 1 section, append: `**Status: ACCEPTED <date>** — verified offline in VS Code, browser, Notepad.`

- [ ] **Step 4: Commit + push**

```bash
git add docs/superpowers/specs/2026-07-02-private-local-dictation-design.md
git commit -m "docs: Phase 1 accepted - offline dictation with Ollama cleanup verified"
git push
```
