# Settings Navigation Dedup + Theme-Aware Logo + Flow Bar Redesign

## Context

Follow-up to the toast/glass/splash UI refresh (same branch, same PR #39). Three
independent pieces of settings/branding/UI refinement (Parts A and B below; Part C, the
Flow Bar redesign, was added later in the same brainstorming session):

1. **Settings duplication.** Two features have a full dedicated page reachable from the main
   sidebar AND a duplicate mini-UI embedded inside Settings → Hotkeys, driving the same
   Zustand store fields from two different UIs:
   - **Personalized Styles**: full page at `StyleView.tsx` (sidebar item `style`) vs. a
     duplicate block in `SettingsPage.tsx`'s `hotkeys` case (lines 2794-2847,
     `enableVoiceStyles` toggle + 4 `styleTone*` selects).
   - **Polish**: full page at `TransformDetailView.tsx` (via `transforms` sidebar item →
     TransformsView → Polish card) vs. a duplicate block in `SettingsPage.tsx`'s `hotkeys`
     case (lines 2700-2767, `polishKey` HotkeyInput + 4 `polishInstruction*` toggles).
     `TransformDetailView.tsx:49-51` already has a comment acknowledging this: *"Polish
     mirrors the existing Settings Polish hotkey rather than owning its own."* One field,
     `polishEnabled`, currently exists ONLY in the Hotkeys block — `TransformDetailView`
     has no on/off toggle at all.

2. **Logo has no dark/light adaptation.** `src/assets/logo.svg` is a static file with
   hardcoded hex colors (`#8B6EF0`→`#4A34A8` gradient, `#F5A94A` dot) baked in at author
   time — it can never respond to theme changes since it's loaded as a static asset, not
   rendered inline. It's also barely used (2 integration-card icons only). The actual
   onboarding/favicon logo is a separate raster `icon.png`, equally static.

Research grounding (web search, 2026-07-19): the standard technique for theme-adaptive
SVG marks is an inline `<svg>` using `stroke="currentColor"`/`fill="currentColor"` so the
mark inherits the CSS `color` of its container and switches automatically with the
existing `.dark` class toggling already used everywhere else in this codebase — no
`prefers-color-scheme` media query needed since the app already drives theme via a class,
not the OS preference. Wispr Flow (the app whose cream/purple/amber palette this project's
`--color-flow-*` tokens were modeled on) uses a real palette of cream/black/lavender
`#f0d7ff`/forest-teal `#034f46`/ember-orange `#ffa946` — confirming the existing
`--color-flow-warm: #f5a94a` accent is already in the right neighborhood — and their
signature shape is a horizontal waveform "pill", not a ring. A ring-shaped mark is
therefore a deliberate differentiator from the closest competitor's silhouette while
staying in the same visual language.

## A. Settings Navigation Dedup

**Direction:** dedicated pages (`StyleView.tsx`, `TransformDetailView.tsx`) become the
sole source of truth. Settings → Hotkeys keeps only actual hotkey bindings, nothing else.

### A1. Personalized Styles — remove from Hotkeys entirely

`SettingsPage.tsx` lines 2794-2847 (the `enableVoiceStyles` toggle + 4 `styleTone*`
selects) has no hotkey binding of its own — it's pure config, fully duplicated in
`StyleView.tsx`. Delete the block. Replace it with a small link card: "Configure
personalized styles →" that opens the `style` sidebar view (reuse whatever
navigation function `ControlPanelSidebar.tsx` uses to switch `ControlPanelView`).

### A2. Polish — trim Hotkeys to just the key binding

`SettingsPage.tsx` lines 2700-2767: keep the `polishKey` HotkeyInput (2708-2721) — that's
a real hotkey binding, belongs in Hotkeys. Delete the 4 `polishInstruction*` toggles
(2734-2764) and the `polishEnabled` toggle (2726). Add the same style of link card:
"Configure Polish →" pointing at the Transforms → Polish detail view.

### A3. Move `polishEnabled` into TransformDetailView

