# Settings Dedup, Theme-Aware Logo, and Flow Bar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplicate settings UI (Personalized Styles, Polish), add a theme-aware inline-SVG `Logo` component, and ship a 4-way user-selectable `flowBarPillStyle` setting (Glass/Flat/Bold/Minimal) for the main Flow Bar dictation pill.

**Architecture:** Three independent parts on the same branch/PR. Part A is React state/UI cleanup. Part B is a single new inline-SVG component wired into two existing usage sites. Part C extends the existing `micStateClass`-style className-branching pattern in `App.jsx` with a second, orthogonal modifier driven by a new persisted Zustand setting, mirroring the existing `voiceVisualizerStyle` picker pattern for its settings UI.

**Tech Stack:** React 19, TypeScript/JSX, Tailwind CSS v4, Zustand, Electron.

## Global Constraints

- Every new user-facing string needs a translation key in `src/locales/{lang}/translation.json` for all 9 languages: en, es, fr, de, pt, it, ru, zh-CN, zh-TW.
- No new npm dependencies.
- TypeScript for the new `Logo.tsx` component.
- Follow existing patterns: `currentColor` + the app's `.dark`-class theme switch (no `prefers-color-scheme`).
- Part C's glass treatment is a deliberate, documented, opt-in exception to the app-wide solid-surface rule — no other component gets blur reintroduced.
- Same branch/PR as the toast/glass/splash work (`ui/toast-glass-splash-refresh`, PR #39). Do not switch branches.

---

### Task 1: Settings dedup — Personalized Styles + Polish blocks in `SettingsPage.tsx`

**Files:**
- Modify: `src/components/SettingsPage.tsx:115-120` (props interface), `src/components/SettingsPage.tsx:636-640` (component signature), `src/components/SettingsPage.tsx:700-723` (destructure cleanup), `src/components/SettingsPage.tsx:2700-2847` (hotkeys-case blocks)
- Modify: `src/components/SettingsModal.tsx:39-45,142-157`
- Modify: `src/components/ControlPanel.tsx:689-699`
- Modify: `src/locales/{en,es,fr,de,pt,it,ru,zh-CN,zh-TW}/translation.json`

**Interfaces:**
- Consumes: `ControlPanelView` type from `src/components/ControlPanelSidebar.tsx:31-42` (type-only import — no runtime circularity since `ControlPanelSidebar.tsx` does not import `SettingsPage.tsx`).
- Produces: `onNavigateToView` callback prop, threaded `ControlPanel.tsx` → `SettingsModal.tsx` → `SettingsPage.tsx`. Consumed by Task 1 (link cards) only in this branch; no other consumer today.

- [ ] **Step 1: Thread `onNavigateToView` through `ControlPanel.tsx` → `SettingsModal.tsx` → `SettingsPage.tsx`**

  In `src/components/SettingsModal.tsx`, current:
  ```tsx
  interface SettingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialSection?: string;
  }

  export default function SettingsModal({ open, onOpenChange, initialSection }: SettingsModalProps) {
  ```
  becomes:
  ```tsx
  import type { ControlPanelView } from "./ControlPanelSidebar";

  interface SettingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialSection?: string;
    onNavigateToView?: (view: ControlPanelView) => void;
  }

  export default function SettingsModal({
    open,
    onOpenChange,
    initialSection,
    onNavigateToView,
  }: SettingsModalProps) {
  ```
  (add the `import type { ControlPanelView } from "./ControlPanelSidebar";` line near the top, after the existing `import SettingsPage, { SettingsSectionType } from "./SettingsPage";` line.)

  Current render (lines 142-157):
  ```tsx
    return (
      <SidebarModal<SettingsSectionType>
        open={open}
        onOpenChange={onOpenChange}
        title={t("settingsModal.title")}
        sidebarItems={sidebarItems}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      >
        <SettingsPage
          activeSection={activeSection}
          onNavigateToSection={handleSectionChange}
          initialSubTab={initialSubTab}
        />
      </SidebarModal>
    );
  ```
  becomes:
  ```tsx
    return (
      <SidebarModal<SettingsSectionType>
        open={open}
        onOpenChange={onOpenChange}
        title={t("settingsModal.title")}
        sidebarItems={sidebarItems}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      >
        <SettingsPage
          activeSection={activeSection}
          onNavigateToSection={handleSectionChange}
          onNavigateToView={onNavigateToView}
          initialSubTab={initialSubTab}
        />
      </SidebarModal>
    );
  ```

  In `src/components/SettingsPage.tsx`, current:
  ```tsx
  interface SettingsPageProps {
    activeSection?: SettingsSectionType;
    onNavigateToSection?: (section: SettingsSectionType) => void;
    /** When a legacy section ID was used (e.g. `meetings`), land on the matching sub-tab. */
    initialSubTab?: string;
  }
  ```
  becomes:
  ```tsx
  import type { ControlPanelView } from "./ControlPanelSidebar";

  interface SettingsPageProps {
    activeSection?: SettingsSectionType;
    onNavigateToSection?: (section: SettingsSectionType) => void;
    /** When a legacy section ID was used (e.g. `meetings`), land on the matching sub-tab. */
    initialSubTab?: string;
    /** Closes Settings and switches the main sidebar to this ControlPanel view — used by
     * link cards that point at a feature's dedicated page (Personalized Styles, Polish). */
    onNavigateToView?: (view: ControlPanelView) => void;
  }
  ```
  (add the `import type { ControlPanelView } ...` line near the top, with the other local imports.)

  Current component signature (line 636-640):
  ```tsx
  export default function SettingsPage({
    activeSection = "general",
    onNavigateToSection,
    initialSubTab,
  }: SettingsPageProps) {
  ```
  becomes:
  ```tsx
  export default function SettingsPage({
    activeSection = "general",
    onNavigateToSection,
    onNavigateToView,
    initialSubTab,
  }: SettingsPageProps) {
  ```

  In `src/components/ControlPanel.tsx`, current (lines 689-699):
  ```tsx
        {showSettings && (
          <Suspense fallback={null}>
            <SettingsModal
              open={showSettings}
              onOpenChange={(open) => {
                setShowSettings(open);
                if (!open) setSettingsSection(undefined);
              }}
              initialSection={settingsSection}
            />
          </Suspense>
        )}
  ```
  becomes:
  ```tsx
        {showSettings && (
          <Suspense fallback={null}>
            <SettingsModal
              open={showSettings}
              onOpenChange={(open) => {
                setShowSettings(open);
                if (!open) setSettingsSection(undefined);
              }}
              initialSection={settingsSection}
              onNavigateToView={(view) => {
                setShowSettings(false);
                setSettingsSection(undefined);
                setActiveView(view);
              }}
            />
          </Suspense>
        )}
  ```
  (`setActiveView` is already in scope in `ControlPanel.tsx` — declared at line 113: `const [activeView, setActiveView] = useState<ControlPanelView>("home");`.)

- [ ] **Step 2: Delete the Personalized Styles duplicate block, replace with a link card**

  In `src/components/SettingsPage.tsx`, the current block (lines 2794-2847):
  ```tsx
              {/* Personalized Styles */}
              <div>
                <SectionHeader
                  title={t("settingsPage.general.personalizedStyles.title")}
                  description={t("settingsPage.general.personalizedStyles.description")}
                />
                <SettingsPanel>
                  <SettingsPanelRow className="flex items-center justify-between gap-3 pb-3 mb-2 border-b border-border/40 dark:border-white/5">
                    <span className="text-sm font-medium text-foreground">
                      Enable Voice Styles
                    </span>
                    <Toggle checked={enableVoiceStyles} onChange={setEnableVoiceStyles} />
                  </SettingsPanelRow>

                  {(
                    [
                      ["work", styleToneWork, setStyleToneWork],
                      ["email", styleToneEmail, setStyleToneEmail],
                      ["personal", styleTonePersonal, setStyleTonePersonal],
                      ["other", styleToneOther, setStyleToneOther],
                    ] as const
                  ).map(([contextKey, value, setValue], index) => (
                    <SettingsPanelRow
                      key={contextKey}
                      className={
                        index > 0 ? "border-t border-border/40 dark:border-white/5" : undefined
                      }
                    >
                      <SettingsRow
                        label={t(`settingsPage.general.personalizedStyles.contexts.${contextKey}`)}
                      >
                        <select
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          className="h-7 rounded border border-border/70 bg-surface-1 px-2.5 text-xs font-medium text-foreground shadow-sm hover:border-border-hover hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-1 transition-colors duration-200"
                        >
                          <option value="off">
                            {t("settingsPage.general.personalizedStyles.off")}
                          </option>
                          <option value="veryCasual">
                            {t("style.presets.veryCasual.label", "Very Casual")}
                          </option>
                          <option value="casual">
                            {t("settingsPage.general.personalizedStyles.casual")}
                          </option>
                          <option value="formal">
                            {t("settingsPage.general.personalizedStyles.formal")}
                          </option>
                        </select>
                      </SettingsRow>
                    </SettingsPanelRow>
                  ))}
                </SettingsPanel>
              </div>
  ```
  becomes:
  ```tsx
              {/* Personalized Styles — full config lives at the dedicated `style`
                  sidebar view (StyleView.tsx); this used to be a duplicate mini-UI. */}
              <div>
                <SectionHeader
                  title={t("settingsPage.general.personalizedStyles.title")}
                  description={t("settingsPage.general.personalizedStyles.description")}
                />
                <SettingsPanel>
                  <SettingsPanelRow>
                    <button
                      type="button"
                      onClick={() => onNavigateToView?.("style")}
                      className="w-full flex items-center justify-between gap-3 text-left text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      {t("settingsPage.general.personalizedStyles.configureLink")}
                    </button>
                  </SettingsPanelRow>
                </SettingsPanel>
              </div>
  ```

- [ ] **Step 3: Trim the Polish block to just the hotkey, add a link card**

  In `src/components/SettingsPage.tsx`, the current block (lines 2700-2767):
  ```tsx
              {/* Polish Hotkey */}
              <div>
                <SectionHeader
                  title={t("settingsPage.general.polishHotkey.title")}
                  description={t("settingsPage.general.polishHotkey.description")}
                />
                <SettingsPanel>
                  <SettingsPanelRow>
                    <HotkeyInput
                      value={polishKey}
                      onChange={async (newHotkey) => {
                        await registerPolishHotkey(newHotkey);
                      }}
                      onClear={async () => {
                        await window.electronAPI?.registerPolishHotkey?.("");
                        setPolishKey("");
                      }}
                      disabled={isPolishHotkeyRegistering}
                      validate={validatePolishHotkey}
                      slotName="polish"
                    />
                  </SettingsPanelRow>
                  <SettingsPanelRow className="flex items-center justify-between gap-3 border-t border-border/40 dark:border-white/5">
                    <span className="text-xs text-muted-foreground/80">
                      {t("settingsPage.general.polishHotkey.enabledLabel")}
                    </span>
                    <Toggle checked={polishEnabled} onChange={setPolishEnabled} />
                  </SettingsPanelRow>
                  <SettingsPanelRow className="flex flex-col gap-2.5 border-t border-border/40 dark:border-white/5">
                    <span className="text-xs text-muted-foreground/80">
                      {t("settingsPage.general.polishHotkey.instructionsLabel")}
                    </span>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs">
                        {t("settingsPage.general.polishHotkey.instructionConcise")}
                      </span>
                      <Toggle
                        checked={polishInstructionConcise}
                        onChange={setPolishInstructionConcise}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs">
                        {t("settingsPage.general.polishHotkey.instructionClarity")}
                      </span>
                      <Toggle
                        checked={polishInstructionClarity}
                        onChange={setPolishInstructionClarity}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs">
                        {t("settingsPage.general.polishHotkey.instructionTone")}
                      </span>
                      <Toggle checked={polishInstructionTone} onChange={setPolishInstructionTone} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs">
                        {t("settingsPage.general.polishHotkey.instructionStructure")}
                      </span>
                      <Toggle
                        checked={polishInstructionStructure}
                        onChange={setPolishInstructionStructure}
                      />
                    </div>
                  </SettingsPanelRow>
                </SettingsPanel>
              </div>
  ```
  becomes:
  ```tsx
              {/* Polish Hotkey — the on/off toggle and rule toggles moved to
                  TransformDetailView.tsx (the dedicated Polish page); only the
                  actual hotkey binding stays here. */}
              <div>
                <SectionHeader
                  title={t("settingsPage.general.polishHotkey.title")}
                  description={t("settingsPage.general.polishHotkey.description")}
                />
                <SettingsPanel>
                  <SettingsPanelRow>
                    <HotkeyInput
                      value={polishKey}
                      onChange={async (newHotkey) => {
                        await registerPolishHotkey(newHotkey);
                      }}
                      onClear={async () => {
                        await window.electronAPI?.registerPolishHotkey?.("");
                        setPolishKey("");
                      }}
                      disabled={isPolishHotkeyRegistering}
                      validate={validatePolishHotkey}
                      slotName="polish"
                    />
                  </SettingsPanelRow>
                  <SettingsPanelRow className="border-t border-border/40 dark:border-white/5">
                    <button
                      type="button"
                      onClick={() => onNavigateToView?.("transforms")}
                      className="w-full flex items-center justify-between gap-3 text-left text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      {t("settingsPage.general.polishHotkey.configureLink")}
                    </button>
                  </SettingsPanelRow>
                </SettingsPanel>
              </div>
  ```

- [ ] **Step 4: Remove now-unused destructured fields**

  In `src/components/SettingsPage.tsx`, current destructure block (lines 700-724, inside the `useSettings()` call):
  ```tsx
      audioCuesEnabled,
      setAudioCuesEnabled,
      polishEnabled,
      setPolishEnabled,
      polishInstructionConcise,
      setPolishInstructionConcise,
      polishInstructionClarity,
      setPolishInstructionClarity,
      polishInstructionTone,
      setPolishInstructionTone,
      polishInstructionStructure,
      setPolishInstructionStructure,
      polishKey,
      setPolishKey,
      styleToneWork,
      setStyleToneWork,
      styleToneEmail,
      setStyleToneEmail,
      styleTonePersonal,
      setStyleTonePersonal,
      styleToneOther,
      setStyleToneOther,
      enableVoiceStyles,
      setEnableVoiceStyles,
      pauseMediaOnDictation,
      setPauseMediaOnDictation,
  ```
  becomes (drop the 6 pairs no longer read anywhere in this file — verified via grep that `polishEnabled`/`setPolishEnabled`, the 4 `polishInstruction*`/setters, `styleTone*`/setters, and `enableVoiceStyles`/`setEnableVoiceStyles` have no remaining usages in `SettingsPage.tsx` after Steps 2-3; `polishKey`/`setPolishKey` stay, still used by the trimmed hotkey block):
  ```tsx
      audioCuesEnabled,
      setAudioCuesEnabled,
      polishKey,
      setPolishKey,
      pauseMediaOnDictation,
      setPauseMediaOnDictation,
  ```

- [ ] **Step 5: i18n — add `configureLink` keys to all 9 locale files**

  `src/locales/en/translation.json` — inside `settingsPage.general.polishHotkey` (after `"instructionStructure"` value at line 1628) add a trailing key, and inside `settingsPage.general.personalizedStyles` (after `"contexts": {...}` at line 1645) add a trailing key:
  ```json
        "polishHotkey": {
          "title": "Polish Hotkey",
          "description": "Select text in any app and rewrite it in place with AI",
          "enabledLabel": "Enable Polish",
          "instructionsLabel": "Edits to apply",
          "instructionConcise": "Make more concise",
          "instructionClarity": "Improve clarity and flow",
          "instructionTone": "Preserve original tone",
          "instructionStructure": "Add structure where helpful",
          "configureLink": "Configure Polish →"
        },
        "pasteLastTranscriptHotkey": { ... },
        "personalizedStyles": {
          "title": "Personalized Styles",
          "description": "Set a writing tone for dictation cleanup based on the app you're using",
          "off": "Off",
          "casual": "Casual",
          "formal": "Formal",
          "contexts": {
            "work": "Work apps",
            "email": "Email apps",
            "personal": "Personal/messaging apps",
            "other": "Everything else"
          },
          "configureLink": "Configure personalized styles →"
        },
  ```
  (`enabledLabel`/`instructionsLabel`/`instruction*` keys stay in the JSON even though the Hotkeys UI no longer reads them — `TransformDetailView.tsx` reuses `enabledLabel` in Task 2, and deleting the instruction keys risks breaking other unverified callers; leaving unused JSON keys is harmless.)

  Apply the same two-key addition (`polishHotkey.configureLink`, `personalizedStyles.configureLink`) to the other 8 locale files, using each file's `polishHotkey`/`personalizedStyles` blocks (all confirmed present, same nested shape, at these anchors):
  - `es/translation.json`: `polishHotkey` at 1644, `personalizedStyles` at 1654 → `"configureLink": "Configurar Polish →"` / `"configureLink": "Configurar estilos personalizados →"`
  - `fr/translation.json`: `polishHotkey` at 1644, `personalizedStyles` at 1654 → `"configureLink": "Configurer Polish →"` / `"configureLink": "Configurer les styles personnalisés →"`
  - `de/translation.json`: `polishHotkey` at 1596, `personalizedStyles` at 1606 → `"configureLink": "Polish konfigurieren →"` / `"configureLink": "Personalisierte Stile konfigurieren →"`
  - `pt/translation.json`: `polishHotkey` at 1575, `personalizedStyles` at 1585 → `"configureLink": "Configurar Polish →"` / `"configureLink": "Configurar estilos personalizados →"`
  - `it/translation.json`: `polishHotkey` at 1596, `personalizedStyles` at 1606 → `"configureLink": "Configura Polish →"` / `"configureLink": "Configura stili personalizzati →"`
  - `ru/translation.json`: `polishHotkey` at 1596, `personalizedStyles` at 1606 → `"configureLink": "Настроить Polish →"` / `"configureLink": "Настроить персональные стили →"`
  - `zh-CN/translation.json`: `polishHotkey` at 1596, `personalizedStyles` at 1606 → `"configureLink": "配置 Polish →"` / `"configureLink": "配置个性化风格 →"`
  - `zh-TW/translation.json`: `polishHotkey` at 1596, `personalizedStyles` at 1606 → `"configureLink": "設定 Polish →"` / `"configureLink": "設定個人化風格 →"`

  For each file, insert `"configureLink": "..."` as the last key of the `polishHotkey` object (after `instructionStructure`) and as the last key of `personalizedStyles` (after the `contexts` object), matching en's structure exactly — read each file's exact block before editing to confirm no drift from the en shape (spot-checked es and zh-CN above; both match).

- [ ] **Step 6: Test (manual)**

  `npm run dev` → open Control Panel → Settings → Hotkeys. Confirm: Polish section shows only the hotkey input + "Configure Polish →" link (no enable toggle, no 4 instruction toggles); clicking the link closes Settings and switches the sidebar to Transforms. Confirm the section below shows "Personalized Styles" header + "Configure personalized styles →" link only; clicking it closes Settings and switches to the Style sidebar view.

- [ ] **Step 7: Commit**
```bash
git add src/components/SettingsPage.tsx src/components/SettingsModal.tsx src/components/ControlPanel.tsx src/locales/*/translation.json
git commit -m "$(cat <<'EOF'
Dedup Personalized Styles and Polish config out of Settings > Hotkeys

Both had full dedicated pages (StyleView, TransformDetailView) already
driving the same store fields as a second, drifting mini-UI embedded in
Hotkeys. Hotkeys now only shows the hotkey bindings plus a link to each
feature's real settings page.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014DwW4vCvBtSDLejqtWwHPN
EOF
)"
```

---

### Task 2: Move `polishEnabled` toggle into `TransformDetailView.tsx`

**Files:**
- Modify: `src/components/TransformDetailView.tsx:48-58` (store hooks), `:159-182` (rules array), `:307-326` (rendered list)

**Interfaces:**
- Consumes: `polishEnabled`/`setPolishEnabled` from `useSettingsStore` (already exist at `src/stores/settingsStore.ts:492,560,1222,1256` — no store changes needed).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Read `polishEnabled` from the store**

  Current (lines 48-58):
  ```tsx
    const polishKey = useSettingsStore((s) => s.polishKey);
    const setPolishKey = useSettingsStore((s) => s.setPolishKey);
    const instructionConcise = useSettingsStore((s) => s.polishInstructionConcise);
    const instructionClarity = useSettingsStore((s) => s.polishInstructionClarity);
    const instructionTone = useSettingsStore((s) => s.polishInstructionTone);
    const instructionStructure = useSettingsStore((s) => s.polishInstructionStructure);
    const setInstructionConcise = useSettingsStore((s) => s.setPolishInstructionConcise);
    const setInstructionClarity = useSettingsStore((s) => s.setPolishInstructionClarity);
    const setInstructionTone = useSettingsStore((s) => s.setPolishInstructionTone);
    const setInstructionStructure = useSettingsStore((s) => s.setPolishInstructionStructure);
  ```
  becomes:
  ```tsx
    const polishKey = useSettingsStore((s) => s.polishKey);
    const setPolishKey = useSettingsStore((s) => s.setPolishKey);
    const polishEnabled = useSettingsStore((s) => s.polishEnabled);
    const setPolishEnabled = useSettingsStore((s) => s.setPolishEnabled);
    const instructionConcise = useSettingsStore((s) => s.polishInstructionConcise);
    const instructionClarity = useSettingsStore((s) => s.polishInstructionClarity);
    const instructionTone = useSettingsStore((s) => s.polishInstructionTone);
    const instructionStructure = useSettingsStore((s) => s.polishInstructionStructure);
    const setInstructionConcise = useSettingsStore((s) => s.setPolishInstructionConcise);
    const setInstructionClarity = useSettingsStore((s) => s.setPolishInstructionClarity);
    const setInstructionTone = useSettingsStore((s) => s.setPolishInstructionTone);
    const setInstructionStructure = useSettingsStore((s) => s.setPolishInstructionStructure);
  ```

- [ ] **Step 2: Also reset `polishEnabled` on "Reset"**

  Current `handleReset` (lines 130-146) doesn't touch `polishEnabled`. Add it alongside the other polish-rule resets:
  ```tsx
    const handleReset = useCallback(() => {
      saveBuiltinOverride(transform.id, null);
      setOverride({});
      setPrompt(transform.prompt);
      if (isPolish) {
        setPolishEnabled(true);
        setInstructionConcise(true);
        setInstructionClarity(true);
        setInstructionTone(true);
        setInstructionStructure(false);
        if (transform.shortcut) {
          void polishRegisterFn(transform.shortcut).then((result) => {
            if (result?.success) setPolishKey(transform.shortcut!);
          });
        }
      } else if (transform.shortcut) {
        void transformRegisterFn(transform.shortcut);
      }
    }, [
      isPolish,
      polishRegisterFn,
      setInstructionClarity,
      setInstructionConcise,
      setInstructionStructure,
      setInstructionTone,
      setPolishEnabled,
      setPolishKey,
      transform,
      transformRegisterFn,
    ]);
  ```
  (`true` matches the store's own default at `settingsStore.ts:1222`: `polishEnabled: readBoolean("polishEnabled", true)`.)

- [ ] **Step 3: Render the toggle above the rules list**

  Current (lines 307-326):
  ```tsx
            {isPolish ? (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  {t("transformDetail.selectRules", { defaultValue: "Select rules for Polish" })}
                </h3>
                <div className="overflow-hidden rounded-xl bg-muted/50">
                  {polishRules.map((rule, i) => (
                    <div
                      key={rule.label}
                      className={[
                        "flex items-center justify-between px-4 py-3.5",
                        i > 0 ? "border-t border-border/40" : "",
                      ].join(" ")}
                    >
                      <span className="text-sm text-foreground">{rule.label}</span>
                      <Toggle checked={rule.checked} onChange={rule.onChange} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
  ```
  becomes:
  ```tsx
            {isPolish ? (
              <div>
                <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-4 py-3.5">
                  <span className="text-sm font-medium text-foreground">
                    {t("settingsPage.general.polishHotkey.enabledLabel", {
                      defaultValue: "Enable Polish",
                    })}
                  </span>
                  <Toggle checked={polishEnabled} onChange={setPolishEnabled} />
                </div>
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  {t("transformDetail.selectRules", { defaultValue: "Select rules for Polish" })}
                </h3>
                <div className="overflow-hidden rounded-xl bg-muted/50">
                  {polishRules.map((rule, i) => (
                    <div
                      key={rule.label}
                      className={[
                        "flex items-center justify-between px-4 py-3.5",
                        i > 0 ? "border-t border-border/40" : "",
                      ].join(" ")}
                    >
                      <span className="text-sm text-foreground">{rule.label}</span>
                      <Toggle checked={rule.checked} onChange={rule.onChange} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
  ```
  This reuses the existing `settingsPage.general.polishHotkey.enabledLabel` key (present in all 9 locale files already — see Task 1 Step 5's file list) instead of adding a new translation key, avoiding a 9-file duplicate-string edit for identical text.

- [ ] **Step 4: Test (manual)**

  `npm run dev` → Control Panel → Transforms → Polish. Confirm a new "Enable Polish" toggle appears above "Select rules for Polish", reflects/persists the same value the old Hotkeys toggle used to (toggle it off, reopen the app, confirm still off), and "Reset" turns it back on along with the other rules.

- [ ] **Step 5: Commit**
```bash
git add src/components/TransformDetailView.tsx
git commit -m "$(cat <<'EOF'
Add Polish enable/disable toggle to TransformDetailView

polishEnabled previously only had a UI in Settings > Hotkeys, which Task 1
just removed. This is its new (and only) home, next to the rule toggles it
already controlled from a distance.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014DwW4vCvBtSDLejqtWwHPN
EOF
)"
```

---

### Task 3: Manual verification — Part A dedup complete

**Files:** none (verification only)

**Interfaces:**
- Consumes: Tasks 1-2's UI changes.
- Produces: sign-off before starting Part B.

- [ ] **Step 1: Manual verification checklist**

  Run `npm run dev`. Verify all of the following:
  1. Control Panel → Settings → Hotkeys: no "Enable Voice Styles" toggle, no 4 style-tone selects (work/email/personal/other), no 4 Polish instruction toggles, no Polish enable toggle. Only: hotkey inputs (dictation, meeting, polish, paste-last-transcript, chat agent, voice agent, etc.) and the two new link cards.
  2. Click "Configure personalized styles →" → Settings closes, main sidebar switches to Style (Palette icon) view, `StyleView.tsx` renders with the same `styleTone*`/`enableVoiceStyles` values previously set from Hotkeys.
  3. Click "Configure Polish →" → Settings closes, sidebar switches to Transforms, Polish card is reachable and its detail view shows the same `polishInstruction*` values previously set from Hotkeys, plus the new "Enable Polish" toggle reflecting the same `polishEnabled` value.
  4. Change a style tone or a polish rule from its dedicated page, reopen Settings → Hotkeys → confirm the hotkey-only view still has no residual duplicate UI (nothing to break — this is a regression check that Step 2 didn't leave a stale copy of removed JSX behind).
  5. Custom Dictionary in `general` settings and its own `dictionary` sidebar item — confirm untouched (out of scope per spec).

---

### Task 4: Create `src/components/ui/Logo.tsx`

**Files:**
- Create: `src/components/ui/Logo.tsx`

**Interfaces:**
- Consumes: nothing (self-contained SVG).
- Produces: `Logo` component, consumed by Task 5.

- [ ] **Step 1: Create the component**

  Modeled on `src/components/ui/LogoTile.tsx`'s named-export, typed-props style:
  ```tsx
  interface LogoProps {
    size?: number;
    className?: string;
  }

  /**
   * Dhwani's theme-aware wordmark icon — a ring + wave, inline SVG using
   * currentColor so it inherits the app's existing .dark class / palette
   * tokens instead of needing its own theme logic. The accent dot stays a
   * literal #f5a94a (matches --color-flow-warm) in both themes, same as the
   * static logo.svg it does NOT replace (logo.svg is still used by
   * CliIntegrationCard/McpIntegrationCard and is left as-is).
   */
  export function Logo({ size = 56, className }: LogoProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        className={className}
        role="img"
        aria-label="Dhwani"
      >
        <path
          d="M53 41 A27 27 0 1 1 53 23"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M20 32 Q26 18 32 32 T44 32"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="44" cy="32" r="4" fill="#f5a94a" />
      </svg>
    );
  }
  ```

- [ ] **Step 2: Test (manual)**

  No consumers yet — defer visual check to Task 5's manual test.

- [ ] **Step 3: Commit**
```bash
git add src/components/ui/Logo.tsx
git commit -m "$(cat <<'EOF'
Add theme-aware Logo component (inline SVG, currentColor)

logo.svg is a static asset with baked-in hex colors that can't respond to
theme changes. Logo.tsx is a new inline SVG for the two spots that need a
real theme-adaptive mark; logo.svg itself is untouched and keeps its two
existing integration-card consumers.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014DwW4vCvBtSDLejqtWwHPN
EOF
)"
```

---

### Task 5: Wire `Logo` into onboarding + sidebar footer

**Files:**
- Modify: `src/components/OnboardingFlow.tsx:35,524-529`
- Modify: `src/components/ui/SidebarModal.tsx:198-214`

**Interfaces:**
- Consumes: `Logo` from Task 4.
- Produces: nothing for later tasks.

- [ ] **Step 1: Onboarding welcome screen**

  Current import (line 35):
  ```tsx
  import logoIcon from "../assets/icon.png";
  ```
  becomes:
  ```tsx
  import { Logo } from "./ui/Logo";
  ```
  (verified via grep that `logoIcon` has exactly one other usage in this file, at line 526 — safe to remove the import entirely.)

  Current usage (lines 524-529):
  ```tsx
            <m.img
              variants={staggerItem}
              src={logoIcon}
              alt="Dhwani"
              className="w-14 h-14 mx-auto rounded-xl shadow-sm"
            />
  ```
  becomes:
  ```tsx
            <m.div variants={staggerItem} className="mx-auto w-14 h-14 flex items-center justify-center text-foreground">
              <Logo size={56} />
            </m.div>
  ```
  (kept the same `w-14 h-14` / centered footprint as the old `<img>`; dropped `rounded-xl shadow-sm` since there's no longer a raster tile to round/shadow — the mark itself is the visual, not a rounded card.)

- [ ] **Step 2: Settings sidebar footer**

  Current (`src/components/ui/SidebarModal.tsx:198-214`):
  ```tsx
                {/* Footer / version */}
                {version && (
                  <div
                    className={`border-t border-border/20 dark:border-border-subtle ${
                      isCompact ? "flex justify-center py-2.5" : "px-3 py-2.5"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="h-1 w-1 rounded-full bg-success/60" />
                      {!isCompact && (
                        <span className="text-xs text-muted-foreground/40 tabular-nums tracking-wide">
                          Dhwani v{version}
                        </span>
                      )}
                    </div>
                  </div>
                )}
  ```
  becomes:
  ```tsx
                {/* Footer / version */}
                {version && (
                  <div
                    className={`border-t border-border/20 dark:border-border-subtle ${
                      isCompact ? "flex justify-center py-2.5" : "px-3 py-2.5"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Logo size={16} className="text-foreground/60 shrink-0" />
                      <div className="h-1 w-1 rounded-full bg-success/60" />
                      {!isCompact && (
                        <span className="text-xs text-muted-foreground/40 tabular-nums tracking-wide">
                          Dhwani v{version}
                        </span>
                      )}
                    </div>
                  </div>
                )}
  ```
  Add the import near the top of `SidebarModal.tsx` (after the existing `import { SettingsLayoutProvider } from "./useSettingsLayout";` line):
  ```tsx
  import { Logo } from "./Logo";
  ```
  Note: `SettingsModal.tsx` is currently the only consumer of `SidebarModal`, and it does not pass a `version` prop (confirmed by reading `SettingsModal.tsx` in full — no `version={...}` on its `<SidebarModal>` call), so this footer block doesn't actually render in the app today regardless of this change. Do not add a `version` prop to `SettingsModal.tsx`'s call as part of this task — that's a pre-existing gap outside this spec's scope; only make the footer itself theme-aware for whenever/if a caller does pass `version`.

- [ ] **Step 3: Test (manual)**

  `npm run dev` → trigger onboarding (or check via a fresh profile / dev flag) → welcome screen shows the ring+wave mark instead of the raster icon, in both light and dark theme (toggle via OS or in-app theme switcher, confirm the ring/wave recolor while the dot stays amber). For the sidebar footer, since no live caller passes `version` today, visually confirm by temporarily passing a hardcoded `version="0.0.0-test"` prop to the `SettingsModal`'s `<SidebarModal>` call in a local scratch edit (not committed) — confirm the 16px mark renders correctly sized next to the dot and version text, then revert the scratch edit.

- [ ] **Step 4: Commit**
```bash
git add src/components/OnboardingFlow.tsx src/components/ui/SidebarModal.tsx
git commit -m "$(cat <<'EOF'
Use the theme-aware Logo in onboarding and the settings sidebar footer

Replaces the static icon.png <img> on the onboarding welcome screen and
adds the mark next to the version string in SidebarModal's footer.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014DwW4vCvBtSDLejqtWwHPN
EOF
)"
```

---

### Task 6: Add `flowBarPillStyle` setting

**Files:**
- Modify: `src/hooks/useSettings.ts:81-87` (ThemeSettings interface), `:294-297` (hook return)
- Modify: `src/stores/settingsStore.ts:658-659` (interface field+setter), `:969-972` (init read), `:1527-1530` (setter impl)

**Interfaces:**
- Consumes: nothing new (same localStorage-only pattern as `voiceVisualizerStyle` — no IPC persistence, confirmed by grepping `settingsStore.ts` for `"voiceVisualizerStyle"` and finding only the two localStorage read/write sites, no `.env`/IPC involvement).
- Produces: `flowBarPillStyle`/`setFlowBarPillStyle`, consumed by Tasks 10-11.

- [ ] **Step 1: `useSettings.ts` — add the field to `ThemeSettings`**

  Current (lines 81-87):
  ```tsx
  export interface ThemeSettings {
    theme: "light" | "dark" | "auto";
    palette: "default" | "nord" | "dracula" | "solarized" | "rose";
    accentColor: string | null;
    voiceVisualizerStyle: "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles";
    enableVoiceStyles: boolean;
  }
  ```
  becomes:
  ```tsx
  export interface ThemeSettings {
    theme: "light" | "dark" | "auto";
    palette: "default" | "nord" | "dracula" | "solarized" | "rose";
    accentColor: string | null;
    voiceVisualizerStyle: "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles";
    enableVoiceStyles: boolean;
    flowBarPillStyle: "glass" | "flat" | "bold" | "minimal";
  }
  ```

- [ ] **Step 2: `useSettings.ts` — add to the hook's returned object**

  Current (lines 294-297):
  ```tsx
        voiceVisualizerStyle: store.voiceVisualizerStyle,
        setVoiceVisualizerStyle: store.setVoiceVisualizerStyle,
        enableVoiceStyles: store.enableVoiceStyles,
        setEnableVoiceStyles: store.setEnableVoiceStyles,
  ```
  becomes:
  ```tsx
        voiceVisualizerStyle: store.voiceVisualizerStyle,
        setVoiceVisualizerStyle: store.setVoiceVisualizerStyle,
        enableVoiceStyles: store.enableVoiceStyles,
        setEnableVoiceStyles: store.setEnableVoiceStyles,
        flowBarPillStyle: store.flowBarPillStyle,
        setFlowBarPillStyle: store.setFlowBarPillStyle,
  ```

- [ ] **Step 3: `settingsStore.ts` — add field + setter type to `SettingsState`**

  Current (lines 656-659):
  ```tsx
    setTheme: (value: "light" | "dark" | "auto") => void;
    setPalette: (value: "default" | "nord" | "dracula" | "solarized" | "rose") => void;
    setAccentColor: (value: string | null) => void;
    voiceVisualizerStyle: "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles";
    setVoiceVisualizerStyle: (style: "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles") => void;
  ```
  becomes:
  ```tsx
    setTheme: (value: "light" | "dark" | "auto") => void;
    setPalette: (value: "default" | "nord" | "dracula" | "solarized" | "rose") => void;
    setAccentColor: (value: string | null) => void;
    voiceVisualizerStyle: "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles";
    setVoiceVisualizerStyle: (style: "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles") => void;
    flowBarPillStyle: "glass" | "flat" | "bold" | "minimal";
    setFlowBarPillStyle: (style: "glass" | "flat" | "bold" | "minimal") => void;
  ```
  (this mirrors the existing redundant-but-working pattern where `SettingsState` both extends `ThemeSettings` — which already declares `voiceVisualizerStyle` as a bare field — and separately redeclares it in its own body alongside the setter signature; TypeScript allows this as long as the field types match.)

- [ ] **Step 4: `settingsStore.ts` — add init read**

  Current (lines 969-972):
  ```tsx
    voiceVisualizerStyle: (() => {
      const v = readString("voiceVisualizerStyle", "plasma");
      return (["plasma", "bars", "siri", "ripple", "neon", "particles"].includes(v) ? v : "plasma") as "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles";
    })(),
  ```
  Add immediately after it:
  ```tsx
    voiceVisualizerStyle: (() => {
      const v = readString("voiceVisualizerStyle", "plasma");
      return (["plasma", "bars", "siri", "ripple", "neon", "particles"].includes(v) ? v : "plasma") as "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles";
    })(),
    flowBarPillStyle: (() => {
      const v = readString("flowBarPillStyle", "glass");
      return (["glass", "flat", "bold", "minimal"].includes(v) ? v : "glass") as
        | "glass"
        | "flat"
        | "bold"
        | "minimal";
    })(),
  ```

- [ ] **Step 5: `settingsStore.ts` — add setter implementation**

  Current (lines 1527-1530):
  ```tsx
    setVoiceVisualizerStyle: (style: "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles") => {
      if (isBrowser) localStorage.setItem("voiceVisualizerStyle", style);
      set({ voiceVisualizerStyle: style });
    },
  ```
  Add immediately after it:
  ```tsx
    setVoiceVisualizerStyle: (style: "plasma" | "bars" | "siri" | "ripple" | "neon" | "particles") => {
      if (isBrowser) localStorage.setItem("voiceVisualizerStyle", style);
      set({ voiceVisualizerStyle: style });
    },
    setFlowBarPillStyle: (style: "glass" | "flat" | "bold" | "minimal") => {
      if (isBrowser) localStorage.setItem("flowBarPillStyle", style);
      set({ flowBarPillStyle: style });
    },
  ```

- [ ] **Step 6: Test (manual)**

  `npm run dev` → open devtools console in the main window → `localStorage.getItem("flowBarPillStyle")` should be `null` initially (unset), and `useSettingsStore.getState().flowBarPillStyle` should read `"glass"` (the default). No UI wired yet — this task is store-only.

- [ ] **Step 7: Commit**
```bash
git add src/hooks/useSettings.ts src/stores/settingsStore.ts
git commit -m "$(cat <<'EOF'
Add flowBarPillStyle setting (glass/flat/bold/minimal, default glass)

Same localStorage-only persistence pattern as voiceVisualizerStyle. No UI
or CSS wiring yet — that's the next several tasks.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014DwW4vCvBtSDLejqtWwHPN
EOF
)"
```

---

### Task 7: CSS — idle states per style (`.flow-dock-panel`, `.flow-dock-mic`)

**Files:**
- Modify: `src/index.css:823-901` (append new rules after the existing panel/mic blocks; do not touch the existing unmodified base rules)

**Interfaces:**
- Consumes: nothing (pure CSS; classes `flow-dock-panel--{style}` / `flow-dock-mic--{style}` are applied by Task 10).
- Produces: CSS classes consumed by Task 10.

- [ ] **Step 1: Add `.flow-dock-panel--*` modifiers**

  Insert immediately after the existing `.dark .flow-dock-panel { ... }` block (after line 846, before the `@keyframes flow-dock-in` block) in `src/index.css`:
  ```css
  /* Pill Style — 4-way user setting (Settings > Appearance > Pill Appearance,
     flowBarPillStyle in settingsStore.ts). "flat" is Task 8's (f344dfb1)
     already-solid values verbatim — the unmodified rule above. "glass" is a
     deliberate, opt-in, documented exception to the app-wide solid-surface
     rule from that same glass-removal audit: Apple's 2026 "Liquid Glass"
     reserves translucency for floating controls above arbitrary content,
     which is exactly this window's situation, and it's now opt-in rather
     than forced on every user. Do not collapse these 4 classes back to one
     without re-reading docs/superpowers/specs/2026-07-19-settings-dedup-and-logo-design.md Part C. */
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
  .dark .flow-dock-panel.flow-dock-panel--glass {
    background: rgba(30, 28, 38, 0.35);
    border-color: rgba(255, 255, 255, 0.14);
    border-top-color: rgba(255, 255, 255, 0.32);
    box-shadow:
      0 6px 18px rgba(0, 0, 0, 0.35),
      inset 0 1px 0 rgba(255, 255, 255, 0.55);
  }

  /* flat: matches the unmodified .flow-dock-panel rule above exactly — empty
     ruleset kept as an explicit anchor for the 4-way split. */
  .flow-dock-panel.flow-dock-panel--flat {
  }

  /* bold: same flat neutral surface as above — bold's high-contrast signal
     is the mic icon color below and the recording pill (index.css, recording
     rules), not this idle surface. */
  .flow-dock-panel.flow-dock-panel--bold {
  }

  /* minimal: transparent, hairline border, no shadow/blur. */
  .flow-dock-panel.flow-dock-panel--minimal {
    background: transparent;
    border: 1px solid rgba(0, 0, 0, 0.12);
    box-shadow: none;
  }
  .dark .flow-dock-panel.flow-dock-panel--minimal {
    border-color: rgba(255, 255, 255, 0.14);
  }
  ```

- [ ] **Step 2: Add `.flow-dock-mic--*` modifiers (idle mic button)**

  Insert immediately after the existing `.dark .flow-dock-mic:hover { ... }` block (after line 901, before the `/* Recording: ... */` comment):
  ```css
  /* Pill Style — idle mic icon color per style. Background/border stay the
     existing translucent gradient (already glass-like) for all 4 styles
     except minimal; only the icon color (and minimal's fill) change. */
  .flow-dock-mic.flow-dock-mic--glass {
    color: #6d4fe0;
  }
  .dark .flow-dock-mic.flow-dock-mic--glass {
    color: #b8a8f5;
  }

  /* flat: matches the unmodified .flow-dock-mic rule above — no override. */
  .flow-dock-mic.flow-dock-mic--flat {
  }

  .flow-dock-mic.flow-dock-mic--bold {
    color: #1c1a17;
  }
  .dark .flow-dock-mic.flow-dock-mic--bold {
    color: #f4f1ea;
  }

  .flow-dock-mic.flow-dock-mic--minimal {
    background: transparent;
    border: 1px solid rgba(0, 0, 0, 0.12);
    box-shadow: none;
    color: #6b6558;
  }
  .dark .flow-dock-mic.flow-dock-mic--minimal {
    border-color: rgba(255, 255, 255, 0.14);
    color: #9b9587;
  }
  ```

- [ ] **Step 3: Test (manual)**

  Deferred to Task 12 (no className wiring exists yet until Task 10) — CSS-only, verify via `npm run dev` + devtools by manually adding `flow-dock-panel--glass`/`flow-dock-mic--glass` etc. to the elements in the inspector.

- [ ] **Step 4: Commit**
```bash
git add src/index.css
git commit -m "$(cat <<'EOF'
Add Pill Style CSS modifiers for idle dock panel + mic button

glass/flat/bold/minimal variants for .flow-dock-panel and .flow-dock-mic.
flat is Task 8's already-solid baseline verbatim; glass is the one
deliberate, opt-in exception to the solid-surface rule, documented inline.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014DwW4vCvBtSDLejqtWwHPN
EOF
)"
```

---

### Task 8: CSS — recording states per style (`.flow-dock-mic--recording`, `.flow-bar-pill--command`)

**Files:**
- Modify: `src/index.css:905-983` (append new rules + new keyframe after the existing recording-pill block)

**Interfaces:**
- Consumes: nothing (pure CSS; classes applied by Task 10).
- Produces: CSS classes + `flow-pill-breathe` keyframe, consumed by Task 10.

- [ ] **Step 1: Add the `flow-pill-breathe` keyframe and recording modifiers**

  Insert immediately after the existing `@keyframes pill-breath { ... }` block (after line 983, before the `/* Secondary icons ... */` comment for `.flow-dock-icon`):
  ```css
  @keyframes flow-pill-breathe {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.03);
    }
  }

  /* Pill Style — recording pill per style. Compound selectors
     (.flow-dock-mic--recording.flow-dock-mic--recording--X) deliberately
     match the existing rules' specificity (two classes) so these reliably
     win the cascade over .dark .flow-dock-mic--recording and
     .flow-dock-mic--recording.flow-bar-pill--command above, regardless of
     theme or command mode. */
  .flow-dock-mic--recording.flow-dock-mic--recording--glass {
    background: rgba(109, 79, 224, 0.55) !important;
    backdrop-filter: blur(12px) saturate(150%);
    -webkit-backdrop-filter: blur(12px) saturate(150%);
    border: 1px solid rgba(255, 255, 255, 0.45) !important;
    border-top-color: rgba(255, 255, 255, 0.85) !important;
    box-shadow:
      0 8px 22px rgba(109, 79, 224, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.5);
    animation:
      flow-pill-spring 380ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
      flow-pill-breathe 2.6s ease-in-out infinite;
  }

  /* flat: matches the unmodified .flow-dock-mic--recording rule above
     (Task 8/f344dfb1's solidified values) — empty ruleset kept as an
     explicit anchor. No breathing pulse — keeps only flow-pill-spring. */
  .flow-dock-mic--recording.flow-dock-mic--recording--flat {
  }

  .flow-dock-mic--recording.flow-dock-mic--recording--bold {
    background: #f5a94a !important;
    border: none !important;
    box-shadow: none !important;
    color: #1c1a17 !important;
  }
  .flow-dock-mic--recording.flow-dock-mic--recording--bold.flow-bar-pill--command {
    background: #6d4fe0 !important;
    color: #fff !important;
  }

  .flow-dock-mic--recording.flow-dock-mic--recording--minimal {
    background: transparent !important;
    border: 2px solid #6d4fe0 !important;
    box-shadow: none !important;
    color: #6d4fe0 !important;
  }
  .dark .flow-dock-mic--recording.flow-dock-mic--recording--minimal {
    border-color: #8b6ef0 !important;
    color: #8b6ef0 !important;
  }
  .flow-dock-mic--recording.flow-dock-mic--recording--minimal::after {
    content: "";
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: #e0524d;
    z-index: 1;
  }
  ```
  (`.flow-dock-mic--recording` already has `position: relative; overflow: hidden` — verified at `index.css:860-876` via the shared `.flow-dock-mic` base rule it inherits classes from — the `::after` dot needs `overflow: hidden` NOT clipping it, i.e. this must render inside the pill, not outside; since `top: 8px` / `left: 50%` positions it inside the 48×128px pill's bounds, `overflow: hidden` on the parent is fine and won't clip it.)

- [ ] **Step 2: Test (manual)**

  Deferred to Task 12 (no className wiring until Task 10).

- [ ] **Step 3: Commit**
```bash
git add src/index.css
git commit -m "$(cat <<'EOF'
Add Pill Style CSS modifiers for the recording pill + command mode

glass gets a slow breathing pulse (new flow-pill-breathe keyframe, additive
to the existing entrance spring); bold swaps to solid amber/purple with no
blur or glow; minimal drops the fill entirely for a bordered outline plus a
small recording dot. flat is the existing solid baseline, unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014DwW4vCvBtSDLejqtWwHPN
EOF
)"
```

---

### Task 9: CSS — processing pill + transform menu card + idle handle per style

**Files:**
- Modify: `src/index.css:1045-1062` (append after `.flow-pill-h` block)
- Modify: `src/index.css:794-820` (append after `.flow-dock-handle` block)
- Modify: `src/index.css` (new `.flow-transform-menu` rules, appended near the other flow-* blocks)

**Interfaces:**
- Consumes: nothing new.
- Produces: CSS classes `flow-pill-h--*`, `flow-dock-handle--*`, `flow-transform-menu--*`,
  consumed by Task 10 (which applies the matching classNames in `App.jsx`, including the
  transform-menu card's — CSS-only here deliberately, so this task never references the
  `flowBarPillStyle` JS variable Task 10 Step 1 declares; keeps every task's commit in a
  working state on its own).

- [ ] **Step 1: `.flow-pill-h--*` modifiers**

  Insert immediately after the existing `.dark .flow-pill-h { ... }` block (after line 1062, before the `/* Label pill ... */` comment):
  ```css
  /* Pill Style — processing/status pill. Neutral surface like the idle dock
     (C1), not the active recording pill — no bold color-block, no breathing
     pulse. */
  .flow-pill-h.flow-pill-h--glass {
    background: rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(12px) saturate(150%);
    -webkit-backdrop-filter: blur(12px) saturate(150%);
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-top-color: rgba(255, 255, 255, 0.8);
    box-shadow:
      0 6px 18px rgba(0, 0, 0, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.55);
  }
  .dark .flow-pill-h.flow-pill-h--glass {
    background: rgba(30, 28, 38, 0.35);
    border-color: rgba(255, 255, 255, 0.14);
    border-top-color: rgba(255, 255, 255, 0.32);
    box-shadow:
      0 6px 18px rgba(0, 0, 0, 0.35),
      inset 0 1px 0 rgba(255, 255, 255, 0.55);
  }

  /* flat: matches the unmodified .flow-pill-h rule above — no override. */
  .flow-pill-h.flow-pill-h--flat {
  }

  .flow-pill-h.flow-pill-h--bold {
    background: var(--color-surface-2);
    border: 1px solid rgba(0, 0, 0, 0.15);
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.2);
  }
  .dark .flow-pill-h.flow-pill-h--bold {
    background: var(--color-flow-surface-dark);
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.35);
  }

  .flow-pill-h.flow-pill-h--minimal {
    background: transparent;
    border: 1px solid rgba(0, 0, 0, 0.12);
    box-shadow: none;
  }
  .dark .flow-pill-h.flow-pill-h--minimal {
    border-color: rgba(255, 255, 255, 0.14);
  }
  ```

- [ ] **Step 2: `.flow-dock-handle--*` modifiers**

  Insert immediately after the existing `.dark .flow-dock-handle:hover { ... }` block (after line 820, before the `/* Rounded vertical panel ... */` comment):
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

- [ ] **Step 3: Transform menu card CSS**

  This adds only the CSS classes. The `App.jsx` transform-menu `<div>` gets its
  `flow-transform-menu flow-transform-menu--${flowBarPillStyle}` base class added in Task 10
  (which also declares the `flowBarPillStyle` variable) — keeping this task CSS-only means
  it never references a JS variable that doesn't exist yet, so the branch stays in a working
  state after this commit.

  Insert after the `.flow-dock-handle--*` block from Step 2 above (or anywhere in the flow-*
  section; placement relative to the Tailwind utility classes doesn't matter since
  Tailwind's own rules live in a separate generated stylesheet loaded before `index.css`'s
  custom rules):
  ```css
  /* Pill Style — transform menu card. The existing bg-white/dark:bg-neutral-900
     Tailwind utilities ARE the flat look already; these modifiers override
     them with !important for the other 3 styles (same technique the
     recording-pill rules above already use for state overrides). */
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

  /* flat: matches the existing Tailwind bg-white/dark:bg-neutral-900 utility
     classes already on this element — no override needed. */
  .flow-transform-menu.flow-transform-menu--flat {
  }

  .flow-transform-menu.flow-transform-menu--bold {
    background: var(--color-surface-2) !important;
    border-color: rgba(0, 0, 0, 0.15) !important;
  }
  .dark .flow-transform-menu.flow-transform-menu--bold {
    background: var(--color-flow-surface-dark) !important;
    border-color: rgba(255, 255, 255, 0.08) !important;
  }

  .flow-transform-menu.flow-transform-menu--minimal {
    background: transparent !important;
    border-color: rgba(0, 0, 0, 0.12) !important;
    box-shadow: none !important;
  }
  .dark .flow-transform-menu.flow-transform-menu--minimal {
    border-color: rgba(255, 255, 255, 0.14) !important;
  }
  ```

- [ ] **Step 4: Test (manual)**

  Deferred to Task 12.

- [ ] **Step 5: Commit**
```bash
git add src/index.css
git commit -m "$(cat <<'EOF'
Add Pill Style CSS modifiers for the processing pill, transform menu, and handle

Extends the C1 neutral-surface language to .flow-pill-h, .flow-dock-handle,
and a new flow-transform-menu class (App.jsx wiring lands in the next task,
alongside the rest of the flowBarPillStyle className plumbing) — direct,
low-risk extrapolation of the already-locked idle-dock treatment.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014DwW4vCvBtSDLejqtWwHPN
EOF
)"
```

---

### Task 10: Wire `flowBarPillStyle` into `App.jsx` className logic

**Files:**
- Modify: `src/App.jsx:276-281` (store selectors), `:601,634,664,687,723,795-798` (className additions)

**Interfaces:**
- Consumes: `flowBarPillStyle` from Task 6's store; CSS classes from Tasks 7-9.
- Produces: fully wired Pill Style feature (idle + recording + processing + menu all respond to the setting).

- [ ] **Step 1: Read the setting**

  Current (lines 276-281):
  ```jsx
    const floatingIconAutoHide = useSettingsStore((s) => s.floatingIconAutoHide);
    const voiceVisualizerStyle = useSettingsStore((s) => s.voiceVisualizerStyle);
    const polishKey = useSettingsStore((s) => s.polishKey);
    const prevAutoHideRef = useRef(floatingIconAutoHide);
    const showStreamingPreview = useSettingsStore((s) => s.showStreamingPreview);
    const autoPasteEnabled = useSettingsStore((s) => s.autoPasteEnabled);
  ```
  becomes:
  ```jsx
    const floatingIconAutoHide = useSettingsStore((s) => s.floatingIconAutoHide);
    const voiceVisualizerStyle = useSettingsStore((s) => s.voiceVisualizerStyle);
    const flowBarPillStyle = useSettingsStore((s) => s.flowBarPillStyle);
    const polishKey = useSettingsStore((s) => s.polishKey);
    const prevAutoHideRef = useRef(floatingIconAutoHide);
    const showStreamingPreview = useSettingsStore((s) => s.showStreamingPreview);
    const autoPasteEnabled = useSettingsStore((s) => s.autoPasteEnabled);
  ```

- [ ] **Step 2: Processing/status pill (line 601)**

  Current:
  ```jsx
          <div className="flow-pill-h mr-1.5">
  ```
  becomes:
  ```jsx
          <div className={`flow-pill-h flow-pill-h--${flowBarPillStyle} mr-1.5`}>
  ```

- [ ] **Step 3: Idle collapsed handle (line 634)**

  Current:
  ```jsx
            className="flow-dock-handle"
  ```
  (in the `<div className="flow-dock-handle" role="button" ...>` block) becomes:
  ```jsx
            className={`flow-dock-handle flow-dock-handle--${flowBarPillStyle}`}
  ```

- [ ] **Step 4: Recording mic button (line 664)**

  Current:
  ```jsx
                className={`flow-dock-mic flow-dock-mic--recording ${micStateClass} relative flex items-center justify-center`}
  ```
  becomes:
  ```jsx
                className={`flow-dock-mic flow-dock-mic--recording flow-dock-mic--recording--${flowBarPillStyle} ${micStateClass} relative flex items-center justify-center`}
  ```
  (`micStateClass` already contributes `flow-bar-pill--command` when in command mode — Task 8's `.flow-dock-mic--recording.flow-dock-mic--recording--bold.flow-bar-pill--command` compound selector depends on this class also being present on the same element, which it is.)

- [ ] **Step 5: Idle expanded dock panel (line 687) + idle mic button (line 723)**

  Current (line 687):
  ```jsx
            <div className="flow-dock-panel">
  ```
  becomes:
  ```jsx
            <div className={`flow-dock-panel flow-dock-panel--${flowBarPillStyle}`}>
  ```

  Current (line 723):
  ```jsx
                  className="flow-dock-mic"
  ```
  (in the idle mic `<button>`) becomes:
  ```jsx
                  className={`flow-dock-mic flow-dock-mic--${flowBarPillStyle}`}
  ```

- [ ] **Step 6: Transform menu card (line 795-798)**

  Current:
  ```jsx
              <div
                ref={menuRef}
                className="absolute right-full bottom-0 mr-2 w-64 rounded-2xl bg-white border border-black/10 py-2 text-neutral-900 shadow-2xl shadow-black/10 dark:bg-neutral-900 dark:border-white/10 dark:text-neutral-100 animate-menu-in"
  ```
  becomes:
  ```jsx
              <div
                ref={menuRef}
                className={`flow-transform-menu flow-transform-menu--${flowBarPillStyle} absolute right-full bottom-0 mr-2 w-64 rounded-2xl bg-white border border-black/10 py-2 text-neutral-900 shadow-2xl shadow-black/10 dark:bg-neutral-900 dark:border-white/10 dark:text-neutral-100 animate-menu-in`}
  ```
  (`flowBarPillStyle` is declared in Step 1 above, earlier in this same task, so this
  reference is valid the moment this task's commit lands — `flow-transform-menu--*` CSS
  already exists from Task 9.)

- [ ] **Step 7: Test (manual)**

  `npm run dev`. In devtools console: `useSettingsStore.getState().setFlowBarPillStyle("flat")` / `"bold"` / `"minimal"` / `"glass"` and observe the Flow Bar (hover to expand, start a recording, trigger the transform menu, trigger a transform to see the processing pill) update live for each style, in both light and dark theme.

- [ ] **Step 8: Commit**
```bash
git add src/App.jsx
git commit -m "$(cat <<'EOF'
Wire flowBarPillStyle into the Flow Bar's className logic

All 5 states (handle, panel, idle mic, recording mic, processing pill) plus
the transform menu now read the setting and apply the matching modifier
class, mirroring the existing micStateClass branching pattern.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014DwW4vCvBtSDLejqtWwHPN
EOF
)"
```

---

### Task 11: "Pill Appearance" settings section UI

**Files:**
- Modify: `src/components/SettingsPage.tsx:770-780` (destructure), `:1751-1754` (new section, appended after Voice Overlay Settings, same `appearance` case)
- Modify: `src/locales/{en,es,fr,de,pt,it,ru,zh-CN,zh-TW}/translation.json`

**Interfaces:**
- Consumes: `flowBarPillStyle`/`setFlowBarPillStyle` from Task 6 (via `useSettings()`), same `appearance` case as the existing "Voice Overlay Pill" section this mirrors.
- Produces: nothing for later tasks (final UI surface).

- [ ] **Step 1: Destructure the new setting**

  Locate the `useSettings()` destructure in `SettingsPage.tsx` (same block edited in Task 1 Step 4). Current context around `voiceVisualizerStyle` (verify exact line by re-reading the file at execution time, since Task 1 shifts line numbers below it):
  ```tsx
      voiceVisualizerStyle,
      setVoiceVisualizerStyle,
  ```
  Add immediately after:
  ```tsx
      voiceVisualizerStyle,
      setVoiceVisualizerStyle,
      flowBarPillStyle,
      setFlowBarPillStyle,
  ```

- [ ] **Step 2: Add the "Pill Appearance" section**

  In the `case "appearance":` block, current end of the Voice Overlay Settings section (lines 1751-1754):
  ```tsx
              </SettingsPanel>
            </div>


          </div>
        );
  ```
  becomes:
  ```tsx
              </SettingsPanel>
            </div>

            {/* Pill Appearance — separate section from Voice Overlay Pill above
                (that controls the in-pill visualizer animation; this controls
                the pill's surface treatment). Same grid-of-live-preview-buttons
                pattern as Voice Overlay Pill. */}
            <div>
              <SectionHeader
                title={t("settingsPage.general.pillAppearance.title", {
                  defaultValue: "Pill Appearance",
                })}
                description={t("settingsPage.general.pillAppearance.description", {
                  defaultValue: "Choose how the floating Flow Bar looks",
                })}
              />
              <SettingsPanel>
                <SettingsPanelRow>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full">
                    {(
                      [
                        { id: "glass", labelKey: "glass", defaultLabel: "Glass" },
                        { id: "flat", labelKey: "flat", defaultLabel: "Flat" },
                        { id: "bold", labelKey: "bold", defaultLabel: "Bold" },
                        { id: "minimal", labelKey: "minimal", defaultLabel: "Minimal" },
                      ] as const
                    ).map((style) => {
                      const isSelected = flowBarPillStyle === style.id;
                      return (
                        <button
                          key={style.id}
                          onClick={() => setFlowBarPillStyle(style.id)}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border-[1.5px] transition-all duration-200 shadow-sm outline-none group ${
                            isSelected
                              ? "border-primary bg-primary/5 ring-2 ring-primary/20 scale-[1.02]"
                              : "border-border hover:border-border-hover bg-card scale-100"
                          }`}
                        >
                          <div className="flex items-center justify-center h-[70px] w-full mb-2 pointer-events-none">
                            <div
                              className={`flow-dock-panel flow-dock-panel--${style.id} flex items-center justify-center w-14 h-14`}
                            >
                              <div className={`flow-dock-mic flow-dock-mic--${style.id} w-8 h-8`}>
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                                </svg>
                              </div>
                            </div>
                          </div>
                          <span
                            className={`text-[11px] font-medium transition-colors ${isSelected ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}
                          >
                            {t(`settingsPage.general.pillAppearance.${style.labelKey}`, {
                              defaultValue: style.defaultLabel,
                            })}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </SettingsPanelRow>
              </SettingsPanel>
            </div>

          </div>
        );
  ```
  This live-previews each style by reusing the real `.flow-dock-panel--{style}`/`.flow-dock-mic--{style}` CSS classes from Tasks 7-9 at a smaller scale (`w-14 h-14`/`w-8 h-8`), rather than building separate mock components the way the visualizer picker does (that picker needs real animated components since the differentiator IS animation; here the differentiator is static surface treatment, so reusing the actual CSS classes at small size is both simpler and guaranteed to stay visually in sync with the real Flow Bar).

- [ ] **Step 3: i18n — add `pillAppearance` keys to all 9 locale files**

  `src/locales/en/translation.json` — add a new sibling object inside `settingsPage.general`, next to `appearance` (after the `appearance` block closes at line 1583, before `floatingIcon`):
  ```json
        "appearance": {
          "auto": "Auto",
          ...
          "resetAccent": "Reset to palette default"
        },
        "pillAppearance": {
          "title": "Pill Appearance",
          "description": "Choose how the floating Flow Bar looks",
          "glass": "Glass",
          "flat": "Flat",
          "bold": "Bold",
          "minimal": "Minimal"
        },
        "floatingIcon": {
  ```

  Apply the same 6-key object to the other 8 locale files at their `settingsPage.general.appearance` anchor (confirmed present at: es/fr 1427, de/it/ru/zh-CN/zh-TW 1379, pt 1358 — insert `pillAppearance` as the next sibling key after `appearance` closes, same position as en relative to `floatingIcon`):
  - es: `{"title": "Apariencia de la píldora", "description": "Elige el aspecto de la barra flotante Flow Bar", "glass": "Cristal", "flat": "Plano", "bold": "Audaz", "minimal": "Minimalista"}`
  - fr: `{"title": "Apparence de la pilule", "description": "Choisissez l'apparence de la barre flottante Flow Bar", "glass": "Verre", "flat": "Plat", "bold": "Audacieux", "minimal": "Minimaliste"}`
  - de: `{"title": "Aussehen der Pille", "description": "Wähle, wie die schwebende Flow Bar aussieht", "glass": "Glas", "flat": "Flach", "bold": "Kräftig", "minimal": "Minimal"}`
  - pt: `{"title": "Aparência da pílula", "description": "Escolha a aparência da barra flutuante Flow Bar", "glass": "Vidro", "flat": "Plano", "bold": "Arrojado", "minimal": "Minimalista"}`
  - it: `{"title": "Aspetto della pillola", "description": "Scegli l'aspetto della barra flottante Flow Bar", "glass": "Vetro", "flat": "Piatto", "bold": "Deciso", "minimal": "Minimal"}`
  - ru: `{"title": "Оформление панели", "description": "Выберите внешний вид плавающей панели Flow Bar", "glass": "Стекло", "flat": "Плоский", "bold": "Смелый", "minimal": "Минимальный"}`
  - zh-CN: `{"title": "胶囊外观", "description": "选择悬浮 Flow Bar 的外观", "glass": "玻璃", "flat": "平面", "bold": "醒目", "minimal": "极简"}`
  - zh-TW: `{"title": "膠囊外觀", "description": "選擇浮動 Flow Bar 的外觀", "glass": "玻璃", "flat": "平面", "bold": "醒目", "minimal": "極簡"}`

  Read each file's `settingsPage.general.appearance` closing brace at execution time to confirm exact insertion point before editing (line numbers above are from the initial grep pass and may drift slightly file-to-file).

- [ ] **Step 4: Test (manual)**

  `npm run dev` → Settings → Appearance → new "Pill Appearance" section below "Voice Overlay Pill", 4 buttons each showing a small live rendering of that style's dock panel + mic icon. Click each, confirm selection ring updates and the actual Flow Bar (visible behind/around the settings window, or by closing Settings) changes to match.

- [ ] **Step 5: Commit**
```bash
git add src/components/SettingsPage.tsx src/locales/*/translation.json
git commit -m "$(cat <<'EOF'
Add Pill Appearance settings section (Glass/Flat/Bold/Minimal picker)

Same grid-of-live-preview-buttons pattern as the existing Voice Overlay
Pill visualizer picker, but reuses the real flow-dock-panel/flow-dock-mic
CSS classes at small scale instead of separate mock components, since the
differentiator here is static surface treatment, not animation.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014DwW4vCvBtSDLejqtWwHPN
EOF
)"
```

---

### Task 12: Manual verification — Part C Flow Bar redesign complete

**Files:** none (verification only)

**Interfaces:**
- Consumes: Tasks 6-11's full Pill Style feature.
- Produces: sign-off before merging.

- [ ] **Step 1: Manual verification checklist**

  `npm run dev`. For each of the 4 styles (select via Settings → Appearance → Pill Appearance), in both light and dark theme:

  1. **Idle handle** (mouse away from the dock): confirm the 7×40px sliver renders per-style (glass: translucent+blurred; flat: solid, unchanged from before this spec; bold: same as flat; minimal: transparent with hairline border).
  2. **Idle expanded dock** (hover): confirm `.flow-dock-panel` background/border/blur matches the style, and the mic icon color matches (glass: purple `#6d4fe0`/`#b8a8f5`; flat: unchanged ink/white; bold: ink `#1c1a17`/cream `#f4f1ea`; minimal: gray `#6b6558`/`#9b9587` with transparent fill).
  3. **Recording (normal dictation)**: confirm the pill matches the style — glass shows a slow breathing pulse (~2.6s) on top of the entrance spring; flat is unchanged solid dark; bold is solid amber `#f5a94a` with dark-ink icon, no glow, no pulse; minimal is transparent with a 2px purple border and a small red dot, no fill change.
  4. **Recording (command mode — trigger via whatever addresses the named agent)**: confirm `.flow-bar-pill--command` still layers correctly for glass/flat/minimal (unaffected per spec — amber gradient/solid dark/purple-border render as they did for normal recording, just with the command visualizer/amber accent still present via the pre-existing `.flow-dock-mic--recording.flow-bar-pill--command` rule), and specifically confirm bold inverts to solid purple `#6d4fe0` with white text/icon (the one style with an explicit command-mode color swap).
  5. **Processing/status pill** (trigger a transform run): confirm `.flow-pill-h` matches the style per the C1-equivalent neutral treatment (no bold color-block, no pulse, in any style).
  6. **Transform menu card** (click the sparkle's chevron to open it): confirm the card's background/border matches the style.
  7. **Visualizer independence**: with each of the 6 visualizer styles selected (Voice Overlay Pill section) crossed with each of the 4 pill styles, confirm the visualizer renders unaffected on top of whichever pill background is active (visualizer selection is unrelated and untouched).
  8. **Window footprint**: confirm no visible change in window size/position behavior across styles — `WINDOW_SIZES`/`resizeMainWindow` logic is untouched, this is a surface-only redesign.
  9. **Default**: confirm a fresh profile (or `localStorage.removeItem("flowBarPillStyle")` + reload) defaults to `"glass"`.