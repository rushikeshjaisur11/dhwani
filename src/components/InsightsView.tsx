import { useTranslation } from "react-i18next";
import { Flame } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import RadialGauge from "./ui/RadialGauge";
import StreakHeatmap from "./ui/StreakHeatmap";
import { useInsightsStats } from "../hooks/useInsightsStats";

export default function InsightsView() {
  const { t } = useTranslation();
  const { stats } = useInsightsStats();

  const wpm = stats?.averageWPM ?? 0;
  const best = Math.max(stats?.personalBestWPM ?? 0, wpm);
  const pctOfBest = best > 0 ? Math.round((wpm / best) * 100) : 0;

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

        <TabsContent value="usage" className="mt-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col items-center gap-1">
              <RadialGauge value={wpm} max={best || 1} />
              <span className="text-3xl font-bold text-foreground tabular-nums leading-none -mt-1">
                {wpm}
              </span>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("insights.wpmGauge.title", { defaultValue: "Words per minute" })}
              </span>
              <span className="text-[11px] text-muted-foreground mt-1">
                {t("insights.wpmGauge.best", { defaultValue: "Best: {{value}}", value: best })}
                {" · "}
                {t("insights.wpmGauge.pctOfBest", {
                  defaultValue: "{{pct}}% of best",
                  pct: pctOfBest,
                })}
              </span>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1.5 justify-center">
              <span className="text-3xl font-bold text-foreground tabular-nums leading-none">
                {stats?.fixesMade ?? "–"}
              </span>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("insights.fixes.title", { defaultValue: "Fixes made" })}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t("insights.fixes.subtitle", {
                  defaultValue: "Cleaned up automatically by Dhwani",
                })}
              </span>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1.5 justify-center">
              <span className="text-3xl font-bold text-foreground tabular-nums leading-none">
                {stats?.totalWords ?? "–"}
              </span>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("insights.totalWords")}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t("insights.totalWordsCard.subtitle", {
                  defaultValue: "{{today}} today · {{week}} this week",
                  today: stats?.wordsToday ?? 0,
                  week: stats?.wordsThisWeek ?? 0,
                })}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5" />
                  {t("insights.streak.title", {
                    defaultValue: "{{count}} day streak",
                    count: stats?.dayStreak ?? 0,
                  })}
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  {t("insights.streak.longest", {
                    defaultValue: "Longest: {{count}} days",
                    count: stats?.longestStreak ?? 0,
                  })}
                </span>
              </div>
              <StreakHeatmap dailyActivity={stats?.dailyActivity ?? []} />
            </div>

            {stats && stats.appUsage.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    {t("insights.appUsage.title", { defaultValue: "Desktop usage" })}
                  </h3>
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    {t("insights.appUsage.totalApps", {
                      defaultValue: "{{count}} apps used",
                      count: stats.appUsage.length,
                    })}
                  </span>
                </div>
                <div className="space-y-2">
                  {stats.appUsage.slice(0, 6).map((entry) => (
                    <div key={entry.app} className="flex items-center gap-2">
                      <span className="text-xs text-foreground w-24 truncate shrink-0">
                        {entry.app}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-[var(--color-progress-track)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${entry.pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground w-9 text-right tabular-nums">
                        {entry.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="voice" className="mt-5">
          <p className="text-sm text-muted-foreground">{t("insights.tabs.voiceComingSoon")}</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
