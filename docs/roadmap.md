# Dhwani Productivity Roadmap

This document outlines planned alignment fixes and new productivity features to enhance Dhwani's capabilities as an on-device AI dictation and editing assistant.

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

### 10. Cadence-Based Auto-Formatting
* **Concept:** Format text based on the rhythmic timing and pauses of your speech rather than explicit voice commands.
* **How it works:**
  - Dhwani analyzes the silence gaps (VAD pauses) between your sentences.
  - If you take a 2-second breath, it automatically creates a new paragraph.
  - If you quickly list items (*"we need marketing, sales, and engineering"*), it detects the rapid, rhythmic cadence and automatically formats the output as a markdown bulleted list.
* **Benefit:** You never have to unnaturally dictate punctuation commands like "new line" or "comma" again, allowing for a pure, uninterrupted flow of thought.

### 11. Non-Destructive Paste (Auto-Clipboard Restore)
* **Concept:** Prevent dictation from overwriting whatever text or files you currently have copied to your system clipboard.
* **How it works:**
  - Before pasting the transcribed text into the active window (using simulated keystrokes like `Ctrl+V`), Dhwani temporarily saves the current state of your system clipboard.
  - It pastes the dictation, and then instantly restores your original clipboard contents in the background.
* **Benefit:** You can dictate a message and still hit `Ctrl+V` immediately after to paste the URL or text you originally had copied, without losing your clipboard history.

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

### 8. Speculative Streaming Transcription (Near-Instant Paste) [IN PROGRESS]
* **Concept:** Eliminate the waiting time after releasing the recording hotkey by transcribing and polishing speech in real-time.
* **How it works (Hybrid Pipelining):**
  - **Linear Pipeline:** For simple polishing, stream audio chunks to the local STT. When a Voice Activity Detection (VAD) pause is hit, lock the chunk and send it to the LLM (with previous chunks injected as context for accuracy).
  - **Structural Pipeline:** For complex tasks (e.g. Summarization), wait until recording is fully complete to process as a single block.
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

### 11. Rust/C++ Native Node Addon for Audio Math
* **Concept:** Move all remaining heavy mathematical audio operations (like real-time PCM down-sampling or volume normalization) out of the JavaScript event loop.
* **How it works:**
  - Create a lightweight Rust or C++ Node addon (using `napi-rs` or `node-addon-api`).
  - Route the raw audio buffers through this compiled module before they hit the STT engines.
* **Benefit:** Drastically reduces CPU spikes during continuous recording and drops audio-routing latency to single-digit milliseconds, ensuring the React UI remains buttery smooth.

### 12. Electron V8 Snapshotting (Instant App Boot)
* **Concept:** Slash the application boot time by pre-compiling JavaScript dependencies into a binary snapshot.
* **How it works:**
  - Use Electron's `mksnapshot` feature during the build process to parse all heavy vendor dependencies (React, AI SDKs) into a V8 memory snapshot.
  - When the app launches, the V8 engine bypasses parsing the JS source code and instantly loads the binary snapshot directly into memory.
* **Benefit:** The application boots from a cold start in under 100 milliseconds, making it feel as fast as a native C++ desktop application.

---

## 🎨 UI/UX Feature Ideas

### 1. Refined Insights Dashboard
* **Concept:** Transform the Insights page into a visually stunning, data-rich dashboard.
* **How it works:**
  - Introduce sleek, interactive charts (e.g., using Recharts) for dictation frequency, average word count, and time saved.
  - Implement dynamic glassmorphic metric cards that animate on load.
  - Add filtering by date range with smooth transitions.

### 2. Enhanced Smart Snippets UI
* **Concept:** Redesign the Snippets manager to feel like an advanced prompt library.
* **How it works:**
  - Display snippets as a beautiful masonry grid of cards instead of a basic list.
  - Add visual tagging (color-coded badges) to categorize snippets.
  - Provide an inline, syntax-highlighted preview of dynamic variables (e.g., `{{clipboard}}`) directly on the snippet card.

### 3. Fluid Audio Visualizer (Recording HUD)
* **Concept:** Make the act of dictating visually mesmerizing.
* **How it works:** 
  - Replace the simple pulsing recording indicator with a dynamic, liquid-like waveform or a glowing 3D orb.
  - Hook it into the Web Audio API so it reacts in real-time to the pitch and volume of the voice.

### 4. Context-Aware Command Palette (CMD+K)
* **Concept:** Navigate the entire app instantly without touching the mouse, packaged in a sleek interface.
* **How it works:** 
  - Add a global hotkey (`CMD+K` or `Ctrl+K`) that summons a floating, glassmorphic search bar in the center of the screen.
  - Features rich keyboard navigation and fuzzy search to instantly jump to specific notes, trigger snippets, or toggle settings.

### 5. Immersive Focus Mode (Zen Editor)
* **Concept:** A distraction-free environment for pure, uninterrupted thought.
* **How it works:** 
  - A single toggle in the editor that gracefully fades out the sidebar, the top navigation, and all toolbars.
  - The text centers itself against a subtle, ambient background gradient that very slowly shifts colors.

### 6. Chronological "Journey" Timeline
* **Concept:** Replace the standard list of past dictations with a beautiful, connected timeline.
* **How it works:** 
  - Lay out dictations along a vertical or horizontal track in the History tab.
  - Cluster notes from the same session together, connected by a subtle, glowing line.
  - Hover over a dot on the timeline to pop up a miniature preview card.

### 7. Cinematic "First Run" Onboarding
* **Concept:** Make the first impression unforgettable with an interactive setup wizard.
* **How it works:** 
  - A full-screen, blurred glassmorphic wizard that guides users through setup.
  - It plays a short, beautiful embedded video showing how the app works, tests their microphone with a 3D audio visualizer, and lets them pick their favorite AI models with sleek animated cards.

### 8. Visual "Soundwave" Minimap
* **Concept:** Make reviewing 45-minute meeting recordings or long lectures incredibly intuitive and visual.
* **How it works:** 
  - Next to a long transcript in the History view, Dhwani renders a tiny, interactive audio waveform acting as a scrollbar minimap.
  - Sections where people spoke loudly or with high energy are color-coded (e.g., bright orange).
  - You can click anywhere on the waveform minimap to instantly jump to that exact sentence in the transcript and start playing the audio.
  - Includes an interactive mic test (with live visualizers) and automatically detects hardware to suggest the best AI models.

### 9. Generative UI Themes (AI Color Palettes)
* **Concept:** Infinite, personalized themes generated on the fly.
* **How it works:** 
  - A text prompt (e.g., "Midnight Cyberpunk" or "Cozy Autumn Cafe") uses the local LLM to generate a perfectly balanced CSS color palette.
  - Smoothly crossfades the entire application into the new theme.

### 10. Magnetic, Cascading Context Menus
* **Concept:** Make every right-click and dropdown feel physically satisfying.
* **How it works:** 
  - Custom context menus utilizing heavy background blur (`backdrop-blur-xl`) and physical "magnetism" (snapping slightly to the cursor).
  - Menu items cascade into view with a subtle, staggered spring animation.

---

## ✅ Completed Items

### UI/UX
* **Collapsible Sidebar with Peek Transition:** Allowed the sidebar to collapse into a minimal strip, conserving screen real estate while keeping navigation fluid. Added micro-animations to sidebar icons.
* **Premium Workspace Card Switcher:** Replaced the native dropdown menu with a floating grid of visual workspace cards featuring gradient glows and monogram avatars.
* **Interactive Cards for Settings Rows:** Redesigned the settings layout from plain divided lists into individually hoverable, interactive cards with rounded corners.
