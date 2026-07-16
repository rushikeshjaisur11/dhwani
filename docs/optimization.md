# Performance & Optimization

All performance work lives here: how it's measured, what has shipped, and the prioritized backlog.
Feature ideas (productivity, UI/UX) stay in [roadmap.md](roadmap.md).

## Methodology

- **Startup**: `src/helpers/startupMarks.js` logs `[startup] <name> +<ms>` from process T0.
  Run `npm run dev`, grep the output for `[startup]`. Marks cover the require block, whenReady,
  window/hotkey/native-listener readiness, and every sidecar kick.
- **Bundle**: `npm run build:renderer` prints per-chunk sizes; watch `settingsStore`, `OnboardingFlow`,
  the eager `index` chunk, and per-locale `translation-*`/`prompts-*` chunks.
- **Installer**: compare `extraResources` payloads in `electron-builder.json` and the final artifact size.

## Baseline vs. after (dev mode, same machine, 2026-07-16)

| Mark | Baseline | After Phase 1–2.5 |
|---|---|---|
| main-required | 475 ms | ~200 ms (electron-updater require deferred) |
| hotkey-registered (dictation live) | 5,082 ms | **~900 ms** |
| native-key-listener-reconciled (Win+Alt+1 live) | 5,273 ms + 3 s delay, gated behind ~23 s of setup → effectively ~26 s | **~920 ms** |
| mainWindow-shown | 5,082 ms | ~3,800 ms |
| controlPanel-created | 7,223 ms | ~6,000 ms |
| whisper/parakeet prewarm kick | 23,193 ms | **~6,000 ms** |
| startApp-done | 23,299 ms | **~6,000 ms** |

The single biggest culprit was `await windowManager.createAgentWindow()` (a hidden window whose renderer
load took ~14 s in dev) blocking everything after the control panel. It no longer blocks startup.

Bundle: `settingsStore` chunk **1.5 MB → 204 KB** (locale JSON was ~85% of it; now one lazy chunk per
locale). `OnboardingFlow` lazy chunk carries framer-motion (117 KB) — nothing eager grew.

Installer: the bundled Qdrant binary (~85 MB per platform) is gone.

## Completed optimizations

### Startup critical path (Phase 1)
- Dictation hotkey registers before the main-window renderer finishes loading (`windowManager.js` —
  hotkeys come from `.env`, not from secret decryption).
- Native key listener (Windows/Linux push-to-talk + polish hotkey) spawns right after hotkey
  registration; the legacy 3-second reconcile delay is deleted.
- Polish (Win+Alt+1) slot registration + native key event wiring moved to immediately after
  `createMainWindow()`.
- Secret decryption (`environmentManager.init()`) runs concurrently with window creation; secret-getter
  IPC handlers await the same memoized promise. Cookie→bearer migration also concurrent.
- Sidecar reaper is async (promisified `execFile` instead of `execFileSync("tasklist")`) and awaited
  just before fresh sidecars spawn instead of blocking startApp's first line.
- Agent window creation is fire-and-forget — `toggleAgentOverlay` no-ops until it exists.
- Sidecar storm staggered: T+0 whisper/parakeet prewarm + tray; T+3 s local-LLM prewarm + vector index;
  T+10 s model downloads + update check. All batches gated on the main window still being alive.
- `electron-updater` (~200 ms require) loads on first updater use, not at boot (`src/updater.js`).

### Runtime (Phase 2)
- **Locale lazy-loading** (`src/i18n.ts`): only `en` ships eagerly (it is the fallback); the other 9
  locales are per-locale dynamic-import chunks loaded by `changeUiLanguage()`. Main process
  (`i18nMain.js`) likewise requires only `en` + the active `UI_LANGUAGE`. Trade-off: non-en users can see
  one frame of English on cold start.
- **Settings context memoized** (`useSettings.ts`): the ~140-key context value is `useMemo`'d on the
  zustand snapshot, so unrelated settings writes stop re-rendering all consumers.
- **DB index**: `idx_transcriptions_deleted_at_timestamp` covers the history list query
  (`WHERE deleted_at IS NULL ORDER BY timestamp DESC`).
- **Prepared-statement cache** (`database.js` `_prep()`): transcription hot paths stop re-parsing SQL.
- **WindowControls**: maximize state is pushed (`window-maximized-changed`) instead of polled every 1 s.
- **useMicLevel**: waveform setState throttled to ~20 fps inside the rAF loop.
- **Health-check idle backoff** (whisper/parakeet/llama servers): 5 s checks for 60 s after
  start/activity, then 30 s. `noteActivity()` bumps the window from transcribe/prewarm paths.
  llamaServer's failure-threshold logic is preserved.
