# Flow Bar Pill/Visualizer/Menu Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Flow Bar's remaining visual surfaces: switch the pill from its current vertical footprint to a horizontal orb→capsule morph, ship 8 redesigned/new audio-reactive voice visualizers, add a selectable idle-orb animation, and polish the expanded dock and transform-menu card — all layered on top of the existing 4-way `flowBarPillStyle` (Glass/Flat/Bold/Minimal) system.

**Architecture:** Window-size and CSS-shape changes land first (they're the foundation everything else renders inside), then settings/store plumbing, then the 8 visualizer components (extracted into their own file), then wiring, then the settings UI + i18n for the two new pickers.

**Tech Stack:** React 19, TypeScript/JSX, Tailwind CSS v4, Zustand, Electron.

## Global Constraints

- All 4 `flowBarPillStyle` values (glass/flat/bold/minimal) must get an equivalent treatment for every new rule — never Glass-only. Follow the existing `.{base-class}.{base-class}--{style}` modifier pattern exactly (see `src/index.css` around `.flow-dock-panel--*` for the established convention, including empty-ruleset anchors for styles that intentionally match the unmodified base rule).
- Every new user-facing string needs a translation key in all 9 locale files: `en, es, fr, de, pt, it, ru, zh-CN, zh-TW` (`src/locales/{lang}/translation.json`). Existing visualizer style names (`"Liquid Plasma"`, `"Equalizer Bars"`, etc. in `SettingsPage.tsx`) are plain JS strings, not i18n'd — that is a pre-existing gap, not introduced by this plan; follow that existing (non-i18n) pattern for the 2 new visualizer names to stay consistent, but DO i18n the new "Idle Animation" settings section (title/description/labels), matching how "Pill Appearance" does it.
- The click-to-expand / hover-to-fade interaction model in `App.jsx` (`isExpanded`, `isHovered` state) is unchanged by this plan — only the visual styling of each state changes, not what triggers it.
- No change to `resizeMainWindow`'s workArea math, default-anchor logic, or `dragManager.js` — only the numeric `WINDOW_SIZES` values change.

---

### Task 1: Window sizing for horizontal Flow Bar

**Files:**
- Modify: `src/helpers/windowConfig.js:35-43`

**Interfaces:**
- Consumes: nothing new.
- Produces: `WINDOW_SIZES.BASE`, `WINDOW_SIZES.RECORDING`, `WINDOW_SIZES.STACK`, `WINDOW_SIZES.WITH_MENU` — new width/height values consumed by `resizeMainWindow` calls elsewhere (unchanged call sites, only the constants they read change).

- [ ] **Step 1: Update WINDOW_SIZES for the horizontal layout**

Current block:
```js
const WINDOW_SIZES = {
  BASE: { width: 28, height: 96 },
  STACK: { width: 300, height: 240 },
  RECORDING: { width: 110, height: 170 },
  WIDE: { width: 250, height: 72 },
  WITH_MENU: { width: 340, height: 340 },
  WITH_TOAST: { width: 400, height: 500 },
  EXPANDED: { width: 400, height: 500 },
};
```

Replace with:
```js
const WINDOW_SIZES = {
  BASE: { width: 64, height: 56 },
  STACK: { width: 240, height: 72 },
  RECORDING: { width: 170, height: 64 },
  WIDE: { width: 250, height: 72 },
  WITH_MENU: { width: 340, height: 280 },
  WITH_TOAST: { width: 400, height: 500 },
  EXPANDED: { width: 400, height: 500 },
};
```

Update the comment directly above the block (currently describes the old vertical dock):

Current:
```js
// Right-edge dock sizes: BASE is the collapsed handle, STACK the hover icon
// panel (wide enough for the white tooltip pills opening leftward), WIDE the
// horizontal status pill (spinner / "Done. See changes"), WITH_MENU adds the
// transform menu opening leftward.
```

Replace with:
```js
// Right-edge dock sizes: BASE is the collapsed idle orb, STACK the expanded
// horizontal icon row (mic/scratchpad/transform-sparkle, wide enough for the
// white tooltip pills opening leftward), RECORDING the horizontal capsule
// hosting the mic + visualizer, WIDE the horizontal status pill (spinner /
// "Done. See changes"), WITH_MENU adds the transform menu card opening
// leftward above the dock.
```

- [ ] **Step 2: Verify the module still loads and exports the updated values**

Run: `node -e "const { WINDOW_SIZES } = require('./src/helpers/windowConfig.js'); console.log(JSON.stringify(WINDOW_SIZES));"`
Expected output: `{"BASE":{"width":64,"height":56},"STACK":{"width":240,"height":72},"RECORDING":{"width":170,"height":64},"WIDE":{"width":250,"height":72},"WITH_MENU":{"width":340,"height":280},"WITH_TOAST":{"width":400,"height":500},"EXPANDED":{"width":400,"height":500}}`

- [ ] **Step 3: Commit**

```bash
git add src/helpers/windowConfig.js
git commit -m "feat(flowbar): resize window states for horizontal pill layout"
```

---

### Task 2: Settings store + hook — idleOrbAnimation, extend voiceVisualizerStyle to 8 values

**Files:**
- Modify: `src/stores/settingsStore.ts:658-661` (interface), `src/stores/settingsStore.ts:971-982` (init), `src/stores/settingsStore.ts:1537-1544` (setters)
- Modify: `src/hooks/useSettings.ts:81-88` (`ThemeSettings` interface), `src/hooks/useSettings.ts:295-299` (mapped return)
- Test: `src/stores/settingsStore.test.ts`

**Interfaces:**
- Produces: `idleOrbAnimation: "breathe" | "glow-ring" | "bob" | "shimmer"` field + `setIdleOrbAnimation(value)` setter on `useSettingsStore`. `voiceVisualizerStyle` type widened to `"plasma" | "bars" | "siri" | "ripple" | "neon" | "particles" | "waveline" | "spectrum"`.
- Consumed by: Task 8 (App.jsx wiring), Task 9 (SettingsPage.tsx pickers).

- [ ] **Step 1: Write the failing tests**

Append to `src/stores/settingsStore.test.ts`:

```ts
  it('initializes with an idle orb animation', () => {
    const state = useSettingsStore.getState();
    expect(state.idleOrbAnimation).toBeDefined();
  });

  it('setIdleOrbAnimation updates the animation correctly', () => {
    const { setIdleOrbAnimation } = useSettingsStore.getState();

    setIdleOrbAnimation('glow-ring');
    expect(useSettingsStore.getState().idleOrbAnimation).toBe('glow-ring');

    setIdleOrbAnimation('shimmer');
    expect(useSettingsStore.getState().idleOrbAnimation).toBe('shimmer');
  });

  it('setVoiceVisualizerStyle accepts the 2 new styles', () => {
    const { setVoiceVisualizerStyle } = useSettingsStore.getState();

    setVoiceVisualizerStyle('waveline');
    expect(useSettingsStore.getState().voiceVisualizerStyle).toBe('waveline');

    setVoiceVisualizerStyle('spectrum');
    expect(useSettingsStore.getState().voiceVisualizerStyle).toBe('spectrum');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src && npx vitest run stores/settingsStore.test.ts`
Expected: FAIL — `idleOrbAnimation` is `undefined`, `setIdleOrbAnimation` is not a function, and TypeScript rejects `'waveline'`/`'spectrum'` as not assignable to the narrower union.

- [ ] **Step 3: Widen `voiceVisualizerStyle`'s type and add `idleOrbAnimation` to the interface**

In `src/stores/settingsStore.ts`, replace lines 658-661:
```ts
  voiceVisualizerStyle: "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles";
  setVoiceVisualizerStyle: (style: "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles") => void;
  flowBarPillStyle: "glass" | "flat" | "bold" | "minimal";
  setFlowBarPillStyle: (style: "glass" | "flat" | "bold" | "minimal") => void;
```
with:
```ts
  voiceVisualizerStyle: "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles" | "waveline" | "spectrum";
  setVoiceVisualizerStyle: (style: "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles" | "waveline" | "spectrum") => void;
  flowBarPillStyle: "glass" | "flat" | "bold" | "minimal";
  setFlowBarPillStyle: (style: "glass" | "flat" | "bold" | "minimal") => void;
  idleOrbAnimation: "breathe" | "glow-ring" | "bob" | "shimmer";
  setIdleOrbAnimation: (value: "breathe" | "glow-ring" | "bob" | "shimmer") => void;
```

- [ ] **Step 4: Update init logic**

Replace lines 971-974:
```ts
  voiceVisualizerStyle: (() => {
    const v = readString("voiceVisualizerStyle", "plasma");
    return (["plasma", "bars", "siri", "ripple", "neon", "particles"].includes(v) ? v : "plasma") as "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles";
  })(),
```
with:
```ts
  voiceVisualizerStyle: (() => {
    const v = readString("voiceVisualizerStyle", "plasma");
    return (["plasma", "bars", "siri", "ripple", "neon", "particles", "waveline", "spectrum"].includes(v) ? v : "plasma") as "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles" | "waveline" | "spectrum";
  })(),
```

Then, immediately after the existing `flowBarPillStyle` init block (ends at line 982, right before `accentColor:`), insert:
```ts
  idleOrbAnimation: (() => {
    const v = readString("idleOrbAnimation", "breathe");
    return (["breathe", "glow-ring", "bob", "shimmer"].includes(v) ? v : "breathe") as
      | "breathe"
      | "glow-ring"
      | "bob"
      | "shimmer";
  })(),
```

- [ ] **Step 5: Add the setter**

In `src/stores/settingsStore.ts`, replace lines 1541-1544:
```ts
  setFlowBarPillStyle: (style: "glass" | "flat" | "bold" | "minimal") => {
    if (isBrowser) localStorage.setItem("flowBarPillStyle", style);
    set({ flowBarPillStyle: style });
  },
```
with:
```ts
  setFlowBarPillStyle: (style: "glass" | "flat" | "bold" | "minimal") => {
    if (isBrowser) localStorage.setItem("flowBarPillStyle", style);
    set({ flowBarPillStyle: style });
  },
  setIdleOrbAnimation: (value: "breathe" | "glow-ring" | "bob" | "shimmer") => {
    if (isBrowser) localStorage.setItem("idleOrbAnimation", value);
    set({ idleOrbAnimation: value });
  },
```

- [ ] **Step 6: Mirror into `useSettings.ts`**

In `src/hooks/useSettings.ts`, replace lines 81-88:
```ts
export interface ThemeSettings {
  theme: "light" | "dark" | "auto";
  palette: "default" | "nord" | "dracula" | "solarized" | "rose";
  accentColor: string | null;
  voiceVisualizerStyle: "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles";
  enableVoiceStyles: boolean;
  flowBarPillStyle: "glass" | "flat" | "bold" | "minimal";
}
```
with:
```ts
export interface ThemeSettings {
  theme: "light" | "dark" | "auto";
  palette: "default" | "nord" | "dracula" | "solarized" | "rose";
  accentColor: string | null;
  voiceVisualizerStyle: "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles" | "waveline" | "spectrum";
  enableVoiceStyles: boolean;
  flowBarPillStyle: "glass" | "flat" | "bold" | "minimal";
  idleOrbAnimation: "breathe" | "glow-ring" | "bob" | "shimmer";
}
```

Around line 295-299, find:
```ts
      voiceVisualizerStyle: store.voiceVisualizerStyle,
```
and the `flowBarPillStyle: store.flowBarPillStyle,` line a few lines below it — add immediately after that line:
```ts
      idleOrbAnimation: store.idleOrbAnimation,
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd src && npx vitest run stores/settingsStore.test.ts`
Expected: PASS (all tests including the 3 new ones)

- [ ] **Step 8: Run the TypeScript check**

Run: `npx tsc --noEmit -p .`
Expected: no new errors (existing pre-existing errors, if any, are unaffected)

- [ ] **Step 9: Commit**

```bash
git add src/stores/settingsStore.ts src/stores/settingsStore.test.ts src/hooks/useSettings.ts
git commit -m "feat(settings): add idleOrbAnimation setting, extend voiceVisualizerStyle to 8 values"
```

---

### Task 3: CSS — orb idle shape, expanded dock shape, recording capsule shape (Part A)

**Files:**
- Modify: `src/index.css:794-966` (replaces the `.flow-dock-handle*` block with an orb, resizes `.flow-dock-panel` for horizontal capsule proportions — recording-capsule sizing is via `.flow-dock-mic--recording`, touched in Task 5)

**Interfaces:**
- Consumes: nothing new (pure CSS).
- Produces: `.flow-dock-handle` becomes a 40px circular orb (was a 7×40px sliver) — classNames `flow-dock-handle`, `flow-dock-handle--{glass,flat,bold,minimal}` are unchanged identifiers, only their rule bodies change. `App.jsx` (Task 8) does not need a className change here — same class names, new shapes.

- [ ] **Step 1: Replace the idle handle rules with an orb**

Replace lines 794-820 (`.flow-dock-handle` base rule + hover + dark overrides):
```css
.flow-dock-handle {
  width: 7px;
  height: 40px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.8);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  margin-right: 4px;
  cursor: pointer;
  transition:
    height 200ms var(--flow-spring-easing),
    border-color 200ms ease-out;
}

.flow-dock-handle:hover {
  height: 46px;
  border-color: #000;
}

.dark .flow-dock-handle {
  background: rgba(16, 16, 18, 0.75);
  border-color: rgba(255, 255, 255, 0.45);
}

.dark .flow-dock-handle:hover {
  border-color: rgba(255, 255, 255, 0.75);
}
```
with:
```css
.flow-dock-handle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.8);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  margin-right: 8px;
  cursor: pointer;
  transition:
    transform 200ms var(--flow-spring-easing),
    border-color 200ms ease-out,
    box-shadow 200ms ease-out;
}

.flow-dock-handle:hover {
  transform: scale(1.08);
  border-color: #000;
}

.dark .flow-dock-handle {
  background: rgba(16, 16, 18, 0.75);
  border-color: rgba(255, 255, 255, 0.45);
}

.dark .flow-dock-handle:hover {
  border-color: rgba(255, 255, 255, 0.75);
}
```

- [ ] **Step 2: Update the glass/minimal orb variants' comment and shadow for the new shape**

Replace lines 822-853:
```css
/* Pill Style — collapsed handle sliver (7x40px). Smallest, least visually
   significant state; same per-style language as the idle dock, scaled
   down. Not individually mocked in the visual brainstorm — direct
   extrapolation, not a new design decision. */
.flow-dock-handle.flow-dock-handle--glass {
  background: rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  border-color: rgba(255, 255, 255, 0.5);
}
.dark .flow-dock-handle.flow-dock-handle--glass {
  background: rgba(30, 28, 38, 0.45);
  border-color: rgba(255, 255, 255, 0.25);
}

/* flat: matches the unmodified .flow-dock-handle rule above — no override. */
.flow-dock-handle.flow-dock-handle--flat {
}

/* bold: same opaque neutral sliver as flat — bold's contrast signal lives
   in the mic icon and recording pill, not this sliver. */
.flow-dock-handle.flow-dock-handle--bold {
}

.flow-dock-handle.flow-dock-handle--minimal {
  background: transparent;
  border-color: rgba(0, 0, 0, 0.12);
  box-shadow: none;
}
.dark .flow-dock-handle.flow-dock-handle--minimal {
  border-color: rgba(255, 255, 255, 0.14);
}
```
with:
```css
/* Pill Style — collapsed idle orb (40px circle, was a 7x40px sliver before
   the horizontal redesign). Mockup "C1: Orb -> Capsule (grow)" from
   docs/superpowers/specs/2026-07-20-flowbar-pill-visualizer-menu-redesign.md
   Part A. Same per-style language as the idle dock. */
.flow-dock-handle.flow-dock-handle--glass {
  background: linear-gradient(135deg, rgba(109, 79, 224, 0.55), rgba(109, 79, 224, 0.25));
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 4px 16px rgba(109, 79, 224, 0.35);
}
.dark .flow-dock-handle.flow-dock-handle--glass {
  background: linear-gradient(135deg, rgba(109, 79, 224, 0.6), rgba(109, 79, 224, 0.3));
  border-color: rgba(255, 255, 255, 0.25);
}

/* flat: matches the unmodified .flow-dock-handle rule above — no override. */
.flow-dock-handle.flow-dock-handle--flat {
}

.flow-dock-handle.flow-dock-handle--bold {
  background: #f5a94a;
  border-color: rgba(0, 0, 0, 0.1);
}
.dark .flow-dock-handle.flow-dock-handle--bold {
  border-color: rgba(255, 255, 255, 0.15);
}

.flow-dock-handle.flow-dock-handle--minimal {
  background: transparent;
  border-color: rgba(0, 0, 0, 0.12);
  box-shadow: none;
}
.dark .flow-dock-handle.flow-dock-handle--minimal {
  border-color: rgba(255, 255, 255, 0.14);
}
```

- [ ] **Step 3: Manual visual check (no automated test for pure CSS shape)**

Run: `npm run dev`, hover/click the idle Flow Bar in the running app, confirm it renders as a 40px circle (not a sliver) in all 4 pill styles, light and dark theme.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat(flowbar): idle handle becomes a 40px orb (was a 7x40px sliver)"
```

---

### Task 4: CSS — idle orb animations (Part C, 4 selectable variants)

**Files:**
- Modify: `src/index.css` (append after the `.flow-dock-handle--minimal` dark rule added in Task 3)

**Interfaces:**
- Consumes: `.flow-dock-handle` orb shape from Task 3.
- Produces: 4 new modifier classes — `.flow-dock-handle--anim-breathe`, `.flow-dock-handle--anim-glow-ring`, `.flow-dock-handle--anim-bob`, `.flow-dock-handle--anim-shimmer` — consumed by Task 8 (App.jsx applies one of these based on `idleOrbAnimation`).

- [ ] **Step 1: Add the 4 animation keyframes + modifier classes**

Append to `src/index.css` immediately after the `.flow-dock-handle.flow-dock-handle--minimal` dark-mode rule from Task 3:
```css
/* Idle orb animation — user-selectable via idleOrbAnimation setting
   (settingsStore.ts). Applies only to the idle (.flow-dock-handle) state;
   hover/recording use their own transitions untouched by this setting. */
@keyframes flow-orb-breathe {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
}
.flow-dock-handle--anim-breathe {
  animation: flow-orb-breathe 2.6s ease-in-out infinite;
}

@keyframes flow-orb-glow-ring {
  0% {
    transform: scale(0.85);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}
.flow-dock-handle--anim-glow-ring {
  position: relative;
}
.flow-dock-handle--anim-glow-ring::after {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1.5px solid rgba(167, 139, 250, 0.5);
  animation: flow-orb-glow-ring 2.4s ease-out infinite;
  pointer-events: none;
}
.dark .flow-dock-handle--anim-glow-ring::after {
  border-color: rgba(167, 139, 250, 0.6);
}

@keyframes flow-orb-bob {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}
.flow-dock-handle--anim-bob {
  animation: flow-orb-bob 2.2s ease-in-out infinite;
}

@keyframes flow-orb-shimmer-sweep {
  0% {
    left: -60%;
  }
  45%, 100% {
    left: 120%;
  }
}
.flow-dock-handle--anim-shimmer {
  position: relative;
  overflow: hidden;
}
.flow-dock-handle--anim-shimmer::after {
  content: "";
  position: absolute;
  top: 0;
  left: -60%;
  width: 60%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
  animation: flow-orb-shimmer-sweep 3.2s ease-in-out infinite;
  pointer-events: none;
}
```

Note: `--anim-breathe` and `--anim-bob` animate the `transform` property (same property `.flow-dock-handle:hover`'s `transform: scale(1.08)` uses) — this is intentional and matches how the existing recording-pill breathing pulse (`flow-pill-breathe`, added in the prior plan) already coexists with hover transforms elsewhere in this file; the idle animation only runs while `!isExpanded` (Task 8 only applies the class in that state), so it never overlaps with the hover-scale transition in practice.

- [ ] **Step 2: Manual visual check**

Run: `npm run dev`. In Settings, once Task 9 ships the picker you'll be able to switch styles; for now, temporarily add `flow-dock-handle--anim-breathe` to the className in `App.jsx`'s handle `<div>` (line ~635), confirm the orb pulses, then remove the temporary edit (Task 8 wires this properly).

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat(flowbar): add 4 selectable idle-orb animations (breathe/glow-ring/bob/shimmer)"
```

---

### Task 5: CSS — recording capsule resize + dock panel row layout + polish (Parts A cont'd + D)

**Files:**
- Modify: `src/index.css:894-1071` (`.flow-dock-panel` block, `.flow-dock-mic--recording` block)

**Interfaces:**
- Consumes: nothing new.
- Produces: `.flow-dock-panel` becomes `flex-direction: row` (was `column`) with glass-shine/shadow polish per style; `.flow-dock-mic--recording` resized to `140×44px` (was `48×128px`).

- [ ] **Step 1: Switch `.flow-dock-panel` to row layout with polish**

Replace lines 894-917:
```css
/* Rounded vertical panel holding the mic / scratchpad / transforms icons. */
.flow-dock-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 28px;
  background: var(--color-surface-2);
  color: #1a1a1a;
  border: 1px solid rgba(0, 0, 0, 0.15);
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.04);
  animation: flow-dock-in 180ms var(--flow-spring-easing);
}

.dark .flow-dock-panel {
  background: var(--color-flow-surface-dark);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.5),
    0 4px 16px rgba(0, 0, 0, 0.25);
}
```
with:
```css
/* Rounded horizontal capsule holding the mic / scratchpad / transforms
   icons in a row (was a vertical column before the horizontal redesign —
   see docs/superpowers/specs/2026-07-20-flowbar-pill-visualizer-menu-redesign.md
   Part D, mockup A2 "Polished flat row"). */
.flow-dock-panel {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  border-radius: 23px;
  background: var(--color-surface-2);
  color: #1a1a1a;
  border: 1px solid rgba(0, 0, 0, 0.15);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
  animation: flow-dock-in 180ms var(--flow-spring-easing);
}

.dark .flow-dock-panel {
  background: var(--color-flow-surface-dark);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
```

- [ ] **Step 2: Add per-style ambient glow shadow to the glass/bold variants**

Replace lines 928-937 (the `.flow-dock-panel--glass` light-mode rule):
```css
.flow-dock-panel.flow-dock-panel--glass {
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-top-color: rgba(255, 255, 255, 0.8);
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.55);
}
```
with:
```css
.flow-dock-panel.flow-dock-panel--glass {
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-top-color: rgba(255, 255, 255, 0.8);
  box-shadow:
    0 8px 24px rgba(109, 79, 224, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.55);
}
```

Replace lines 955-956 (the currently-empty `.flow-dock-panel--bold` anchor):
```css
.flow-dock-panel.flow-dock-panel--bold {
}
```
with:
```css
.flow-dock-panel.flow-dock-panel--bold {
  box-shadow:
    0 8px 24px rgba(245, 169, 74, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
}
```

(`--flat` and `--minimal` stay as their existing empty/transparent rules — flat inherits the base panel's new inset-highlight shadow as-is, minimal stays shadow-free per its existing `box-shadow: none` rule, both already correct without changes.)

- [ ] **Step 3: Resize the recording capsule**

Replace lines 1057-1071:
```css
.flow-dock-mic--recording {
  width: 48px;
  height: 128px;
  color: #fff;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 !important;
  border: 1px solid rgba(139, 110, 240, 0.35) !important;
  background: #120f1c !important;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3),
              0 0 1px 0 rgba(255, 255, 255, 0.2) inset,
              0 0 20px 2px rgba(139, 110, 240, 0.3);
  animation: flow-pill-spring 380ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
```
with:
```css
.flow-dock-mic--recording {
  width: 140px;
  height: 44px;
  border-radius: 22px;
  color: #fff;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 !important;
  border: 1px solid rgba(139, 110, 240, 0.35) !important;
  background: #120f1c !important;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3),
              0 0 1px 0 rgba(255, 255, 255, 0.2) inset,
              0 0 20px 2px rgba(139, 110, 240, 0.3);
  animation: flow-pill-spring 380ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
```

(Only `width`/`height` swap and an explicit `border-radius: 22px` are added — `.flow-dock-mic`'s base rule already sets `border-radius: 999px`, which on a 140×44 box would look like two half-circle end-caps rather than the intended 22px capsule corners, so this override is required, not cosmetic drift.)

- [ ] **Step 4: Manual visual check**

Run: `npm run dev`. Click the orb to expand — confirm the dock's 3 icons (mic, scratchpad, transform sparkle) now sit in a horizontal row inside a capsule, in all 4 pill styles, both themes. Start a recording — confirm the recording pill is a wide 140×44 capsule (not the old tall 48×128 bar).

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "feat(flowbar): dock icons lay out horizontally, recording pill becomes 140x44 capsule"
```

---

### Task 6: CSS — transform menu card polish (Part E)

**Files:**
- Modify: `src/index.css:855-891` (`.flow-transform-menu--*` block)

**Interfaces:**
- Consumes: nothing new.
- Produces: active-row gradient class `.flow-transform-menu-item--active` (new, consumed by App.jsx's transform-menu row markup in Task 8) plus deeper card shadow on the existing `.flow-transform-menu--{style}` modifiers.

- [ ] **Step 1: Deepen the card shadow per style**

Replace lines 859-868 (`.flow-transform-menu--glass`):
```css
.flow-transform-menu.flow-transform-menu--glass {
  background: rgba(255, 255, 255, 0.2) !important;
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
  border-color: rgba(255, 255, 255, 0.5) !important;
}
.dark .flow-transform-menu.flow-transform-menu--glass {
  background: rgba(30, 28, 38, 0.35) !important;
  border-color: rgba(255, 255, 255, 0.14) !important;
}
```
with:
```css
.flow-transform-menu.flow-transform-menu--glass {
  background: rgba(255, 255, 255, 0.2) !important;
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border-color: rgba(255, 255, 255, 0.5) !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25) !important;
}
.dark .flow-transform-menu.flow-transform-menu--glass {
  background: rgba(30, 28, 38, 0.5) !important;
  border-color: rgba(255, 255, 255, 0.14) !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5) !important;
}
```

Replace lines 875-882 (`.flow-transform-menu--bold`):
```css
.flow-transform-menu.flow-transform-menu--bold {
  background: var(--color-surface-2) !important;
  border-color: rgba(0, 0, 0, 0.15) !important;
}
.dark .flow-transform-menu.flow-transform-menu--bold {
  background: var(--color-flow-surface-dark) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}
```
with:
```css
.flow-transform-menu.flow-transform-menu--bold {
  background: var(--color-surface-2) !important;
  border-color: rgba(0, 0, 0, 0.15) !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18) !important;
}
.dark .flow-transform-menu.flow-transform-menu--bold {
  background: var(--color-flow-surface-dark) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45) !important;
}
```

- [ ] **Step 2: Add the per-style active-row treatment**

Append immediately after the `.flow-transform-menu.flow-transform-menu--minimal` dark rule (after line 891, before the `.flow-dock-panel` section that starts at 893):
```css
/* Transform menu — active/selected row. Today there is no background
   highlight for the selected row at all (only a trailing checkmark icon);
   these classes add one, per pill style, applied only when the row is
   selected. flowBarPillStyle read at render time in App.jsx picks which of
   these 4 classes to apply (Task 9). */
