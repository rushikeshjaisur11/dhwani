# Dhwani Productivity Roadmap

This document outlines planned alignment fixes and new productivity features to enhance Dhwani's capabilities as an on-device AI dictation and editing assistant.

---

## 🛠️ High Priority Alignment Fixes

### 1. Unified Style Tones (Connecting Sidebar & Pipeline)
* **Goal:** Sync the sidebar **Style** view with the settings store so selecting a tone has an immediate impact on dictation.
* **Tasks:**
  - Update `StyleView.tsx` to read/write directly to the settings store keys (`styleToneWork`, `styleToneEmail`, `styleTonePersonal`, `styleToneOther`) instead of a separate `"dictationStyle"` key in `localStorage`.
  - Add `"veryCasual"` to the instructions mapping in `appCategory.js` (*"Adjust tone to be very casual, relaxed, and informal"*).
  - Include "Very Casual" in the Settings Page Personalized Styles dropdowns.

---

## 💡 New Productivity Feature Ideas

### 1. Smart Snippets with Dynamic Variables
* **Concept:** Upgrade the existing static text Snippets to support dynamic placeholders resolved at the moment of insertion.
* **Placeholders to Support:**
  - `{{clipboard}}` - Inserts the current clipboard text.
  - `{{date}}` / `{{time}}` - Inserts the current date/time.
  - `{{cursor}}` - Positions the text cursor at this spot after pasting.
* **Example:** A snippet triggers on `/ref` and expands to:
  > *"Regarding your question about **{{clipboard}}**, here is the documentation..."*

### 2. Auto Action-Item Extractor (Voice-to-Task)
* **Concept:** A post-processing option that parses transcriptions (especially meeting recordings) to automatically extract action items.
* **How it works:**
  - A background LLM call runs after dictation to extract TODOs.
  - Appends them to the Scratchpad or creates a task checklist in a new Note under a "Tasks" folder.

### 3. Floating Always-on-Top "Micro-Notes"
* **Concept:** Allow users to pop out any note or scratchpad into a small, borderless, semi-transparent, always-on-top window.
* **How it works:**
  - Adds a "pin" icon to Note headers.
  - Clicking it invokes Electron main process to open a lightweight browser window displaying just the text editor.
* **Benefit:** Perfect for keeping reference material or instructions visible while writing code or writing emails in full-screen apps.

### 4. Inline Voice Commands
* **Concept:** Let users run editing commands directly using their voice during dictation.
* **How it works:**
  - If a user says command phrases (e.g., *"command: delete last sentence"*, *"command: format as markdown table"*), the reasoning service executes the instruction on the preceding text block in-place.
* **Benefit:** Allows fully hands-free writing and editing.

### 5. Local Dictation Clipboard History
* **Concept:** Maintain a local searchable cache of the last 50 transcriptions directly inside the Dhwani panel.
* **Benefit:** Quickly search, copy, or re-paste recent thoughts even if they were overwritten in the clipboard.

### 6. One-Click Reformatting HUD
* **Concept:** Instantly format your dictated text for different destinations without writing a new AI prompt.
* **How it works:**
  - When dictation finishes, a small, subtle floating HUD (Heads-Up Display) appears briefly near your cursor.
  - It shows quick buttons to copy/paste the text reformatted as:
    - **📧 Email** (adds formal greeting/salutation).
    - **💬 Slack** (adds conversational flow and markdown emojis).
    - **💻 Code Comment** (prefixes lines with `//` or `#`).
    - **📊 Markdown** (adds headings and bulleted structure).
* **Benefit:** One dictate action satisfies multiple communication channels.

### 7. Live Voice Profiles (Acoustic Filtering)
* **Concept:** If you are dictating in a noisy room (like a cafe or airport), configure a local "Voice Profile" that suppresses all background noise and other human voices.
* **How it works:**
  - Train a local audio-model on 10 seconds of your voice.
  - The recording manager applies a spectral gate to target only your specific vocal frequency range before feeding the audio to Whisper.
* **Benefit:** Massive accuracy improvements for mobile or remote workers in public places.

