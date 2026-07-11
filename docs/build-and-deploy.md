# Build & Deploy

Dhwani ships Windows-only for now — see [CI workflows](#ci-workflows) below. The renderer/main-process code
is still platform-agnostic (macOS/Linux code paths exist and build locally), but only Windows artifacts are
produced by CI/release automation.

## Local dev setup

```
npm install          # Node 24 required (pinned in .nvmrc — CI uses Node 24)
npm run dev           # concurrently runs dev:renderer (vite, port 5183) + dev:main (electron)
```

`predev`/`predev:main` compile native helpers and download sidecar binaries automatically
(`compile:native` + `download:meeting-aec-helper` + `download:qdrant` + `download:embedding-model` +
`download:whisper-vad-model`). `sherpa-onnx` (Parakeet) is **not** in `predev` — run
`npm run download:sherpa-onnx` manually if you hit "binary not found".

## Native helper compilation (Windows)

No gcc/clang on PATH by default — native C helpers compile with MSVC:

```
cmd /c '"C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat" >nul && cl /O2 /nologo resources\<file>.c /Fe:resources\bin\<file>.exe user32.lib'
```

The `build-*.js` scripts (`scripts/build-windows-key-listener.js` etc.) try downloading a prebuilt binary
from GitHub releases **first** — after editing a `.c` source, compile manually or the script may fetch a
stale prebuilt (CI only rebuilds these on push to `main`).

Native helpers compiled for Windows: `windows-key-listener.c` (push-to-talk, low-level keyboard hook),
`windows-mic-listener.c` (WASAPI mic-session monitor for meeting detection), `windows-fast-paste.c`
(SendInput unicode injection for live typing), `windows-text-monitor.c` (UI Automation, auto-learn
corrections).

## Sidecar binaries

Downloaded (not compiled) into `resources/bin/` at `prebuild`/`predev` time:

| Binary | Purpose | Source |
|---|---|---|
| `whisper-server-win32-x64-cuda.exe` | Local Whisper ASR (CUDA) | whisper.cpp release, lives in `userData/bin/`, not `resources/bin/` |
| `sherpa-onnx-ws-win32-x64.exe` | Local Parakeet ASR | sherpa-onnx release |
| `qdrant-win32-x64.exe` | Vector DB for semantic search | Qdrant release |
| `llama-server` | Local LLM cleanup/agent inference | llama.cpp release |
| `nircmd.exe` | Windows clipboard fallback | bundled |
| `meeting-aec-helper-win32-x64.exe` | WebRTC echo cancellation for meeting recording | this repo's own `build-meeting-aec-helper.yml` |

CUDA whisper-server specifically lives in `%APPDATA%\Dhwani[-development]\bin\`, not `resources/bin/` —
it's a userData-scoped download, not a packaged resource.

## CI workflows (`.github/workflows/`)

Trimmed to Windows-only as of the 2026-07-11 CI pass — Linux/macOS/Nix jobs and workflows were removed
since only Windows ships:

| Workflow | Trigger | What it does |
|---|---|---|
| `build-and-notarize.yml` | push to main/develop, PR, manual | CI build check — `build-windows` job only (NSIS + zip, `--publish never`) |
| `release.yml` | push tag `v*.*.*`, manual | Publishes the Windows release artifact + `latest.yml` auto-update metadata |
| `build-windows-key-listener.yml` | push touching the `.c` source | Compiles + publishes the push-to-talk binary |
| `build-windows-mic-listener.yml` | push touching the `.c` source | Compiles + publishes the meeting mic-detection binary |
| `build-windows-fast-paste.yml` | push touching the `.c` source | Compiles + publishes the live-typing paste binary |
| `build-windows-text-monitor.yml` | push touching the `.c` source | Compiles + publishes the auto-learn text-monitor binary |
| `build-meeting-aec-helper.yml` | push touching `native/meeting-aec-helper/**` | Compiles the WebRTC AEC sidecar, `win32-x64` only |
| `codeql.yml` | push/PR to main, weekly | JS/TS security scan — platform-agnostic, kept regardless of target OS |

Removed: `build-linux-text-monitor.yml` (Linux-only), `update-nix.yml` (kept `nix/package.nix` in sync with
releases — the whole `nix/` directory and root `flake.nix`/`flake.lock` were removed alongside it, since
nothing else referenced them and there was no more automation keeping them current).

## Packaging

- `npm run pack` — unsigned build (`CSC_IDENTITY_AUTO_DISCOVERY=false`)
- `npm run build:win` — signed Windows build (NSIS installer + zip), self-signed code-signing cert in CI
- `afterSign.js` skips signing automatically when `CSC_IDENTITY_AUTO_DISCOVERY=false`
- **Lockfile**: always run `npm install` with Node 24 (matches CI) — `nvm exec 24 npm install` if your
  local Node differs. A mismatched major version produces an incompatible `package-lock.json` that breaks
  `npm ci` in CI.

## Auto-update

`release.yml` publishes `latest.yml` alongside the installer; the in-app updater (Settings → System →
Software Updates, and the tray's "Check for updates…") reads it via `updateManager.checkForUpdates()`
(`electron-updater` under the hood).