.flow-transform-menu-item--active-glass {
  background: linear-gradient(135deg, rgba(109, 79, 224, 0.5), rgba(109, 79, 224, 0.2)) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15);
}
.flow-transform-menu-item--active-flat {
  background: rgba(0, 0, 0, 0.06) !important;
}
.dark .flow-transform-menu-item--active-flat {
  background: rgba(255, 255, 255, 0.08) !important;
}
.flow-transform-menu-item--active-bold {
  background: rgba(245, 169, 74, 0.25) !important;
}
.flow-transform-menu-item--active-minimal {
  background: transparent !important;
  border: 1px solid rgba(109, 79, 224, 0.4);
}
```

- [ ] **Step 3: Manual visual check**

Run: `npm run dev`. Open the transform menu (sparkle chevron), confirm the card has a visibly deeper shadow and the selected/active row shows a purple gradient in Glass style. Switch pill style in Settings and re-check the active row color changes accordingly.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat(flowbar): deepen transform-menu card shadow, add per-style active-row treatment"
```

---

### Task 7: Extract and redesign the 6 existing voice visualizer components

**Files:**
- Create: `src/components/flowbar/visualizers.jsx`
- Modify: `src/App.jsx:1-190` (remove the 6 inline component definitions, they move to the new file)

**Interfaces:**
- Consumes: `levels: number[]` (14-element array, values 0.15-1, from `useMicLevel`), `isCommandMode: boolean` — unchanged prop contract from before.
- Produces: `LiveWaveform`, `SiriOrbVisualizer`, `NeonPulseVisualizer`, `ParticleSwarmVisualizer`, `RippleWaveVisualizer`, `LiquidPlasmaVisualizer` — same 6 export names as before (so Task 8's App.jsx import swap and SettingsPage.tsx's existing import both keep working), now redesigned for the horizontal 140×44 capsule instead of the old vertical 48×128 bar.

