import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Kbd } from "./ui/Kbd";
import HotkeyInput from "./ui/HotkeyInput";
import PromoBanner, { BetaBadge } from "./ui/PromoBanner";
import { Toggle } from "./ui/toggle";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { useToast } from "./ui/useToast";
import { useHotkeyRegistration } from "../hooks/useHotkeyRegistration";
import { useSettingsStore } from "../stores/settingsStore";
import { formatHotkeyLabel } from "../utils/hotkeys";
import TransformPreviewDialog from "./TransformPreviewDialog";
import TransformDetailView from "./TransformDetailView";
import { TRANSFORMS_DEFAULTS_URL } from "../config/constants";
import {
  BUNDLED_DEFAULTS,
  BUILTIN_POLISH_ID,
  resolveDefaults,
  loadCustoms,
  saveCustoms,
  mergeTransforms,
  applyBuiltinOverrides,
  type Transform,
} from "../config/transforms/loadEffectiveTransforms";

const OPT_IN_KEY = "transformsOptIn";

interface TransformCardProps {
  transform: Transform;
  onShortcutChange: (transform: Transform, hotkey: string) => void;
  onRemove: (transform: Transform) => void;
  onOpenPreview: () => void;
}

// Its own component so each custom card can independently call
// useHotkeyRegistration (a per-transform hotkey needs a per-transform hook
// instance) — hooks can't be called conditionally inside the parent's .map().
function TransformCard({ transform, onShortcutChange, onRemove, onOpenPreview }: TransformCardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  // Polish mirrors the existing Settings Polish hotkey rather than owning
  // its own; the other builtin (Prompt Engineer) is fixed at Win+Alt+2 —
  // neither is customizable here, only user-created transforms are.
  const polishKey = useSettingsStore((s) => s.polishKey);

  const { registerHotkey, isRegistering } = useHotkeyRegistration({
    onSuccess: (hotkey) => onShortcutChange(transform, hotkey),
    showSuccessToast: false,
    showErrorToast: true,
    showAlert: (opts) => toast(opts),
    registerFn: (hotkey) =>
      window.electronAPI?.registerTransformHotkey?.(transform.id, hotkey) ??
      Promise.resolve({ success: false }),
  });

  const displayShortcut =
    transform.id === BUILTIN_POLISH_ID ? polishKey || transform.shortcut || "" : transform.shortcut || "";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenPreview}
      onKeyDown={(e) => e.key === "Enter" && onOpenPreview()}
      className="group relative rounded-xl border border-border bg-card p-4 flex flex-col gap-2 text-left cursor-pointer hover:bg-muted/40 transition-colors"
    >
      {!transform.builtin && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(transform);
          }}
          aria-label={t("transforms.remove", { name: transform.name })}
          className="absolute top-3 right-3 p-1 text-foreground/25 hover:text-destructive/70 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 size={12} />
        </button>
      )}
      <p className="text-sm font-semibold text-foreground pr-5">{transform.name}</p>
      <p className="text-xs text-muted-foreground line-clamp-2">{transform.prompt}</p>
      {transform.builtin ? (
        displayShortcut && (
          <div className="flex items-center gap-1 mt-1">
            {formatHotkeyLabel(displayShortcut)
              .split("+")
              .map((key) => (
                <Kbd key={key} className="text-[10px] px-1.5 py-0.5">
                  {key}
                </Kbd>
              ))}
          </div>
        )
      ) : (
        <div onClick={(e) => e.stopPropagation()} className="mt-1 w-[150px]">
          <HotkeyInput
            value={transform.shortcut || ""}
            onChange={(hotkey) => void registerHotkey(hotkey)}
            onClear={() => {
              window.electronAPI?.registerTransformHotkey?.(transform.id, "");
              onShortcutChange(transform, "");
            }}
            disabled={isRegistering}
          />
        </div>
      )}
    </div>
  );
}

