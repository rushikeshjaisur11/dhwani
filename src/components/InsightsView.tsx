import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Flame, Mic, Type, Gauge, CalendarDays, CalendarRange } from "lucide-react";

interface InsightsStats {
  totalWords: number;
  totalDictations: number;
  averageWPM: number;
  wordsToday: number;
  wordsThisWeek: number;
  dayStreak: number;
}

export default function InsightsView() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<InsightsStats | null>(null);

  useEffect(() => {
    window.electronAPI.getInsightsStats().then(setStats);
  }, []);

  const tiles = [
    { key: "totalWords", label: t("insights.totalWords"), value: stats?.totalWords, icon: Type },
    {
      key: "totalDictations",
      label: t("insights.totalDictations"),
      value: stats?.totalDictations,
      icon: Mic,
    },
    {
      key: "averageWPM",
      label: t("insights.averageWPM"),
      value: stats?.averageWPM,
      icon: Gauge,
    },
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
    <div className="p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4">{t("insights.title")}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {tiles.map(({ key, label, value, icon: Icon }) => (
          <div
            key={key}
            className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2"
          >
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Icon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">{label}</span>
            </div>
            <span className="text-2xl font-semibold text-foreground tabular-nums">
              {value ?? "–"}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card p-4">
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
    </div>
  );
}