- [ ] **Step 1: Create the new file with the 6 redesigned components**

Write `src/components/flowbar/visualizers.jsx`:
```jsx
import React from "react";

export const LiveWaveform = ({ levels, isCommandMode }) => {
  const bars = levels.filter((_, i) => i % 2 === 0);
  const gradient = isCommandMode
    ? "linear-gradient(180deg, #fde68a, #f59e0b)"
    : "linear-gradient(180deg, #c4b5fd, #6d4fe0)";

  return (
    <div className="absolute inset-0 z-0 flex items-center justify-center gap-[3px] px-1">
      {bars.map((level, i) => (
        <div
          key={i}
          className="w-[4px] rounded-full transition-[height] duration-75"
          style={{
            height: `${8 + level * 26}px`,
            background: gradient,
            transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />
      ))}
    </div>
  );
};

export const SiriOrbVisualizer = ({ levels, isCommandMode }) => {
  const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
  const scale = 1 + avg * 0.5;
  const coreColor = isCommandMode ? "251,191,36" : "167,139,250";
  const auraColor = isCommandMode ? "245,158,11" : "139,110,240";

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
      <div
        className="transition-transform duration-100 ease-out"
        style={{ width: "34px", height: "34px", transform: `scale(${scale})` }}
      >
        <div
          className="flow-viz-siri-spin"
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            background: `conic-gradient(from 0deg, rgba(${coreColor},1), rgba(${auraColor},1), rgba(${coreColor},1))`,
            filter: "blur(6px)",
          }}
        />
      </div>
    </div>
  );
};

export const NeonPulseVisualizer = ({ levels, isCommandMode }) => {
  const bars = levels.slice(0, 9);
  const glowColor = isCommandMode ? "rgba(245,158,11,0.9)" : "rgba(167,139,250,0.9)";

  return (
    <div className="absolute inset-0 flex items-center justify-center gap-[3px] pointer-events-none">
      {bars.map((level, i) => (
        <div
          key={i}
          className="w-[2.5px] rounded-full bg-white transition-[height] duration-75"
          style={{
            height: `${6 + level * 22}px`,
            boxShadow: `0 0 6px 1px ${glowColor}`,
          }}
        />
      ))}
    </div>
  );
};

export const ParticleSwarmVisualizer = ({ levels, isCommandMode }) => {
  const dotColor = isCommandMode ? "rgba(245,158,11,0.9)" : "rgba(139,110,240,0.9)";
  const dots = [levels[0], levels[2], levels[5], levels[8], levels[11], levels[13]];

  return (
    <div className="absolute inset-0 flex items-center justify-center gap-[10px] pointer-events-none">
      {dots.map((level, i) => (
        <div
          key={i}
          className="w-[5px] h-[5px] rounded-full transition-transform duration-100 ease-out"
          style={{
            backgroundColor: dotColor,
            boxShadow: `0 0 6px ${dotColor}`,
            transform: `translateY(${-(level - 0.15) * 16}px) scale(${0.6 + level * 0.8})`,
            opacity: 0.3 + level * 0.7,
          }}
        />
      ))}
    </div>
  );
};

export const RippleWaveVisualizer = ({ levels, isCommandMode }) => {
  const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
  const ringColor = isCommandMode ? "rgba(245,158,11,0.55)" : "rgba(109,79,224,0.55)";

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
      <div
        className="absolute rounded-full border-2 transition-transform duration-150 ease-out"
        style={{
          width: "16px",
          height: "16px",
          borderColor: ringColor,
          transform: `scale(${1 + avg * 6})`,
          opacity: Math.max(0, 1 - avg * 1.1),
        }}
      />
      <div
        className="absolute rounded-full border-2 transition-transform duration-150 ease-out"
        style={{
          width: "16px",
          height: "16px",
          borderColor: ringColor,
          transform: `scale(${1 + avg * 3.5})`,
          opacity: Math.max(0, 1 - avg * 0.7),
        }}
      />
      <div
        className="absolute rounded-full"
        style={{ width: "8px", height: "8px", background: ringColor }}
      />
    </div>
  );
};

export const LiquidPlasmaVisualizer = ({ levels, isCommandMode }) => {
  const getBand = (start, end) => {
    let sum = 0;
    for (let i = start; i < end; i++) sum += levels[i] || 0.15;
    return sum / (end - start);
  };

  const b1 = getBand(0, 5);
  const b2 = getBand(5, 10);
  const b3 = getBand(10, 14);

  const gradient = isCommandMode
    ? "radial-gradient(ellipse at 30% 50%, #fde68a, #f59e0b 60%, transparent 85%)"
    : "radial-gradient(ellipse at 30% 50%, #c4b5fd, #6d4fe0 60%, transparent 85%)";

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
      <div
        className="transition-all duration-100 ease-out"
        style={{
          width: `${70 + b1 * 30}px`,
          height: `${22 + b2 * 14}px`,
          background: gradient,
          filter: "blur(6px)",
          borderRadius: `${50 - b3 * 15}% / 50%`,
        }}
      />
    </div>
  );
};
```

