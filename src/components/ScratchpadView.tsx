import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Textarea } from "./ui/textarea";
import PromoBanner, { BetaBadge } from "./ui/PromoBanner";
import ToggleSwitch from "./ui/ToggleSwitch";

const STORAGE_KEY = "scratchpadContent";
const FLOW_BAR_KEY = "scratchpadAddToFlowBar";

// ponytail: localStorage-backed single scratch note. A multi-scratchpad
// system (like PersonalNotesView) can replace this if users need more than
// one, but a single persistent pad is what Wispr's Scratchpad is.
export default function ScratchpadView() {
  const { t } = useTranslation();
  const [content, setContent] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [addToFlowBar, setAddToFlowBar] = useState(
    () => localStorage.getItem(FLOW_BAR_KEY) === "true"
  );
  const [editing, setEditing] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, content);
    }, 300);
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [content]);

  useEffect(() => {
    localStorage.setItem(FLOW_BAR_KEY, String(addToFlowBar));
  }, [addToFlowBar]);

  return (
    <div className="px-5 py-4 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-foreground">{t("scratchpad.title")}</h2>
          <BetaBadge />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{t("scratchpad.addToFlowBar")}</span>
          <ToggleSwitch
            checked={addToFlowBar}
            onChange={setAddToFlowBar}
            ariaLabel={t("scratchpad.addToFlowBar")}
          />
          <button className="h-7 px-2.5 rounded-md border border-border bg-muted/50 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {t("scratchpad.enableShortcut")}
          </button>
        </div>
      </div>

      <PromoBanner
        title={t("scratchpad.bannerTitle")}
        description={t("scratchpad.bannerDescription")}
        primaryAction={{ label: t("scratchpad.startNewNote"), onClick: () => setEditing(true) }}
      />

      <div>
        <h3 className="font-serif text-lg text-foreground mb-3">{t("scratchpad.recents")}</h3>
        {editing ? (
          <Textarea
            autoFocus
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={() => !content.trim() && setEditing(false)}
            placeholder={t("scratchpad.placeholder")}
            className="min-h-[240px] resize-none text-sm leading-relaxed"
          />
        ) : content.trim() ? (
          <button
            onClick={() => setEditing(true)}
            className="w-full text-left rounded-xl border border-border bg-card p-4 text-sm text-foreground/80 line-clamp-3 hover:bg-muted/40 transition-colors"
          >
            {content}
          </button>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("scratchpad.noNotesFound")}
          </p>
        )}
      </div>
    </div>
  );
}
