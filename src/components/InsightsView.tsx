import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Flame, Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import RadialGauge from "./ui/RadialGauge";
import StreakHeatmap from "./ui/StreakHeatmap";
import { useInsightsStats, useInsightsActivity } from "../hooks/useInsightsStats";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "../hooks/useTheme";

type RangeKey = "7" | "30" | "all";
const RANGE_DAYS: Record<RangeKey, number | null> = { "7": 7, "30": 30, all: null };

// Small "pop in on change" number, reused across the metric cards below so
// updates (new dictation, range switch) read as animated rather than a
// silent DOM swap.
function AnimatedNumber({ value }: { value: number | string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={value}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.2 }}
        className="inline-block"
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

const CARD_CLASS =
  "rounded-xl border border-border/50 bg-surface-1 dark:bg-surface-2 p-4 shadow-sm transition-all hover:bg-surface-2 dark:hover:bg-surface-3";

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`${CARD_CLASS} h-56`}>
      <h3 className="text-sm font-semibold text-foreground mb-3 drop-shadow-sm">{title}</h3>
      <ResponsiveContainer width="100%" height="80%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export default function InsightsView() {
  const { t } = useTranslation();
  const { stats } = useInsightsStats();
  const { theme } = useTheme();
  const [range, setRange] = useState<RangeKey>("30");
  const { activity } = useInsightsActivity(RANGE_DAYS[range]);

  const wpm = stats?.averageWPM ?? 0;
  const best = Math.max(stats?.personalBestWPM ?? 0, wpm);
  const pctOfBest = best > 0 ? Math.round((wpm / best) * 100) : 0;

  const chartColor = theme === "dark" ? "#60a5fa" : "#3b82f6"; // primary blue color
  const secondaryChartColor = theme === "dark" ? "#c084fc" : "#a855f7";
  const tickFormatter = (val: string) => {
    const d = new Date(val);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const tooltipStyle = {
    contentStyle: {
      backgroundColor: "var(--color-card)",
      borderColor: "var(--color-border)",
      borderRadius: "0.5rem",
      fontSize: "12px",
    },
    itemStyle: { color: "var(--color-foreground)" },
  };

  const timeSavedLabel = useMemo(() => {
    const minutes = stats?.totalTimeSavedMinutes ?? 0;
    if (minutes >= 60) {
      return t("insights.timeSaved.hoursMinutes", {
        defaultValue: "{{hours}}h {{minutes}}m",
        hours: Math.floor(minutes / 60),
        minutes: minutes % 60,
      });
    }
    return t("insights.timeSaved.minutesOnly", { defaultValue: "{{minutes}}m", minutes });
  }, [stats?.totalTimeSavedMinutes, t]);

  const wordsThisWeek = stats?.wordsThisWeek ?? 0;
  const wordsLastWeek = stats?.wordsLastWeek ?? 0;
  const weeklyDeltaPct =
    wordsLastWeek > 0 ? Math.round(((wordsThisWeek - wordsLastWeek) / wordsLastWeek) * 100) : null;
  const WeeklyTrendIcon =
    weeklyDeltaPct === null || weeklyDeltaPct === 0 ? Minus : weeklyDeltaPct > 0 ? TrendingUp : TrendingDown;
  const weeklyTrendColor =
    weeklyDeltaPct === null || weeklyDeltaPct === 0
      ? "text-muted-foreground"
      : weeklyDeltaPct > 0
        ? "text-success"
        : "text-destructive";

  const hasChartData = !!activity && activity.dailyActivity.length > 0;

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
            <div className={`${CARD_CLASS} flex flex-col items-center gap-1`}>
              <RadialGauge value={wpm} max={best || 1} />
              <span className="text-3xl font-bold text-foreground tabular-nums leading-none -mt-1 drop-shadow-sm">
                <AnimatedNumber value={wpm} />
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

            <div className={`${CARD_CLASS} flex flex-col gap-1.5 justify-center`}>
              <span className="text-3xl font-bold text-foreground tabular-nums leading-none drop-shadow-sm">
                <AnimatedNumber value={stats?.fixesMade ?? "–"} />
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

            <div className={`${CARD_CLASS} flex flex-col gap-1.5 justify-center`}>
              <span className="text-3xl font-bold text-foreground tabular-nums leading-none drop-shadow-sm">
                <AnimatedNumber value={stats?.totalWords ?? "–"} />
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
            <div className={`${CARD_CLASS} flex flex-col gap-1.5 justify-center`}>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-primary shrink-0" />
                <span className="text-3xl font-bold text-foreground tabular-nums leading-none drop-shadow-sm">
                  <AnimatedNumber value={timeSavedLabel} />
                </span>
              </div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("insights.timeSaved.title", { defaultValue: "Time saved" })}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t("insights.timeSaved.subtitle", {
                  defaultValue: "Vs. typing it out at ~{{wpm}} WPM",
                  wpm: 40,
                })}
              </span>
            </div>

            <div className={`${CARD_CLASS} flex flex-col gap-1.5 justify-center`}>
              <div className="flex items-center gap-1.5">
                <WeeklyTrendIcon className={`w-4 h-4 shrink-0 ${weeklyTrendColor}`} />
                <span className="text-3xl font-bold text-foreground tabular-nums leading-none drop-shadow-sm">
                  <AnimatedNumber value={wordsThisWeek} />
                </span>
              </div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("insights.weeklyTrend.title", { defaultValue: "Words this week" })}
              </span>
              <span className={`text-[11px] ${weeklyTrendColor}`}>
                {weeklyDeltaPct === null
                  ? t("insights.weeklyTrend.noBaseline", { defaultValue: "No data for last week yet" })
                  : t("insights.weeklyTrend.vsLastWeek", {
                      defaultValue: "{{sign}}{{pct}}% vs last week",
                      sign: weeklyDeltaPct > 0 ? "+" : "",
                      pct: weeklyDeltaPct,
                    })}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={CARD_CLASS}>
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
              <div className={CARD_CLASS}>
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

          <div className="flex items-center justify-between mt-4">
            <h3 className="text-sm font-semibold text-foreground drop-shadow-sm">
              {t("insights.charts.sectionTitle", { defaultValue: "Trends" })}
            </h3>
            <Tabs value={range} onValueChange={(value) => setRange(value as RangeKey)}>
              <TabsList className="h-8 p-0.5">
                <TabsTrigger value="7" className="h-7 px-2.5 text-xs">
                  {t("insights.rangeFilter.7days", { defaultValue: "7 days" })}
                </TabsTrigger>
                <TabsTrigger value="30" className="h-7 px-2.5 text-xs">
                  {t("insights.rangeFilter.30days", { defaultValue: "30 days" })}
                </TabsTrigger>
                <TabsTrigger value="all" className="h-7 px-2.5 text-xs">
                  {t("insights.rangeFilter.allTime", { defaultValue: "All time" })}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {hasChartData ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ChartCard title={t("insights.charts.frequency.title", { defaultValue: "Dictation frequency" })}>
                <BarChart data={activity!.dailyActivity}>
                  <XAxis
                    dataKey="date"
                    stroke="var(--color-border)"
                    fontSize={10}
                    tickFormatter={tickFormatter}
                    minTickGap={20}
                  />
                  <YAxis stroke="var(--color-border)" fontSize={10} allowDecimals={false} />
                  <RechartsTooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill={chartColor} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ChartCard>

              <ChartCard title={t("insights.charts.avgWords.title", { defaultValue: "Average word count" })}>
                <LineChart data={activity!.dailyActivity}>
                  <XAxis
                    dataKey="date"
                    stroke="var(--color-border)"
                    fontSize={10}
                    tickFormatter={tickFormatter}
                    minTickGap={20}
                  />
                  <YAxis stroke="var(--color-border)" fontSize={10} />
                  <RechartsTooltip {...tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="avgWords"
                    stroke={secondaryChartColor}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartCard>

              <ChartCard title={t("insights.charts.timeSaved.title", { defaultValue: "Time saved per day" })}>
                <AreaChart data={activity!.dailyActivity}>
                  <defs>
                    <linearGradient id="colorTimeSaved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    stroke="var(--color-border)"
                    fontSize={10}
                    tickFormatter={tickFormatter}
                    minTickGap={20}
                  />
                  <YAxis stroke="var(--color-border)" fontSize={10} />
                  <RechartsTooltip {...tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="timeSavedMinutes"
                    stroke={chartColor}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorTimeSaved)"
                  />
                </AreaChart>
              </ChartCard>
            </div>
          ) : (
            <div className={`${CARD_CLASS} text-sm text-muted-foreground text-center py-8`}>
              {t("insights.charts.emptyState", {
                defaultValue: "Not enough dictation history yet to chart this range.",
              })}
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