### 8. Home Screen "Meetings" Tab
* **Concept:** Provide a dedicated "Meetings" history list directly next to the "Dictations" history list on the Home screen.
* **How it works:**
  - Introduce sub-tabs ("Dictations" and "Meetings") at the top of the Home panel (`ControlPanel.tsx`).
  - Query the local database for notes where `note_type === 'meeting'`.
  - Group and display meetings chronologically (grouped by date) showing title, time, duration, and a quick-preview summary card.
  - Clicking a meeting note directly opens it in the note editor.
* **Benefit:** Immediate accessibility to all past meeting recordings and AI summaries directly from the landing dashboard, without having to dig through Notes folders.

### 9. Self-Learning Phonetic Correction (Zero-Config Dictionary)
* **Concept:** The application automatically learns your jargon, names, and vocabulary preferences simply by watching how you edit your text.
* **How it works:**
  - When Dhwani pastes a transcript, it monitors if you immediately edit a word (e.g., correcting *"Wispr"* to *"Whisper"*).
  - It aligns the original Whisper output with the corrected text, mapping the audio segment phonetically, and logs it in a local database.
  - Next time, it automatically boosts those specific words in the Whisper prompt.
* **Benefit:** The app adapts to your personal vocabulary over time without requiring you to open settings and manually manage a custom dictionary.

---

## ⚡ Performance Feature Ideas

### 1. Smart Model Suspend (Memory Saver)
* **Concept:** Dynamically unload AI models (Whisper/LLMs) from RAM and VRAM when the application has been idle for a specified duration.
* **How it works:**
  - Introduce an idle timer setting (e.g. *"Unload models after 15 minutes of inactivity"*).
  - When idle, send an IPC call to the main process to terminate/unload model instances.
  - When the global hotkey is pressed, trigger a fast hot-reload (or display a quick loading overlay).
* **Benefit:** Frees up gigabytes of RAM/VRAM for other demanding desktop apps (like gaming or design software) when Dhwani is sitting in the tray.

### 2. Audio Stream Chunker (Low Memory Footprint)
* **Concept:** Prevent high memory consumption during long meeting recordings by writing audio directly to disk in chunks rather than keeping raw PCM buffers in RAM.
* **How it works:**
  - Periodically compress and flush recorded audio blocks to temporary files.
  - On stop, concatenate the files before sending them to the STT transcriber.
* **Benefit:** Prevents application crashes and keeps Dhwani's memory usage under 100MB even during multi-hour recordings.

### 3. List Virtualization for History Views
* **Concept:** Optimize the Home view's transcription list to handle thousands of rows with zero rendering lag.
* **How it works:**
  - Re-implement the list item renderer in `HistoryView.tsx` using the `@tanstack/react-virtual` library (already present in the dependencies).
  - Only render elements currently visible in the DOM viewport.
* **Benefit:** Instant loading and buttery-smooth scrolling of history views regardless of history size.

### 4. Segment-Parallel Transcription (Multithreaded STT)
* **Concept:** Speed up long audio transcriptions (like meeting recordings or uploaded files) by processing them in parallel.
* **How it works:**
  - Instead of transcribing a 30-minute audio file sequentially, the app uses Voice Activity Detection (VAD) to split the audio into logical segments (silence boundaries).
  - It distributes these segments across multiple local Whisper worker threads concurrently (utilizing all available CPU cores) and then merges the transcripts back chronologically.
* **Benefit:** Can cut transcription times for long recordings by 2x to 4x on multi-core processors.

### 5. Local Prompt Caching (Instant LLM Generation)
* **Concept:** Eliminate the "prompt processing" lag that occurs every time you run a dictation cleanup or custom transform.
* **How it works:**
  - Leverage KV (Key-Value) caching in the local inference runner (llama.cpp / ollama).
  - The compiler caches the evaluated state of the system prompts and historical context. When you run consecutive dictations or polish commands, the LLM starts generating text instantly rather than re-evaluating the prompt from scratch.
* **Benefit:** Reduces the initial delay before the LLM starts writing from 2–3 seconds down to milliseconds.

### 6. Battery-Aware Power Modes
* **Concept:** Dynamically adjust model sizes and CPU threads depending on whether the laptop is plugged in or running on battery.
* **How it works:**
  - The Electron main process monitors the battery state.
  - **On Battery:** Swaps to smaller, highly efficient models (e.g. Whisper base instead of medium) and reduces the thread count to save battery life.
  - **On AC Power:** Swaps back to maximum precision models.
