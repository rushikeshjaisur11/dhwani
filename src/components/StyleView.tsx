import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import PromoBanner from "./ui/PromoBanner";
import { cn } from "./lib/utils";
import { useSettingsStore } from "../stores/settingsStore";
import { 
  Briefcase, Coffee, Sparkles, MessageCircle, Send, MessageSquare, 
  Hash, Users, Video, Mail, Inbox, Mails, FileText, Layout, Globe 
} from "lucide-react";
import { Toggle } from "./ui/toggle";

const CONTEXTS = ["personal", "work", "email", "other"] as const;
type StyleContext = (typeof CONTEXTS)[number];

const PRESET_KEYS = ["formal", "casual", "veryCasual"] as const;
type PresetKey = (typeof PRESET_KEYS)[number] | "off";

const CONTEXT_LOGOS = {
  personal: [
    { slug: "whatsapp", name: "WhatsApp" },
    { slug: "telegram", name: "Telegram" },
    { slug: "discord", name: "Discord" },
    { slug: "messenger", name: "Messenger" }
  ],
  work: [
    { icon: Hash, name: "Slack" },
    { icon: Users, name: "Teams" },
    { slug: "zoom", name: "Zoom" },
    { slug: "googlemeet", name: "Meet" }
  ],
  email: [
    { slug: "gmail", name: "Gmail" },
    { icon: Mail, name: "Outlook" },
    { slug: "thunderbird", name: "Thunderbird" }
  ],
  other: [
    { slug: "googlechrome", name: "Chrome" },
    { slug: "notion", name: "Notion" },
    { slug: "obsidian", name: "Obsidian" },
    { icon: FileText, name: "Word" }
  ],
};

const PRESET_STYLES = {
  formal: {
    icon: Briefcase,
    colorClass: "text-blue-500",
    bgClass: "bg-blue-500/10",
    bgFill: "bg-blue-500",
    borderClass: "border-blue-500/30",
    glowClass: "shadow-[0_0_20px_rgba(59,130,246,0.15)]",
  },
  casual: {
    icon: Coffee,
    colorClass: "text-amber-500",
    bgClass: "bg-amber-500/10",
    bgFill: "bg-amber-500",
    borderClass: "border-amber-500/30",
    glowClass: "shadow-[0_0_20px_rgba(245,158,11,0.15)]",
  },
  veryCasual: {
    icon: Sparkles,
    colorClass: "text-pink-500",
    bgClass: "bg-pink-500/10",
    bgFill: "bg-pink-500",
    borderClass: "border-pink-500/30",
    glowClass: "shadow-[0_0_20px_rgba(236,72,153,0.15)]",
  },
};

