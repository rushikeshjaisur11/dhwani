# Features

## Hotkey slots

`hotkeyManager.js` manages named, independently-configurable global hotkey slots. Each slot is
registered/unregistered/persisted separately, with cross-slot conflict detection
(`validateHotkeyForSlot`) so two slots can't share the same combo.

| Slot | Default | Purpose | Settings location |
|---|---|---|---|
| `dictation` | `Control+Super` (Win/Linux), `GLOBE` (macOS) | Start/stop standard dictation | General |
| `agent` | none (opt-in) | Toggle the chat agent overlay window | AI Models |
| `voiceAgent` | none (opt-in) | Dictation routed straight to the agent as a command, bypassing cleanup — no "Hey \[name]" wake word needed | General |
| `polish` | none (opt-in) | Rewrite the currently-selected text in any app in place | General → Polish Hotkey |
| `meeting` | none (opt-in) | Manually start meeting-mode recording | General |
| `pasteLastTranscript` | `Alt+Shift+Z` | Paste the most recent dictation at the cursor again | General → Paste Last Transcript |

Push-to-talk is supported only on the `dictation` slot; every other slot is tap-to-toggle. On
Windows, compound and modifier-only hotkeys (e.g. `Control+Super`) go through a native low-level keyboard
hook (`windows-key-listener.exe`) since Electron's `globalShortcut` can't capture modifier-only
combinations.

## Paste Last Transcript

Repastes the most recent dictation without re-recording. Two trigger points, one implementation:

- **Tray menu** → "Paste last transcript"
- **Global hotkey** → `Alt+Shift+Z` by default, remappable in Settings

Both call the same `main.js` callback: read the latest row from the transcriptions table
(`databaseManager.getTranscriptions(1)`), paste its `text` field via the shared `clipboard.js` path. See
[data-flow.md](data-flow.md#paste-path).

## Sidebar tools

The control panel sidebar (Home, Insights, Dictionary, Snippets, Style, Transforms, Scratchpad, Chat,
Notes, Upload, Integrations) — the first seven mirror Wispr Flow's layout; the last four are
Dhwani-specific features kept below the fold rather than removed.

- **Snippets** (`SnippetsView.tsx`) — say a trigger word, it's replaced with saved text (a URL, an intro,
  a prompt). Backed by `useSettings().snippets`, fully wired into the dictation expansion path
  (`src/utils/snippets.ts`).
- **Style** (`StyleView.tsx`) — per-context (personal/work/email/other) tone presets (Formal/Casual/Very casual). Fully integrated into the cleanup prompt pipeline via `resolveStyleInstruction` in `appCategory.js` and parsed in `audioManager.js`.
- **Transforms** (`TransformsView.tsx`) — save reusable rewrite prompts. Fully integrated into the application: users can map custom hotkeys to specific transforms, which captures selected text, runs it through the reasoning model, and pastes the result back.
- **Scratchpad** (`ScratchpadView.tsx`) — one persistent scratch note, autosaved to `localStorage`. Not
  wired into the multi-note system (`PersonalNotesView.tsx`) — intentionally simpler, matching what Wispr's
  Scratchpad actually is (a single always-available pad, not a notes app).

## Custom dictionary

Settings → Custom Dictionary. Words/phrases stored as a JSON array (`customDictionary` in the settings
store), joined and passed as the `prompt` parameter to Whisper — the model treats prompt words as strong
hints, improving recognition of uncommon names, jargon, and brand names. Works with both local whisper.cpp
and cloud OpenAI Whisper API.

## Local semantic search

See [data-flow.md](data-flow.md#local-semantic-search). Only reachable through the AI agent's
`search_notes` tool today, not the manual search UI (Cmd/Ctrl+K).

## Contextual right panel

The control panel's right panel (`ContextPanel.tsx`) shows Home/Insights-relevant content (total
words/WPM/day-streak stats, Voice Profile progress, upcoming calendar meetings) and is `null` on every
other view — it's genuinely contextual, not a static sidebar that happens to always render the same thing.
