# Dhwani: Full-Codebase Optimization + Cinematic Onboarding + Docs Rewrite

Repo: `C:\Users\rushi\OneDrive\Documents\GitHub\dhwani` (Electron 41, React 19, Vite, better-sqlite3, Node 24 for any `npm install`).

## Context

User complaints: (1) app slow to open after launch/install, (2) after Windows boot, the Win+Alt+1 hotkey (native `windows-key-listener.exe`) takes long to activate. Scope expanded to full-codebase optimization (all findings incl. low-impact), plus roadmap.md item 7 "Cinematic First Run Onboarding", plus replacing `docs/roadmap.md` with optimization-focused documentation.

Root causes found (verified):
- **Startup**: ~30 synchronous manager requires at `main.js:283-310`; blocking `reapStaleSidecars()` with `execFileSync("tasklist")` (`main.js:780`, `sidecarReaper.js:25`); `await environmentManager.init()` (17 DPAPI secret decrypts) before window (`main.js:784`); `await migrateCookieToBearerToken()` (`main.js:893`); native key listener reconcile gated behind all of that PLUS hard-coded `setTimeout(..., 3000)` at `main.js:1788-1789`; post-window "sidecar storm" (Qdrant 85MB spawn, embedding/diarization downloads, calendar sync, update check) all firing at once (`main.js:1292-1385`).
- **Bundle**: 1.5MB `settingsStore` chunk eager on every window — **~85% is locale JSON**: `src/i18n.ts:3-4` statically imports all 10 locales × (translation+prompts). Fix is locale lazy-loading, not store splitting.
- **Re-renders**: `useSettings.ts:101-102` subscribes whole zustand store, returns fresh ~140-key object as context value without `useMemo` → every settings change re-renders all 9 consumers.
- **DB**: no index on `transcriptions(deleted_at, timestamp)`; `SELECT * ... ORDER BY timestamp DESC` full-scans (`database.js:776-778`). Prepared statements re-created per call.
- **Idle CPU**: `WindowControls.tsx:21` 1s maximize-state poll; 4 sidecar health checks every 5s forever; meeting process detector 30s `tasklist` poll default-on; `useMicLevel.js` setState per rAF (60fps).
- Already fine (do NOT touch): HistoryView virtualization, lazy InsightsView/PersonalNotesView chunks, audio→IPC transferable ArrayBuffers, no sendSync IPC.

User decisions: onboarding demo = **animated in-app demo** (no video file); **add framer-motion**; optimization scope = **everything incl. low-impact**.

Verification commands: `npm run dev`, `npm test` (vitest + `node --test`), `npm run typecheck`, `npm run lint`, `npm run i18n:check`, `npm run build:renderer`.

---

## Phase 0 — Startup instrumentation (first, so before/after is measurable)

**Status: ✅ Completed** (`a26c22e5`)

Files: `main.js`, `src/helpers/windowManager.js`.

- `const STARTUP_T0 = Date.now();` near top of main.js + `markStartup(name)` helper logging `[startup] <name> +<ms>` via existing `debugLogger` (fallback console.log before logger exists).
- Marks: `main-required` (after require block), `whenReady`, `startApp-begin`, `coreManagers-done`, `env-init-done`, `mainWindow-shown`, `hotkey-registered`, `native-key-listener-reconciled`, `controlPanel-created`, `startApp-done`, one per sidecar kick.
- Run `npm run dev`, record baseline numbers (used in Phase 4 doc).

## Phase 1 — Startup critical path (window + Win+Alt+1 live ASAP)

**Status: ✅ Completed** (`b7cb677a`)

Files: `main.js`, `src/helpers/windowManager.js`, `src/helpers/sidecarReaper.js`, `src/helpers/environment.js`, `src/helpers/ipcHandlers.js`.

1. **Hotkey before renderer load** (`windowManager.js:107-108`): hotkeys come from `.env` via dotenv (already loaded pre-whenReady), NOT from secret decryption — so reorder:
   ```js
   const loadPromise = this.loadMainWindow();
   await this.initializeHotkey();
   await loadPromise;
   ```