`TransformDetailView.tsx` currently has no enable/disable toggle at all for Polish. Add
one, in the same location/style as the existing `polishInstruction*` rule toggles
(lines 46-158, 307-326), reading/writing the same `polishEnabled` store field the deleted
Hotkeys toggle used to.

### Out of scope

The "Custom Dictionary" possible duplication noted during investigation (appears in both
`general` settings and its own `dictionary` sidebar item) is NOT confirmed as the same
live/duplicate pattern and is explicitly out of scope for this spec — no changes to it.

## B. Theme-Aware Logo

### B1. New component

`src/components/ui/Logo.tsx` — a TypeScript React component wrapping a single inline SVG
(viewBox `0 0 64 64`), accepting a `size` prop (default matches current onboarding usage).
Final mark (from the visual brainstorm — concept "F1"):

```svg
<svg viewBox="0 0 64 64" fill="none">
  <path d="M53 41 A27 27 0 1 1 53 23" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M20 32 Q26 18 32 32 T44 32" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/>
  <circle cx="44" cy="32" r="4" fill="#f5a94a"/>
</svg>
```

- Ring and wave stroke use `currentColor` — inherits from the component's CSS `color`,
  which already resolves correctly via the app's existing `.dark` class toggle and
  `--color-foreground`/`--color-flow-ink` tokens, no new theming logic needed.
- Accent dot stays a literal `#f5a94a` (matches `--color-flow-warm`) in both themes —
  same treatment the existing `logo.svg` already used for its accent dot.
- Stroke width fixed at 4 (chosen during brainstorm to stay legible from ~96px onboarding
  size down to ~16-20px sidebar size without needing a second small-size variant).

### B2. Usage sites

- **Onboarding welcome screen**: `OnboardingFlow.tsx:35` currently does
  `import logoIcon from "../assets/icon.png"` and renders it as an `<img>`. Replace with
  `<Logo />` at the equivalent size.
- **Settings sidebar footer**: `SidebarModal.tsx:205-212` (the version footer just updated
  to show "Dhwani v{version}" earlier in this branch) — add a small `<Logo size={16} />`
  immediately before the text, so the mark and version sit together.

### Out of scope

- `logo.svg`'s two existing consumers (`CliIntegrationCard.tsx`, `McpIntegrationCard.tsx`)
  are NOT touched — those are small third-party-integration icons unrelated to app
  branding, left as-is.
- OS-level app icons (`icon.icns`, `icon.ico`, `icon.png` used for taskbar/dock/build) are
  static assets the OS controls rendering of — no code can make them theme-aware, and no
  new icon files are generated by this spec. `logo.svg` itself is also left unchanged
  (still hardcoded, still only used by the two integration cards) — `Logo.tsx` is a new,
  separate component, not a replacement for that file.
