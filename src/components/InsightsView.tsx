import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Flame, Mic, Type, Gauge, CalendarDays, CalendarRange } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";

interface InsightsStats {
  totalWords: number;
  totalDictations: number;
  averageWPM: number;
  wordsToday: number;
  wordsThisWeek: number;
  dayStreak: number;
}

// ponytail: no radial WPM gauge or per-day streak heatmap — those need a
// percentile baseline and per-day history the current getInsightsStats()
// shape doesn't return. Flat stat cards until that data exists.
export default function InsightsView() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<InsightsStats | null>(null);

  useEffect(() => {
    window.electronAPI.getInsightsStats().then(setStats);
  }, []);

  const tiles = [
    { key: "averageWPM", label: t("insights.averageWPM"), value: stats?.averageWPM, icon: Gauge },
    {
      key: "totalDictations",
      label: t("insights.totalDictations"),
      value: stats?.totalDictations,
      icon: Mic,
    },
    { key: "totalWords", label: t("insights.totalWords"), value: stats?.totalWords, icon: Type },
    {
      key: "wordsToday",
      label: t("insights.wordsToday"),
      value: stats?.wordsToday,
      icon: CalendarDays,
    },
    {
      key: "wordsThisWeek",
      label: t("insights.wordsThisWeek"),
      value: stats?.wordsThisWeek,
      icon: CalendarRange,
    },
    { key: "dayStreak", label: t("insights.dayStreak"), value: stats?.dayStreak, icon: Flame },
  ];

  // ponytail: fixed milestone, not a real unlock feature — placeholder framing
  // matching the Wispr "Voice Profile" reference until a real threshold exists.
  const VOICE_PROFILE_MILESTONE_WORDS = 5000;
  const wordsTowardMilestone = Math.min(stats?.totalWords ?? 0, VOICE_PROFILE_MILESTONE_WORDS);
  const milestoneProgress = wordsTowardMilestone / VOICE_PROFILE_MILESTONE_WORDS;
  const wordsRemaining = Math.max(VOICE_PROFILE_MILESTONE_WORDS - (stats?.totalWords ?? 0), 0);

  return (
    <div className="px-5 py-4">
      <h2 className="text-xl font-bold text-foreground mb-4">{t("insights.title")}</h2>

      <Tabs defaultValue="usage">
        <TabsList className="h-8 p-0.5 bg-transparent border-b border-border rounded-none w-full justify-start gap-1">
          <TabsTrigger
            value="usage"
            className="h-8 px-1 text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            {t("insights.tabs.usage")}
          </TabsTrigger>
          <TabsTrigger
            value="voice"
            className="h-8 px-1 text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            {t("insights.tabs.voice")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="usage" className="mt-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {tiles.map(({ key, label, value, icon: Icon }) => (
              <div
                key={key}
                className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1.5"
              >
                <span className="text-3xl font-bold text-foreground tabular-nums leading-none">
                  {value ?? "–"}
                </span>
                <div className="flex items-center gap-1.5 text-muted-foreground mt-1">
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-1">
              {t("insights.voiceProfile.title", { defaultValue: "Your Voice Profile" })}
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              {t("insights.voiceProfile.description", {
                defaultValue: "Discover how you use your voice.",
              })}
            </p>
            <div className="h-1.5 rounded-full bg-[var(--color-progress-track)] overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: `${milestoneProgress * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {wordsRemaining > 0
                ? t("insights.voiceProfile.unlocksIn", {
                    defaultValue: "Unlocks in {{count}} words",
                    count: wordsRemaining,
                  })
                : t("insights.voiceProfile.unlocked", { defaultValue: "Unlocked" })}
            </p>
          </div>
        </TabsContent>

        <TabsContent value="voice" className="mt-5">
          <p className="text-sm text-muted-foreground">{t("insights.tabs.voiceComingSoon")}</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
