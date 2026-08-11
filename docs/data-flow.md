# Data Flow

## Dictation pipeline (standard, non-streaming)

1. User presses the dictation hotkey (default `Control+Super` on Windows, registered via
   `hotkeyManager.js`).
2. `windowManager` shows the dictation overlay; `useAudioRecording.js` starts `MediaRecorder` via
   `AudioManager` (`src/helpers/audioManager.js`).
3. User presses the hotkey again (tap-to-toggle) or releases it (push-to-talk) → recording stops.
4. Audio `Blob` → `ArrayBuffer` → sent over IPC to the main process → written to a temporary file.
5. The active local engine (whisper.cpp `whisper-server.exe` or Parakeet `sherpa-onnx-ws.exe`) or a cloud
   provider transcribes the file. Temp file is deleted after processing.
6. If a cleanup model is configured, the raw transcript is sent through the LLM cleanup pipeline (adds
   punctuation, fixes filler words, optionally applies the `{{activeApp}}`-aware prompt so cleanup style
   adapts to the app you're dictating into).
7. Final text is copied to the clipboard and auto-pasted at the cursor (`clipboard.js`), and saved to the
   transcriptions table (`database.js`) unless data retention is disabled.

```mermaid
sequenceDiagram
    participant User
    participant Overlay as Dictation overlay (App.jsx)
    participant Main as Main process
    participant Engine as Whisper / Parakeet
    participant LLM as Cleanup model
    participant Clipboard

    User->>Overlay: press hotkey
    Overlay->>Main: start recording (MediaRecorder)
    User->>Overlay: press hotkey again
    Overlay->>Main: stop recording, send audio buffer
    Main->>Engine: transcribe(tempFile)
    Engine-->>Main: raw text
    Main->>LLM: cleanup(raw text, activeApp context)
    LLM-->>Main: cleaned text
    Main->>Clipboard: write + auto-paste
    Main->>Main: save to SQLite (unless retention disabled)
```

Note: `windows-fast-paste.exe` has a `--type` mode (raw `SendInput` streaming injection) in its C source,
but nothing in this codebase currently calls it with that flag — every paste today goes through the single
clipboard-paste path (`Ctrl+V`/`Cmd+V`) described above.

An earlier version of this pipeline pasted the raw transcript immediately, then erased it with backspaces
and pasted the cleaned version once cleanup finished ("instant paste"). It was removed — the delete-then-
repaste was visibly janky in some target apps — in favor of always waiting for the full pipeline (steps
5-6 above) before the single paste in step 7.

## Meeting detection

Three independent, event-driven signal sources feed `MeetingDetectionEngine`
(`src/helpers/meetingDetectionEngine.js`), which coalesces them into a single notification:

```mermaid
flowchart LR
    Process["MeetingProcessDetector<br/>known apps: Zoom/Teams/Webex<br/>(macOS: event-driven,<br/>Win/Linux: 30s poll)"]
    Audio["AudioActivityDetector<br/>unscheduled meetings<br/>(mic-in-use, event-driven<br/>via windows-mic-listener.exe)"]
    Calendar["GoogleCalendarManager<br/>imminent/active events"]
    Engine["MeetingDetectionEngine"]
    Notify["Notification overlay<br/>(one, not three)"]

    Process --> Engine
    Audio --> Engine
    Calendar -.context.-> Engine
    Engine --> Notify
```

Rules: all notifications are suppressed while actively recording (tap or push-to-talk); a 2.5s
post-recording cooldown avoids a notification flashing right after you finish dictating; process detection
takes priority over audio detection when both fire, so exactly one notification shows.

## Paste path

`clipboard.js`'s `pasteText(text, options)` is the single entry point used by both the end-of-dictation
paste and the tray/hotkey-triggered "Paste last transcript" feature
(`main.js`'s `pasteLastTranscriptCallback`, reading `databaseManager.getTranscriptions(1)`). Platform
dispatch:

- **Windows**: PowerShell `SendKeys`, or bundled `nircmd.exe` as fallback; `windows-fast-paste.exe`
  (SendInput) for the live-typing streaming path specifically.
- **macOS**: AppleScript (requires Accessibility permission); falls back to clipboard-only with a manual
  paste prompt if permission is denied.
- **Linux**: native XTest binary first (works on X11 and XWayland), then xdotool/wtype/ydotool depending
  on compositor.

## Local semantic search

Always-on, offline. Vectors live in `vec0` (sqlite-vec) virtual tables inside the app's SQLite database —
no separate process. The `all-MiniLM-L6-v2` embedding model runs in the ONNX utility process and
auto-downloads on first use if missing.

```mermaid
flowchart LR
    Note["Note create/update"] --> SQLite["SQLite write"]
    SQLite -.background.-> Vector["Vector upsert<br/>(sqlite-vec vec0, 384-dim)"]
    Query["Agent search_notes tool"] --> FTS["FTS5 keyword search"]
    Query --> VSearch["sqlite-vec vector search"]
    FTS --> RRF["Reciprocal Rank Fusion<br/>(k=60, 0.3 cosine threshold)"]
    VSearch --> RRF
    RRF --> Results["Ranked results"]
```

If the sqlite-vec extension fails to load, search silently falls back to FTS5 keyword search only —
semantic search is a progressive enhancement, not a hard dependency, for the agent's note search.