* **Benefit:** Prevents Dhwani from draining your laptop battery during long sessions when you are working on the go.

### 7. Hardware-Aware Quantization Picker (Smart Downloader)
* **Concept:** Automate the selection of model weight files based on the user's specific hardware specs.
* **How it works:**
  - On first run, detect system parameters: VRAM capacity, unified memory size (on Apple Silicon), RAM size, and CPU extension support (AVX2, AVX-512).
  - Automatically download and configure the most performant model quantization (e.g., suggesting a highly-quantized 4-bit model for 8GB RAM systems, or an unquantized/8-bit model for high-end systems).
* **Benefit:** Prevents out-of-memory crashes and lag for users who don't know which model version matches their hardware.

### 8. Speculative Streaming Transcription (Near-Instant Paste)
* **Concept:** Eliminate the waiting time after releasing the recording hotkey by transcribing speech in real-time.
* **How it works:**
  - Stream audio chunks to the local Whisper engine continuously while the user is speaking.
  - When the hotkey is released, only the last few seconds of audio need to be transcribed.
* **Benefit:** Dictation is pasted near-instantly when the hotkey is released, regardless of how long the user spoke.

### 9. Pre-Warmed Inference Pipeline (Zero Startup Delay)
* **Concept:** Eliminate the startup lag (typically 1–2 seconds) when initiating dictation after system idle.
* **How it works:**
  - Detect when the user focuses a text input field or starts typing.
  - Automatically load/warm up the local Whisper and LLM engines in the background.
* **Benefit:** Recording starts the exact millisecond the dictation hotkey is pressed.

### 10. Adaptive Acoustic Profile (Environment-Aware STT)
* **Concept:** Dynamically adjust the noise-suppression filter strength and Whisper model size based on background noise levels.
* **How it works:**
  - Continually analyze background noise levels (SNR) before recording starts.
  - Apply deep-learning noise-cancellation (like RNNoise) and select larger Whisper models (e.g. Medium instead of Base) only when the environment is loud.
* **Benefit:** Maximizes speed in quiet settings, while preserving high transcription accuracy in cafes or airports.

---

## 🎨 UI/UX Feature Ideas

### 1. Floating Glassmorphic Dictation HUD (With Audio Wave)
* **Concept:** Redesign the dictation overlay from a simple popup into a premium, responsive HUD that feels "alive."
* **How it works:**
  - Use a sleek glassmorphic card (heavy backdrop-blur, semi-transparent dark/light fill, and a subtle glowing border colored with the active accent color).
  - Add a fluid SVG audio wave visualizer that ripples and changes amplitude dynamically based on the microphone's input volume.
  - Apply spring-like entrance and exit animations (sliding up from the bottom of the screen).

### 2. Collapsible Sidebar with Peek Transition
* **Concept:** Save screen real estate while keeping navigation fluid.
* **How it works:**
  - Allow the sidebar to collapse into a minimal, vertical strip of icons.
  - When the user hovers over the collapsed strip, it smoothly "peeks" open to reveal the text labels using a spring transition.
  - Add micro-animations to sidebar icons.

### 3. Raycast-Style Cmd+K Command Center
* **Concept:** Enhance the search overlay (`CommandSearch.tsx`) to feel like a premium command center.
* **How it works:**
  - Group search results into clear, visually distinct sections (Notes, Settings, Actions, Snippets) with subtle separator lines.
  - Align custom keyboard shortcuts (styled as modern, rounded `Kbd` badges) perfectly on the right edge of each list row.
  - Implement smooth height auto-resizing on the container card as results filter down.

### 4. Premium Workspace Card Switcher
* **Concept:** Redesign the workspace dropdown to feel like a modern collaborative tool.
* **How it works:**
  - Instead of a native dropdown menu, clicking the workspace name opens a floating list of visual cards.
  - Each workspace card shows its name, a colored monogram avatar, and participant badges.
  - Highlight the active workspace with a checkmark and a subtle gradient glow.

### 5. Interactive Cards for Settings Rows
* **Concept:** Ditch the long plain settings list for interactive grid cards.
* **How it works:**
  - Group settings into distinct visual panels with rounded corners.
  - Hovering over a settings row highlights the entire row with a soft background wash and focuses the associated toggle switch.
  - Add tooltips that fade in smoothly with context explanations.
