import { useTranslation } from "react-i18next";
import { Flame } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import RadialGauge from "./ui/RadialGauge";
import StreakHeatmap from "./ui/StreakHeatmap";
import { useInsightsStats } from "../hooks/useInsightsStats";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "../hooks/useTheme";

export default function InsightsView() {
  const { t } = useTranslation();
  const { stats } = useInsightsStats();
  const { theme } = useTheme();

  const wpm = stats?.averageWPM ?? 0;
  const best = Math.max(stats?.personalBestWPM ?? 0, wpm);
  const pctOfBest = best > 0 ? Math.round((wpm / best) * 100) : 0;

  const chartColor = theme === "dark" ? "#60a5fa" : "#3b82f6"; // primary blue color

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

        <TabsContent value="usage" className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border/50 bg-surface-1 dark:bg-surface-2 p-4 flex flex-col items-center gap-1 shadow-sm transition-all hover:bg-surface-2 dark:hover:bg-surface-3">
              <RadialGauge value={wpm} max={best || 1} />
              <span className="text-3xl font-bold text-foreground tabular-nums leading-none -mt-1 drop-shadow-sm">
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

            <div className="rounded-xl border border-border/50 bg-surface-1 dark:bg-surface-2 p-4 flex flex-col gap-1.5 justify-center shadow-sm transition-all hover:bg-surface-2 dark:hover:bg-surface-3">
              <span className="text-3xl font-bold text-foreground tabular-nums leading-none drop-shadow-sm">
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

            <div className="rounded-xl border border-border/50 bg-surface-1 dark:bg-surface-2 p-4 flex flex-col gap-1.5 justify-center shadow-sm transition-all hover:bg-surface-2 dark:hover:bg-surface-3">
              <span className="text-3xl font-bold text-foreground tabular-nums leading-none drop-shadow-sm">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border/50 bg-surface-1 dark:bg-surface-2 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 drop-shadow-sm">
                  <Flame className="w-3.5 h-3.5 text-orange-500" />
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
              <div className="rounded-xl border border-border/50 bg-surface-1 dark:bg-surface-2 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground drop-shadow-sm">
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

          {stats && stats.dailyActivity.length > 0 && (
            <div className="rounded-xl border border-border/50 bg-surface-1 dark:bg-surface-2 p-4 shadow-sm h-64 mt-4">
              <h3 className="text-sm font-semibold text-foreground mb-4 drop-shadow-sm">
                {t("insights.dailyWords.title", { defaultValue: "Words Dictated Over Time" })}
              </h3>
              <ResponsiveContainer width="100%" height="85%">
                <AreaChart data={stats.dailyActivity}>
                  <defs>
                    <linearGradient id="colorWords" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="date" 
                    stroke="var(--color-border)" 
                    fontSize={10} 
                    tickFormatter={(val) => {
                      const d = new Date(val);
                      return `${d.getMonth() + 1}/${d.getDate()}`;
                    }}
                    minTickGap={20}
                  />
                  <YAxis stroke="var(--color-border)" fontSize={10} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '0.5rem', fontSize: '12px' }}
                    itemStyle={{ color: 'var(--color-foreground)' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="words" 
                    stroke={chartColor} 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorWords)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </TabsContent>

        <TabsContent value="voice" className="mt-5">
          <p className="text-sm text-muted-foreground">{t("insights.tabs.voiceComingSoon")}</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