- [ ] **Step 2: Remove the 6 inline definitions from App.jsx and import from the new file instead**

In `src/App.jsx`, delete lines 27-190 (the 6 `export const ...Visualizer = ...` blocks — from `export const LiveWaveform` through the closing `};` of `LiquidPlasmaVisualizer`).

Add to the top import block (after the existing `import { Toggle } from "./components/ui/toggle";` line):
```js
import {
  LiveWaveform,
  SiriOrbVisualizer,
  NeonPulseVisualizer,
  ParticleSwarmVisualizer,
  RippleWaveVisualizer,
  LiquidPlasmaVisualizer,
} from "./components/flowbar/visualizers";
```

Note: `App.jsx` no longer `export`s these 6 names. `SettingsPage.tsx` currently imports them via `from "../App"` (Task 9 fixes that import to point at the new file — do not run the app expecting that import to resolve until Task 9 lands, this task's own manual check only needs the recording pill itself, not the Settings preview grid).

- [ ] **Step 3: Add the siri-spin keyframe this file's `SiriOrbVisualizer` depends on**

Append to `src/index.css` (anywhere in the file; grouped near the other `@keyframes` for `flow-orb-*` added in Task 4 is a reasonable spot):
```css
@keyframes flow-viz-spin {
  to {
    transform: rotate(360deg);
  }
}
.flow-viz-siri-spin {
  animation: flow-viz-spin 3.2s linear infinite;
}
```

- [ ] **Step 4: Run the existing UI test suite**

Run: `cd src && npx vitest run`
Expected: `App.test.jsx` still passes (it renders `<App />` with mocked hooks; the visualizer components it indirectly renders no longer live inline but the import path change doesn't affect render output).

- [ ] **Step 5: Commit**

```bash
git add src/components/flowbar/visualizers.jsx src/App.jsx src/index.css
git commit -m "refactor(flowbar): extract visualizer components to their own file, redesign for horizontal capsule"
```

---

### Task 8: Add the 2 new visualizer components (waveline, spectrum)

**Files:**
- Modify: `src/components/flowbar/visualizers.jsx` (append 2 new exports)

**Interfaces:**
- Consumes: same `{ levels, isCommandMode }` contract as Task 7's components.
- Produces: `WavelineVisualizer`, `SpectrumVisualizer` — new exports consumed by Task 9 (App.jsx conditional) and Task 10 (SettingsPage.tsx picker grid).

- [ ] **Step 1: Append the 2 new components**

Append to `src/components/flowbar/visualizers.jsx`:
```jsx
export const WavelineVisualizer = ({ levels, isCommandMode }) => {
  const strokeColor = isCommandMode ? "#f59e0b" : "#a78bfa";
  const width = 110;
  const height = 32;
  const mid = height / 2;
  const samples = [levels[1], levels[4], levels[7], levels[10], levels[13]];
  const points = samples.map((level, i) => {
    const x = (width / (samples.length - 1)) * i;
    const y = mid - (level - 0.15) * (mid - 4);
    return [x, y];
  });
  let d = `M0,${mid}`;
  points.forEach(([x, y], i) => {
    const prevX = i === 0 ? 0 : points[i - 1][0];
    const cx = (prevX + x) / 2;
    d += ` Q${cx},${y} ${x},${y}`;
  });

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path d={d} stroke={strokeColor} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
};

export const SpectrumVisualizer = ({ levels, isCommandMode }) => {
  const gradient = isCommandMode
    ? "linear-gradient(180deg, #fde68a, #f59e0b)"
    : "linear-gradient(180deg, #f5a94a, #6d4fe0)";

  return (
    <div className="absolute inset-0 flex items-end justify-center gap-[2px] pb-1 pointer-events-none">
      {levels.map((level, i) => (
        <div
          key={i}
          className="w-[2.5px] rounded-[1px] transition-[height] duration-75"
          style={{ height: `${4 + level * 28}px`, background: gradient }}
        />
      ))}
    </div>
  );
};
```

- [ ] **Step 2: Run the existing UI test suite**

Run: `cd src && npx vitest run`
Expected: PASS (new exports don't affect any existing test — nothing imports them yet)

- [ ] **Step 3: Commit**

```bash
git add src/components/flowbar/visualizers.jsx
git commit -m "feat(flowbar): add waveline and spectrum visualizer components"
```

---

### Task 9: Wire shape/animation/visualizer changes into App.jsx

**Files:**
- Modify: `src/App.jsx` (import fix left pending from Task 7, add `idleOrbAnimation` store read + className, add `waveline`/`spectrum` to the visualizer conditional, apply active-row class in the transform menu)

**Interfaces:**
- Consumes: `idleOrbAnimation` from `useSettingsStore` (Task 2), `WavelineVisualizer`/`SpectrumVisualizer` (Task 8), `.flow-dock-handle--anim-{value}` classes (Task 4), `.flow-transform-menu-item--active-{style}` classes (Task 6).
- Produces: fully wired horizontal Flow Bar — nothing downstream depends on this task except manual QA (Task 11).

- [ ] **Step 1: Read `idleOrbAnimation` from the store**

In `src/App.jsx`, find the existing line (added by the prior plan):
```js
  const flowBarPillStyle = useSettingsStore((s) => s.flowBarPillStyle);
```
Add immediately after it:
```js
  const idleOrbAnimation = useSettingsStore((s) => s.idleOrbAnimation);
```

- [ ] **Step 2: Apply the idle-animation class to the orb**

Find (this is the `!isExpanded` branch, now rendering an orb instead of a sliver per Task 3's CSS):
```jsx
        ) : !isExpanded ? (
          <div
            className={`flow-dock-handle flow-dock-handle--${flowBarPillStyle}`}
            role="button"
            aria-label={t("app.dock.expand", { defaultValue: "Expand Flow Bar" })}
            onClick={() => setIsExpanded(true)}
          />
        ) : (
```
Replace with:
```jsx
        ) : !isExpanded ? (
          <div
            className={`flow-dock-handle flow-dock-handle--${flowBarPillStyle} flow-dock-handle--anim-${idleOrbAnimation}`}
            role="button"
            aria-label={t("app.dock.expand", { defaultValue: "Expand Flow Bar" })}
            onClick={() => setIsExpanded(true)}
          />
        ) : (
```

- [ ] **Step 3: Add the 2 new visualizer styles to the conditional render**

Find:
```jsx
                {voiceVisualizerStyle === "bars" ? (
                  <LiveWaveform levels={micLevels} isCommandMode={isCommandMode} />
                ) : voiceVisualizerStyle === "siri" ? (
                  <SiriOrbVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                ) : voiceVisualizerStyle === "ripple" ? (
                  <RippleWaveVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                ) : voiceVisualizerStyle === "neon" ? (
                  <NeonPulseVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                ) : voiceVisualizerStyle === "particles" ? (
                  <ParticleSwarmVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                ) : (
                  <LiquidPlasmaVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                )}
```
Replace with:
```jsx
                {voiceVisualizerStyle === "bars" ? (
                  <LiveWaveform levels={micLevels} isCommandMode={isCommandMode} />
                ) : voiceVisualizerStyle === "siri" ? (
                  <SiriOrbVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                ) : voiceVisualizerStyle === "ripple" ? (
                  <RippleWaveVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                ) : voiceVisualizerStyle === "neon" ? (
                  <NeonPulseVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                ) : voiceVisualizerStyle === "particles" ? (
                  <ParticleSwarmVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                ) : voiceVisualizerStyle === "waveline" ? (
                  <WavelineVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                ) : voiceVisualizerStyle === "spectrum" ? (
                  <SpectrumVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                ) : (
                  <LiquidPlasmaVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                )}
```

Update the import added in Task 7 to include the 2 new components — find:
```js
import {
  LiveWaveform,
  SiriOrbVisualizer,
  NeonPulseVisualizer,
  ParticleSwarmVisualizer,
  RippleWaveVisualizer,
  LiquidPlasmaVisualizer,
} from "./components/flowbar/visualizers";
```
Replace with:
```js
import {
  LiveWaveform,
  SiriOrbVisualizer,
  NeonPulseVisualizer,
  ParticleSwarmVisualizer,
  RippleWaveVisualizer,
  LiquidPlasmaVisualizer,
  WavelineVisualizer,
  SpectrumVisualizer,
} from "./components/flowbar/visualizers";
```

- [ ] **Step 4: Apply the active-row class in the transform menu**

Today the transform list has no background highlight for the selected row at all — only a trailing checkmark icon. Find:
```jsx
                <div className="px-1">
                  {transforms.map((tr) => (
                    <button
                      key={tr.id}
                      onClick={() => selectAutoApplyTransform(tr.id)}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] hover:bg-black/5 focus:bg-black/5 focus:outline-none dark:hover:bg-white/10 dark:focus:bg-white/10 transition-colors"
                    >
                      <span className="truncate">{tr.name}</span>
                      {autoApplyTransformId === tr.id && (
                        <Check size={14} className="shrink-0 text-neutral-700 dark:text-neutral-200" />
                      )}
                    </button>
                  ))}
                </div>
```
Replace with:
```jsx
                <div className="px-1">
                  {transforms.map((tr) => (
                    <button
                      key={tr.id}
                      onClick={() => selectAutoApplyTransform(tr.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] hover:bg-black/5 focus:bg-black/5 focus:outline-none dark:hover:bg-white/10 dark:focus:bg-white/10 transition-colors ${
                        autoApplyTransformId === tr.id
                          ? `flow-transform-menu-item--active-${flowBarPillStyle}`
                          : ""
                      }`}
                    >
                      <span className="truncate">{tr.name}</span>
                      {autoApplyTransformId === tr.id && (
                        <Check size={14} className="shrink-0 text-neutral-700 dark:text-neutral-200" />
                      )}
                    </button>
                  ))}
                </div>
