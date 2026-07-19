# Toast Redesign, Glassmorphism Removal, Startup Splash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox () syntax for tracking.

**Goal:** Replace glassmorphism across Dhwani's UI with the existing solid surface design tokens (starting with the toast component), add a fade-out to the app's existing startup splash, fix the scratchpad window's stray native border, and surface the app name/version in the Settings sidebar.

**Architecture:** Pure CSS/Tailwind class and small component changes — no new dependencies, no data-layer changes. Each task is an independently-verifiable visual diff, executed on a dedicated feature branch.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Electron, lucide-react icons.

## Global Constraints
- i18n requirement: every new user-facing string needs a translation key in all locale files under `src/locales/{lang}/translation.json` (en, es, fr, de, pt, it, ru, zh-CN, zh-TW). Note: `common.loading` already exists in all 10 locale files (verified during planning) — Part C adds no new keys.
- No new npm dependencies — reuse `lucide-react` icons already installed.
- TypeScript for new/modified components (`.tsx`); existing `.jsx` files (App.jsx, AppRouter.jsx) stay JS.
- Follow existing Tailwind v4 + CSS custom property patterns: solid replacements use the `--color-surface-0..3/raised` tokens (Tailwind utilities `bg-surface-1`, `bg-surface-2`, `bg-surface-3`, `bg-surface-raised`, generated automatically by Tailwind v4 from the `@theme` block in `src/index.css`) plus `border-border-subtle` / `border-border` / `border-border-hover`.
- Every step's "current content" below was read directly from the file at planning time; treat exact whitespace/quoting as load-bearing for the `old_string` match.
- This is a UI-only visual-change project — "Test" steps are manual visual verification via `npm run dev`, not new automated tests, unless noted.

---

### Task 1: Create the feature branch

**Files:** none (git operation only)

**Interfaces:**
- Consumes: nothing
- Produces: a branch all subsequent tasks commit to

- [ ] **Step 1: Create and switch to the feature branch off the current branch**
```bash
git checkout -b ui/toast-glass-splash-refresh
```

- [ ] **Step 2: Verify**
```bash
git branch --show-current
```
Expected output: `ui/toast-glass-splash-refresh`

---

### Task 2: Fix scratchpad window's transparent border

**Context:** `SCRATCHPAD_OVERLAY_CONFIG` (`src/helpers/windowConfig.js:285-294`) spreads `AGENT_OVERLAY_CONFIG` and overrides `resizable: true`. `AGENT_OVERLAY_CONFIG` already carries a `thickFrame: false` fix with a comment explaining it removes "the stray border around the rounded scratchpad/agent overlay" — but that fix only holds for non-resizable frameless windows. On Windows, a frameless *resizable* transparent window reintroduces the native `WS_THICKFRAME` border regardless of `thickFrame: false`, which is why the agent overlay (not resizable) is clean but the scratchpad overlay (resizable: true) still shows a border. Fix: keep the window itself non-resizable at the OS level, and implement resizing entirely in the renderer via a drag handle that calls back into the main process over IPC.

**Files:**
- Modify: `src/helpers/windowConfig.js:283-294`
- Modify: `main.js:1314-1320` (add IPC handler next to the existing `set-scratchpad-pinned` handler)
- Modify: `preload.js:65`
- Modify: `src/types/electron.ts:516`
- Modify: `src/components/ScratchpadOverlay.tsx`

**Interfaces:**
- Consumes: `windowManager.scratchpadWindow` (existing)
- Produces: `window.electronAPI.resizeScratchpadBy({ dx, dy }) => Promise<{ success: boolean }>`, consumed only within this task's renderer changes

- [ ] **Step 1: Disable native resizing on the scratchpad window, document why**
```js
// OLD (src/helpers/windowConfig.js:283-294)
// Scratchpad floating note overlay — small always-on-top notes window
// (sidebar + editor), cloned from the agent overlay shell.
const SCRATCHPAD_OVERLAY_CONFIG = {
  ...AGENT_OVERLAY_CONFIG,
  width: 560,
  height: 470,
  minWidth: 420,
  minHeight: 320,
  maxWidth: 1200,
  maxHeight: 900,
  resizable: true,
};

// NEW
// Scratchpad floating note overlay — small always-on-top notes window
// (sidebar + editor), cloned from the agent overlay shell.
//
// resizable stays false here even though this window IS user-resizable in
// practice — Windows reintroduces the native WS_THICKFRAME border on
// frameless *resizable* windows even with thickFrame: false (that's the
// stray border users see around this window specifically; the agent
// overlay above doesn't show it because it's not resizable). Resizing is
// instead handled entirely in the renderer via a drag handle that calls
// resizeScratchpadBy() over IPC — see src/components/ScratchpadOverlay.tsx.
const SCRATCHPAD_OVERLAY_CONFIG = {
  ...AGENT_OVERLAY_CONFIG,
  width: 560,
  height: 470,
  minWidth: 420,
  minHeight: 320,
  maxWidth: 1200,
  maxHeight: 900,
  resizable: false,
};
```

- [ ] **Step 2: Add the `resize-scratchpad-by` IPC handler**
```js
// OLD (main.js:1314-1320)
  ipcMain.handle("set-scratchpad-pinned", async (_event, pinned) => {
    const win = windowManager.scratchpadWindow;
    if (win && !win.isDestroyed()) {
      win.setAlwaysOnTop(!!pinned);
    }
    return { success: true };
  });

// NEW
  ipcMain.handle("set-scratchpad-pinned", async (_event, pinned) => {
    const win = windowManager.scratchpadWindow;
    if (win && !win.isDestroyed()) {
      win.setAlwaysOnTop(!!pinned);
    }
    return { success: true };
  });

  ipcMain.handle("resize-scratchpad-by", async (_event, { dx, dy }) => {
    const win = windowManager.scratchpadWindow;
    if (!win || win.isDestroyed()) return { success: false };
    const bounds = win.getBounds();
    const minWidth = 420;
    const minHeight = 320;
    const maxWidth = 1200;
    const maxHeight = 900;
    const width = Math.min(maxWidth, Math.max(minWidth, bounds.width + dx));
    const height = Math.min(maxHeight, Math.max(minHeight, bounds.height + dy));
    win.setBounds({ x: bounds.x, y: bounds.y, width, height });
    return { success: true };
  });
```

- [ ] **Step 3: Expose it in preload.js**
```js
// OLD (preload.js:65)
  setScratchpadPinned: (pinned) => ipcRenderer.invoke("set-scratchpad-pinned", pinned),

// NEW
  setScratchpadPinned: (pinned) => ipcRenderer.invoke("set-scratchpad-pinned", pinned),
  resizeScratchpadBy: (delta) => ipcRenderer.invoke("resize-scratchpad-by", delta),
```

- [ ] **Step 4: Add the type**
```ts
// OLD (src/types/electron.ts:516)
      setScratchpadPinned?: (pinned: boolean) => Promise<{ success: boolean }>;

// NEW
      setScratchpadPinned?: (pinned: boolean) => Promise<{ success: boolean }>;
      resizeScratchpadBy?: (delta: { dx: number; dy: number }) => Promise<{ success: boolean }>;
```

- [ ] **Step 5: Add the resize handle to `ScratchpadOverlay.tsx`**

First, add the drag-tracking handler alongside the other hooks near the top of the component:
```tsx
// OLD (src/components/ScratchpadOverlay.tsx:68-70)
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

// NEW
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const resizeStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartRef.current = { x: e.screenX, y: e.screenY };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const dx = moveEvent.screenX - start.x;
      const dy = moveEvent.screenY - start.y;
      resizeStartRef.current = { x: moveEvent.screenX, y: moveEvent.screenY };
      void window.electronAPI?.resizeScratchpadBy?.({ dx, dy });
    };

    const handleMouseUp = () => {
      resizeStartRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, []);
```

Then add the grip element and make the outer wrapper `relative` so it can be positioned against it:
```tsx
// OLD (src/components/ScratchpadOverlay.tsx:269-270)
  return (
    <div className="h-screen w-screen p-2 bg-transparent">
      <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-[#f5f3ef] shadow-2xl">

// NEW
  return (
    <div className="relative h-screen w-screen p-2 bg-transparent">
      <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-[#f5f3ef] shadow-2xl">
```

```tsx
// OLD (src/components/ScratchpadOverlay.tsx:528-531)
        </div>
      </div>
    </div>
  );
}

// NEW
        </div>
      </div>
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute bottom-0.5 right-0.5 h-4 w-4 cursor-nwse-resize"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      />
    </div>
  );
}
```

- [ ] **Step 6: Verify**
Run `npm run dev`, open the scratchpad overlay (Flow Bar dock → Scratchpad icon). Confirm no stray border/line is visible around the rounded card against the desktop behind it (compare against the agent overlay, which should look the same). Drag from the bottom-right corner (the invisible 16x16px grip) and confirm the window resizes smoothly, clamped between 420x320 and 1200x900.

- [ ] **Step 7: Commit**
```bash
git add src/helpers/windowConfig.js main.js preload.js src/types/electron.ts src/components/ScratchpadOverlay.tsx
git commit -m "fix(scratchpad): remove native resize border via renderer-driven resize handle"
```

---

### Task 3: Show app name + version at the bottom of the Settings sidebar

**Context:** `src/components/ui/SidebarModal.tsx:198-213` already renders a version footer (`v{version}`) at the bottom of the Settings modal's nav sidebar — the only existing "bottom of screen" version display in the app, fed by `SettingsModal.tsx` via `window.electronAPI.getAppVersion()`. Prepending the app name here is the minimal, correct fix rather than introducing a new footer bar elsewhere.

**Files:**
- Modify: `src/components/ui/SidebarModal.tsx:205-212`

**Interfaces:**
- Consumes: existing `version` prop (already wired from `getAppVersion()` in `SettingsModal.tsx`)
- Produces: n/a (leaf UI)

- [ ] **Step 1: Prepend the app name to the version string**
```tsx
// OLD (src/components/ui/SidebarModal.tsx:205-212)
                    <div className="flex items-center gap-1.5">
                      <div className="h-1 w-1 rounded-full bg-success/60" />
                      {!isCompact && (
                        <span className="text-xs text-muted-foreground/40 tabular-nums tracking-wide">
                          v{version}
                        </span>
                      )}
                    </div>

// NEW
                    <div className="flex items-center gap-1.5">
                      <div className="h-1 w-1 rounded-full bg-success/60" />
                      {!isCompact && (
                        <span className="text-xs text-muted-foreground/40 tabular-nums tracking-wide">
                          Dhwani v{version}
                        </span>
                      )}
                    </div>
```
Note: "Dhwani" is the brand name — per the i18n rules in `CLAUDE.md`, brand names are not translated, so this stays a literal string rather than an i18n key.

- [ ] **Step 2: Verify**
Run `npm run dev`, open Settings. Confirm the bottom of the sidebar reads "Dhwani v0.6.0" (or current `package.json` version) instead of just "v0.6.0", in both the expanded and compact sidebar states.