2. **Native key listener early + delete 3s delay**: move polish slot registration block (`main.js:1002-1017`, registers `Super+Alt+1`) + the win32/linux native key event-wiring block (`main.js:1688-1786`) to run immediately after `createMainWindow()`; call `windowManager.reconcileNativeKeyListeners()` right there (spawns `windows-key-listener.exe`). **Delete `STARTUP_DELAY_MS = 3000` + setTimeout (`main.js:1788-1789`)** — reconcile is idempotent; the existing reconcile after agent/voiceAgent/meeting slot registrations covers later slots.
3. **Env init + cookie migration concurrent**: `environment.js` `init()` stores/returns `this.initPromise`. `main.js:784` → start promise, await it **after** `createMainWindow()` / before `createControlPanelWindow()`. Same for `migrateCookieToBearerToken()`. Guard: prefix secret-getter IPC handlers (`get-*-key` in ipcHandlers.js) with `await this.environmentManager.initPromise;`.
4. **Async deferred reaping**: `sidecarReaper.js` → promisified `execFile`; remove call from `startApp()` top; `await reapStaleSidecars()` at head of the post-window sidecar section (must finish before new sidecars spawn).
5. **Lazy-require heavy managers**: keep pre-window: EnvironmentManager, WindowManager(+hotkey), DatabaseManager, ClipboardManager, IPCHandlers, WindowsKeyManager/LinuxKeyManager, DevServerManager, sidecarRegistry, i18nMain. Defer via memoized getters (`const getX = () => (x ??= new (require(...))(...))` — mirrors existing `getTrayManager` at `main.js:452`): UpdateManager, GoogleCalendarManager, MeetingProcessDetector, AudioActivityDetector, MeetingDetectionEngine, AudioTapManager, LinuxPortalAudioManager, MeetingAecManager, DiarizationManager, WhisperCudaManager, TrayManager, GlobeKeyManager, TextEditMonitor, CliBridge, WhisperManager, ParakeetManager, ensureYdotool. **IPC handler registration stays pre-window** (only instantiation lazy — comment at main.js:793-798 warns transform IPC must exist before main window loads). Measure via `main-required` mark; if a module costs <10ms, don't churn ipcHandlers for it.
6. **Stagger sidecar storm** (`main.js:1292-1385`) into batches (guard with `isLiveWindow`):
   - T+0: tray, whisper/parakeet `initializeAtStartup` (active STT must prewarm for dictation latency), reaper await.
   - T+3s: Qdrant + vectorIndex, llama prewarm.
   - T+10s: diarization downloads, embedding model download, update check. (Calendar sync + meeting engine stay in `initializeDeferredManagers`, instantiated via getters.)

Verify: startup marks — `hotkey-registered` + `native-key-listener-reconciled` before `mainWindow-shown`; cold-start → dictation hotkey and Win+Alt+1 respond ~immediately; change polish hotkey in Settings still works; dictation resolves API keys; quit leaves no orphan sidecars (`tasklist | findstr /i "qdrant whisper sherpa llama key-listener"`); `npm test`, `npm run lint`.

## Phase 2 — Runtime optimizations (all items)

**Status: ✅ Completed** (`d5126336`)

