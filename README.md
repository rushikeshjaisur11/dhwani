<h1 align="center">Dhwani — ध्वनि</h1>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat" alt="License" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat" alt="Platform" />
  <img src="https://img.shields.io/badge/status-in%20development-orange?style=flat" alt="Status" />
</p>

<p align="center">
  Fully on-device multilingual voice dictation with its own fine-tuned STT model family.<br/>
  Hold a hotkey, speak, release — clean text appears at your cursor in any app. Your audio never leaves your machine.
</p>

<p align="center">
  Fork of <a href="https://github.com/OpenWhispr/openwhispr">OpenWhispr</a> (MIT). Design spec: <a href="docs/superpowers/specs/2026-07-02-private-local-dictation-design.md">docs/superpowers/specs</a>
</p>

---

OpenWhispr turns your voice into text, notes, and actions from your desktop. Press a hotkey, speak, and your words appear at your cursor. Choose between fully private offline transcription with local speech-to-text engines like Whisper and NVIDIA Parakeet — where your audio never leaves your device — or cloud processing for speed. No data collection, no telemetry, fully open source.

## Download

| Platform              | Download                                                                                                                                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS (Apple Silicon) | [`.dmg`](https://github.com/OpenWhispr/openwhispr/releases/latest)                                                                                                                                                                                                                        |
| macOS (Intel)         | [`.dmg`](https://github.com/OpenWhispr/openwhispr/releases/latest)                                                                                                                                                                                                                        |
| Windows               | [`.exe`](https://github.com/OpenWhispr/openwhispr/releases/latest)                                                                                                                                                                                                                        |
| Linux                 | [`.AppImage`](https://github.com/OpenWhispr/openwhispr/releases/latest) / [`.deb`](https://github.com/OpenWhispr/openwhispr/releases/latest) / [`.rpm`](https://github.com/OpenWhispr/openwhispr/releases/latest) / [`.tar.gz`](https://github.com/OpenWhispr/openwhispr/releases/latest) |

## Features

- **Voice dictation** — global hotkey to dictate into any app with automatic pasting
- **AI agent** — talk to GPT-5, Claude, Gemini, Groq, or local models with a named voice assistant
- **Voice agent hotkey** — dedicated hotkey that sends your dictation straight to your AI agent as a command, no wake word needed and no cleanup pass
- **Flow Bar overlay** — restyled dictation pill with distinct idle/listening/processing/command visual states
- **Polish** — select text in any app and rewrite it in place (concise, clarity, tone, structure) via a dedicated hotkey
- **Command Mode** — a hotkey that treats your speech as an instruction rather than dictation
- **Snippets & Dictionary** — trigger→expansion text snippets and a custom vocabulary that biases transcription and survives cleanup
- **Insights** — total words, dictations, average WPM, and day streak computed from your local history
- **Personalized Styles** — set a casual/formal writing tone per app context (work, email, personal, other)
- **Meeting transcription** — auto-detect Zoom, Teams, and FaceTime calls with live speaker diarization, voice fingerprinting, and Google Calendar integration
- **Local speaker diarization** — on-device speaker labelling with voice fingerprint recognition across meetings, no cloud required
- **Notes** — create, organize, and search notes with folders, semantic search, cloud sync, and AI actions
- **Local or cloud — your choice** — all core features (transcription, AI reasoning, speaker diarization, semantic search) work with local models or cloud providers
- **Public API & MCP** — manage notes and transcriptions programmatically or connect your AI assistant via the [MCP server](https://docs.openwhispr.com/integrations/mcp)

## Quick start

```bash
git clone https://github.com/OpenWhispr/openwhispr.git
cd openwhispr
npm install
npm run dev
```

Requires Node.js 24+. See the [full documentation](https://docs.openwhispr.com/quickstart) for setup guides, platform-specific instructions, and build details.

## Documentation

Visit **[docs.openwhispr.com](https://docs.openwhispr.com)** for:

- [Getting started](https://docs.openwhispr.com/quickstart)
- [Platform guides](https://docs.openwhispr.com/platform/macos) (macOS, Windows, Linux)
- [API reference](https://docs.openwhispr.com/api/overview)
- [MCP server setup](https://docs.openwhispr.com/integrations/mcp)
- [Troubleshooting](https://docs.openwhispr.com/troubleshooting)

## Tech stack

React 19, TypeScript, Tailwind CSS v4, Electron 41, better-sqlite3, whisper.cpp, sherpa-onnx, shadcn/ui

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=OpenWhispr/openwhispr&type=date&legend=top-left)](https://www.star-history.com/#OpenWhispr/openwhispr&type=date&legend=top-left)

## Sponsors

<p align="center">
  <a href="https://console.neon.tech/app/?promo=openwhispr">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
      <img width="250" alt="Neon" src="https://neon.com/brand/neon-logo-light-color.svg">
    </picture>
  </a>
</p>

<p align="center"><a href="https://console.neon.tech/app/?promo=openwhispr">Neon</a> is the serverless Postgres platform powering OpenWhispr Cloud.</p>

## Contributing

We welcome contributions. Fork the repo, create a feature branch, and open a pull request. See the [contributing guide](https://docs.openwhispr.com/contributing) for development setup and guidelines.

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
- **[Neon](https://console.neon.tech/app/?promo=openwhispr)** — serverless Postgres powering OpenWhispr Cloud