- [ ] **Step 3: Commit**
```bash
git add src/components/ui/SidebarModal.tsx
git commit -m "feat(settings): show app name alongside version in sidebar footer"
```

---

### Task 4: Toast surface CSS — solid background, both themes

**Files:**
- Modify: `src/index.css:658-679`

**Interfaces:**
- Consumes: nothing (pure CSS, first task in sequence)
- Produces: `.toast-surface` class consumed by Task 5/6 (`src/components/ui/Toast.tsx`)

- [ ] **Step 1: Replace the glass gradient + blur with solid surface tokens (light)**
```css
/* OLD (src/index.css:658-669) */
/* Toast — ultra-premium glassmorphic surface */
.toast-surface {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.45) 100%);
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.1),
    0 4px 12px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 1),
    inset 0 -1px 0 rgba(0, 0, 0, 0.05);
}

/* NEW */
/* Toast — solid surface */
.toast-surface {
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-subtle);
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.1),
    0 4px 12px rgba(0, 0, 0, 0.05);
}
```

- [ ] **Step 2: Replace the dark-mode override with the same solid treatment**
```css
/* OLD (src/index.css:671-679) */
.dark .toast-surface {
  background: linear-gradient(135deg, rgba(40, 40, 46, 0.75) 0%, rgba(20, 20, 24, 0.55) 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.4),
    0 4px 12px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.15),
    inset 0 -1px 0 rgba(0, 0, 0, 0.1);
}

/* NEW */
.dark .toast-surface {
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-subtle);
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.4),
    0 4px 12px rgba(0, 0, 0, 0.2);
}
```
Note: light and dark now resolve to the same rule shape (both read from the theme's surface tokens, which already differ by theme via `.dark` overrides elsewhere in `:root`/`.dark` — verify `--color-surface-2` has a `.dark` override in `src/index.css`'s `.dark { ... }` block before treating this as "no asymmetry"; if it doesn't, add one there rather than hardcoding a second color here).

- [ ] **Step 3: Verify**
Run `npm run dev`, open the control panel, trigger a toast (e.g. copy an error). In DevTools, select `.toast-surface`, confirm Computed panel shows no `backdrop-filter` property (or `none`) and `background-color` resolves to the surface-2 token in both light and dark (toggle theme via Settings → Appearance).

- [ ] **Step 4: Commit**
```bash
git add src/index.css
git commit -m "style(toast): replace glassmorphic toast surface with solid surface tokens"
```

---

### Task 5: Toast variant icons

**Files:**
- Modify: `src/components/ui/Toast.tsx:1-2,143-256`

**Interfaces:**
- Consumes: `variantConfig` object (existing), `lucide-react` icons
- Produces: icon rendering ahead of the message text; the left accent bar (`config.accentClass` div at line 220) is removed since the icon now signals variant.

- [ ] **Step 1: Import variant icons**
```tsx
// OLD (src/components/ui/Toast.tsx:2)
import { X, Copy, Check } from "lucide-react";

// NEW
import { X, Copy, Check, CheckCircle2, AlertTriangle, Info } from "lucide-react";
```

- [ ] **Step 2: Add `icon` field to `variantConfig`**
```tsx
// OLD (src/components/ui/Toast.tsx:143-156)
const variantConfig = {
  default: {
    accentClass: "bg-white/20",
    progressClass: "bg-white/15",
  },
  destructive: {
    accentClass: "bg-red-400",
    progressClass: "bg-red-400/30",
  },
  success: {
    accentClass: "bg-emerald-400",
    progressClass: "bg-emerald-400/30",
  },
};

// NEW
const variantConfig = {
  default: {
    icon: Info,
    iconClass: "text-primary",
    progressClass: "bg-white/15",
  },
  destructive: {
    icon: AlertTriangle,
    iconClass: "text-red-500 dark:text-red-400",
    progressClass: "bg-red-400/30",
  },
  success: {
    icon: CheckCircle2,
    iconClass: "text-emerald-600 dark:text-emerald-400",
    progressClass: "bg-emerald-400/30",
  },
};
```

- [ ] **Step 3: Remove the accent bar, render the icon instead**
```tsx
// OLD (src/components/ui/Toast.tsx:220-222)
      <div className={cn("w-0.5 shrink-0", config.accentClass)} />

      <div className="flex items-start gap-2 flex-1 min-w-0 px-2.5 py-2">
        <div className="flex-1 min-w-0">

// NEW
      <div className="flex items-start gap-2 flex-1 min-w-0 px-2.5 py-2">
        <config.icon className={cn("size-3.5 shrink-0 mt-0.5", config.iconClass)} />
        <div className="flex-1 min-w-0">
```

- [ ] **Step 4: Verify**
Run `npm run dev`, trigger a success toast, a destructive toast (e.g. a failed action), and a default/info toast. Confirm each shows the correct lucide icon (`CheckCircle2`/`AlertTriangle`/`Info`) to the left of the message, colored per variant, and the old vertical accent bar is gone in both themes.

- [ ] **Step 5: Commit**
```bash
git add src/components/ui/Toast.tsx
git commit -m "feat(toast): add variant icons, replace left accent bar"
```

---

### Task 6: Toast close button restyle

**Files:**
- Modify: `src/components/ui/Toast.tsx:260-276`

**Interfaces:**
- Consumes: Task 4's solid surface tokens
- Produces: final toast visual state for Part A

- [ ] **Step 1: Swap glass pill classes for solid surface classes**
```tsx
// OLD (src/components/ui/Toast.tsx:260-276)
      {onClose && (
        <button
          onClick={onClose}
          className={cn(
            "absolute -left-2 -top-2 size-6 rounded-full",
            "flex items-center justify-center",
            "bg-black/5 dark:bg-white/10 backdrop-blur-sm border border-black/5 dark:border-white/10",
            "text-neutral-600 dark:text-white/70 hover:text-neutral-900 dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/20",
            "opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100",
            "transition-all duration-150",
            "focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
          )}
        >
          <X className="size-3" />
          <span className="sr-only">Close</span>
        </button>
      )}

// NEW
      {onClose && (
        <button
          onClick={onClose}
          className={cn(
            "absolute -left-2 -top-2 size-6 rounded-full",
            "flex items-center justify-center",
            "bg-surface-3 dark:bg-surface-raised border border-border-subtle",
            "text-neutral-600 dark:text-white/70 hover:text-neutral-900 dark:hover:text-white hover:bg-surface-raised dark:hover:bg-surface-3",
            "opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100",
            "transition-all duration-150",
            "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
          )}
        >
          <X className="size-3" />
          <span className="sr-only">Close</span>
        </button>
      )}
```
Note: also swapped the focus ring from `ring-white/30` (only visible on dark glass) to `ring-ring/30` (theme token) since the surface is now solid in both themes — position (`-left-2 -top-2`), size (`size-6`), and hover/focus behavior are otherwise unchanged per spec.

- [ ] **Step 2: Verify**
Hover a toast in both themes; confirm the close button fades/scales in as before, has a solid (non-blurred) background, and DevTools Computed shows no `backdrop-filter` on the button.

- [ ] **Step 3: Commit**
```bash
git add src/components/ui/Toast.tsx
git commit -m "style(toast): restyle close button with solid surface, drop blur"
```

---

### Task 7: B1 dead cruft — card.tsx, dialog.tsx, popover.tsx

**Files:**
- Modify: `src/components/ui/card.tsx:9-13`
- Modify: `src/components/ui/dialog.tsx:38-44`
- Modify: `src/components/ui/popover.tsx:19-22`

**Interfaces:**
- Consumes: nothing new (`--glass-blur` is already `0px`, so these are proven no-ops)
- Produces: fewer references to `--glass-*` tokens, tracked by Task 30 (B4) grep

- [ ] **Step 1: card.tsx — delete the dead `dark:` glass classes**
```tsx
// OLD (src/components/ui/card.tsx:9-13)
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-colors duration-150",
        "dark:bg-[var(--glass-bg)] dark:border-[var(--glass-border)] dark:backdrop-blur-[var(--glass-blur)] dark:hover:border-border-hover",
        className
      )}

// NEW
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-colors duration-150",
        "dark:hover:border-border-hover",
        className
      )}
```

- [ ] **Step 2: dialog.tsx — delete dead glass classes from `DialogContent` only (leave `DialogOverlay` for Task 8's B3 pass)**
```tsx
// OLD (src/components/ui/dialog.tsx:38-44)
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border p-6 shadow-2xl duration-200 rounded-2xl",
        "bg-card border-border/60",
        "dark:bg-[var(--glass-bg)] dark:border-[var(--glass-border)] dark:backdrop-blur-[var(--glass-blur)] dark:shadow-modal",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        className
      )}

// NEW
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border p-6 shadow-2xl duration-200 rounded-2xl",
        "bg-card border-border/60 dark:shadow-modal",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        className
      )}
```

- [ ] **Step 3: popover.tsx — delete dead glass classes**
```tsx
// OLD (src/components/ui/popover.tsx:19-22)
      className={cn(
        "z-50 min-w-[220px] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        "dark:bg-[var(--glass-bg)] dark:border-[var(--glass-border)] dark:backdrop-blur-[var(--glass-blur)]",
        className
      )}

// NEW
      className={cn(
        "z-50 min-w-[220px] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
```

- [ ] **Step 4: Verify**
Run `npm run dev`, open a `Card`, a `Dialog` (e.g. any confirm dialog), and a `Popover` (e.g. a dropdown) in dark mode. Diff a before/after screenshot — since `--glass-blur` was already `0px`, pixel output should be byte-identical; this step is a no-visual-change sanity check, not a real design change.

- [ ] **Step 5: Commit**
```bash
git add src/components/ui/card.tsx src/components/ui/dialog.tsx src/components/ui/popover.tsx
git commit -m "chore: delete dead glass-token classes from card/dialog/popover (zero visual change)"
```

---

### Task 8: `src/index.css` — `.flow-dock-panel` and `.flow-dock-mic--recording` → solid (B2)

**Files:**
- Modify: `src/index.css:844-874` (`.flow-dock-panel`, `.dark .flow-dock-panel`)
- Modify: `src/index.css:931-954` (`.flow-dock-mic--recording`, `.dark .flow-dock-mic--recording`)

**Interfaces:**
- Consumes: nothing new
- Produces: solid dock panel background consumed visually by `App.jsx`'s flow dock (Task 9)

- [ ] **Step 1: `.flow-dock-panel` (light) — solid background, drop blur**
```css
/* OLD (src/index.css:844-863) */
/* Rounded vertical panel holding the mic / scratchpad / transforms icons. */
.flow-dock-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.75) 0%, rgba(255, 255, 255, 0.4) 100%);
  backdrop-filter: blur(32px) saturate(180%);
  -webkit-backdrop-filter: blur(32px) saturate(180%);
  color: #1a1a1a;
  border: 1px solid rgba(0, 0, 0, 0.4);
  box-shadow: 
    0 16px 40px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    inset 0 -1px 0 rgba(0, 0, 0, 0.05);
  animation: flow-dock-in 180ms var(--flow-spring-easing);
}

/* NEW */
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
```

- [ ] **Step 2: `.dark .flow-dock-panel` — solid dark background**
```css
/* OLD (src/index.css:865-874) */
.dark .flow-dock-panel {
  background: linear-gradient(135deg, rgba(45, 45, 52, 0.6) 0%, rgba(20, 20, 24, 0.4) 100%);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 
    0 16px 40px rgba(0, 0, 0, 0.5),
    0 4px 16px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    inset 0 -1px 0 rgba(0, 0, 0, 0.1);
}

/* NEW */
.dark .flow-dock-panel {
  background: #2b2822;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 
    0 16px 40px rgba(0, 0, 0, 0.5),
    0 4px 16px rgba(0, 0, 0, 0.25);
}
```
Note: `#2b2822` matches `--color-flow-surface-dark` already defined at `src/index.css:80` — reuse that var instead of a literal if it resolves cleanly: `background: var(--color-flow-surface-dark);`.

- [ ] **Step 3: `.flow-dock-mic--recording` — solid, drop blur (light+dark share one opaque rgba already)**
```css
/* OLD (src/index.css:933-949) */
.flow-dock-mic--recording {
  width: 48px;
  height: 128px;
  color: #fff;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 !important;
  border: 1px solid rgba(139, 110, 240, 0.35) !important;
  background: rgba(18, 15, 28, 0.85) !important;
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3),
              0 0 1px 0 rgba(255, 255, 255, 0.2) inset,
              0 0 20px 2px rgba(139, 110, 240, 0.3);
  animation: flow-pill-spring 380ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

/* NEW */
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
(`rgba(18, 15, 28, 0.85)` over the near-black dock backdrop visually approximates `#120f1c` fully opaque — this element sits over the desktop, not another panel, so full opacity is the correct solid replacement, matching the spec's "keep the solid color, drop the blur" instruction for `.dark .flow-dock-mic--recording` too, which is unchanged below it since it already only sets `background`/`border-color` overrides without its own `backdrop-filter`.)

- [ ] **Step 4: Verify**
Run `npm run dev` on the main dictation overlay window. Hover the flow dock to open the panel — confirm the vertical pill background is opaque (no see-through desktop content behind it) in both themes. Start a recording — confirm the recording pill (tall variant) is fully opaque, not translucent.

- [ ] **Step 5: Commit**
```bash
git add src/index.css
git commit -m "style(flow-dock): solid dock panel and recording pill backgrounds, drop blur"
```

---

### Task 9: `src/App.jsx` — flow dock hover panel, floating icon, context menu (B2)

**Files:**
- Modify: `src/App.jsx:648`, `:773`, `:798`

**Interfaces:**
- Consumes: Task 8's solid `.flow-dock-panel` pattern for visual consistency
- Produces: n/a (leaf UI)

- [ ] **Step 1: Hover-tooltip panel (line 648) — solid surface**
```jsx
// OLD (src/App.jsx:648)
              <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 w-72 rounded-2xl bg-white/90 backdrop-blur-2xl border border-black/10 p-3 shadow-2xl shadow-black/10 dark:bg-neutral-900/90 dark:border-white/10 dark:text-neutral-100 pointer-events-none animate-in fade-in slide-in-from-right-4 duration-300 z-50">

// NEW
              <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 w-72 rounded-2xl bg-white border border-black/10 p-3 shadow-2xl shadow-black/10 dark:bg-neutral-900 dark:border-white/10 dark:text-neutral-100 pointer-events-none animate-in fade-in slide-in-from-right-4 duration-300 z-50">
```

- [ ] **Step 2: Floating dock icon background (line 773) — solid surface**
```jsx
// OLD (src/App.jsx:773)
                        className="flow-dock-icon flow-dock-icon--small flow-dock-icon--float bg-white/40 dark:bg-black/20 backdrop-blur-md shadow-sm border border-black/5 dark:border-white/10"

// NEW
                        className="flow-dock-icon flow-dock-icon--small flow-dock-icon--float bg-surface-2 dark:bg-surface-2 shadow-sm border border-black/5 dark:border-white/10"
```

- [ ] **Step 3: Dock context menu panel (line 798) — solid surface**
```jsx
// OLD (src/App.jsx:798)
                className="absolute right-full bottom-0 mr-2 w-64 rounded-2xl bg-white/90 backdrop-blur-2xl border border-black/10 py-2 text-neutral-900 shadow-2xl shadow-black/10 dark:bg-neutral-900/90 dark:border-white/10 dark:text-neutral-100 animate-menu-in"

// NEW
                className="absolute right-full bottom-0 mr-2 w-64 rounded-2xl bg-white border border-black/10 py-2 text-neutral-900 shadow-2xl shadow-black/10 dark:bg-neutral-900 dark:border-white/10 dark:text-neutral-100 animate-menu-in"
```

- [ ] **Step 4: Verify**
Run `npm run dev` on the main dictation window. Hover a dock icon to trigger the tooltip panel (line 648 site) — confirm opaque background. Check the small floating icon background is solid. Right-click/open the dock context menu (line 798 site) — confirm it's opaque, not translucent, in both themes.

- [ ] **Step 5: Commit**
```bash
git add src/App.jsx
git commit -m "style(flow-dock): solid backgrounds for hover panel, floating icon, context menu"
```

---

### Task 10: `src/components/ui/dialog.tsx` `DialogOverlay` + `src/components/ui/SidebarModal.tsx` overlay — keep dim, drop blur (B3)

**Files:**
- Modify: `src/components/ui/dialog.tsx:21-24`
- Modify: `src/components/ui/SidebarModal.tsx:105`, `:110`

**Interfaces:**
- Consumes: nothing new
- Produces: consistent overlay behavior consumed by every `Dialog`/`SidebarModal` usage app-wide

- [ ] **Step 1: `DialogOverlay` — drop blur, keep dim**
```tsx
// OLD (src/components/ui/dialog.tsx:19-27)
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));

// NEW
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
```

- [ ] **Step 2: `SidebarModal` overlay — drop blur, keep dim**
```tsx
// OLD (src/components/ui/SidebarModal.tsx:105)
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

// NEW
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
```

- [ ] **Step 3: `SidebarModal` content — delete dead glass classes (B1, bundled here since same file/line)**
```tsx
// OLD (src/components/ui/SidebarModal.tsx:110)
          className="fixed left-[50%] top-[50%] z-50 max-h-[85vh] w-[90vw] max-w-4xl translate-x-[-50%] translate-y-[-50%] rounded-xl p-0 overflow-hidden bg-background border border-border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] dark:bg-[var(--glass-bg)] dark:border-[var(--glass-border)] dark:backdrop-blur-[var(--glass-blur)] dark:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-98 data-[state=open]:zoom-in-98"

// NEW
          className="fixed left-[50%] top-[50%] z-50 max-h-[85vh] w-[90vw] max-w-4xl translate-x-[-50%] translate-y-[-50%] rounded-xl p-0 overflow-hidden bg-background border border-border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] dark:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-98 data-[state=open]:zoom-in-98"
```

- [ ] **Step 4: Verify**
Open any `Dialog` (e.g. a confirm dialog) and the `SidebarModal` (e.g. transcript detail sidebar). Confirm the dim scrim behind the modal is still present (background still darkened) but DevTools Computed shows no `backdrop-filter` on the overlay element.

- [ ] **Step 5: Commit**
```bash
git add src/components/ui/dialog.tsx src/components/ui/SidebarModal.tsx
git commit -m "style(overlays): drop blur from dialog/sidebar-modal scrims, keep solid dim"
```

---

### Task 11: `src/components/CommandSearch.tsx` — backdrop (B3) + content panel (B2)

**Files:**
- Modify: `src/components/CommandSearch.tsx:293`, `:295-304`

- [ ] **Step 1: Backdrop — drop blur, keep dim**
```tsx
// OLD (src/components/CommandSearch.tsx:293)
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

// NEW
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
```

- [ ] **Step 2: Content panel — solid surface**
```tsx
// OLD (src/components/CommandSearch.tsx:295-304)
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[18%] z-50 w-full max-w-xl translate-x-[-50%]",
            "rounded-2xl border border-border/60 bg-background/85 backdrop-blur-3xl shadow-[0_16px_64px_-12px_rgba(0,0,0,0.3)] overflow-hidden",
            "dark:bg-[#151413]/70 dark:border-white/10 dark:shadow-[0_16px_64px_-12px_rgba(0,0,0,0.8)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=open]:slide-in-from-top-[44%] data-[state=closed]:slide-out-to-top-[44%]",
            "data-[state=open]:slide-in-from-left-1/2 data-[state=closed]:slide-out-to-left-1/2"
          )}

// NEW
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[18%] z-50 w-full max-w-xl translate-x-[-50%]",
            "rounded-2xl border border-border/60 bg-surface-2 shadow-[0_16px_64px_-12px_rgba(0,0,0,0.3)] overflow-hidden",
            "dark:bg-surface-2 dark:border-white/10 dark:shadow-[0_16px_64px_-12px_rgba(0,0,0,0.8)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=open]:slide-in-from-top-[44%] data-[state=closed]:slide-out-to-top-[44%]",
            "data-[state=open]:slide-in-from-left-1/2 data-[state=closed]:slide-out-to-left-1/2"
          )}
```

- [ ] **Step 3: Verify**
Open Command Search (Cmd/Ctrl+K in control panel). Confirm backdrop dim with no blur, and the search panel itself is opaque in both themes.

- [ ] **Step 4: Commit**
```bash
git add src/components/CommandSearch.tsx
git commit -m "style(command-search): solid panel, drop backdrop/content blur"
```

---

### Task 12: `src/components/CliIntegrationCard.tsx` + `src/components/McpIntegrationCard.tsx` (B2)

**Files:**
- Modify: `src/components/CliIntegrationCard.tsx:35`
- Modify: `src/components/McpIntegrationCard.tsx:38`

- [ ] **Step 1: CliIntegrationCard**
```tsx
// OLD (src/components/CliIntegrationCard.tsx:35)
    <div className="rounded-lg border border-border/50 dark:border-border-subtle/70 bg-card/50 dark:bg-surface-2/50 backdrop-blur-sm p-4">

// NEW
    <div className="rounded-lg border border-border/50 dark:border-border-subtle/70 bg-surface-1 dark:bg-surface-2 p-4">
```

- [ ] **Step 2: McpIntegrationCard**
```tsx
// OLD (src/components/McpIntegrationCard.tsx:38)
    <div className="rounded-lg border border-border/50 dark:border-border-subtle/70 bg-card/50 dark:bg-surface-2/50 backdrop-blur-sm p-4">

// NEW
    <div className="rounded-lg border border-border/50 dark:border-border-subtle/70 bg-surface-1 dark:bg-surface-2 p-4">
```

- [ ] **Step 3: Verify**
Open Settings → Integrations (CLI + MCP cards). Confirm both cards render with an opaque background in both themes.

- [ ] **Step 4: Commit**
```bash
git add src/components/CliIntegrationCard.tsx src/components/McpIntegrationCard.tsx
git commit -m "style(integrations): solid card backgrounds for CLI/MCP integration cards"
```

---

### Task 13: `src/components/HistoryView.tsx` — empty-state bubbles, stat cards, fullscreen overlay (B2+B3)

**Files:**
- Modify: `src/components/HistoryView.tsx:261,265,269,273` (empty-state bubbles, B2)
- Modify: `src/components/HistoryView.tsx:416,423` (stat/empty cards, B2)
- Modify: `src/components/HistoryView.tsx:599` (fullscreen modal overlay, B3)

- [ ] **Step 1: Empty-state floating bubbles — solid**
```tsx
// OLD (src/components/HistoryView.tsx:261)
                    <div className="absolute top-0 right-10 w-7 h-7 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-md">

// NEW
                    <div className="absolute top-0 right-10 w-7 h-7 rounded-full bg-white/20 border border-white/10 flex items-center justify-center shadow-md">
```
```tsx
// OLD (src/components/HistoryView.tsx:265)
                    <div className="absolute bottom-2 left-6 w-8 h-8 rounded-full bg-[#3F0F3F]/80 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-md">

// NEW
                    <div className="absolute bottom-2 left-6 w-8 h-8 rounded-full bg-[#3F0F3F] border border-white/10 flex items-center justify-center shadow-md">
```
```tsx
// OLD (src/components/HistoryView.tsx:269)
                    <div className="absolute bottom-0 right-12 w-8 h-8 rounded-full bg-[#EA4335]/80 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-md">

// NEW
                    <div className="absolute bottom-0 right-12 w-8 h-8 rounded-full bg-[#EA4335] border border-white/10 flex items-center justify-center shadow-md">
```
```tsx
// OLD (src/components/HistoryView.tsx:273)
                    <div className="absolute top-6 left-20 w-8 h-8 rounded-full bg-[#0077B5]/80 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-md">

// NEW
                    <div className="absolute top-6 left-20 w-8 h-8 rounded-full bg-[#0077B5] border border-white/10 flex items-center justify-center shadow-md">
```
(These decorative bubbles sit over a dark promo-banner background, not a live page, so raising opacity to fully-opaque brand colors preserves the look without blur compositing; the first `bg-white/10` bubble is bumped to `/20` to stay visible as a flat translucent-white chip instead of relying on blur to read as glass.)

- [ ] **Step 2: Loading/empty stat cards — solid**
```tsx
// OLD (src/components/HistoryView.tsx:416)
              <div className="rounded-2xl border border-border bg-card/50 dark:bg-card/60 backdrop-blur-sm shadow-sm">

// NEW
              <div className="rounded-2xl border border-border bg-surface-1 dark:bg-surface-2 shadow-sm">
```
```tsx
// OLD (src/components/HistoryView.tsx:423)
              <div className="rounded-2xl border border-border bg-card/50 dark:bg-card/60 backdrop-blur-sm shadow-sm">

// NEW
              <div className="rounded-2xl border border-border bg-surface-1 dark:bg-surface-2 shadow-sm">
```

- [ ] **Step 3: Fullscreen transcript-detail overlay — keep dim, drop blur (B3)**
```tsx
// OLD (src/components/HistoryView.tsx:599)
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">

// NEW
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4">
```
(Bumped opacity from `/80` to `/90` since the blur is no longer softening the boundary between overlay and content behind it.)

- [ ] **Step 4: Verify**
Open History tab with empty history (or a fresh profile) to see the empty-state bubbles and empty stat cards — confirm opaque. Click a transcript row to open the fullscreen detail overlay — confirm the dim background has no blur but still reads as a scrim.

- [ ] **Step 5: Commit**
```bash
git add src/components/HistoryView.tsx
git commit -m "style(history): solid empty-state bubbles/stat cards, drop overlay blur"
```

---

### Task 14: `src/components/OnboardingFlow.tsx` — header, sticky header, step card, sticky footer (B2)

**Files:**
- Modify: `src/components/OnboardingFlow.tsx:1034,1047,1059,1079`

- [ ] **Step 1: TitleBar className — solid**
```tsx
// OLD (src/components/OnboardingFlow.tsx:1034)
                className="bg-background backdrop-blur-xl border-b border-border shadow-sm"

// NEW
                className="bg-background border-b border-border shadow-sm"
```

- [ ] **Step 2: Sticky progress header — solid**
```tsx
// OLD (src/components/OnboardingFlow.tsx:1047)
            <div className="shrink-0 bg-background/80 backdrop-blur-2xl border-b border-white/5 px-6 md:px-12 py-3 z-10">

// NEW
            <div className="shrink-0 bg-background border-b border-white/5 px-6 md:px-12 py-3 z-10">
```

- [ ] **Step 3: Step content card — solid**
```tsx
// OLD (src/components/OnboardingFlow.tsx:1059)
              <Card className="bg-card/90 backdrop-blur-2xl border border-border/50 dark:border-white/5 shadow-lg rounded-2xl overflow-hidden">

// NEW
              <Card className="bg-card border border-border/50 dark:border-white/5 shadow-lg rounded-2xl overflow-hidden">
```

- [ ] **Step 4: Sticky footer nav — solid**
```tsx
// OLD (src/components/OnboardingFlow.tsx:1079)
            <div className="shrink-0 bg-background/80 backdrop-blur-2xl border-t border-white/5 px-6 md:px-12 py-3 z-10">

// NEW
            <div className="shrink-0 bg-background border-t border-white/5 px-6 md:px-12 py-3 z-10">
```

- [ ] **Step 5: Verify**
Run onboarding flow (reset `onboardingCompleted` in localStorage or use a fresh profile). Confirm header/footer bars and the central step card are opaque with no blur throughout the multi-step flow, in both themes.

- [ ] **Step 6: Commit**
```bash
git add src/components/OnboardingFlow.tsx
git commit -m "style(onboarding): solid header/footer bars and step card, drop blur"
```

---

### Task 15: `src/components/InsightsView.tsx` — 6 stat/chart tiles (B2)

**Files:**
- Modify: `src/components/InsightsView.tsx:43,61,75,93,113,148`

- [ ] **Step 1: Replace `bg-card/50 backdrop-blur-sm` with solid surface at all 6 sites**
All six occurrences share the identical fragment `bg-card/50 backdrop-blur-sm`; apply this same substitution at each of the 6 lines below (their surrounding classes differ but this fragment is byte-identical at each site):
```tsx
// OLD (occurs verbatim at InsightsView.tsx:43, 61, 75, 93, 113, 148)
bg-card/50 backdrop-blur-sm

// NEW
bg-surface-1 dark:bg-surface-2
```
Concretely:
```tsx
// Line 43 OLD
            <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 flex flex-col items-center gap-1 shadow-sm transition-all hover:bg-card/80">
// Line 43 NEW
            <div className="rounded-xl border border-border/50 bg-surface-1 dark:bg-surface-2 p-4 flex flex-col items-center gap-1 shadow-sm transition-all hover:bg-surface-2 dark:hover:bg-surface-3">

// Line 61 OLD
            <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 flex flex-col gap-1.5 justify-center shadow-sm transition-all hover:bg-card/80">
// Line 61 NEW
            <div className="rounded-xl border border-border/50 bg-surface-1 dark:bg-surface-2 p-4 flex flex-col gap-1.5 justify-center shadow-sm transition-all hover:bg-surface-2 dark:hover:bg-surface-3">

// Line 75 OLD
            <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 flex flex-col gap-1.5 justify-center shadow-sm transition-all hover:bg-card/80">
// Line 75 NEW
            <div className="rounded-xl border border-border/50 bg-surface-1 dark:bg-surface-2 p-4 flex flex-col gap-1.5 justify-center shadow-sm transition-all hover:bg-surface-2 dark:hover:bg-surface-3">

// Line 93 OLD
            <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 shadow-sm">
// Line 93 NEW
            <div className="rounded-xl border border-border/50 bg-surface-1 dark:bg-surface-2 p-4 shadow-sm">

// Line 113 OLD
              <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 shadow-sm">
// Line 113 NEW
              <div className="rounded-xl border border-border/50 bg-surface-1 dark:bg-surface-2 p-4 shadow-sm">

// Line 148 OLD
            <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 shadow-sm h-64 mt-4">
// Line 148 NEW
            <div className="rounded-xl border border-border/50 bg-surface-1 dark:bg-surface-2 p-4 shadow-sm h-64 mt-4">
```

- [ ] **Step 2: Verify**
Open Settings → Insights (Usage tab). Confirm the WPM gauge tile, fixes-made tile, total-words tile, streak heatmap tile, desktop-usage tile, and daily-words chart tile are all opaque with hover states intact.

- [ ] **Step 3: Commit**
```bash
git add src/components/InsightsView.tsx
git commit -m "style(insights): solid backgrounds for all 6 stat/chart tiles, drop blur"
```

---

### Task 16: `src/components/MeetingNotificationCard.tsx` + `src/components/UpdateNotificationOverlay.tsx` (B2)

**Files:**
- Modify: `src/components/MeetingNotificationCard.tsx:37`
- Modify: `src/components/UpdateNotificationOverlay.tsx:67`

- [ ] **Step 1: MeetingNotificationCard**
```tsx
// OLD (src/components/MeetingNotificationCard.tsx:37)
        "bg-card/95 dark:bg-surface-2/95 backdrop-blur-xl",

// NEW
        "bg-card dark:bg-surface-2",
```

- [ ] **Step 2: UpdateNotificationOverlay**
```tsx
// OLD (src/components/UpdateNotificationOverlay.tsx:67)
          "bg-card/95 dark:bg-surface-2/95 backdrop-blur-xl",

// NEW
          "bg-card dark:bg-surface-2",
```

- [ ] **Step 3: Verify**
Trigger a meeting-detected notification (or run `window.electronAPI` test hook if available) and an app-update notification. Both are small floating windows over the desktop — confirm each renders fully opaque, not see-through to the desktop behind it.

- [ ] **Step 4: Commit**
```bash
git add src/components/MeetingNotificationCard.tsx src/components/UpdateNotificationOverlay.tsx
git commit -m "style(notifications): solid backgrounds for meeting/update notification cards"
```

---

### Task 17: `src/components/StyleView.tsx` — icon-grid tile + swatch highlight (B2)

**Files:**
- Modify: `src/components/StyleView.tsx:157,238`

- [ ] **Step 1: App-icon grid tile**
```tsx
// OLD (src/components/StyleView.tsx:157)
                  <div key={app.name} className="group relative w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md shadow-sm border border-white/10 transition-transform hover:scale-110 hover:bg-white/20 cursor-default">

// NEW
                  <div key={app.name} className="group relative w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shadow-sm border border-white/10 transition-transform hover:scale-110 hover:bg-white/30 cursor-default">
```
(Sits over the purple `PromoBanner` gradient, not a live page — bumped `/10`→`/20` and hover `/20`→`/30` to stay legible without blur.)

- [ ] **Step 2: Selected swatch highlight**
```tsx
// OLD (src/components/StyleView.tsx:236-239)
                    <div className={cn(
                      "relative z-10 rounded-2xl p-5 w-full min-h-[140px] flex flex-col justify-end transition-all duration-500 border flex-shrink-0 mt-auto overflow-hidden",
                      selected ? cn("bg-background/90 shadow-sm backdrop-blur-md", styleDef.borderClass) : "bg-muted/30 border-transparent group-hover:bg-muted/50"
                    )}>

// NEW
                    <div className={cn(
                      "relative z-10 rounded-2xl p-5 w-full min-h-[140px] flex flex-col justify-end transition-all duration-500 border flex-shrink-0 mt-auto overflow-hidden",
                      selected ? cn("bg-background shadow-sm", styleDef.borderClass) : "bg-muted/30 border-transparent group-hover:bg-muted/50"
                    )}>
```

- [ ] **Step 3: Verify**
Open Settings → Style. Confirm the app-icon row (Notion/Slack/etc.) tiles are opaque, and selecting a style preset shows an opaque example-quote panel (no blur) while unselected presets keep their existing translucent `bg-muted/30`.

- [ ] **Step 4: Commit**
```bash
git add src/components/StyleView.tsx
git commit -m "style(style-view): solid icon-grid tiles and selected swatch panel, drop blur"
```

---

### Task 18: `src/components/SnippetsView.tsx` — search input + list row (B2)

**Files:**
- Modify: `src/components/SnippetsView.tsx:251,341`

- [ ] **Step 1: Search input**
```tsx
// OLD (src/components/SnippetsView.tsx:251)
          className="w-full h-9 text-[13px] pr-20 bg-card/50 backdrop-blur-sm border-border/50 focus-visible:ring-primary/20 transition-all placeholder:text-foreground/30 font-medium shadow-sm"

// NEW
          className="w-full h-9 text-[13px] pr-20 bg-surface-1 border-border/50 focus-visible:ring-primary/20 transition-all placeholder:text-foreground/30 font-medium shadow-sm"
```

- [ ] **Step 2: Snippet list row**
```tsx
// OLD (src/components/SnippetsView.tsx:341)
                className="group flex items-center gap-3 p-2.5 rounded-lg border border-border/40 bg-card/40 backdrop-blur-sm shadow-sm hover:bg-card/70 hover:border-primary/20 transition-all"

// NEW
                className="group flex items-center gap-3 p-2.5 rounded-lg border border-border/40 bg-surface-1 shadow-sm hover:bg-surface-2 hover:border-primary/20 transition-all"
```

- [ ] **Step 3: Verify**
Open Settings → Snippets. Confirm the search input and each snippet row render opaque, hover state on rows still visible.

- [ ] **Step 4: Commit**
```bash
git add src/components/SnippetsView.tsx
git commit -m "style(snippets): solid search input and list rows, drop blur"
```

---

### Task 19: `src/components/SettingsPage.tsx` — section container + 3 action-button `<select>`s (B2)

**Files:**
- Modify: `src/components/SettingsPage.tsx:146,1958,2828,2990`

- [ ] **Step 1: Section container**
```tsx
// OLD (src/components/SettingsPage.tsx:146)
      className={`rounded-lg border border-border/50 dark:border-border-subtle/70 bg-card/50 dark:bg-surface-2/50 backdrop-blur-sm divide-y divide-border/30 dark:divide-border-subtle/50 ${className}`}

// NEW
      className={`rounded-lg border border-border/50 dark:border-border-subtle/70 bg-surface-1 dark:bg-surface-2 divide-y divide-border/30 dark:divide-border-subtle/50 ${className}`}
```

- [ ] **Step 2: Panel-start-position `<select>` (line 1958)**
```tsx
// OLD (src/components/SettingsPage.tsx:1958)
                      className="h-7 rounded border border-border/70 bg-surface-1/80 px-2.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm hover:border-border-hover hover:bg-surface-2/70 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-1 transition-colors duration-200"

// NEW
                      className="h-7 rounded border border-border/70 bg-surface-1 px-2.5 text-xs font-medium text-foreground shadow-sm hover:border-border-hover hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-1 transition-colors duration-200"
```

- [ ] **Step 3: Personalized-styles context `<select>` (line 2828)**
```tsx
// OLD (src/components/SettingsPage.tsx:2828)
                        className="h-7 rounded border border-border/70 bg-surface-1/80 px-2.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm hover:border-border-hover hover:bg-surface-2/70 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-1 transition-colors duration-200"

// NEW
                        className="h-7 rounded border border-border/70 bg-surface-1 px-2.5 text-xs font-medium text-foreground shadow-sm hover:border-border-hover hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-1 transition-colors duration-200"
```

- [ ] **Step 4: Audio-retention-days `<select>` (line 2990)**
```tsx
// OLD (src/components/SettingsPage.tsx:2990)
                      className="h-7 rounded border border-border/70 bg-surface-1/80 px-2.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm hover:border-border-hover hover:bg-surface-2/70 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-1 transition-colors duration-200"

// NEW
                      className="h-7 rounded border border-border/70 bg-surface-1 px-2.5 text-xs font-medium text-foreground shadow-sm hover:border-border-hover hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-1 transition-colors duration-200"
```

- [ ] **Step 5: Verify**
Open Settings. Confirm any `SettingsSection`-style container (search "bg-surface-1 dark:bg-surface-2 divide-y" usage in the rendered page) is opaque. Locate the "Floating icon position" select (General), "Personalized styles" per-context selects (General), and "Audio retention" select (Privacy) — confirm each is a solid opaque control with no blur.

- [ ] **Step 6: Commit**
```bash
git add src/components/SettingsPage.tsx
git commit -m "style(settings-page): solid section container and 3 select controls, drop blur"
```

---

### Task 20: `src/components/notes/ActionProcessingOverlay.tsx` — full dim (B3) + status pill (B2)

**Files:**
- Modify: `src/components/notes/ActionProcessingOverlay.tsx:42,76`

- [ ] **Step 1: Full-screen dim — keep solid dim, drop blur (B3)**
```tsx
// OLD (src/components/notes/ActionProcessingOverlay.tsx:39-46)
    <div
      className={cn(
        "absolute inset-0 z-[5] flex items-center justify-center",
        "bg-background/60 dark:bg-background/70 backdrop-blur-md",
        "transition-opacity duration-300",
        isFadingOut && "opacity-0 pointer-events-none"
      )}
      style={!isFadingOut ? { animation: "float-up 0.25s ease-out" } : undefined}
    >

// NEW
    <div
      className={cn(
        "absolute inset-0 z-[5] flex items-center justify-center",
        "bg-background/85 dark:bg-background/90",
        "transition-opacity duration-300",
        isFadingOut && "opacity-0 pointer-events-none"
      )}
      style={!isFadingOut ? { animation: "float-up 0.25s ease-out" } : undefined}
    >
```
(Bumped `/60`→`/85` and `/70`→`/90` since blur previously did most of the "obscure the content behind" work — a solid dim needs higher opacity to read the same way.)

- [ ] **Step 2: Status pill — solid (B2)**
```tsx
// OLD (src/components/notes/ActionProcessingOverlay.tsx:70-78)
      <div
        className={cn(
          "relative flex flex-col items-center gap-2.5",
          isSuccess
            ? "bg-success/6 dark:bg-success/8 border-success/12 dark:border-success/15"
            : "bg-accent/6 dark:bg-accent/8 border-accent/12 dark:border-accent/15",
          "backdrop-blur-xl border rounded-xl px-6 py-3 shadow-elevated",
          "transition-colors duration-300"
        )}
      >

// NEW
      <div
        className={cn(
          "relative flex flex-col items-center gap-2.5",
          isSuccess
            ? "bg-surface-2 border-success/25 dark:border-success/30"
            : "bg-surface-2 border-accent/25 dark:border-accent/30",
          "border rounded-xl px-6 py-3 shadow-elevated",
          "transition-colors duration-300"
        )}
      >
```
(Original tinted-glass fill was extremely subtle (`/6`–`/8`) and relied on blur to look tangible against content behind it; now that the parent dim is solid and opaque enough to fully obscure content, the pill itself needs a genuinely solid surface — `bg-surface-2` with a slightly stronger tinted border to keep the success/accent signal.)

- [ ] **Step 3: Verify**
Trigger a notes action (e.g. AI cleanup on a note) to show the processing overlay. Confirm the full-screen dim has no blur but still obscures the note content, and the status pill (with "Done"/processing label) is opaque.

- [ ] **Step 4: Commit**
```bash
git add src/components/notes/ActionProcessingOverlay.tsx
git commit -m "style(action-overlay): solid full-screen dim and status pill, drop blur"
```

---

### Task 21: `src/components/TranscriptionModelPicker.tsx` — segmented tab bar (B2)

**Files:**
- Modify: `src/components/TranscriptionModelPicker.tsx:301`

- [ ] **Step 1: Solid segmented control track**
```tsx
// OLD (src/components/TranscriptionModelPicker.tsx:301)
    <div className="relative flex p-0.5 rounded-lg bg-surface-1/80 backdrop-blur-xl dark:bg-surface-1 border border-border/60 dark:border-white/8 shadow-(--shadow-metallic-light) dark:shadow-(--shadow-metallic-dark)">

// NEW
    <div className="relative flex p-0.5 rounded-lg bg-surface-1 dark:bg-surface-1 border border-border/60 dark:border-white/8 shadow-(--shadow-metallic-light) dark:shadow-(--shadow-metallic-dark)">
```

- [ ] **Step 2: Verify**
Open Settings → Transcription. Confirm the Local/Cloud segmented tab toggle track renders opaque, with the sliding selected-tab pill still visible.

- [ ] **Step 3: Commit**
```bash
git add src/components/TranscriptionModelPicker.tsx
git commit -m "style(transcription-model-picker): solid segmented tab bar, drop blur"
```

---

### Task 22: `src/components/notes/EmbeddedChat.tsx` — floating chat panel (B2)

**Files:**
- Modify: `src/components/notes/EmbeddedChat.tsx:206-212`

- [ ] **Step 1: Solid floating chat container**
```tsx
// OLD (src/components/notes/EmbeddedChat.tsx:202-212)
        className={cn(
          "absolute bottom-4 left-5 right-5 z-20",
          "max-h-[calc(100%-2rem)] min-h-50",
          "flex flex-col",
          "bg-background/95 dark:bg-surface-2/95",
          "border border-border/20 dark:border-white/8",
          "rounded-xl",
          "shadow-elevated",
          "backdrop-blur-2xl",
          "animate-[scale-in_200ms_ease-out]"
        )}

// NEW
        className={cn(
          "absolute bottom-4 left-5 right-5 z-20",
          "max-h-[calc(100%-2rem)] min-h-50",
          "flex flex-col",
          "bg-background dark:bg-surface-2",
          "border border-border/20 dark:border-white/8",
          "rounded-xl",
          "shadow-elevated",
          "animate-[scale-in_200ms_ease-out]"
        )}
```

- [ ] **Step 2: Verify**
Open a note's embedded chat (floating mode). Confirm the chat panel is opaque, not translucent over the note content behind it.

- [ ] **Step 3: Commit**
```bash
git add src/components/notes/EmbeddedChat.tsx
git commit -m "style(embedded-chat): solid floating chat panel, drop blur"
```

---

### Task 23: `src/components/notes/DictationWidget.tsx` — 3 recording/processing/idle states (B2)

**Files:**
- Modify: `src/components/notes/DictationWidget.tsx:44-51,101-108,118-129`

- [ ] **Step 1: Recording state pill**
```tsx
// OLD (src/components/notes/DictationWidget.tsx:44-51)
        <div
          className={cn(
            "flex items-center gap-4 h-12 px-5 rounded-xl pointer-events-auto",
            "bg-primary/6 dark:bg-primary/10",
            "backdrop-blur-xl",
            "border border-primary/20 dark:border-primary/25",
            "shadow-elevated"
          )}

// NEW
        <div
          className={cn(
            "flex items-center gap-4 h-12 px-5 rounded-xl pointer-events-auto",
            "bg-surface-2",
            "border border-primary/20 dark:border-primary/25",
            "shadow-elevated"
          )}
```

- [ ] **Step 2: Processing state pill**
```tsx
// OLD (src/components/notes/DictationWidget.tsx:101-108)
        <div
          className={cn(
            "flex items-center gap-3 h-12 px-5 rounded-xl pointer-events-auto",
            "bg-primary/6 dark:bg-primary/10",
            "backdrop-blur-xl",
            "border border-primary/15 dark:border-primary/20",
            "shadow-elevated"
          )}

// NEW
        <div
          className={cn(
            "flex items-center gap-3 h-12 px-5 rounded-xl pointer-events-auto",
            "bg-surface-2",
            "border border-primary/15 dark:border-primary/20",
            "shadow-elevated"
          )}
```

- [ ] **Step 3: Idle start button**
```tsx
// OLD (src/components/notes/DictationWidget.tsx:119-129)
            className={cn(
              "flex items-center justify-center w-11 h-11 rounded-full",
              "bg-primary/8 dark:bg-primary/12",
              "backdrop-blur-xl",
              "border border-primary/15 dark:border-primary/20",
              "shadow-sm hover:shadow-md",
              "text-primary/60 hover:text-primary",
              "transition-all duration-200",
              "hover:bg-primary/14 dark:hover:bg-primary/20",
              "hover:scale-105",
              "active:scale-[0.97]"

// NEW
            className={cn(
              "flex items-center justify-center w-11 h-11 rounded-full",
              "bg-surface-2",
              "border border-primary/15 dark:border-primary/20",
              "shadow-sm hover:shadow-md",
              "text-primary/60 hover:text-primary",
              "transition-all duration-200",
              "hover:bg-surface-3",
              "hover:scale-105",
              "active:scale-[0.97]"
```

- [ ] **Step 4: Verify**
Open a note's dictation widget. Trigger each of the 3 states (idle → start → recording → stop → processing). Confirm each pill/button renders opaque throughout.

- [ ] **Step 5: Commit**
```bash
git add src/components/notes/DictationWidget.tsx
git commit -m "style(dictation-widget): solid backgrounds for idle/recording/processing states"
```

---

### Task 24: `src/components/notes/MeetingTranscriptChat.tsx` — 2 chips (B2)

**Files:**
- Modify: `src/components/notes/MeetingTranscriptChat.tsx:527,688`

- [ ] **Step 1: Speaker-assignment chip**
```tsx
// OLD (src/components/notes/MeetingTranscriptChat.tsx:527)
      className="flex items-center gap-3 rounded-md border border-border/40 bg-surface-2/95 backdrop-blur px-3 py-1.5 text-xs shadow-lg"

// NEW
      className="flex items-center gap-3 rounded-md border border-border/40 bg-surface-2 px-3 py-1.5 text-xs shadow-lg"
```

- [ ] **Step 2: Diarizing/hint chip**
```tsx
// OLD (src/components/notes/MeetingTranscriptChat.tsx:688)
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-2.5 py-1 rounded-md border border-border bg-background/95 backdrop-blur shadow-sm text-xs text-foreground">

// NEW
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-2.5 py-1 rounded-md border border-border bg-background shadow-sm text-xs text-foreground">
```

- [ ] **Step 3: Verify**
Open a meeting transcript with multiple speakers, select transcript text to trigger the speaker-assignment chip, and start a meeting recording to see the diarizing hint chip. Confirm both are opaque.

- [ ] **Step 4: Commit**
```bash
git add src/components/notes/MeetingTranscriptChat.tsx
git commit -m "style(meeting-transcript-chat): solid speaker-assignment and diarizing chips"
```

---

### Task 25: `src/components/notes/UploadAudioView.tsx` — drop-zone x2 + error panel (B2)

**Files:**
- Modify: `src/components/notes/UploadAudioView.tsx:686,756,1040`

- [ ] **Step 1: Idle drop-zone**
```tsx
// OLD (src/components/notes/UploadAudioView.tsx:684-691)
        className={cn(
          "relative rounded-lg p-8 text-center cursor-pointer transition-[background-color,border-color,transform] duration-300 group",
          "bg-surface-1/40 dark:bg-white/[0.03] backdrop-blur-sm",
          "border border-foreground/6 dark:border-white/6",
          "hover:bg-surface-1/60 dark:hover:bg-white/[0.05] hover:border-foreground/12 dark:hover:border-white/10",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30",
          isDragOver && "border-primary/30 bg-primary/[0.04] dark:bg-primary/[0.06] scale-[1.01]"
        )}

// NEW
        className={cn(
          "relative rounded-lg p-8 text-center cursor-pointer transition-[background-color,border-color,transform] duration-300 group",
          "bg-surface-1 dark:bg-surface-2",
          "border border-foreground/6 dark:border-white/6",
          "hover:bg-surface-2 dark:hover:bg-surface-3 hover:border-foreground/12 dark:hover:border-white/10",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30",
          isDragOver && "border-primary/30 bg-primary/[0.04] dark:bg-primary/[0.06] scale-[1.01]"
        )}
```

- [ ] **Step 2: Selected-file panel (second drop-zone-adjacent site)**
```tsx
// OLD (src/components/notes/UploadAudioView.tsx:756)
      <div className="rounded-lg border border-foreground/8 dark:border-white/6 bg-surface-1/40 dark:bg-white/[0.03] backdrop-blur-sm p-4 mb-3">

// NEW
      <div className="rounded-lg border border-foreground/8 dark:border-white/6 bg-surface-1 dark:bg-surface-2 p-4 mb-3">
```

- [ ] **Step 3: Error panel**
```tsx
// OLD (src/components/notes/UploadAudioView.tsx:1040)
      <div className="rounded-lg border border-destructive/15 dark:border-destructive/20 bg-destructive/[0.03] dark:bg-destructive/[0.05] backdrop-blur-sm p-4 mb-4">

// NEW
      <div className="rounded-lg border border-destructive/15 dark:border-destructive/20 bg-destructive/[0.06] dark:bg-destructive/[0.1] p-4 mb-4">
```
(Bumped destructive tint from `/[0.03]`/`/[0.05]` to `/[0.06]`/`/[0.1]` since blur previously supplied visual weight; kept it a tint rather than `bg-surface-N` since it's semantically an inline error state, matching the pattern used elsewhere for destructive banners like `HistoryView.tsx:408`.)

- [ ] **Step 4: Verify**
Open Notes → Upload Audio. Confirm idle drop-zone is opaque, drag a file over it to see the drag state, select a file to see the selected-file panel, and trigger an upload error (e.g. oversized file) to see the error panel — all opaque.

- [ ] **Step 5: Commit**
```bash
git add src/components/notes/UploadAudioView.tsx
git commit -m "style(upload-audio): solid drop-zone, selected-file, and error panels"
```

---

### Task 26: `src/components/notes/MeetingRecordingPill.tsx` + `src/components/notes/RealtimeTranscriptionBanner.tsx` (B2)

**Files:**
- Modify: `src/components/notes/MeetingRecordingPill.tsx:78-86`
- Modify: `src/components/notes/RealtimeTranscriptionBanner.tsx:25-33`

- [ ] **Step 1: MeetingRecordingPill**
```tsx
// OLD (src/components/notes/MeetingRecordingPill.tsx:78-86)
      <div
        className={cn(
          "flex items-center gap-2 h-9 px-3 rounded-xl",
          "bg-card/95 dark:bg-surface-2/95",
          "backdrop-blur-xl",
          "border border-primary/25 dark:border-primary/30",
          "shadow-elevated"
        )}
      >

// NEW
      <div
        className={cn(
          "flex items-center gap-2 h-9 px-3 rounded-xl",
          "bg-card dark:bg-surface-2",
          "border border-primary/25 dark:border-primary/30",
          "shadow-elevated"
        )}
      >
```

- [ ] **Step 2: RealtimeTranscriptionBanner**
```tsx
// OLD (src/components/notes/RealtimeTranscriptionBanner.tsx:26-32)
      className={cn(
        "flex items-center gap-2 px-3 h-8 shrink-0",
        "backdrop-blur-xl bg-primary/[0.03] dark:bg-primary/[0.06]",
        "border-b border-primary/10 dark:border-primary/15",
        "animate-in slide-in-from-top-2 duration-300"
      )}

// NEW
      className={cn(
        "flex items-center gap-2 px-3 h-8 shrink-0",
        "bg-primary/[0.06] dark:bg-primary/[0.1]",
        "border-b border-primary/10 dark:border-primary/15",
        "animate-in slide-in-from-top-2 duration-300"
      )}
```
(Bumped tint from `/[0.03]`/`/[0.06]` to `/[0.06]`/`/[0.1]` since it's a thin banner strip that previously relied on blur; this keeps it visually distinguishable as an inline promo strip rather than converting it to a hard `bg-surface-N`.)

- [ ] **Step 3: Verify**
Return to a note while a meeting recording is active (elsewhere) to see the "return to recording" pill; open the notes real-time transcription upsell banner. Confirm both are opaque.

- [ ] **Step 4: Commit**
```bash
git add src/components/notes/MeetingRecordingPill.tsx src/components/notes/RealtimeTranscriptionBanner.tsx
git commit -m "style(notes): solid meeting-recording pill and realtime-transcription banner"
```

---

### Task 27: `src/utils/modelPickerStyles.ts` — dropdown panel, both color variants (B2)

**Files:**
- Modify: `src/utils/modelPickerStyles.ts:14,40`

- [ ] **Step 1: `purple` variant container**
```ts
// OLD (src/utils/modelPickerStyles.ts:12-14)
  purple: {
    container:
      "bg-surface-1/95 dark:bg-white/[0.03] rounded-lg overflow-hidden border border-border/60 dark:border-white/8 backdrop-blur-xl shadow-(--shadow-metallic-light) dark:shadow-(--shadow-metallic-dark)",

// NEW
  purple: {
    container:
      "bg-surface-1 dark:bg-surface-2 rounded-lg overflow-hidden border border-border/60 dark:border-white/8 shadow-(--shadow-metallic-light) dark:shadow-(--shadow-metallic-dark)",
```

- [ ] **Step 2: `blue` variant container**
```ts
// OLD (src/utils/modelPickerStyles.ts:38-40)
  blue: {
    container:
      "bg-surface-1/95 dark:bg-white/[0.03] rounded-lg overflow-hidden border border-border/60 dark:border-white/8 backdrop-blur-xl shadow-(--shadow-metallic-light) dark:shadow-(--shadow-metallic-dark)",

// NEW
  blue: {
    container:
      "bg-surface-1 dark:bg-surface-2 rounded-lg overflow-hidden border border-border/60 dark:border-white/8 shadow-(--shadow-metallic-light) dark:shadow-(--shadow-metallic-dark)",
```

- [ ] **Step 3: Verify**
Find both consumers of `getModelPickerStyles` (grep `getModelPickerStyles(` under `src/components/`) and open each model picker dropdown in both color-scheme contexts. Confirm the dropdown panel is opaque.

- [ ] **Step 4: Commit**
```bash
git add src/utils/modelPickerStyles.ts
git commit -m "style(model-picker-styles): solid dropdown container for both color variants"
```

---

### Task 28: `src/components/ui/LanguageSelector.tsx` — trigger + dropdown (B2)

**Files:**
- Modify: `src/components/ui/LanguageSelector.tsx:158-170,199`

- [ ] **Step 1: Trigger button — remove blur, keep existing conditional bg classes**
```tsx
// OLD (src/components/ui/LanguageSelector.tsx:158-170)
        className={`
          group relative w-full flex items-center justify-between gap-2
          h-7 px-2.5 text-left
          rounded text-xs font-medium
          border shadow-sm backdrop-blur-sm
          transition-[background-color,border-color,transform] duration-200 ease-out
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1
          ${
            isOpen
              ? "border-border-active bg-surface-2/90 shadow ring-1 ring-primary/20"
              : "border-border/70 bg-surface-1/80 hover:border-border-hover hover:bg-surface-2/70 hover:shadow active:scale-[0.985]"
          }
        `}

// NEW
        className={`
          group relative w-full flex items-center justify-between gap-2
          h-7 px-2.5 text-left
          rounded text-xs font-medium
          border shadow-sm
          transition-[background-color,border-color,transform] duration-200 ease-out
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1
          ${
            isOpen
              ? "border-border-active bg-surface-2 shadow ring-1 ring-primary/20"
              : "border-border/70 bg-surface-1 hover:border-border-hover hover:bg-surface-2 hover:shadow active:scale-[0.985]"
          }
        `}
```

- [ ] **Step 2: Dropdown panel — solid**
```tsx
// OLD (src/components/ui/LanguageSelector.tsx:199)
            className="z-9999 bg-popover/95 backdrop-blur-xl border border-border/70 rounded shadow-xl overflow-hidden"

// NEW
            className="z-9999 bg-popover border border-border/70 rounded shadow-xl overflow-hidden"
```

- [ ] **Step 3: Verify**
Open any `LanguageSelector` instance (e.g. Settings → Transcription language). Confirm trigger and open dropdown are both opaque.

- [ ] **Step 4: Commit**
```bash
git add src/components/ui/LanguageSelector.tsx
git commit -m "style(language-selector): solid trigger and dropdown panel, drop blur"
```

---

### Task 29: `src/components/ui/button.tsx` — `outline` + `social` variants (B2)

**Files:**
- Modify: `src/components/ui/button.tsx:53,112`

- [ ] **Step 1: `outline` variant**
```tsx
// OLD (src/components/ui/button.tsx:50-60)
        // Outline — refined with subtle glassmorphism
        outline: [
          "relative font-medium",
          "text-foreground bg-muted/70 backdrop-blur-sm",
          "border border-border/70",
          "shadow-sm",
          "hover:bg-muted hover:border-border-hover",
          "active:scale-[0.985]",
          "dark:bg-surface-raised/90 dark:border-border-hover dark:hover:bg-surface-raised",
          "transition-[background-color,border-color,color,transform] duration-200 ease-out",
        ].join(" "),

// NEW
        // Outline
        outline: [
          "relative font-medium",
          "text-foreground bg-muted",
          "border border-border/70",
          "shadow-sm",
          "hover:bg-muted hover:border-border-hover",
          "active:scale-[0.985]",
          "dark:bg-surface-raised dark:border-border-hover dark:hover:bg-surface-raised",
          "transition-[background-color,border-color,color,transform] duration-200 ease-out",
        ].join(" "),
```

- [ ] **Step 2: `social` variant**
```tsx
// OLD (src/components/ui/button.tsx:109-119)
        // Social button for auth flows - ultra-premium glassmorphism
        social: [
          "relative font-medium",
          "text-foreground bg-surface-1/80 backdrop-blur-xl",
          "border border-border/60",
          "shadow-sm gap-2",
          "hover:bg-surface-2/90 hover:border-border-hover hover:shadow",
          "active:scale-[0.985] active:shadow-sm",
          "dark:bg-surface-raised/80 dark:border-border-hover dark:hover:bg-surface-raised/95",
          "transition-[background-color,border-color,color,transform] duration-200 ease-out",
        ].join(" "),

// NEW
        // Social button for auth flows
        social: [
          "relative font-medium",
          "text-foreground bg-surface-1",
          "border border-border/60",
          "shadow-sm gap-2",
          "hover:bg-surface-2 hover:border-border-hover hover:shadow",
          "active:scale-[0.985] active:shadow-sm",
          "dark:bg-surface-raised dark:border-border-hover dark:hover:bg-surface-raised",
          "transition-[background-color,border-color,color,transform] duration-200 ease-out",
        ].join(" "),
```

- [ ] **Step 3: Verify**
Since `Button` is used pervasively, spot-check: any `variant="outline"` button (e.g. Cancel button in a `ConfirmDialog`) and any `variant="social"` button (auth/sign-in screen, if present). Confirm both render opaque in both themes.

- [ ] **Step 4: Commit**
```bash
git add src/components/ui/button.tsx
git commit -m "style(button): solid outline/social variants, drop blur"
```

---

### Task 30: `src/components/ui/SettingsSection.tsx` (B2)

**Files:**
- Modify: `src/components/ui/SettingsSection.tsx:117`

- [ ] **Step 1: Solid section wrapper**
```tsx
// OLD (src/components/ui/SettingsSection.tsx:117)
    <div className={`rounded-xl border border-border/50 dark:border-border-subtle/70 bg-card/50 dark:bg-surface-2/50 backdrop-blur-sm transition-all duration-200 hover:bg-foreground/5 dark:hover:bg-white/5 hover:border-border/80 dark:hover:border-white/10 ${isCompact ? "px-3 py-2.5" : "px-4 py-3"} ${className}`}>

// NEW
    <div className={`rounded-xl border border-border/50 dark:border-border-subtle/70 bg-surface-1 dark:bg-surface-2 transition-all duration-200 hover:bg-surface-2 dark:hover:bg-surface-3 hover:border-border/80 dark:hover:border-white/10 ${isCompact ? "px-3 py-2.5" : "px-4 py-3"} ${className}`}>
```

- [ ] **Step 2: Verify**
Open any settings section that uses `SettingsSection` (most rows in Settings). Confirm opaque background and hover state.

- [ ] **Step 3: Commit**
```bash
git add src/components/ui/SettingsSection.tsx
git commit -m "style(settings-section): solid section background, drop blur"
```

---

### Task 31: `src/components/ui/TranscriptDetailView.tsx` — header bar (B2)

**Files:**
- Modify: `src/components/ui/TranscriptDetailView.tsx:118`

- [ ] **Step 1: Solid header bar**
```tsx
// OLD (src/components/ui/TranscriptDetailView.tsx:118)
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/5 bg-black/5 dark:bg-white-[0.02] backdrop-blur-md">

// NEW
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/5 bg-surface-1 dark:bg-surface-2">
```
Note: the original `dark:bg-white-[0.02]` is itself a bug (Tailwind arbitrary-value syntax needs brackets around the full class — `dark:bg-white/[0.02]` — as written, `dark:bg-white-[0.02]` doesn't compile to a valid utility, so it silently does nothing today). Replacing it with a real solid surface token fixes this dead class too.

- [ ] **Step 2: Verify**
Open a transcript detail view (from `HistoryView`'s fullscreen overlay, Task 13). Confirm the header bar behind the back button/title is opaque in both themes.

- [ ] **Step 3: Commit**
```bash
git add src/components/ui/TranscriptDetailView.tsx
git commit -m "style(transcript-detail): solid header bar, fix invalid dark bg utility, drop blur"
```

---

### Task 32: B4 cleanup — remove `--glass-*` token definitions if unused

**Files:**
- Modify: `src/index.css:88-91` (`:root` block) and `:221-223` (`.dark` block) — conditionally

**Interfaces:**
- Consumes: completion of Tasks 7-31 (all B1/B2/B3 sites)
- Produces: final state of the glass-token cleanup

- [ ] **Step 1: Grep for any remaining references**
```bash
grep -rn 'glass-bg\|glass-border\|glass-blur' src/
```
Expected result after Tasks 7-31: only the three definition lines in `src/index.css`'s `:root` block (currently lines 88-91) and their `.dark` override (currently lines 221-223, which redefine the same three vars for dark mode) should remain — no consumers.

- [ ] **Step 2: If (and only if) no consumers remain, delete both definition blocks**
```css
/* OLD (src/index.css:88-91, inside :root) */
  /* Glass surface tokens (kept for compat; pill/cards use solid surfaces now) */
  --glass-bg: rgba(255, 255, 255, 0.7);
  --glass-border: rgba(28, 26, 23, 0.08);
  --glass-blur: 0px;

/* NEW: delete these 4 lines entirely (comment + 3 declarations) */
```
```css
/* OLD (src/index.css:221-223, inside .dark) — verify by reading the file at execution time,
   line numbers will have shifted from earlier edits in this task list */
  --glass-bg: rgba(34, 30, 26, 0.9);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-blur: 0px;

/* NEW: delete these 3 lines entirely */
```
If the grep in Step 1 turns up any remaining hits outside `src/index.css`, stop — do not delete the definitions — and instead file/fix that remaining site using the same B1/B2/B3 policy before retrying this task.

- [ ] **Step 3: Verify**
Run `npm run build` (or `npm run dev`) after deletion — confirm no CSS build errors (no other file references `var(--glass-*)`). Re-run the grep from Step 1 — should return zero results.

- [ ] **Step 4: Commit**
```bash
git add src/index.css
git commit -m "chore: delete unused --glass-* token definitions after glass-to-solid audit"
```

---

### Task 33: Startup splash — findings + `LoadingFallback` fade-out (C, part 1 of 2)

**Files:**
- Read (no changes; findings only): `src/main.jsx`, `src/AppRouter.jsx`, `src/hooks/useSettings.ts`, `src/i18n.ts`, `src/locales/en/translation.json`
- Modify: `src/AppRouter.jsx:41-115` (add fade-out transition)

**Interfaces:**
- Consumes: findings below
- Produces: a fading `LoadingFallback` gate consumed by Task 34 (no i18n-key task needed — see findings)

**Findings (read during planning, confirmed against actual files):**

1. **There is no separate `SplashScreen.tsx` to create — one already exists.** `src/AppRouter.jsx`'s `MainApp` component already renders a `LoadingFallback` (defined at the bottom of the same file, lines 117-151) while `isLoading` is `true` (line 43, 96-98), and reuses it as the `Suspense` fallback for the lazily-loaded `ControlPanel`/`OnboardingFlow`/`AgentOverlay` chunks (lines 90, 102, 109). It already has: a centered layout, a branded Dhwani mark (inline SVG gradient icon matching the app logo, not `Loader2`), a custom CSS spinner (`animate-[spinner-rotate_...]`, not `Loader2` — see note below), and a message driven by `t("common.loading")`.
2. **`common.loading` already exists in all 10 locale files** (verified: `en`, `es`, `fr`, `de`, `pt`, `it`, `ru`, `zh-CN`, `zh-TW`, and `ja` even though `ja` isn't in the spec's 9-language list — all under `"common": { ... "loading": "..." }`). **No new i18n key is needed for Part C** — Task 35 becomes a no-op verification, not a translation task.
3. **The `isLoading` gate is not actually "i18n ready + settings loaded"** — it's a synchronous `localStorage.getItem("onboardingCompleted")` check inside a `useEffect`, resolved on the same tick (line 64-78). It's set `true` initially (line 43) so `LoadingFallback` always paints for at least one frame before this resolves, avoiding a flash — but it does not wait on `i18next`'s async locale loading (`loadLocale`/`changeUiLanguage` in `src/i18n.ts`, lines 85-97) or on `useSettings`'s `initializeSettings()` IPC sync (`src/hooks/useSettings.ts` line 107-117, which runs in the background and does not block first paint since the settings store's initial state comes from `localStorage` synchronously via `useSettingsStore`).
4. **`useSettings.ts` has no `isLoading`/`isReady` boolean to gate on** — grep for `isLoading|isReady|isInitialized` in that file returns nothing; settings render immediately from local defaults and refine asynchronously. There is nothing meaningful to block the splash on here beyond what already exists.
5. **`src/i18n.ts` has no ready-promise exposed either** — `i18n.init()` runs synchronously for the inlined `en` bundle; non-`en` locales load lazily via dynamic `import()` in `loadLocale()`, with `fallbackLng: "en"` so `t()` calls never throw or block, they just show English until the real locale resolves.

**Conclusion for the plan:** the spec's ask ("i18n ready + settings loaded" gate, branded spinner, `common.loading` key, ~200ms fade-out) is **95% already implemented**. The only real gap is the fade-out transition — `isLoading` currently flips straight from `true` to `false`, causing `LoadingFallback` to unmount instantly rather than fade. This task closes that gap; it does not introduce a new component.

- [ ] **Step 1: Add a `isExiting` transitional state so `LoadingFallback` fades out over ~200ms before `MainApp` swaps to real content**
```jsx
// OLD (src/AppRouter.jsx:41-43)
function MainApp() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

// NEW
function MainApp() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSplashExiting, setIsSplashExiting] = useState(false);
```

```jsx
// OLD (src/AppRouter.jsx:64-78)
  useEffect(() => {
    const resolved = localStorage.getItem("onboardingCompleted") === "true";

    if (isControlPanel && !resolved) {
      setShowOnboarding(true);
    }

    if (isDictationPanel && !resolved) {
      // Keep the dictation overlay hidden during onboarding — OnboardingFlow
      // shows it explicitly when the user reaches the activation step.
      window.electronAPI?.hideWindow?.();
    }

    setIsLoading(false);
  }, [isControlPanel, isDictationPanel]);

// NEW
  useEffect(() => {
    const resolved = localStorage.getItem("onboardingCompleted") === "true";

    if (isControlPanel && !resolved) {
      setShowOnboarding(true);
    }

    if (isDictationPanel && !resolved) {
      // Keep the dictation overlay hidden during onboarding — OnboardingFlow
      // shows it explicitly when the user reaches the activation step.
      window.electronAPI?.hideWindow?.();
    }

    // Fade the splash out over ~200ms instead of swapping it out instantly.
    setIsSplashExiting(true);
    const fadeTimer = setTimeout(() => setIsLoading(false), 200);
    return () => clearTimeout(fadeTimer);
  }, [isControlPanel, isDictationPanel]);
```

- [ ] **Step 2: Pass the exiting flag through to `LoadingFallback` and apply the transition**
```jsx
// OLD (src/AppRouter.jsx:96-98)
  if (isLoading) {
    return <LoadingFallback />;
  }

// NEW
  if (isLoading) {
    return <LoadingFallback isExiting={isSplashExiting} />;
  }
```

```jsx
// OLD (src/AppRouter.jsx:117-123)
function LoadingFallback({ message }) {
  const { t } = useTranslation();
  const fallbackMessage = message || t("common.loading");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 animate-[scale-in_300ms_ease-out]">

// NEW
function LoadingFallback({ message, isExiting = false }) {
  const { t } = useTranslation();
  const fallbackMessage = message || t("common.loading");

  return (
    <div
      className={`min-h-screen bg-background flex items-center justify-center transition-opacity duration-200 ease-out ${isExiting ? "opacity-0" : "opacity-100"}`}
    >
      <div className="flex flex-col items-center gap-4 animate-[scale-in_300ms_ease-out]">
```

(Only the top-level `MainApp`-driven splash gets the fade — `LoadingFallback` used bare as a `Suspense fallback` for lazy chunks at lines 90/102/109 keeps its default `isExiting={false}`, i.e. no fade, since React unmounts `Suspense` fallbacks itself the instant the lazy component resolves and there's no controlling state to drive a fade there; adding one would require restructuring those call sites, which is out of scope per "single gate, single spinner" and the spec's explicit scope of "the control panel's root mount".)

- [ ] **Step 3: Verify**
Run `npm run dev`, open the control panel window fresh (clear `onboardingCompleted` from localStorage is optional — this fires either way). Watch for the branded spinner fading out over ~200ms instead of popping away instantly, in both light and dark themes. Confirm no layout flash/white flicker during the transition (DevTools → Rendering → "Paint flashing" can help spot it).

- [ ] **Step 4: Commit**
```bash
git add src/AppRouter.jsx
git commit -m "feat(splash): fade the existing control-panel loading splash out over 200ms"
```

---

### Task 34: Startup splash — control-panel-only scoping check (C, part 2 of 2)

**Files:**
- Read/verify only: `src/AppRouter.jsx:14-39` (dictation overlay early-returns), `src/helpers/windowConfig.js`, `src/helpers/windowManager.js`

**Interfaces:**
- Consumes: Task 33's fade transition
- Produces: confirmation that the splash's scope matches the spec ("control panel window only")

- [ ] **Step 1: Confirm `LoadingFallback` doesn't leak into out-of-scope windows**
Re-read `AppRouter.jsx`'s top-level `AppRouter()` (lines 14-39): `meeting-notification=true`, `update-notification=true`, `transcription-preview=true`, and `scratchpad=true` params all return dedicated components (`MeetingNotificationOverlay`, `UpdateNotificationOverlay`, `TransformChangesOverlay`, `ScratchpadOverlay`) *before* reaching `MainApp`, so none of those windows ever see `LoadingFallback` — good, matches spec ("main dictation overlay window" and other overlay windows are out of scope). Only `MainApp` (the dictation window and the control panel, both routed through the same `isLoading` gate) render it. Per spec, the dictation overlay is explicitly out of scope ("already solved by `show`/`ready-to-show`") — but today's code shows the *same* `LoadingFallback` for both the control panel and the dictation overlay (`isDictationPanel` case falls through to the same `if (isLoading) return <LoadingFallback />;` at line 96-98).
- [ ] **Step 2: Scope the splash to the control panel only, per spec**
```jsx
// OLD (src/AppRouter.jsx:96-98, after Task 33's edit)
  if (isLoading) {
    return <LoadingFallback isExiting={isSplashExiting} />;
  }

// NEW
  if (isLoading) {
    // Splash is control-panel-only per spec — the dictation overlay window is
    // already invisible until painted (show: false + ready-to-show in
    // windowConfig.js/windowManager.js), so showing a splash there would only
    // add delay to an already-solved problem.
    return isControlPanel ? <LoadingFallback isExiting={isSplashExiting} /> : null;
  }
```
- [ ] **Step 3: Verify**
Launch the app fresh (both windows). Confirm the control panel shows the branded splash briefly (then fades per Task 33), while the dictation overlay window shows no splash flash at all (stays hidden via `show: false` until ready, exactly as before this change).

- [ ] **Step 4: Commit**
```bash
git add src/AppRouter.jsx
git commit -m "fix(splash): scope loading splash to control panel window only, per spec"
```

---

### Task 35: i18n verification — `common.loading` already present (no-op check)

**Files:**
- Verify only, no changes expected: `src/locales/en/translation.json:158`, and the equivalent `common.loading` line in `es`, `fr`, `de`, `pt`, `it`, `ru`, `zh-CN`, `zh-TW`.

**Interfaces:**
- Consumes: Global Constraints i18n requirement
- Produces: final confirmation there is no outstanding i18n gap in this plan

- [ ] **Step 1: Confirm the key exists with a sensible value in all 9 required locales**
```bash
grep -n '"loading":' src/locales/{en,es,fr,de,pt,it,ru,zh-CN,zh-TW}/translation.json
```
Expected (already verified during planning):
- `en`: `"loading": "Loading..."`
- `es`: `"loading": "Cargando..."`
- `fr`: `"loading": "Chargement..."`
- `de`: `"loading": "Laden..."`
- `it`: `"loading": "Caricamento..."`
- `ru`: `"loading": "Загрузка..."`
- `zh-CN`: `"loading": "加载中..."`
- `zh-TW`: `"loading": "載入中..."`
- `pt`: present under `common` (confirm via the grep above — not directly captured in the excerpt read during planning, but the `common` block structure is identical across all locale files per existing convention).

If the grep above shows a locale missing the key (not expected, but verify — do not assume), add it at the same position as `en/translation.json:158` (immediately after `"model": "Model",` and before `"unknown": "Unknown",`) using the matching translation from the list above, matching that file's existing indentation (2 spaces).

- [ ] **Step 2: No commit needed if Step 1 confirms all 9 locales already have the key** (this task is a verification gate, not a code change — skip Step 3 unless Step 1 found a gap).

- [ ] **Step 3 (only if a gap was found in Step 1): Commit the fix**
```bash
git add src/locales/*/translation.json
git commit -m "i18n: add missing common.loading key for startup splash"
```