1. **Locale lazy-loading** (`src/i18n.ts`, biggest bundle win): eager-import only `en`; explicit `import()` loader map per other locale (one lazy chunk each); export `changeUiLanguage(lang)` = `await loadLocale(lang); await i18n.changeLanguage(lang);` and swap call sites (grep `i18n.changeLanguage` — settingsStore `setUiLanguage`, useSettings init). Delete `src/locales/translations.ts`/`prompts.ts` if unused after. Also `src/helpers/i18nMain.js`: require `en` + saved `UI_LANGUAGE` only. Trade-off: one-frame English flash for non-en users — document it. Verify: `npm run build:renderer` → settingsStore chunk 1.5MB → ≲250KB, per-locale chunks; language switch works; `npm run i18n:check`.
2. **Settings context** (`src/hooks/useSettings.ts`): wrap returned object (lines ~200-382) in `useMemo` keyed on `store` snapshot; migrate narrow consumers (`useTraySync.ts`, `DictionaryView.tsx`) to direct zustand selectors (pattern at OnboardingFlow.tsx:120). Don't split context (only 9 consumers).
3. **DB index** (`src/helpers/database.js`, in `initDatabase()` next to existing index creations): `CREATE INDEX IF NOT EXISTS idx_transcriptions_deleted_at_timestamp ON transcriptions(deleted_at, timestamp DESC)`. Leave insights full-scan (aggregates all rows; index won't help).
4. **WindowControls events**: `windowManager` sends `window-maximized-changed` on `maximize`/`unmaximize`; preload exposes subscribe; `WindowControls.tsx` keeps initial query, subscribes, **deletes 1s setInterval**.
5. **useMicLevel throttle**: gate `setLevels` to ~20fps (50ms) inside existing rAF loop.
6. **Health-check idle backoff** (`qdrantManager.js`, `whisperServer.js`, `parakeetWsServer.js`, `llamaServer.js`): self-rescheduling setTimeout — 5s for first 60s after start / after activity, else 30s; `noteActivity()` bumped from transcribe/query paths; preserve llamaServer failure-threshold logic.
7. **Meeting detection gating**: gating exists (`meetingDetectionEngine` prefs) but defaults ON before renderer pushes prefs; ensure renderer pushes prefs on every window load and/or persist `processDetection`/`audioDetection` via environment.js PERSISTED_KEYS so start-minimized users who disabled it don't get 30s tasklist polling.
8. **Prepared statement cache** (`database.js`): `_prep(sql)` memo Map; swap on hot paths — saveTranscription, getTranscriptions, updateTranscriptionText/Status/Audio, getTranscriptionById.
9. **Meeting audio IPC batching** (`meetingRecordingStore.ts:77`): `MEETING_AUDIO_BUFFER_SIZE` 800 → 4800 samples (33ms → 200ms per IPC msg, ~60→~10 msg/s across streams). Verify live captions still acceptable; fall back to 2400 if laggy. `// ponytail:` comment naming the knob.
10. **Lazy view chunks**: verified already done (React.lazy in ControlPanel.tsx:68-79; no highlight.js in src). No code change — record in doc.

Verify gate: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build:renderer` (record chunk sizes); manual smoke: dictate, history, notes, insights, settings, language switch, meeting record.

## Phase 2.5 — Replace Qdrant sidecar with sqlite-vec

**Status: ✅ Completed** (`079d2797`)

Removes an entire subsystem: 85MB bundled `qdrant-{platform}-{arch}` binary, a spawned child process, a port (6333-6350), a 5s-forever health-check loop, `~/.cache/dhwani/qdrant-data/`, and the spawn/reap/backoff machinery in `qdrantManager.js` + `sidecarReaper.js` entries for it. `vectorIndex.js` (verified, ~150 lines) is already a thin, clean interface — `init/ensureCollection/upsertNote/deleteNote/search/reindexAll/ensureConversationChunksCollection/upsertConversationChunks/deleteConversationChunks` — two collections (`notes`, `conversation_chunks`), 384-dim cosine, backed by `localEmbeddings.embedText/embedTexts`. This maps directly onto `sqlite-vec` (`npm i sqlite-vec`, loaded as a better-sqlite3 extension — same DB connection `database.js` already opens, no new process).

1. **Schema** (`database.js` `initDatabase()`, alongside the new transcriptions index from Phase 2 item 3): two `vec0` virtual tables mirroring the Qdrant collections —
   ```sql
   CREATE VIRTUAL TABLE IF NOT EXISTS vec_notes USING vec0(embedding float[384]);
   CREATE VIRTUAL TABLE IF NOT EXISTS vec_conversation_chunks USING vec0(embedding float[384]);
   ```
   Row id = note id / `conversationId * 1000 + chunkIndex` (same composite id scheme already used), so upsert = delete-by-rowid + insert (vec0 has no native upsert).
2. **Rewrite `vectorIndex.js` internals only — keep the public method signatures identical** (every call site in `ipcHandlers.js`/`searchNotesTool.ts` stays untouched):
   - `init(db)` takes the existing better-sqlite3 handle instead of a Qdrant port; loads the `sqlite-vec` extension once (`sqliteVec.load(db)`).
   - `ensureCollection()`/`ensureConversationChunksCollection()` → the `CREATE VIRTUAL TABLE IF NOT EXISTS` above (idempotent, same pattern as other migrations).
   - `upsertNote`/`upsertConversationChunks` → `DELETE FROM vec_notes WHERE rowid = ?` then `INSERT INTO vec_notes(rowid, embedding) VALUES (?, ?)` (embedding as `Float32Array` buffer, matches vec0's expected format).
   - `deleteNote`/`deleteConversationChunks` → `DELETE FROM vec_notes/vec_conversation_chunks WHERE rowid = ?` (conversation chunks: `WHERE rowid >= id*1000 AND rowid < (id+1)*1000`, replacing the Qdrant payload filter).
   - `search` → `SELECT rowid, distance FROM vec_notes WHERE embedding MATCH ? ORDER BY distance LIMIT ?` (cosine via `vec0` normalized distance, or keep raw embeddings + `vec_distance_cosine` — verify which vec0 gives closer parity with existing 0.3 score threshold in `searchNotesTool.ts`'s RRF merge). Map `distance` back to the existing `{noteId, score}` shape (score = `1 - distance` if cosine distance).
   - `reindexAll` → same batch loop, batched `INSERT` inside a transaction (`db.transaction(...)`) instead of Qdrant batch upsert.
3. **Remove the sidecar entirely**: delete `qdrantManager.js`, the `main.js` Qdrant start block (T+3s batch from Phase 1 item 6 — this item disappears, not staggered), its `sidecarRegistry.register("qdrant", ...)` line, its entry in `sidecarReaper.js` `EXPECTED_BINARY_FRAGMENTS`, `scripts/download-qdrant.js` + its `prebuild`/`predev` package.json wiring, `@qdrant/js-client-rest` dependency, and `electron-builder.json`'s `extraResources` entry for `qdrant-{platform}-{arch}.exe`.
4. **Migration for existing users**: on first launch post-upgrade, if `vec_notes` is empty but `notes` table has rows, run `reindexAll` once from existing SQLite note content (embeddings are cheap/local — no data loss, just a one-time re-embed). Old `~/.cache/dhwani/qdrant-data/` can be left alone or cleaned up (not required for correctness).

Verify: `npm test`; create a note "quarterly revenue projections", agent-search "financial forecast" → still matches semantically (same check as CLAUDE.md's existing testing checklist item, now against sqlite-vec); kill/delete `qdrant-data` dir entirely → search still works (no external process to depend on); confirm `resources/bin/` no longer ships a qdrant binary and installer size drops ~85MB; `npm run build:renderer` unaffected (main-process only change).

## Phase 3 — Cinematic First-Run Onboarding (roadmap item 7)

**Status: ✅ Completed** (`5f39a254`)

Presentation upgrade + demo step insertion; step logic/settings wiring untouched. `OnboardingFlow.tsx` is already lazy + prefetched (`AppRouter.jsx:55-57`).

1. **Dep**: `nvm exec 24 npm install framer-motion`. Import only from onboarding files (lands in lazy OnboardingFlow chunk). Use `LazyMotion features={domAnimation}` + `m.*`; wrap flow in `<MotionConfig reducedMotion="user">`.
2. **New files** in `src/components/onboarding/` (dir exists — UseCaseStep/MeetingSetupStep/FinishStep pattern):
   - `motion.ts` — shared spring/stagger variants.
   - `DemoStep.tsx` — scripted looping demo (~8s, replay button, no mic/IPC): hotkey chip (user's actual `dictationKey` label) press animation → glowing waveform orb driven by canned amplitude array → sentence types into faux desktop window → check pulse → loop. Typed text via `t("onboarding.demo.typedText")`. Clean up all timers/rAF on unmount.
   - `MicTestOrb.tsx` — live mic visualizer for activation step: reuse existing `useMicLevel(active)` hook (14 bar levels); orb glow/scale from avg level; active only while step mounted.
3. **OnboardingFlow.tsx changes** (surgical): insert `demo` step after `welcome` in steps memo (~line 199); bump `MAX_STEP_INDEX` 7→8 (line 54); add to `SKIPPABLE_STEPS` (line 57); `case "demo"` in `renderStep()` + `canProceed()`. Wrap `renderStep()` output in `<AnimatePresence mode="wait">` + spring transitions. Re-skin (stagger/spring only): welcome, setup (wrap existing `TranscriptionModelPicker variant="onboarding"` — already has animated cards + `get-recommended-model` hardware badge, don't touch internals), activation (+`MicTestOrb`), permissions (stagger PermissionCards), finish. Slow animated background gradient layer behind glassmorphic shell. Keep meeting step hidden (note at :189-194); update ponytail theming comment at :934-937.
4. **i18n**: new `onboarding.demo.*` + `onboarding.steps.demo` + mic-test hint keys in **all 10** locale files; `npm run i18n:check`.

Verify: `npm run typecheck`, `i18n:check`, `npm test`; manual — clear `onboardingCompleted`+`onboardingCurrentStep` in control-panel devtools, reload, run full flow (demo loops, skip/back/next transitions, mic orb reacts, recommendation badge, hotkey registers, finish persists, dictation works after); OS reduce-motion → minimal animation; non-English locale; `npm run build:renderer` → framer-motion inside OnboardingFlow chunk only.

## Phase 4 — Documentation (replace roadmap.md)

**Status: ✅ Completed** (`dcd447df`)

1. **New `docs/optimization.md`** (primary): methodology (`[startup]` marks capture, chunk measurement); baseline-vs-after tables (Phase 0 vs Phase 1 marks; chunk sizes; installer size before/after Qdrant removal); completed optimizations (each Phase 1-2.5 item, one line what/why/file, incl. "verified already done" items so future audits don't re-litigate); Phase 5 items (memory-pressure eviction, transform plugin system, keyboard nav, live hotkey conflict indicator) documented alongside; prioritized future backlog — carry roadmap ⚡Performance #1-12 with statuses (#8 speculative streaming stays [IN PROGRESS]; #7 partially exists via `get-recommended-model`; #11 native addon / #12 V8 snapshot low-priority) + new candidates (per-consumer settings selectors, CSS-var mic levels, lazy-download STT binaries, Obsidian/markdown export, CLI bridge subcommands, DB export/import backup, unified cloud-call retry/backoff).
2. **Rewrite `docs/roadmap.md` slim**: productivity + UI/UX feature ideas carried forward; move UI/UX #7 to Completed; link to optimization.md for all perf work; ✅Completed Items section carried over + new entries.
3. Fix any links in `docs/README.md`/`architecture.md` pointing at moved sections.

## Risks

- startApp reorder breaking implicit deps → all `ipcMain.handle` registrations stay pre-window; test transform hotkeys explicitly.
- Secret IPC before env init → gated on `initPromise`; control panel awaits it.
- Locale lazy-load missing keys → `en` stays eager fallback; load before `changeLanguage`.
- 200ms meeting batches degrade captions → verify, fall back to 100ms.
- framer-motion in eager bundle → verify chunk placement in build output.
- Lockfile: any `npm install` under Node 24 only.
- sqlite-vec distance semantics differ from Qdrant cosine score → verify score/threshold mapping against `searchNotesTool.ts`'s existing 0.3 threshold before removing Qdrant fallback path.

## Phase 5 — Reliability, extensibility, accessibility

**Status: ✅ Completed** (`1c5a4d52`, `724a103c`, `5f947da2`, `b55f20a7`)

### 5.1 Memory-pressure model eviction
Extends roadmap ⚡#1 "Smart Model Suspend" (idle-timer unload) with real memory-pressure reaction, not just idle time. `main.js:1285-1286` already lazy-requires `powerMonitor` for `resume` events — same lazy-require pattern applies here.
- Add a poll (30s, cheap) reading `os.freemem()`/`os.totalmem()` in a new `src/helpers/memoryPressureMonitor.js`. On Windows, prefer `powerMonitor.on("thermal-state-change")` where available plus the freemem fallback (Electron has no native low-memory event on Windows — freemem polling is the pragmatic baseline; note as a `// ponytail:` ceiling).
- Threshold (e.g. <10% free or <500MB) → emit an event consumed by whichever local-LLM/whisper/parakeet manager currently holds a loaded model; call their existing unload path (same one the idle timer will use once roadmap #1 lands) instead of a new unload mechanism.
- Debounce re-trigger (don't unload/reload thrash) — cooldown after eviction before re-checking.
- Verify: run with a small local model loaded, synthetically drop free memory (allocate in a throwaway script or lower a test threshold), confirm model unloads and app doesn't crash; confirm normal operation restores model on next hotkey press (existing prewarm-on-demand path).

### 5.2 Plugin system for custom transforms
Builds directly on the **existing per-transform hotkey mechanism** already in `main.js:804-828` (`transformSlotName`, per-transform slot registration reading transform data from renderer localStorage) and the clean `InferenceProvider` registry pattern in `src/services/ai/inferenceProviders/index.ts`.
- Define a transform plugin shape: `{ id, name, promptTemplate, triggerHotkey?, icon? }` — a superset of what today's in-app "custom transform" UI already produces, just persisted as discoverable files instead of only localStorage.
- Add a `transforms/` folder under userData (e.g. `~/.dhwani/transforms/` alongside the existing `~/.cache/dhwani/` convention) — a `TransformPluginLoader` (new `src/helpers/transformPluginLoader.js`) scans it at startup (lazy, deferred like other non-critical managers per Phase 1.5), validates each JSON against the shape, and feeds them into the same registration path `main.js`'s transform-hotkey block already uses.
- Renderer: `TransformsView` (existing custom-transform settings UI — confirm exact component name before editing) gains an "Import"/"Export as plugin file" action so user-created transforms in the UI can be shared as portable files, not just an "install a plugin" one-way flow.
- Keep in-app transform creation working unchanged — this adds a second entry point (file-based) into the same slot-registration pipeline, not a replacement.
- Verify: drop a hand-written transform JSON into the folder, restart app, confirm its hotkey registers and firing it applies the prompt to selected text; export an in-app-created transform, confirm the file round-trips.

### 5.3 Full keyboard navigation (no mouse)
Audit-first, since Radix primitives (already used per CLAUDE.md's shadcn/ui stack) provide most keyboard behavior out of the box — the task is verifying gaps, not building from scratch.
- Audit tab order + arrow-key list navigation across: History list (virtualized — confirm `@tanstack/react-virtual` rows are still keyboard-focusable, virtualization can silently break `tabindex` sequencing), Snippets list, Notes list, Settings nav, the (Phase 3) onboarding wizard steps.
- Add missing `role`/`aria-*`/`tabIndex` where custom (non-Radix) components exist — the glassmorphic model/permission cards are the likely gap (custom divs, not Radix `Card` primitives).
- Global "focus trap" check for modals (Radix `Dialog` should already trap focus — verify, don't reimplement).
- Add a visible focus ring (`:focus-visible`) pass — glassmorphic designs often suppress default outlines for aesthetics; confirm one wasn't lost in the process.
- Verify: unplug/ignore the mouse, complete a full session (open app → change a setting → create a snippet → dictate → review history → open a note) using only Tab/Shift+Tab/Arrow keys/Enter/Esc.

### 5.4 Color-coded hotkey conflict indicator (live, inline)
Backend conflict detection **already exists and is exercised today** — `hotkeyManager._findSlotConflict()` (`hotkeyManager.js:396,518`) returns `{ reason: "slot_conflict", conflictSlot }`, consumed at save-time (`hotkeyManager.js:1058-1060`) and surfaced via toast/error today (per CLAUDE.md's cross-slot validation note for the Voice Agent hotkey). This item moves that same check from "on save" to "live while typing."
- Find the hotkey-capture input component (used by Settings → Hotkeys, onboarding activation step, per-transform hotkey editor) — likely a shared `HotkeyInput` component per earlier exploration.
- Add a debounced (150-200ms) live IPC call to a **new read-only** `check-hotkey-conflict` handler (thin wrapper around the existing `_findSlotConflict`, no side effects — must not register/unregister anything, just check) as the user finishes pressing a combo.
- On conflict: red outline on the input + inline tooltip/text naming the conflicting slot (translate via existing `hotkey.errors.alreadyRegistered` i18n key, already present per `hotkeyManager.js:36`). On clear: green/neutral outline. Disable the Save button while conflicted (a hard save-time reject already exists as the fallback if this is bypassed somehow).
- Verify: open two hotkey editors (e.g. dictation + a custom transform), type the same combo into the second — red state appears within ~200ms without needing to hit Save; clear it, resolves to green; save-time hard validation still catches anything the live check missed (defense in depth, don't remove it).

Verify gate (Phase 5): `npm test`, `npm run typecheck`, `npm run i18n:check` (new conflict-indicator strings if not reusing existing key), manual smoke per sub-item above.

## Execution order

Phase 0 → 1 → 2 (item order: 2.1, 2.2, 2.3, 2.8, 2.4, 2.5, 2.6, 2.7, 2.9, 2.10-doc) → Phase 2.5 (sqlite-vec) → 3 → 4 → 5 (5.4 and 5.3 are independent/low-risk and can move earlier if desired; 5.1 and 5.2 touch more surface area, do later). Each phase ends green on `npm test` + `npm run typecheck` + `npm run dev` smoke.