- No i18n keys needed (a logo has no text; the two new usage sites don't add strings).

## C. Flow Bar Redesign

The Flow Bar (`src/App.jsx`) is the main floating dictation overlay — a right-edge-docked,
always-on-top, non-native-resizable window with 5 states: idle handle, expanded dock,
recording pill, processing/status pill, and the transform menu. Full investigation (states,
CSS classes, window-size constraints) done during brainstorming.

**Direction, locked via visual brainstorm (6 rounds, 21 concepts):** clean/modern surface
treatment, same shape and interaction model as today (no layout rethink, no change to the
`WINDOW_SIZES` lookup table or `resizeMainWindow` calls in `App.jsx:433-452` — footprint
stays identical). Rather than hardcoding one winning look, this ships as a **user-selectable
"Pill Style" setting** with 4 options — resolving the glass-vs-solid tension as a user
choice instead of a unilateral call, and following the exact pattern the app already uses
for the "Voice Overlay Pill" visualizer-style picker (`SettingsPage.tsx:1690-1751`, a grid
of live-previewed option buttons).

### C0. New setting + UI

- New store field `flowBarPillStyle: "glass" | "flat" | "bold" | "minimal"` in
  `useSettingsStore` (same persistence pattern as `voiceVisualizerStyle`), default `"glass"`.
- New **dedicated** settings section "Pill Appearance" (separate from the existing "Voice
  Overlay Pill" visualizer section per the earlier decision) — same grid-of-live-preview-
  buttons UI pattern as `SettingsPage.tsx:1690-1751`, 4 buttons (Glass / Flat / Bold /
  Minimal), each rendering a small live mock of the idle-dock + recording-pill look.
- Implementation: each of the 5 Flow Bar states (`.flow-dock-handle`, `.flow-dock-panel`,
  `.flow-dock-mic`, `.flow-dock-mic--recording`, `.flow-pill-h`, transform menu card) reads
  `flowBarPillStyle` and applies a corresponding modifier class (e.g.
  `flow-dock-panel--glass`, `flow-dock-panel--flat`, `flow-dock-panel--bold`,
  `flow-dock-panel--minimal`) alongside the existing base class, mirroring how
  `micStateClass` already branches className today (`App.jsx:578-583`).

### Important: "flat" reuses Task 8/9 from the earlier glass-removal audit; "glass" reverses
### it (deliberately, for this control only, and only when the user picks it)

Task 8 (commit `f344dfb1`) solidified `.flow-dock-panel` and `.flow-dock-mic--recording` —
that solidified CSS becomes the **`flat`** style variant verbatim (no new values needed,
just gated behind the modifier class instead of being the only option). The **`glass`**
style (below) puts a *restrained* blur back — deliberate, researched, and opt-in: Apple's
current (2026) "Liquid Glass" design language reserves translucency for floating controls
above arbitrary content (this window's exact situation), while the rest of the app's
panels stay solid. Because it's now a setting rather than a forced default-for-everyone,
users who want full-app consistency simply pick `flat`. Add a code comment at each modifier
class explaining the 4-way split so a future glass-audit pass doesn't collapse them back to
one option without knowing why.

### C1. Idle expanded dock (`.flow-dock-panel`, `index.css:823-846`) — per style

- **`glass`**: `background: rgba(255,255,255,0.2)` (light) / `rgba(30,28,38,0.35)` (dark);
  `backdrop-filter: blur(12px) saturate(150%)` (+ `-webkit-`); `border: 1px solid
  rgba(255,255,255,0.5)` (light) / `rgba(255,255,255,0.14)` (dark) with `border-top-color:
  rgba(255,255,255,0.8)` (light) / `rgba(255,255,255,0.32)` (dark) for the bright top rim;
  `box-shadow: 0 6px 18px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.55)` (dark:
  outer shadow alpha `0.35`). Mic button icon stays neutral (`#6d4fe0`/`#b8a8f5`), no fill
  tint at idle.
- **`flat`**: exactly Task 8's already-solid values — `background: var(--color-surface-2)`
  (light) / `var(--color-flow-surface-dark)` (dark), `border: 1px solid rgba(0,0,0,0.15)`,
  no backdrop-filter, existing box-shadow (no inset layer).
- **`bold`**: flat neutral surface (`bg-surface-2`/`--color-flow-surface-dark`, no blur),
  mic button icon uses high-contrast ink/cream color (`#1c1a17` light / `#f4f1ea` dark)
  instead of purple — purple only appears when actively recording (C2).
- **`minimal`**: `background: transparent`, `border: 1px solid rgba(0,0,0,0.12)` (light) /
  `rgba(255,255,255,0.14)` (dark), no shadow, no blur. Mic button: transparent fill, thin
  1px border matching the panel, neutral gray icon (`#6b6558`/`#9b9587`).

### C2. Recording pill (`.flow-dock-mic--recording`, `index.css:905-928`) — per style

- **`glass`**: `background: rgba(109,79,224,0.55)` (same both themes); `backdrop-filter:
  blur(12px) saturate(150%)`; `border: 1px solid rgba(255,255,255,0.45)`, `border-top-color:
  rgba(255,255,255,0.85)`; `box-shadow: 0 8px 22px rgba(109,79,224,0.3), inset 0 1px 0
  rgba(255,255,255,0.5)`; slow breathing pulse — `animation: flow-pill-breathe 2.6s
  ease-in-out infinite` (new keyframe, `scale(1)`→`scale(1.03)`→`scale(1)`), additive to
  the existing `flow-pill-spring` entrance animation.
- **`flat`**: exactly Task 8's already-solid values — `background: #120f1c !important`, no
  backdrop-filter, existing box-shadow, no breathing pulse (keeps only the existing
  `flow-pill-spring` entrance animation).
- **`bold`**: solid flat `#f5a94a` (amber) background, no gradient, no blur, no glow —
  icon/text switches to dark ink (`#1c1a17`) for contrast against the amber fill. No
  breathing pulse (relies on the inner waveform visualizer alone to read as "live").
  Command-mode variant swaps to solid purple `#6d4fe0` instead of amber (inverted from the
  normal-recording color, so the two modes stay visually distinct).
- **`minimal`**: `background: transparent`, `border: 2px solid #6d4fe0` (light) /
  `#8b6ef0` (dark), icon color matches the border. A small 6px solid dot (`#e0524d`,
  positioned top-center inside the pill) is the only additional "recording" signal — no
  fill/background color change at all.
- All 4 styles: the command-mode variant (`.flow-bar-pill--command`) and the live waveform
  visualizer inside the pill (one of 6, `App.jsx:666-678`) render unaffected on top of
  whichever background is active — visualizer selection is a separate setting, untouched.

### C3. Processing/status pill (`.flow-pill-h`, `index.css:1045-1062`) and transform menu
(App.jsx:795-862 card)

Apply the same per-style language as C1 (these are "neutral" surfaces like the idle dock,
not "active" surfaces like the recording pill — no bold color-block or breathing pulse,
just each style's neutral surface treatment). Not individually mocked in the visual
brainstorm (only idle dock and recording pill were compared across rounds) — direct,
low-risk extrapolation of each style's already-locked language, not a new design decision
per style.

### C4. Idle collapsed handle (`.flow-dock-handle`, `index.css:794-820`)

Smallest, least visually significant state (7×40px sliver). Same per-style neutral
treatment as C1, scaled to the handle's existing dimensions.

### Out of scope

- No change to `WINDOW_SIZES`, `resizeMainWindow`, or any native window bounds/position
  logic — the redesign is surface-only, confirmed compatible with the existing IPC-driven
  resize lookup table.
- No change to the 6 selectable visualizer components (`LiveWaveform`, `SiriOrbVisualizer`,
  etc. in `App.jsx`) or the existing "Voice Overlay Pill" visualizer-style setting
  (`SettingsPage.tsx:1690-1751`) — they continue to render inside the recording pill exactly
  as today, and stay in their own settings section, separate from the new "Pill Appearance"
  section (per the earlier decision).
- The non-functional `panelStartPosition` setting (ignored per `windowConfig.js:168-171`)
  is not addressed by this spec.
- No 5th/6th style options beyond the 4 selected (Glass/Flat/Bold/Minimal) — the other
  brainstormed directions (Dynamic Island, Siri-orb halation, oversized squircle, etc.)
  are not implemented; can be added as future style options following the same
  `flowBarPillStyle` pattern if wanted later.

## Global Constraints

- No new npm dependencies.
- TypeScript for the new `Logo.tsx` component.
- Follows existing patterns: `currentColor` + the app's existing `.dark` class-based theme
  switch (not a new `prefers-color-scheme` media query, which the rest of the app doesn't
  use).
- The Flow Bar's restrained-glass treatment (Part C) is a deliberate, documented exception
  to the app-wide solid-surface rule established in the earlier glass-removal audit —
  justified because it's the one floating-over-arbitrary-desktop-content control in the
  app. No other component gets blur reintroduced by this spec.
- Same branch/PR as the toast/glass/splash work (`ui/toast-glass-splash-refresh`, PR #39).