```

- [ ] **Step 5: Run the existing UI test suite**

Run: `cd src && npx vitest run`
Expected: PASS

- [ ] **Step 6: Run the TypeScript/build check**

Run: `npx tsc --noEmit -p .`
Expected: no new errors

- [ ] **Step 7: Manual visual check**

Run: `npm run dev`. Confirm: idle orb animates per the current `idleOrbAnimation` setting (default breathe); switching `voiceVisualizerStyle` to `waveline` and `spectrum` in Settings renders them correctly during recording; opening the transform menu shows the selected row with the active-style treatment.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat(flowbar): wire idle-orb animation, waveline/spectrum visualizers, and active-row menu styling"
```

---

### Task 10: Settings UI — extend visualizer grid to 8 styles, add Idle Animation picker, fix SettingsPage's visualizer import

**Files:**
- Modify: `src/components/SettingsPage.tsx:6` (import), `src/components/SettingsPage.tsx:1697-1734` (visualizer grid), append new "Idle Animation" section after the existing "Pill Appearance" section (after line 1803, before the closing `</div>` at 1805)
- Modify: `src/locales/{en,es,fr,de,pt,it,ru,zh-CN,zh-TW}/translation.json` — add an `idleAnimation` object as a sibling of `pillAppearance` under `settingsPage.general`

