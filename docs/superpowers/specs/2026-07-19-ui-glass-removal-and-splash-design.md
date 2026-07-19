# UI Refresh: Toast Redesign, Glassmorphism Removal, Startup Splash

## Context

Dhwani's UI has drifted into inconsistent glass/solid usage. The design system already
defines a solid surface hierarchy (`--color-surface-0` through `--color-surface-raised`,
`--color-border-subtle`, `--color-border-hover`, `--color-border-active`), and a code
comment on the `--glass-*` tokens already states intent: "kept for compat; pill/cards use
solid surfaces now." In practice, 45+ call sites across 25 files still use
`backdrop-blur-*`/`backdrop-filter`, including the toast component, which is explicitly
commented as an "ultra-premium glassmorphic surface."

Separately, the app has no startup loading state. The main dictation overlay window
already avoids a visible flash via `show: false` + `ready-to-show` in
`windowConfig.js`/`windowManager.js`, but the control panel (settings/history/notes — the
actual "app" surface) renders synchronously with no loading gate, no splash, and no
`isLoading`-driven root state.

This spec covers three related, sequential pieces of work: toast redesign, an app-wide
glass-to-solid pass, and a startup splash for the control panel.

## A. Toast Redesign

**Files**: `src/components/ui/Toast.tsx`, `.toast-surface`/`.dark .toast-surface` rules in
`src/index.css` (lines 658-679).

- **Surface**: Replace the glassmorphic gradient + `backdrop-filter: blur(24px)
  saturate(160%)` with a solid surface: `bg-surface-2` (light) / dark-mode equivalent from
  the existing surface hierarchy, `border border-border-subtle`, `shadow-lg`. Same
  treatment in both themes — no more light/dark asymmetry.
- **Icons**: `variantConfig` gains an `icon` field: `CheckCircle2` (success, emerald),
  `AlertTriangle` (destructive, red), `Info` (default, primary purple/`--color-info`).
  Icon replaces the current left accent-bar as the variant signal.
- **Close button**: Currently a glass pill (`bg-black/5 dark:bg-white/10
  backdrop-blur-sm`) floating at `-left-2 -top-2`. Restyle to solid `bg-surface-3` /
  `dark:bg-surface-raised`, drop the blur, keep position and hover/focus behavior
  unchanged.
- **Unchanged**: progress bar, layout, animation timing, stacking (simple vertical stack,
  no collapse/grouping), timer/dismiss logic, `useToast.ts` API surface.

## B. Glass-to-Solid Audit

**Policy-based, not a fixed line list** — the implementation plan will enumerate exact
edits per file. Three categories:

### B1. Dead cruft (delete, zero visual change)

`src/components/ui/card.tsx`, `dialog.tsx`, `popover.tsx` reference
`dark:backdrop-blur-[var(--glass-blur)]`, `dark:bg-[var(--glass-bg)]`,
`dark:border-[var(--glass-border)]`. `--glass-blur` is already `0px` — these classes
compute to a no-op blur today. Delete the dead references.

### B2. Decorative/frosted panels → solid

Replace `bg-<color>/<opacity> backdrop-blur-*` with solid `bg-surface-N` (matching the
existing surface hierarchy, choosing N by visual elevation/nesting) + existing border
tokens. Drop `backdrop-filter`/`backdrop-blur-*` entirely. Applies to:

- `src/index.css`: `.flow-dock-panel`, `.flow-dock-mic--recording`
- `src/App.jsx`: flow dock hover-tooltip panel, floating dock icon background, dock
  context menu panel
- `src/components/ui/`: `button.tsx` (2 variants), `LanguageSelector.tsx` (trigger +
  dropdown), `TranscriptDetailView.tsx` (header bar), `SettingsSection.tsx`
- `src/components/`: `HistoryView.tsx` (stat cards, empty-state bubbles),
  `OnboardingFlow.tsx` (header, sticky header, step card, sticky footer),
  `InsightsView.tsx` (6 stat/chart tiles), `MeetingNotificationCard.tsx`,
  `UpdateNotificationOverlay.tsx`, `McpIntegrationCard.tsx`, `CliIntegrationCard.tsx`,
  `StyleView.tsx` (icon grid tile, swatch highlight), `SnippetsView.tsx` (search input,
  list row), `SettingsPage.tsx` (section container, 3 action buttons),
  `TranscriptionModelPicker.tsx` (segmented tab bar)
- `src/components/notes/`: `ActionProcessingOverlay.tsx` (status pill only — see B3 for
  its dim), `EmbeddedChat.tsx`, `DictationWidget.tsx` (3 states), `MeetingTranscriptChat.tsx`
  (2 chips), `UploadAudioView.tsx` (drop-zone x2, error panel), `MeetingRecordingPill.tsx`,
  `RealtimeTranscriptionBanner.tsx`
- `src/utils/modelPickerStyles.ts`: dropdown panel (2 style variants)

### B3. Overlay/scrim dims → solid dim, no blur

These sit behind modal content to focus attention. Keep the solid dim, drop the blur
(dim alone is sufficient; blur compositing is the expensive/glassy part):

- `src/components/ui/dialog.tsx` (`DialogOverlay`)
- `src/components/ui/SidebarModal.tsx` (overlay)
- `src/components/CommandSearch.tsx` (backdrop — content panel itself falls under B2)
- `src/components/HistoryView.tsx` (fullscreen modal overlay)
- `src/components/notes/ActionProcessingOverlay.tsx` (full-screen dim)

### B4. Cleanup

After B1-B3 land, grep for remaining references to `--glass-bg`/`--glass-border`/
`--glass-blur`. If none remain, delete the token definitions from `src/index.css`
(currently lines 88-91).

## C. Startup Splash

**Scope**: control panel window only. The main dictation overlay is out of scope — it's
already invisible until painted (`show: false` + `ready-to-show`), and a splash there
would only add delay to an already-solved problem.

- Add a branded splash component shown from the control panel's root mount until init
  completes: i18n ready + settings loaded (exact readiness signals confirmed during
  planning by reading `AppRouter`/`SettingsProvider`).
- Visual: centered Dhwani mark + spinner, reusing the existing `Loader2` +
  `animate-spin` pattern already used elsewhere (`DownloadProgressBar.tsx`,
  `TranscriptionItem.tsx`) — no new dependency. Cream/purple palette, Manrope for any
  label text, new i18n key (e.g. `common.loading`) added to all locale files per the
  i18n requirement.
- Transition: fade out over ~200ms CSS transition once ready, then unmount.
- No skeleton UI, no per-section loading states — single gate, single spinner.

## Out of Scope

- Toast stacking/collapse behavior (kept simple, per earlier decision).
- Blur/opacity user-facing settings slider (deferred to a follow-up spec, depends on
  where B lands).
- Main dictation overlay window loading state (already solved by existing
  `show`/`ready-to-show` mechanism).
- Any behavior change to toast duration, dismiss, or pause-on-hover logic.
