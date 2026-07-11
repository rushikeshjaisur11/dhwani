import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import UpcomingMeetings from "./UpcomingMeetings";
import { useUpcomingEvents } from "../hooks/useUpcomingEvents";
import type { ControlPanelView } from "./ControlPanelSidebar";

// ponytail: same stats card content on both "home" and "insights" — a
// distinct insights-only widget can be split out later if the content needs
// to diverge; today they'd just duplicate each other.
const VIEWS_WITH_STATS: ControlPanelView[] = ["home", "insights"];

const VOICE_PROFILE_MILESTONE_WORDS = 5000;

interface ContextPanelProps {
  activeView: ControlPanelView;
}

export default function ContextPanel({ activeView }: ContextPanelProps) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<{
    totalWords: number;
    averageWPM: number;
    dayStreak: number;
  } | null>(null);
  const { events, isLoading: eventsLoading, isConnected } = useUpcomingEvents();

  useEffect(() => {
    window.electronAPI.getInsightsStats().then(setStats);
  }, []);

  if (!VIEWS_WITH_STATS.includes(activeView)) return null;

  const voiceProfileProgress =
    Math.min(stats?.totalWords ?? 0, VOICE_PROFILE_MILESTONE_WORDS) / VOICE_PROFILE_MILESTONE_WORDS;
  const voiceProfileWordsRemaining = Math.max(
    VOICE_PROFILE_MILESTONE_WORDS - (stats?.totalWords ?? 0),
    0
  );

  return (
    <div className="w-68 shrink-0 hidden lg:block overflow-y-auto px-5 py-6 bg-transparent border-l border-border/10 dark:border-white/5">
      <div className="sticky top-0 space-y-4">
        {/* Unified Stats & Voice Profile Card */}
        <div className="p-5 rounded-2xl bg-[#F9F9F8] dark:bg-[oklch(0.24_0.014_60)] border border-border/40 dark:border-white/5 shadow-sm space-y-5">
          {/* Statistics Grid */}
          <div className="space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground tabular-nums leading-none">
                {stats?.totalWords ?? "–"}
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                {t("controlPanel.stats.totalWords", { defaultValue: "total words" })}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground tabular-nums leading-none">
                {stats?.averageWPM ?? "–"}
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                {t("controlPanel.stats.wpm", { defaultValue: "wpm" })}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground tabular-nums leading-none">
                {stats?.dayStreak ?? "–"}
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                {t("controlPanel.stats.dayStreak", { defaultValue: "day streak" })}
              </span>
            </div>
          </div>

          <hr className="border-border/60 dark:border-white/10" />

          {/* Voice Profile Progress */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-0.5">
              {t("insights.voiceProfile.title", { defaultValue: "Your Voice Profile" })}
            </p>
            <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
              {t("insights.voiceProfile.description", {
                defaultValue: "Discover how you use your voice.",
              })}
            </p>
            <div className="h-1.5 rounded-full bg-[var(--color-progress-track)] dark:bg-white/10 overflow-hidden mb-1.5">
              <div
                className="h-full rounded-full bg-[#6d4fe0] transition-[width] duration-500 ease-out"
                style={{ width: `${voiceProfileProgress * 100}%` }}
              />
            </div>
            <p className="text-[10px] text-right text-muted-foreground font-medium">
              {voiceProfileWordsRemaining > 0
                ? t("insights.voiceProfile.unlocksIn", {
                    defaultValue: "Unlocks in {{count}} words",
                    count: (voiceProfileWordsRemaining / 1000).toFixed(1) + "K words",
                  })
                : t("insights.voiceProfile.unlocked", { defaultValue: "Unlocked" })}
            </p>
          </div>
        </div>

        {isConnected && <UpcomingMeetings events={events} isLoading={eventsLoading} />}
      </div>
    </div>
  );
}
