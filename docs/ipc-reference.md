# IPC Reference

Dhwani registers roughly **380 `ipcMain` channels**, almost entirely in `src/helpers/ipcHandlers.js`
(a handful in `main.js` itself — hotkey registration, tray sync). This is a categorized map, not an
exhaustive list — grep the channel name in `ipcHandlers.js`/`main.js` for the exact handler, and in
`preload.js` for the renderer-facing method name (`window.electronAPI.<method>`).

```
grep -n '"channel-name"' src/helpers/ipcHandlers.js main.js
grep -n 'channel-name' preload.js
```

## Categories

| Prefix / pattern | Count (approx) | Covers |
|---|---|---|
| `db-*` | ~70 | SQLite CRUD — transcriptions, notes, folders, agent conversations, dictionary, insights stats |
| `*-streaming` | ~18 | Realtime cloud transcription (AssemblyAI, Deepgram, Corti) — connect/send-audio/stop per provider |
| `save-*` / `get-*` (Azure/Bedrock/Vertex) | ~24 | Enterprise cloud credential persistence (`safeStorage`-encrypted) |
| `register-*-hotkey` / `update-*-hotkey` / `get-*-key` | ~13 | Per-slot hotkey registration (see [features.md](features.md#hotkey-slots)) |
| `window-*` / `resize-*` / `hide-*` / `show-*` | several | Window lifecycle and sizing |
| `whisper-server-*` / `parakeet-server-*` / `llama-server-*` / `llama-cpp-*` | several | Local inference sidecar lifecycle (start/stop/status) |
| `model-*` / `download-*` | several | Model download progress, cancel, list installed |
| `gcal-*` | ~4 | Google Calendar OAuth + event fetch |
| `meeting-transcription-*` / `dictation-realtime-*` | several | Meeting-mode and realtime-preview transcription streams |
| `export-*` / `delete-all-*` | several | Data export, bulk delete (audio, transcriptions) |
| `cloud-*` | several | "OpenWhispr Cloud" reasoning proxy (see `CLAUDE.md` "Kept OpenWhispr references") |

## Main → renderer pushes (not `ipcMain`-registered — `webContents.send`)

These originate in main and are received via `preload.js`'s `registerListener` pattern
(`window.electronAPI.on<Event>(callback)`, returns an unsubscribe function):

- `tray-select-microphone`, `tray-select-language` — user picked a device/language from the tray submenu;
  renderer applies it via the real `useSettings()` setters (see `useTraySync.ts`)
- `open-settings-section` — tray's "Shortcuts" item deep-links into Settings → Hotkeys
- `setting-updated` — generic settings-sync push (hotkeyManager)
- `dictation-key-active`, `hotkey-fallback-used`, `hotkey-registration-failed` — hotkey state changes
- `toggle-dictation`, `toggle-voice-agent`, `trigger-polish`, `start-dictation`, `stop-dictation` —
  hotkey-triggered actions relayed to the dictation overlay
- `floating-icon-auto-hide-changed`, `cuda-fallback-notification` — misc main→renderer state sync

## Renderer → main pushes (`ipcRenderer.send`, no response expected)

- `tray-sync-microphones`, `tray-sync-language` — renderer pushes its WebRTC device list and current
  settings to main, since main can't enumerate audio devices or read the Zustand-backed settings store
  itself (see `useTraySync.ts` and `architecture.md`)
- `activation-mode-changed`, `floating-icon-auto-hide-changed`, `start-minimized-changed`,
  `panel-start-position-changed` — settings writes that don't need a response

## Adding a new IPC channel

Per `CLAUDE.md`'s "Adding New Features" section: add the handler in `ipcHandlers.js` (or `main.js` if it
needs a closure over a `main.js`-local variable like `hotkeyManager` or `trayManager`), expose it in
`preload.js` via `contextBridge`, and add the method's type signature to `src/types/electron.ts`'s
`electronAPI` interface so `window.electronAPI.yourMethod` typechecks in the renderer.
