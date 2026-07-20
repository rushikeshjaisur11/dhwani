# Flow Bar Redesign: Pill Shape, Voice Visualizer, Idle Animation, Expanded Menu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this spec into an implementation plan, then superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to execute it.

**Goal:** Redesign the Flow Bar's remaining visual surfaces on top of the 4-way pill-style system (Glass/Flat/Bold/Minimal) shipped in the prior plan (`docs/superpowers/plans/2026-07-19-settings-logo-flowbar.md`): the idle/recording pill's own shape and motion, the voice visualizer content, the idle-hover expanded dock, and the transform-menu card.

**Architecture:** Four independent surfaces, same branch. All four continue to respect the existing `flowBarPillStyle` setting (glass/flat/bold/minimal) — none of this work replaces that system, it fills in pieces that system didn't cover (shape/motion, visualizer content, idle animation, dock/menu layout). Two new user-facing settings are added: `idleOrbAnimation` and 2 new `voiceVisualizerStyle` values.

**Tech Stack:** React 19, TypeScript/JSX, Tailwind CSS v4, Zustand, Electron. Same as the prior Flow Bar plan.

**Out of scope:** App-wide color/theme consistency audit (explicitly deferred to a separate spec per user decision during brainstorming — this spec only covers the Flow Bar).

---

## Part A: Pill shape — orb-to-capsule morph

**Decision (mockup C1, "Orb → Capsule (grow)"):**