export default function TransformsView() {
  const { t } = useTranslation();
  const [defaults, setDefaults] = useState<Transform[]>(BUNDLED_DEFAULTS);
  const [customs, setCustoms] = useState<Transform[]>(loadCustoms);
  const [optIn, setOptIn] = useState(() => localStorage.getItem(OPT_IN_KEY) === "true");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");

  // Refreshes defaults from TRANSFORMS_DEFAULTS_URL (at most once/day, with a
  // bundled + cached fallback) so new/updated defaults can ship without an
  // app release. See src/config/transforms/loadEffectiveTransforms.ts.
  useEffect(() => {
    resolveDefaults(TRANSFORMS_DEFAULTS_URL).then(setDefaults);
  }, []);

  useEffect(() => {
    saveCustoms(customs);
  }, [customs]);

  useEffect(() => {
    localStorage.setItem(OPT_IN_KEY, String(optIn));
  }, [optIn]);

  // detailId in deps: re-apply overrides after the detail page edits them.
  const transforms = useMemo(
    () => mergeTransforms(applyBuiltinOverrides(defaults), customs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaults, customs, detailId]
  );

  const canCreate = name.trim() && prompt.trim();

  const handleCreate = () => {
    if (!canCreate) return;
    setCustoms([
      ...customs,
      { id: `custom-${Date.now()}`, name: name.trim(), prompt: prompt.trim(), builtin: false },
    ]);
    setName("");
    setPrompt("");
    setDialogOpen(false);
  };

  // Defaults (Polish, Prompt Engineer) aren't removable — only customs reach
  // this handler (their card is the only one with a remove button).
  const handleRemove = (tr: Transform) => {
    if (tr.shortcut) window.electronAPI?.registerTransformHotkey?.(tr.id, "");
    setCustoms(customs.filter((c) => c.id !== tr.id));
  };

  // Only reached for customs (builtins render a static Kbd display, not a
  // HotkeyInput, so onShortcutChange never fires for them).
  const handleShortcutChange = (tr: Transform, hotkey: string) => {
    setCustoms(customs.map((c) => (c.id === tr.id ? { ...c, shortcut: hotkey || undefined } : c)));
  };

  // Builtin detail page (Polish / Prompt Engineer) replaces the grid.
  const detailTransform = detailId ? (defaults.find((d) => d.id === detailId) ?? null) : null;
  if (detailTransform) {
    return <TransformDetailView transform={detailTransform} onBack={() => setDetailId(null)} />;
  }

  return (
    <div className="px-5 py-4 flex flex-col gap-5">
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("transforms.create")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("transforms.namePlaceholder")}
              maxLength={60}
            />
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t("transforms.promptPlaceholder")}
              rows={4}
              className="min-h-[96px] text-sm"
            />
          </div>
          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={!canCreate}>
              {t("transforms.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransformPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} transforms={transforms} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-foreground">{t("transforms.title")}</h2>
          <BetaBadge />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{t("transforms.optIn")}</span>
          <Toggle checked={optIn} onChange={setOptIn} />
          <div className="flex items-center gap-1 h-7 px-2.5 rounded-md border border-border bg-muted/50 text-xs text-muted-foreground">
            <Kbd className="text-[10px] px-1.5 py-0.5">Win</Kbd>
            <Kbd className="text-[10px] px-1.5 py-0.5">Alt</Kbd>
            <Kbd className="text-[10px] px-1.5 py-0.5">O</Kbd>
            <span className="ml-1">{t("transforms.viewChanges")}</span>
          </div>
        </div>
      </div>

      <PromoBanner
        title={t("transforms.bannerTitle")}
        description={t("transforms.bannerDescription")}
        primaryAction={{ label: t("transforms.tryItOut"), onClick: () => setPreviewOpen(true) }}
        secondaryAction={{ label: t("transforms.howItWorks"), onClick: () => setPreviewOpen(true) }}
      />

      <div className="flex items-center justify-between">
        <h3 className="font-serif text-lg text-foreground">{t("transforms.myTransforms")}</h3>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          {t("transforms.createNew")}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {transforms.map((tr) => (
          <TransformCard
            key={tr.id}
            transform={tr}
            onShortcutChange={handleShortcutChange}
            onRemove={handleRemove}
            onOpenPreview={() => {
              // Builtins open their full config page; customs keep the
              // static preview dialog.
              if (tr.builtin) setDetailId(tr.id);
              else setPreviewOpen(true);
            }}
          />
        ))}
        <button
          onClick={() => setDialogOpen(true)}
          className="rounded-xl border border-dashed border-border bg-card/50 p-4 flex flex-col gap-2 items-start hover:bg-muted/40 transition-colors"
        >
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
            <Plus size={13} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">{t("transforms.createYourOwn")}</p>
          <p className="text-xs text-muted-foreground">{t("transforms.uploadYourOwn")}</p>
        </button>
      </div>
    </div>
  );
}