- **Meeting detection gating**: `processDetection`/`audioDetection` persist via `environment.js`
  (`MEETING_PROCESS_DETECTION`/`MEETING_AUDIO_DETECTION`), so start-minimized launches respect a
  disabled detector instead of defaulting the 30 s `tasklist` poll on.
- **Meeting audio IPC batching**: 800 → 4,800 samples per message (33 ms → 200 ms; ~60 → ~10 msg/s).
  Knob: `MEETING_AUDIO_BUFFER_SIZE` in `meetingRecordingStore.ts`; drop to 2400 if captions lag.

### Verified already fine (don't re-litigate)
- HistoryView is virtualized (`@tanstack/react-virtual`) — roadmap ⚡#3 is done.
- InsightsView / PersonalNotesView are lazy chunks; no highlight.js in the renderer graph.
- Audio→IPC uses transferable ArrayBuffers; no `sendSync` IPC anywhere.

### Qdrant → sqlite-vec (Phase 2.5)
`vectorIndex.js` keeps its public API but stores vectors in `vec0` virtual tables
(`vec_notes`, `vec_conversation_chunks`, `distance_metric=cosine`) on the existing better-sqlite3
handle. Score = 1 − distance, so the pre-existing 0.3 similarity thresholds are unchanged. Removed:
the 85 MB binary, the spawned process + port 6333–6350, its health-check loop, `download-qdrant.js`,
CI steps, and `@qdrant/js-client-rest`. Existing installs re-embed their notes once on first launch
(local + cheap). Also fixed: `ipcHandlers.vectorIndex` was never assigned, so conversation-chunk
indexing had been silently dead.

### Cinematic onboarding (Phase 3, roadmap UI/UX #7)
Not a perf item, but shipped in the same branch: scripted in-app dictation demo step, live mic-test orb,
spring step transitions. framer-motion is confined to the lazy OnboardingFlow chunk.

## Phase 5 (planned in this effort)

1. **Memory-pressure model eviction** — extend roadmap ⚡#1 with an `os.freemem()` poll (30 s) that
   unloads loaded local models below a threshold, with a re-trigger cooldown. Electron has no native
   low-memory event on Windows; freemem polling is the pragmatic baseline.
2. **Transform plugin system** — file-based transforms in `~/.dhwani/transforms/` feeding the existing
   per-transform hotkey slot registration; import/export from the Transforms UI.
3. **Full keyboard navigation** — audit-first (Radix already covers most): virtualized list focus,
   custom card `tabIndex`/`aria-*`, `:focus-visible` ring pass.
4. **Live hotkey conflict indicator** — debounced read-only `check-hotkey-conflict` IPC wrapping the
   existing `_findSlotConflict`; red/green inline state while typing, save-time validation stays.

## Future backlog (carried from roadmap ⚡ Performance)

| # | Item | Status |
|---|---|---|
| 1 | Smart Model Suspend (idle unload) | llamaServer already has an idle timer; whisper/parakeet pending. Phase 5.1 adds memory-pressure eviction on top |
| 2 | Audio Stream Chunker (disk-backed long recordings) | Open |
| 3 | List Virtualization for History | **Done** (already shipped) |
| 4 | Segment-Parallel Transcription | Open |
| 5 | Local Prompt Caching (llama.cpp KV reuse) | Open |
| 6 | Battery-Aware Power Modes | Open |
| 7 | Hardware-Aware Quantization Picker | Partially exists — `get-recommended-model` picks per-hardware models in onboarding |
| 8 | Speculative Streaming Transcription | **[IN PROGRESS]** |
| 9 | Pre-Warmed Inference Pipeline | Partially — active STT prewarms at T+0 on startup; focus-triggered warmup open |
| 10 | Adaptive Acoustic Profile | Open |
| 11 | Rust/C++ native addon for audio math | Open — low priority |
| 12 | Electron V8 snapshotting | Open — low priority |

New candidates found during this effort:

- Per-consumer zustand selectors to replace the remaining broad `useSettings()` consumers.
- Drive mic-level bars via CSS variables instead of React state (zero re-renders).
- Lazy-download STT binaries on first use instead of bundling all of them.
- Obsidian/markdown export for notes; DB export/import backup.
- CLI bridge subcommands (`dhwani transcribe <file>` etc.).
- Unified retry/backoff wrapper for cloud calls (calendar sync already has one; providers don't).
