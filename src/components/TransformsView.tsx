import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Kbd } from "./ui/Kbd";
import PromoBanner, { BetaBadge } from "./ui/PromoBanner";
import ToggleSwitch from "./ui/ToggleSwitch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";

const STORAGE_KEY = "customTransforms";
const OPT_IN_KEY = "transformsOptIn";

interface Transform {
  name: string;
  prompt: string;
}

function loadTransforms(): Transform[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ponytail: CRUD list of saved rewrite prompts, persisted locally. Running a
// transform against the last transcript needs a generic "process text with
// arbitrary prompt" IPC that doesn't exist yet (ReasoningService currently
// only runs the fixed cleanup/agent scopes) — that's the next wiring step.
export default function TransformsView() {
  const { t } = useTranslation();
  const [transforms, setTransforms] = useState<Transform[]>(loadTransforms);
  const [optIn, setOptIn] = useState(() => localStorage.getItem(OPT_IN_KEY) === "true");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transforms));
  }, [transforms]);

  useEffect(() => {
    localStorage.setItem(OPT_IN_KEY, String(optIn));
  }, [optIn]);

  const canCreate = name.trim() && prompt.trim();

  const handleCreate = () => {
    if (!canCreate) return;
    setTransforms([...transforms, { name: name.trim(), prompt: prompt.trim() }]);
    setName("");
    setPrompt("");
    setDialogOpen(false);
  };

  const handleRemove = (removeName: string) => {
    setTransforms(transforms.filter((tr) => tr.name !== removeName));
  };

  const handleReset = () => setTransforms([]);

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

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-foreground">{t("transforms.title")}</h2>
          <BetaBadge />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{t("transforms.optIn")}</span>
          <ToggleSwitch checked={optIn} onChange={setOptIn} ariaLabel={t("transforms.optIn")} />
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
        primaryAction={{ label: t("transforms.tryItOut"), onClick: () => setDialogOpen(true) }}
        secondaryAction={{ label: t("transforms.howItWorks"), onClick: () => {} }}
      />

      <div className="flex items-center justify-between">
        <h3 className="font-serif text-lg text-foreground">{t("transforms.myTransforms")}</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw size={11} />
            {t("transforms.resetToDefaults")}
          </button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            {t("transforms.createNew")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {transforms.map((tr) => (
          <div
            key={tr.name}
            className="group relative rounded-xl border border-border bg-card p-4 flex flex-col gap-2"
          >
            <button
              onClick={() => handleRemove(tr.name)}
              aria-label={t("transforms.remove", { name: tr.name })}
              className="absolute top-3 right-3 p-1 text-foreground/25 hover:text-destructive/70 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={12} />
            </button>
            <p className="text-sm font-semibold text-foreground">{tr.name}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{tr.prompt}</p>
          </div>
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