**Interfaces:**
- Consumes: `WavelineVisualizer`, `SpectrumVisualizer` from Task 8; `idleOrbAnimation`/`setIdleOrbAnimation` from Task 2.
- Produces: nothing further downstream — this is the last wiring task.

- [ ] **Step 1: Fix the visualizer import to point at the new file**

In `src/components/SettingsPage.tsx`, replace line 6:
```ts
import { LiquidPlasmaVisualizer, LiveWaveform, SiriOrbVisualizer, RippleWaveVisualizer, NeonPulseVisualizer, ParticleSwarmVisualizer } from "../App";
```
with:
```ts
import { LiquidPlasmaVisualizer, LiveWaveform, SiriOrbVisualizer, RippleWaveVisualizer, NeonPulseVisualizer, ParticleSwarmVisualizer, WavelineVisualizer, SpectrumVisualizer } from "./flowbar/visualizers";
```

- [ ] **Step 2: Add the 2 new styles to the visualizer picker grid**

Find (inside the `Voice Overlay Settings` section):
```tsx
                      {(
                        [
                          { id: "plasma", name: "Liquid Plasma", Component: LiquidPlasmaVisualizer },
                          { id: "bars", name: "Equalizer Bars", Component: LiveWaveform },
                          { id: "siri", name: "Orb", Component: SiriOrbVisualizer },
                          { id: "ripple", name: "Ripple Waves", Component: RippleWaveVisualizer },
                          { id: "neon", name: "Neon Pulse", Component: NeonPulseVisualizer },
                          { id: "particles", name: "Particle Swarm", Component: ParticleSwarmVisualizer }
                        ] as const
                      ).map(style => {
```
Replace with:
```tsx
                      {(
                        [
                          { id: "plasma", name: "Liquid Plasma", Component: LiquidPlasmaVisualizer },
                          { id: "bars", name: "Equalizer Bars", Component: LiveWaveform },
                          { id: "siri", name: "Orb", Component: SiriOrbVisualizer },
                          { id: "ripple", name: "Ripple Waves", Component: RippleWaveVisualizer },
                          { id: "neon", name: "Neon Pulse", Component: NeonPulseVisualizer },
                          { id: "particles", name: "Particle Swarm", Component: ParticleSwarmVisualizer },
                          { id: "waveline", name: "Waveline", Component: WavelineVisualizer },
                          { id: "spectrum", name: "Spectrum", Component: SpectrumVisualizer }
                        ] as const
                      ).map(style => {
```

