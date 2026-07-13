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
