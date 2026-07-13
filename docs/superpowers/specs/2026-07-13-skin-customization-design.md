# Skin Customization — Phase 1: Color System (Design)

Date: 2026-07-13
Status: Approved (phase 1 of 2 — overlay-window skin is phase 2, separate spec)

## Goal

Let users personalize Dhwani's look beyond the current light/dark/auto toggle:
curated palette presets, plus a free-form accent color override. Applies to the
control panel; overlay-window skin (shape/size/opacity/position) is deliberately
out of scope here — separate follow-up spec.

## Current mechanism (reused, not replaced)

`useTheme.ts` already toggles a `.dark` class on `document.documentElement`;
`src/index.css` defines light-mode CSS custom properties in `@theme` and
dark-mode overrides in a `.dark { --color-...: ... }` block. Tailwind utilities
(`bg-primary`, etc.) read these vars, so swapping the vars at runtime already
reskins the whole app — this is the existing dark-mode trick, generalized to
palettes.

## Data model

Extend `useSettingsStore` (same store `theme` already lives in) with:

- `palette: "default" | "nord" | "dracula" | "solarized" | "rose"` — default `"default"`
- `accentColor: string | null` — hex value, `null` = use the active palette's own accent

Both persist the same way `theme` does today (localStorage-backed store).

## CSS

`src/index.css` gets one block per non-default palette, mirroring the shape of
the existing `.dark` block:

```css
[data-palette="nord"] { --color-primary: ...; --color-background: ...; /* light variant */ }
[data-palette="nord"].dark { --color-primary: ...; --color-background: ...; /* dark variant */ }
```

Default palette needs no attribute — current values stay the fallback. 4 new
palettes × light/dark variants = 8 new blocks (Nord, Dracula, Solarized, Rose).

## Hook (`useTheme.ts`)

Same effect that toggles `.dark` also:

1. Sets `data-palette` attribute on `documentElement` from `settings.palette`.
2. If `accentColor` is non-null, sets `--color-primary`, `--color-ring`,
   `--color-accent` as an **inline style** on `documentElement` — inline style
   specificity beats the attribute-selector CSS, so it composes with whichever
   palette is active without touching palette CSS. If `accentColor` is `null`,
   these inline properties are removed (falls back to palette's own accent).

No new hook file — extending the existing one keeps the single effect that
already owns `documentElement` class/attribute mutation in one place.

## UI

Settings → General → Appearance, directly under the existing light/dark/auto
row:

- 5-swatch palette grid (Default, Nord, Dracula, Solarized, Rose) — each swatch
  shows a small preview using that palette's own primary/background/accent.
- Below it: native `<input type="color">` bound to `accentColor`, plus a
  "Reset to palette default" button that sets `accentColor` back to `null`.

## i18n

New keys under `settingsPage.general.appearance.*` (palette section title,
5 palette names, accent picker label, reset button label) added to all 9
language files per project i18n convention (CLAUDE.md).

## Testing

Manual/visual only, no new automated tests (pure CSS + settings-store wiring,
no branching logic beyond the existing theme toggle):

- Each of the 5 palettes renders correctly in both light and dark mode.
- Accent override persists across app restart.
- Reset button clears override and palette's own accent returns.
- Existing light/dark/auto toggle still works unchanged (no regression).

## Explicitly out of scope (phase 2)

Overlay/dictation-bar-specific skinning (shape, size, opacity, position) —
different concern, different props, own design doc later.