export default function StyleView() {
  const { t } = useTranslation();
  
  const styleTonePersonal = useSettingsStore((s) => s.styleTonePersonal);
  const styleToneWork = useSettingsStore((s) => s.styleToneWork);
  const styleToneEmail = useSettingsStore((s) => s.styleToneEmail);
  const styleToneOther = useSettingsStore((s) => s.styleToneOther);
  const enableVoiceStyles = useSettingsStore((s) => s.enableVoiceStyles);
  
  const setStyleTonePersonal = useSettingsStore((s) => s.setStyleTonePersonal);
  const setStyleToneWork = useSettingsStore((s) => s.setStyleToneWork);
  const setStyleToneEmail = useSettingsStore((s) => s.setStyleToneEmail);
  const setStyleToneOther = useSettingsStore((s) => s.setStyleToneOther);
  const setEnableVoiceStyles = useSettingsStore((s) => s.setEnableVoiceStyles);

  const selectedByContext: Record<StyleContext, string> = {
    personal: styleTonePersonal,
    work: styleToneWork,
    email: styleToneEmail,
    other: styleToneOther,
  };

  const select = (context: StyleContext, key: PresetKey) => {
    switch (context) {
      case "personal": setStyleTonePersonal(key); break;
      case "work": setStyleToneWork(key); break;
      case "email": setStyleToneEmail(key); break;
      case "other": setStyleToneOther(key); break;
    }
  };

  return (
    <div className="px-5 py-4 flex flex-col gap-5 h-full">
      <div className="flex items-center justify-between pb-3 border-b border-border/40">
        <h2 className="text-xl font-bold text-foreground">{t("style.title")}</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            {enableVoiceStyles ? "Enabled" : "Disabled"}
          </span>
          <Toggle checked={enableVoiceStyles} onChange={setEnableVoiceStyles} />
        </div>
      </div>

      <div className={cn("transition-all duration-300 flex-1", !enableVoiceStyles && "opacity-40 pointer-events-none grayscale-[0.5]")}>
        <Tabs defaultValue="personal" className="h-full flex flex-col">
        <TabsList className="h-10 p-1 bg-surface-1/50 border border-border/40 rounded-xl w-full flex justify-between shadow-inner shrink-0">
          {CONTEXTS.map((context) => (
            <TabsTrigger
              key={context}
              value={context}
              className="h-8 flex-1 text-sm font-medium rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground data-[state=active]:scale-[1.02] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all duration-300 active:scale-95"
            >
              {t(`style.contexts.${context}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        {CONTEXTS.map((context) => (
          <TabsContent 
            key={context} 
            value={context} 
            className="mt-5 flex-1 flex flex-col gap-5 animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-500 ease-out fill-mode-both"
          >
            <div className="flex items-center justify-between px-1">
              <h3 className="text-lg font-bold text-foreground capitalize">
                {t(`style.contexts.${context}`)} Apps
              </h3>
              <button
                onClick={() => select(context, selectedByContext[context] === "off" ? "casual" : "off")}
                className={cn(
                  "text-xs font-semibold px-4 py-1.5 rounded-full transition-all duration-300 border",
                  selectedByContext[context] === "off"
                    ? "bg-destructive/10 text-destructive border-destructive/20 shadow-sm"
                    : "bg-surface-1/50 text-muted-foreground border-border/40 hover:bg-surface-2 hover:text-foreground"
                )}
              >
                {selectedByContext[context] === "off" ? "Styling Disabled" : "Disable for this category"}
              </button>
            </div>

            <PromoBanner
              title={t("style.bannerTitle")}
              description={t("style.bannerDescription")}
            >
              <div className="flex items-center gap-3 mt-2 mb-3">
                {CONTEXT_LOGOS[context].map((app) => (
                  <div key={app.name} className="group relative w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md shadow-sm border border-white/10 transition-transform hover:scale-110 hover:bg-white/20 cursor-default">
                    {app.slug ? (
                      <img 
                        src={`https://cdn.simpleicons.org/${app.slug}/white`} 
                        alt={app.name} 
                        className="w-5 h-5 opacity-95 pointer-events-none" 
                      />
                    ) : app.icon ? (
                      <app.icon size={18} className="text-white opacity-95" strokeWidth={2.5} />
                    ) : null}
                    {/* Tooltip */}
                    <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                      <div className="bg-foreground text-background text-[10px] font-semibold px-2 py-1 rounded shadow-lg whitespace-nowrap">
                        {app.name}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </PromoBanner>

            <div className={cn(
              "grid grid-cols-1 sm:grid-cols-3 gap-5 flex-1 transition-all duration-500",
              selectedByContext[context] === "off" && "opacity-30 pointer-events-none grayscale-[0.8]"
            )}>
              {PRESET_KEYS.map((key) => {
                const selected = selectedByContext[context] === key;
                const styleDef = PRESET_STYLES[key];
                const Icon = styleDef.icon;
                
                return (
                  <button
                    key={key}
                    onClick={() => select(context, key)}
                    className={cn(
                      "group text-left rounded-3xl border p-6 flex flex-col gap-6 transition-all duration-500 relative overflow-hidden h-full",
                      selected
                        ? cn("border-transparent scale-[1.02]", styleDef.glowClass)
                        : "border-border/40 bg-surface-1/30 hover:bg-surface-1/60 hover:scale-[1.01]"
                    )}
                  >
                    {/* Animated gradient background for selected state */}
                    <div 
                      className={cn(
                        "absolute inset-0 opacity-0 transition-opacity duration-500",
                        selected && "opacity-100",
                        styleDef.bgClass
                      )} 
                    />
                    
                    {/* Top gradient border for selected state */}
                    <div 
                      className={cn(
                        "absolute top-0 left-0 right-0 h-1 opacity-0 transition-all duration-500",
                        selected && "opacity-100",
                        styleDef.bgFill
                      )} 
                    />

                    <div className="relative z-10 flex-1 flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-500 flex-shrink-0",
                          selected ? cn(styleDef.bgClass, styleDef.colorClass, "scale-110 shadow-sm") : "bg-muted/50 text-muted-foreground group-hover:scale-105"
                        )}>
                          <Icon size={20} strokeWidth={2.5} />
                        </div>
                        <p className={cn(
                          "font-serif text-2xl transition-colors duration-300 tracking-tight",
                          selected ? styleDef.colorClass : "text-foreground group-hover:text-foreground/90"
                        )}>
                          {t(`style.presets.${key}.label`)}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 group-hover:text-foreground/70 transition-colors leading-relaxed">
                        {t(`style.presets.${key}.description`)}
                      </p>
                    </div>
                    
                    <div className={cn(
                      "relative z-10 rounded-2xl p-5 w-full min-h-[140px] flex flex-col justify-end transition-all duration-500 border flex-shrink-0 mt-auto overflow-hidden",
                      selected ? cn("bg-background/90 shadow-sm backdrop-blur-md", styleDef.borderClass) : "bg-muted/30 border-transparent group-hover:bg-muted/50"
                    )}>
                      {/* Decorative quotes watermark */}
                      <div className={cn(
                        "absolute -top-4 -left-2 text-[80px] font-serif leading-none opacity-[0.03] transition-colors duration-500",
                        selected ? styleDef.colorClass : "text-foreground"
                      )}>
                        "
                      </div>
                      
                      <p className="text-sm text-foreground/80 leading-relaxed italic relative z-10 pr-6 font-medium">
                        "{t(`style.presets.${key}.example`)}"
                      </p>
                      <div className={cn(
                        "absolute bottom-4 right-4 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500",
                        selected ? cn(styleDef.bgFill, "text-white shadow-md scale-110") : "bg-foreground/5 text-foreground/40 scale-100"
                      )}>
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
    </div>
  );
}