Also update the preview container's aspect ratio, since the preview box is currently sized for the old vertical pill (`w-[38px] h-[85px]`) and the redesigned components above assume a wide capsule. Find:
```tsx
                               <div className="relative flex items-center justify-center overflow-hidden bg-black/80 dark:bg-black rounded-3xl border border-black/10 dark:border-white/10 shadow-sm transition-all w-[38px] h-[85px]">
```
Replace with:
```tsx
                               <div className="relative flex items-center justify-center overflow-hidden bg-black/80 dark:bg-black rounded-full border border-black/10 dark:border-white/10 shadow-sm transition-all w-[110px] h-[34px]">
```

- [ ] **Step 3: Add the "Idle Animation" settings section**

Add these 2 destructured values to the existing settings destructure near the top of the component (find the line that destructures `flowBarPillStyle` and `setFlowBarPillStyle` from `useSettings()` — add alongside them):
```ts
    idleOrbAnimation,
    setIdleOrbAnimation,
```

Insert this new section immediately after the closing `</div>` of the "Pill Appearance" section (after line 1803, before the outer wrapping `</div>` at line 1805):
```tsx
            {/* Idle Animation — which motion the idle orb (Part A/C) plays
                before recording starts. Same grid-picker pattern as Pill
                Appearance, using the CSS classes from Task 4. */}
            <div>
              <SectionHeader
                title={t("settingsPage.general.idleAnimation.title", {
                  defaultValue: "Idle Animation",
                })}
                description={t("settingsPage.general.idleAnimation.description", {
                  defaultValue: "Choose how the pill behaves while idle",
                })}
              />
              <SettingsPanel>
                <SettingsPanelRow>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full">
                    {(
                      [
                        { id: "breathe", labelKey: "breathe", defaultLabel: "Breathe" },
                        { id: "glow-ring", labelKey: "glowRing", defaultLabel: "Glow Ring" },
                        { id: "bob", labelKey: "bob", defaultLabel: "Bob" },
                        { id: "shimmer", labelKey: "shimmer", defaultLabel: "Shimmer" },
                      ] as const
                    ).map((anim) => {
                      const isSelected = idleOrbAnimation === anim.id;
                      return (
                        <button
                          key={anim.id}
                          onClick={() => setIdleOrbAnimation(anim.id)}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border-[1.5px] transition-all duration-200 shadow-sm outline-none group ${
                            isSelected
                              ? "border-primary bg-primary/5 ring-2 ring-primary/20 scale-[1.02]"
                              : "border-border hover:border-border-hover bg-card scale-100"
                          }`}
                        >
                          <div className="flex items-center justify-center h-[70px] w-full mb-2 pointer-events-none">
                            <div
                              className={`flow-dock-handle flow-dock-handle--glass flow-dock-handle--anim-${anim.id}`}
                              style={{ position: "relative", marginRight: 0 }}
                            />
                          </div>
                          <span
                            className={`text-[11px] font-medium transition-colors ${isSelected ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}
                          >
                            {t(`settingsPage.general.idleAnimation.${anim.labelKey}`, {
                              defaultValue: anim.defaultLabel,
                            })}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </SettingsPanelRow>
              </SettingsPanel>
            </div>
```

- [ ] **Step 4: Add i18n keys to all 9 locale files**

In each `src/locales/{lang}/translation.json`, find the `"pillAppearance": { ... }` object (a child of `settingsPage.general`) and insert a new `"idleAnimation"` object as its sibling, immediately after the `pillAppearance` block's closing `},`.

`en/translation.json` — insert after `pillAppearance`'s closing `},`:
```json
      "idleAnimation": {
        "title": "Idle Animation",
        "description": "Choose how the pill behaves while idle",
        "breathe": "Breathe",
        "glowRing": "Glow Ring",
        "bob": "Bob",
        "shimmer": "Shimmer"
      },
```

`es/translation.json`:
```json
      "idleAnimation": {
        "title": "Animación en reposo",
        "description": "Elige cómo se comporta la píldora en reposo",
        "breathe": "Respirar",
        "glowRing": "Anillo de brillo",
        "bob": "Balanceo",
        "shimmer": "Destello"
      },
```

`fr/translation.json`:
```json
      "idleAnimation": {
        "title": "Animation au repos",
        "description": "Choisissez comment la pilule se comporte au repos",
        "breathe": "Respiration",
        "glowRing": "Anneau lumineux",
        "bob": "Balancement",
        "shimmer": "Reflet"
      },
```

`de/translation.json`:
```json
      "idleAnimation": {
        "title": "Ruheanimation",
        "description": "Wähle, wie sich die Pille im Ruhezustand verhält",
        "breathe": "Atmen",
        "glowRing": "Leuchtring",
        "bob": "Wippen",
        "shimmer": "Schimmer"
      },
```

`pt/translation.json`:
```json
      "idleAnimation": {
        "title": "Animação em repouso",
        "description": "Escolha como a pílula se comporta em repouso",
        "breathe": "Respirar",
        "glowRing": "Anel brilhante",
        "bob": "Balanço",
        "shimmer": "Brilho"
      },
```

`it/translation.json`:
```json
      "idleAnimation": {
        "title": "Animazione a riposo",
        "description": "Scegli come si comporta la pillola a riposo",
        "breathe": "Respiro",
        "glowRing": "Anello luminoso",
        "bob": "Ondeggio",
        "shimmer": "Luccichio"
      },
```

`ru/translation.json`:
```json
      "idleAnimation": {
        "title": "Анимация покоя",
        "description": "Выберите поведение капсулы в состоянии покоя",
        "breathe": "Дыхание",
        "glowRing": "Светящееся кольцо",
        "bob": "Покачивание",
        "shimmer": "Мерцание"
      },
```

`zh-CN/translation.json`:
```json
      "idleAnimation": {
        "title": "待机动画",
        "description": "选择胶囊在待机状态下的表现方式",
        "breathe": "呼吸",
        "glowRing": "光环",
        "bob": "浮动",
        "shimmer": "微光"
      },
```

`zh-TW/translation.json`:
```json
      "idleAnimation": {
        "title": "待機動畫",
        "description": "選擇膠囊在待機狀態下的表現方式",
        "breathe": "呼吸",
        "glowRing": "光環",
        "bob": "浮動",
        "shimmer": "微光"
      },
```

- [ ] **Step 5: Verify all 9 locale files are still valid JSON**

Run:
```bash
for f in en es fr de pt it ru zh-CN zh-TW; do
  node -e "JSON.parse(require('fs').readFileSync('src/locales/$f/translation.json','utf8')); console.log('$f OK')"
done
```
Expected: `en OK`, `es OK`, `fr OK`, `de OK`, `pt OK`, `it OK`, `ru OK`, `zh-CN OK`, `zh-TW OK` — 9 lines, no errors.

- [ ] **Step 6: Run the existing UI test suite and TypeScript check**

Run: `cd src && npx vitest run && cd .. && npx tsc --noEmit -p .`
Expected: PASS, no new type errors

- [ ] **Step 7: Manual visual check**

Run: `npm run dev`. Open Settings → Appearance. Confirm the "Voice Overlay Pill" grid now shows 8 options including Waveline and Spectrum with correctly-sized wide previews, and a new "Idle Animation" section below "Pill Appearance" with 4 selectable options, each preview showing the orb with its animation actually playing.

- [ ] **Step 8: Commit**

```bash
git add src/components/SettingsPage.tsx src/locales/en/translation.json src/locales/es/translation.json src/locales/fr/translation.json src/locales/de/translation.json src/locales/pt/translation.json src/locales/it/translation.json src/locales/ru/translation.json src/locales/zh-CN/translation.json src/locales/zh-TW/translation.json
git commit -m "feat(settings): 8-way visualizer picker, new Idle Animation section, i18n for all 9 locales"
```

---

### Task 11: Manual verification — full redesign

**Files:** none (verification only)

**Interfaces:**
- Consumes: Tasks 1-10's full redesign.
- Produces: sign-off before merging.

- [ ] **Step 1: Manual verification checklist**

`npm run dev`. For each of the 4 pill styles (Settings → Appearance → Pill Appearance), in both light and dark theme:

1. **Idle orb**: confirm it renders as a 40px circle (not the old sliver), colored/bordered per style, and animates per the currently-selected Idle Animation (test all 4: Breathe, Glow Ring, Bob, Shimmer).
2. **Expanded dock** (click the orb): confirm the mic/scratchpad/transform-sparkle icons sit in a horizontal row inside a capsule, with visible inset highlight + ambient glow shadow.
3. **Recording**: confirm the pill is a 140×44 horizontal capsule (not the old 48×128 vertical bar), and each of the 8 visualizer styles (Settings → Appearance → Voice Overlay Pill) renders legibly inside it, in both normal recording and command-mode (amber accent) colors.
4. **Transform menu** (sparkle chevron): confirm the card shows a visibly deeper shadow and the selected row shows the per-style active treatment (purple gradient for Glass, tinted background for Flat/Bold, outlined for Minimal).
5. **Window footprint**: confirm the window resizes correctly for each state (no clipped/cut-off content) — this exercises the `WINDOW_SIZES` changes from Task 1 across all states (idle, hover/expanded, recording, with transform menu open).
6. **Default**: confirm a fresh profile (or `localStorage.removeItem("idleOrbAnimation")` + reload) defaults the idle animation to `"breathe"`.
