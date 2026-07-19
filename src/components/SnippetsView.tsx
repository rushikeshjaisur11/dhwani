import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, CornerDownLeft, Pencil, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { useSettings } from "../hooks/useSettings";
import { getCachedPlatform } from "../utils/platform";
import type { Snippet } from "../utils/snippets";
import PromoBanner from "./ui/PromoBanner";

const EXAMPLE_KEYS = ["linkedin", "rewrite", "intro", "signoff"] as const;

interface EditSnippetDialogProps {
  snippet: Snippet | null;
  onOpenChange: (open: boolean) => void;
  triggerExists: (trigger: string, except: string) => boolean;
  onSave: (snippet: Snippet) => void;
}

function EditSnippetDialog({
  snippet,
  onOpenChange,
  triggerExists,
  onSave,
}: EditSnippetDialogProps) {
  const { t } = useTranslation();
  const [trigger, setTrigger] = useState("");
  const [replacement, setReplacement] = useState("");

  useEffect(() => {
    if (snippet) {
      setTrigger(snippet.trigger);
      setReplacement(snippet.replacement);
    }
  }, [snippet]);

  const trimmedTrigger = trigger.trim();
  const duplicate = !!snippet && !!trimmedTrigger && triggerExists(trimmedTrigger, snippet.trigger);
  const canSave = !!trimmedTrigger && !!replacement.trim() && !duplicate;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    onSave({ trigger: trimmedTrigger, replacement: replacement.trim() });
  }

  return (
    <Dialog open={!!snippet} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dictionary.snippets.editTitle")}</DialogTitle>
          <DialogDescription>{t("dictionary.snippets.dialogDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="snippet-trigger" className="text-xs font-medium">
              {t("dictionary.snippets.triggerLabel")}
            </Label>
            <Input
              id="snippet-trigger"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder={t("dictionary.snippets.triggerPlaceholder")}
              maxLength={80}
            />
            {duplicate && (
              <p className="text-xs text-destructive">{t("dictionary.snippets.duplicate")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="snippet-replacement" className="text-xs font-medium">
              {t("dictionary.snippets.replacementLabel")}
            </Label>
            <Textarea
              id="snippet-replacement"
              autoFocus
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder={t("dictionary.snippets.replacementPlaceholder")}
              className="min-h-[96px] text-xs"
            />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!canSave}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const renderSnippetReplacement = (text: string) => {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return parts.map((part, i) => {
    if (part.startsWith("{{") && part.endsWith("}}")) {
      return (
        <span key={i} className="px-1 py-0.5 mx-0.5 rounded bg-primary/10 text-primary font-mono text-[10px] border border-primary/20 inline-block">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
};

export default function SnippetsView() {
  const { t } = useTranslation();
  const { snippets, setSnippets } = useSettings();
  const [trigger, setTrigger] = useState("");
  const [expansion, setExpansion] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Snippet | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem("snippetsBannerDismissed") === "true"
  );
  const triggerInputRef = useRef<HTMLInputElement>(null);

  const dismissBanner = () => {
    localStorage.setItem("snippetsBannerDismissed", "true");
    setBannerDismissed(true);
  };

  const triggerExists = (value: string, except?: string) => {
    const lower = value.toLowerCase();
    const exceptLower = except?.toLowerCase();
    return snippets.some((s) => {
      const existing = s.trigger.toLowerCase();
      return existing === lower && existing !== exceptLower;
    });
  };

  const trimmedTrigger = trigger.trim();
  const duplicate = !!trimmedTrigger && triggerExists(trimmedTrigger);

  const searchQuery = trimmedTrigger.toLowerCase();
  const visibleSnippets =
    searchQuery && !panelOpen
      ? snippets.filter(
          (s) =>
            s.trigger.toLowerCase().includes(searchQuery) ||
            s.replacement.toLowerCase().includes(searchQuery)
        )
      : snippets;

  const openPanel = () => {
    if (!trimmedTrigger || duplicate) return;
    setPanelOpen(true);
  };

  const openPanelWithExample = (key: (typeof EXAMPLE_KEYS)[number]) => {
    setTrigger(t(`dictionary.snippets.examples.${key}Trigger`));
    setExpansion(t(`dictionary.snippets.examples.${key}Text`));
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setExpansion("");
    triggerInputRef.current?.focus();
  };

  const handleCreate = () => {
    setSnippets([...snippets, { trigger: trimmedTrigger, replacement: expansion.trim() }]);
    setTrigger("");
    closePanel();
  };

  const handleSaveEdit = (snippet: Snippet) => {
    setSnippets(snippets.map((s) => (s.trigger === editing?.trigger ? snippet : s)));
    setEditing(null);
  };

  const handleRemove = (removed: string) => {
    setSnippets(snippets.filter((s) => s.trigger !== removed));
  };

  const canCreate = !!trimmedTrigger && !!expansion.trim() && !duplicate;

  return (
    <div className="px-5 py-4 flex flex-col gap-3">
      <EditSnippetDialog
        snippet={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        triggerExists={triggerExists}
        onSave={handleSaveEdit}
      />

      <div className="mb-1">
        <h2 className="text-xl font-bold text-foreground">{t("dictionary.snippets.title")}</h2>
      </div>

      {!bannerDismissed && (
        <PromoBanner
          title={t("dictionary.snippets.bannerTitle")}
          description={t("dictionary.snippets.bannerDescription")}
          primaryAction={{
            label: t("dictionary.snippets.new"),
            onClick: () => triggerInputRef.current?.focus(),
          }}
          onDismiss={dismissBanner}
          className="mb-1"
        >
          <div className="mb-4 flex flex-col gap-2">
            {EXAMPLE_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => openPanelWithExample(key)}
                className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-left hover:bg-white/15 transition-colors"
              >
                <span className="shrink-0 rounded-md bg-white/15 px-2 py-1 text-xs text-white">
                  {t(`dictionary.snippets.examples.${key}Trigger`)}
                </span>
                <ArrowRight size={12} className="shrink-0 text-white/40" />
                <span className="min-w-0 flex-1 truncate text-xs text-white/60">
                  {t(`dictionary.snippets.examples.${key}Text`)}
                </span>
              </button>
            ))}
          </div>
        </PromoBanner>
      )}

      {/* ─── Add snippet ─── */}
      <div className="relative z-10">
        <Input
          ref={triggerInputRef}
          placeholder={t("dictionary.snippets.addPlaceholder")}
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") openPanel();
          }}
          maxLength={80}
          className="w-full h-9 text-[13px] pr-20 bg-surface-1 border-border/50 focus-visible:ring-primary/20 transition-all placeholder:text-foreground/30 font-medium shadow-sm"
        />
        {!panelOpen && (
          <button
            onClick={openPanel}
            disabled={!trimmedTrigger || duplicate}
            aria-label={t("dictionary.snippets.create")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-foreground/5 text-foreground/50 enabled:hover:bg-primary/15 enabled:hover:text-primary disabled:opacity-50 transition-colors"
          >
            {t("dictionary.add")}
            <CornerDownLeft size={10} className="opacity-70" />
          </button>
        )}
      </div>

      {duplicate && !panelOpen && (
        <p className="mt-1.5 text-[11px] text-destructive pl-1">{t("dictionary.snippets.duplicate")}</p>
      )}

      {/* ─── Expansion panel ─── */}
      {panelOpen && (
        <div className="rounded-xl border-[1.5px] border-primary/50 bg-card p-3 shadow-md -mt-1 relative z-20 animate-in fade-in slide-in-from-top-2 duration-200">
          {duplicate && (
            <p className="mb-2 text-[11px] text-destructive">{t("dictionary.snippets.duplicate")}</p>
          )}
          <Textarea
            autoFocus
            value={expansion}
            onChange={(e) => setExpansion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") closePanel();
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canCreate) handleCreate();
            }}
            placeholder={t("dictionary.snippets.replacementPlaceholder")}
            rows={3}
            className="min-h-[72px] resize-none border-0 shadow-none rounded-md bg-transparent p-1 text-[13px] text-foreground/80 placeholder:text-foreground/20 focus-visible:ring-0 focus-visible:ring-offset-0 outline-none leading-relaxed"
          />
          <div className="flex items-center justify-between pt-3 mt-1">
            <div className="flex items-center gap-1.5">
              <kbd className="text-[10px] px-1.5 py-0.5 rounded-md border border-border bg-muted text-muted-foreground font-mono shadow-sm">
                {getCachedPlatform() === "darwin" ? "⌘" : "Ctrl"}
              </kbd>
              <kbd className="text-[10px] px-1.5 py-0.5 rounded-md border border-border bg-muted text-muted-foreground font-mono shadow-sm">
                ⏎
              </kbd>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-[11px] px-3 text-foreground/50 hover:text-foreground" onClick={closePanel}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" className="h-7 text-[11px] px-4 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm" onClick={handleCreate} disabled={!canCreate}>
                {t("dictionary.snippets.create")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Snippet list ─── */}
      <div className="pt-2">
        {snippets.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-semibold text-foreground/70">
              {t("dictionary.snippets.title")}
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-foreground/5 text-foreground/40 text-[10px] font-medium">
              {snippets.length}
            </span>
          </div>
        )}

        {snippets.length === 0 ? (
          <div className="px-2 py-6">
            <h4 className="text-sm font-semibold text-foreground leading-snug">
              {t("dictionary.snippets.emptyTitle")}{" "}
              <span className="text-primary">{t("dictionary.snippets.emptyTitleAccent")}</span>
            </h4>
            <p className="mt-1.5 text-xs text-foreground/30 leading-relaxed">
              {t("dictionary.snippets.emptyDescription")}
            </p>
          </div>
        ) : visibleSnippets.length === 0 ? (
          <p className="py-6 text-xs text-foreground/20 text-center">
            {t("dictionary.noMatches", { word: trimmedTrigger })}
          </p>
        ) : (
          <div className="flex flex-col gap-2 mt-2">
            {visibleSnippets.map((snippet) => (
              <div
                key={snippet.trigger}
                className="group flex items-center gap-3 p-2.5 rounded-lg border border-border/40 bg-surface-1 shadow-sm hover:bg-surface-2 hover:border-primary/20 transition-all"
              >
                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-foreground/5 dark:bg-white/10 text-foreground/80 border border-border/50">
                  {snippet.trigger}
                </span>
                <span className="shrink-0 text-[10px] text-foreground/20 font-mono">→</span>
                <div className="flex-1 min-w-0 text-[13px] text-foreground/70 truncate">
                  {renderSnippetReplacement(snippet.replacement)}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 shrink-0">
                  <button
                    onClick={() => setEditing(snippet)}
                    aria-label={t("dictionary.snippets.edit", { trigger: snippet.trigger })}
                    className="p-1.5 rounded-md text-foreground/40 hover:bg-foreground/5 hover:text-foreground transition-colors"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => handleRemove(snippet.trigger)}
                    aria-label={t("dictionary.snippets.remove", { trigger: snippet.trigger })}
                    className="p-1.5 rounded-md text-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
