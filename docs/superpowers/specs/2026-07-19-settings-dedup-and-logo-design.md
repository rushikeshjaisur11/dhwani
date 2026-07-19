# Settings Navigation Dedup + Theme-Aware Logo

## Context

Follow-up to the toast/glass/splash UI refresh (same branch, same PR #39). Two independent
pieces of settings/branding refinement:

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

## Global Constraints

- No new npm dependencies.
- TypeScript for the new `Logo.tsx` component.
- Follows existing patterns: `currentColor` + the app's existing `.dark` class-based theme
  switch (not a new `prefers-color-scheme` media query, which the rest of the app doesn't
  use).
- Same branch/PR as the toast/glass/splash work (`ui/toast-glass-splash-refresh`, PR #39).
