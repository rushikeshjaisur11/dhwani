import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import PromoBanner from "./ui/PromoBanner";
import { cn } from "./lib/utils";

const STORAGE_KEY = "dictationStyle";
const CONTEXTS = ["personal", "work", "email", "other"] as const;
type StyleContext = (typeof CONTEXTS)[number];

const PRESET_KEYS = ["formal", "casual", "veryCasual"] as const;
type PresetKey = (typeof PRESET_KEYS)[number];

// ponytail: persists the chosen tone locally; wiring it into the cleanup
// prompt (audioManager.js / ReasoningService) is a follow-up — this view
// establishes the picker and storage the pipeline change will read from.
export default function StyleView() {
  const { t } = useTranslation();
  const [selectedByContext, setSelectedByContext] = useState<Record<StyleContext, PresetKey>>(
    () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw
          ? JSON.parse(raw)
          : { personal: "casual", work: "casual", email: "casual", other: "casual" };
      } catch {
        return { personal: "casual", work: "casual", email: "casual", other: "casual" };
      }
    }
  );

  const select = (context: StyleContext, key: PresetKey) => {
    const next = { ...selectedByContext, [context]: key };
    setSelectedByContext(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <div className="px-5 py-4 flex flex-col gap-5">
      <h2 className="text-xl font-bold text-foreground">{t("style.title")}</h2>

      <Tabs defaultValue="personal">
        <TabsList className="h-8 p-0.5 bg-transparent border-b border-border rounded-none w-full justify-start gap-1">
          {CONTEXTS.map((context) => (
            <TabsTrigger
              key={context}
              value={context}
              className="h-8 px-1 text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              {t(`style.contexts.${context}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        {CONTEXTS.map((context) => (
          <TabsContent key={context} value={context} className="mt-5 flex flex-col gap-5">
            <PromoBanner
              title={t("style.bannerTitle")}
              description={t("style.bannerDescription")}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {PRESET_KEYS.map((key) => {
                const selected = selectedByContext[context] === key;
                return (
                  <button
                    key={key}
                    onClick={() => select(context, key)}
                    className={cn(
                      "text-left rounded-2xl border-2 p-4 flex flex-col gap-3 transition-colors",
                      selected
                        ? "border-primary bg-card"
                        : "border-border bg-card hover:border-foreground/20"
                    )}
                  >
                    <div>
                      <p className="font-serif text-2xl text-foreground">
                        {t(`style.presets.${key}.label`)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t(`style.presets.${key}.description`)}
                      </p>
                    </div>
                    <div className="relative rounded-xl bg-muted/60 p-3 min-h-[90px]">
                      <p className="text-xs text-foreground/80 leading-relaxed pr-4">
                        {t(`style.presets.${key}.example`)}
                      </p>
                      <div className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-semibold text-primary">
                        J
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