- **Idle** (mouse away): a small solid circular orb, ~40px diameter, replacing today's 7×40px sliver handle. Colored per the active `flowBarPillStyle` (e.g. Glass: translucent purple gradient + blur; Flat: solid ink; Bold: solid amber; Minimal: hairline outline, transparent fill).
- **Hover**: orb softens/rounds further and widens slightly (intermediate state, ~64×44px, rounded rect, not yet full capsule) — this is when the expanded dock icons (Part D) become visible.
- **Recording**: grows into the full horizontal capsule (matches today's expanded pill width, ~140×44px, radius 22px) to host the visualizer.
- **Orientation:** confirmed horizontal. **Correction from an earlier (wrong) claim during brainstorming:** the app's *current* Flow Bar is actually already vertical — it docks at the right screen edge with `WINDOW_SIZES.BASE = {width:28, height:96}` and `WINDOW_SIZES.RECORDING = {width:110, height:170}` (`src/helpers/windowConfig.js`), and `.flow-dock-mic--recording` is `48×128px` (`src/index.css`). Going horizontal is a deliberate, larger change than first described, not the lower-risk option — the user chose it anyway after this was corrected. See "Window sizing" below for the concrete blast radius.
- **Motion:** grow/shrink is an animated transition (scale + border-radius + width), not an instant swap, using the same easing family as the existing recording-pill entrance spring.

This replaces the current idle-handle sliver (`.flow-dock-handle` and its `--{style}` modifiers from the prior plan) with an orb. The recording-capsule end state is visually the same *shape family* as today's expanded `.flow-dock-panel`/`.flow-dock-mic--recording` (rounded, blurred/tinted per style) but with swapped proportions (wide-short instead of narrow-tall) — see "Window sizing" below.

### Window sizing (required for horizontal)

`src/helpers/windowConfig.js`'s `WINDOW_SIZES` swaps width/height for the sizes the Flow Bar itself uses, so the *window* is wide-short instead of narrow-tall:

- `BASE` (idle orb): `{width:96, height:40}` → wide enough for a 40px orb centered with margin (was `{width:28, height:96}`)
- `RECORDING`: `{width:170, height:64}` → hosts the ~140×44px capsule with margin (was `{width:110, height:170}`)
- `STACK` (idle hover dock): `{width:240, height:72}` → wide enough for the horizontal icon row plus leftward-opening tooltips (was `{width:300, height:240}`)
- `WITH_MENU`: `{width:340, height:280}` → transform menu still opens as a vertical list card above/beside the dock, so height stays taller than width here (was `{width:340, height:340}` — trimmed since the menu itself doesn't need to grow with the dock anymore)
- `WIDE` and `WITH_TOAST`/`EXPANDED` are unchanged — they're independent secondary surfaces (status pill, toast list), not the mic pill itself.

No change to `MAIN_WINDOW_CONFIG`, `resizeMainWindow`'s clamping logic, or default-position anchoring in `windowManager.js` (still right-edge-vertically-centered, computed from the same `workArea` math) — only the numeric width/height *values* the Flow Bar's own states pass through that existing logic. The window will still default-anchor near the right edge; a wide-short pill sitting there is intentional (matches "no non-goal" for docking behavior below) and it stays user-draggable exactly as today.

## Part B: Voice visualizer — 8 redesigned/new styles

**Problem being fixed:** the current 6 styles (`plasma`, `bars`, `siri`, `ripple`, `neon`, `particles`) read as dated and don't visibly react to real audio amplitude/frequency data.

**Decision:** keep the `voiceVisualizerStyle` setting as an 8-way picker (same UI pattern as today, more options), all horizontal, all genuinely audio-reactive (bound to live amplitude and, where applicable, frequency-bin data — not a fixed-period CSS loop):

1. **`siri`** (redesign) — blurred conic-gradient blob, slow rotation + amplitude-driven scale pulse.
2. **`bars`** (redesign) — fewer, fatter bars with rounded caps and gradient fill, each bar driven by a distinct frequency bin.
3. **`ripple`** (redesign) — concentric rings expanding outward on voice onset, ring frequency tied to speech cadence.
4. **`waveline`** (new) — single continuous smooth line (SVG path) that deforms with live amplitude, oscilloscope-style.
5. **`neon`** (redesign) — thin glowing white bars with a soft colored halo (replaces flat neon fill).
6. **`particles`** (redesign) — a handful of glowing amber dots bobbing at independently randomized rates (replaces the denser particle cloud).
7. **`spectrum`** (new) — dense thin gradient bars (amber→purple), bottom-anchored EQ-meter look, most bars/most "technical" of the set.
8. **`plasma`** (redesign) — soft morphing gradient blob stretched to capsule width, radius shifts with amplitude.

All 8 must render legibly inside the ~140×44px horizontal capsule at each of the 4 pill styles' color treatments (i.e., visualizer accent colors should read against Glass/Flat/Bold/Minimal backgrounds — reuse each style's existing accent color, don't hardcode purple).

## Part C: Idle orb animation — 4 selectable options

**New setting:** `idleOrbAnimation: "breathe" | "glow-ring" | "bob" | "shimmer"`, default `"breathe"`. Same settings-storage pattern as `voiceVisualizerStyle`/`flowBarPillStyle` (localStorage-backed Zustand field + setter), with a picker UI in the same "Pill Appearance" settings section added by the prior plan.

1. **Breathe** (default) — gentle scale (1.0→1.08) + glow-shadow pulse, ~2.6s cycle. Matches the existing recording-pill breathing pulse language.
2. **Glow ring** — orb stays fixed size, a faint ring expands outward from it and fades, ~2.4s cycle (sonar-ping).
3. **Bob** — slow vertical float, ±5px, ~2.2s cycle.
4. **Shimmer** — orb fixed, a soft diagonal light sweep crosses it every ~3.2s (glass-reflection effect); least overall motion.

All 4 animate only in the idle state; hover and recording states use their own existing/new transitions (Part A) and are not affected by this setting.

## Part D: Expanded dock (idle hover) — polished flat row

**Decision (mockup A2, "Polished flat row"):** keep today's structure — a horizontal icon row (mic / scratchpad / transform-sparkle, separated by thin dividers) inside the hover-state capsule — but upgrade the visual treatment:

- Real stroke-based SVG icons (already the case for `Mic`/`SquarePen`/`Sparkles` via lucide-react — no icon change needed, only container styling changes).
- Subtle inset top-edge highlight (`inset 0 1px 0 rgba(255,255,255,.15)` equivalent per style) so the capsule reads as reflective/glass rather than flat.
- Soft ambient glow shadow beneath the capsule, colored per the active `flowBarPillStyle` accent (e.g. Glass: purple-tinted `0 8px 24px`).
- **One real structural change required by Part A's horizontal orientation:** `.flow-dock-panel` is currently `flex-direction: column` (icons stacked vertically — a leftover of the app's current vertical dock). It becomes `flex-direction: row` so the mic/scratchpad/transform-sparkle icons sit side-by-side inside the now-horizontal capsule. This is a mechanical consequence of Part A, not a new design decision — the icon row's own visual polish (highlight, shadow) is the actual Part D decision.

## Part E: Transform menu card — refined list

**Decision (mockup C2, "Refined list, polished"):** keep today's vertical list structure (header + rows, one row per transform, active/selected row highlighted) but upgrade the visual treatment to match:

- Active/selected row gets a per-style accent gradient background (e.g. Glass: `linear-gradient(135deg, rgba(120,92,235,.5), rgba(120,92,235,.2))`) with an inset top highlight, replacing today's flat gray highlight.
- Deeper card shadow (`0 16px 40px rgba(0,0,0,.4)` equivalent) so the card clearly floats above the dock rather than sitting flush.
- Icons stay as-is (already real SVGs via lucide-react per transform).
- No structural change: still a flat vertical list, no search field, no sections, no grid, no radial layout — those alternatives (searchable list, grouped sections, chip wrap, 2×2 grid, radial pie menu) were explored and explicitly not chosen.

## Interaction with existing pill styles

Parts D and E's polish (shine, shadow, gradient accents) must be expressed per the 4 existing `flowBarPillStyle` values, following the same modifier-class pattern already established (`.flow-dock-panel--{style}`, `.flow-transform-menu--{style}`) rather than being Glass-only. Flat/Bold/Minimal get their own equivalent treatment (e.g. Minimal: hairline border instead of glow shadow, no gradient fill on the active menu row — a tinted flat color instead).

## Non-goals

- No change to the recording-pill's own capsule footprint/colors beyond what Part A's motion describes — the 4-style color system from the prior plan is unchanged.
- No change to command-mode-specific color behavior (already covered by the prior plan).
- No app-wide theme/color consistency work (separate spec, tracked as a follow-up).
- No change to the *positioning algorithm* (`resizeMainWindow`'s workArea math, default-anchor logic, or drag behavior in `dragManager.js`) — only the numeric `WINDOW_SIZES` width/height values change, as described in Part A. The dock still defaults near the right edge and remains user-draggable.
- No change to `WIDE`, `WITH_TOAST`, or `EXPANDED` window sizes — those serve other surfaces (status pill, toast list), not the mic pill.
