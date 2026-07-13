<h1 align="center">Dhwani — ध्वनि</h1>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat" alt="License" />
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey?style=flat" alt="Platform" />
  <img src="https://img.shields.io/badge/status-in%20development-orange?style=flat" alt="Status" />
</p>

<p align="center">
  Fully on-device multilingual voice dictation with its own fine-tuned STT model family.<br/>
  Hold a hotkey, speak, release — clean text appears at your cursor in any app. Your audio never leaves your machine.
</p>

<p align="center">
  Fork of <a href="https://github.com/OpenWhispr/openwhispr">OpenWhispr</a> (MIT). Docs: <a href="docs/README.md">docs/</a>
</p>

---

Dhwani turns your voice into text, notes, and actions from your desktop. Press a hotkey, speak, and your words appear at your cursor. Fully private offline transcription with local speech-to-text engines like Whisper and NVIDIA Parakeet — your audio never leaves your device. No data collection, no telemetry.

## Download

No packaged installers yet — build from source (see [Quick start](#quick-start) below). Windows is the
only actively-built and released platform (see [`docs/build-and-deploy.md`](docs/build-and-deploy.md));
once a release is tagged, signed `.exe`/NSIS installers will publish to this repo's
[Releases](https://github.com/rushikeshjaisur11/dhwani/releases) page.

## Features

- **Voice dictation** — global hotkey to dictate into any app with automatic pasting
- **AI agent** — talk to GPT-5, Claude, Gemini, Groq, or local models with a named voice assistant
- **Voice agent hotkey** — dedicated hotkey that sends your dictation straight to your AI agent as a command, no wake word needed and no cleanup pass
- **Flow Bar overlay** — right-edge docked strip that expands into an icon stack (mic, scratchpad, transforms) with a transform menu and functional Auto Apply After Dictation toggle
- **Polish** — select text in any app and rewrite it in place (concise, clarity, readability, structure) via a dedicated hotkey; results show as an inline word-level diff card (Win+Alt+O to replay) with copy/feedback/retry actions
- **Transforms** — Polish and Prompt Engineer with full config pages (custom shortcuts, Polish rule toggles, editable Prompt Engineer prompt), plus user-created transforms
- **Scratchpad** — floating always-on-top quick-note overlay backed by the notes DB, openable from the Flow Bar, settings, or its own hotkey
- **Command Mode** — a hotkey that treats your speech as an instruction rather than dictation
- **Snippets & Dictionary** — trigger→expansion text snippets and a custom vocabulary that biases transcription and survives cleanup
- **Insights** — total words, dictations, average WPM, and day streak computed from your local history
- **Personalized Styles** — set a casual/formal writing tone per app context (work, email, personal, other)
- **Meeting transcription** — auto-detect Zoom, Teams, and FaceTime calls with live speaker diarization, voice fingerprinting, and Google Calendar integration
- **Local speaker diarization** — on-device speaker labelling with voice fingerprint recognition across meetings, no cloud required
- **Notes** — create, organize, and search notes with folders, semantic search, cloud sync, and AI actions
- **Local or cloud — your choice** — all core features (transcription, AI reasoning, speaker diarization, semantic search) work with local models or cloud providers
- **Public API & MCP** — manage notes and transcriptions programmatically or connect your AI assistant via the MCP server

## Quick start

```bash
git clone https://github.com/rushikeshjaisur11/dhwani.git
cd dhwani
npm install
npm run dev
```

Requires Node.js 24+ (pinned in `.nvmrc`). Windows is the only actively-built/released platform — see
[`docs/build-and-deploy.md`](docs/build-and-deploy.md) for native-helper compilation and packaging details.

## Documentation

See [`docs/`](docs/) in this repo:

- [`docs/README.md`](docs/README.md) — index
- [`docs/architecture.md`](docs/architecture.md) — process model, window architecture, storage
- [`docs/data-flow.md`](docs/data-flow.md) — dictation pipeline, live typing, meeting detection
- [`docs/features.md`](docs/features.md) — hotkeys, snippets/style/transforms/scratchpad, dictionary
- [`docs/build-and-deploy.md`](docs/build-and-deploy.md) — build, native helpers, CI, releases
- [`docs/ipc-reference.md`](docs/ipc-reference.md) — main↔renderer IPC channel map

## Tech stack

React 19, TypeScript, Tailwind CSS v4, Electron 41, better-sqlite3, whisper.cpp, sherpa-onnx, shadcn/ui

## Contributing

We welcome contributions. Fork the repo, create a feature branch, and open a pull request. See
[`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE) — free for personal and commercial use.

## Acknowledgments

- **[OpenAI Whisper](https://github.com/openai/whisper)** — speech recognition model powering local and cloud transcription
- **[whisper.cpp](https://github.com/ggerganov/whisper.cpp)** — high-performance C++ implementation for local processing
- **[NVIDIA Parakeet](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)** — fast multilingual ASR model
- **[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)** — cross-platform ONNX runtime for Parakeet inference
- **[Hugging Face](https://huggingface.co/)** — model hub hosting Whisper, Parakeet, and embedding model weights
- **[llama.cpp](https://github.com/ggerganov/llama.cpp)** — local LLM inference for AI text processing
- **[Electron](https://www.electronjs.org/)** — cross-platform desktop framework
- **[React](https://react.dev/)** — UI component library
- **[shadcn/ui](https://ui.shadcn.com/)** — accessible components built on Radix primitives
- **[OpenWhispr](https://github.com/OpenWhispr/openwhispr)** — the project Dhwani is forked from
