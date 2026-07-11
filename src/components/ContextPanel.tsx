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
    <div className="w-64 shrink-0 hidden lg:block overflow-y-auto px-5 py-6">
      <div className="sticky top-0 space-y-5">
        <div className="space-y-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold text-foreground tabular-nums leading-none">
              {stats?.totalWords ?? "–"}
            </span>
            <span className="text-sm text-muted-foreground">
              {t("controlPanel.stats.totalWords", { defaultValue: "total words" })}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold text-foreground tabular-nums leading-none">
              {stats?.averageWPM ?? "–"}
            </span>
            <span className="text-sm text-muted-foreground">
              {t("controlPanel.stats.wpm", { defaultValue: "wpm" })}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold text-foreground tabular-nums leading-none">
              {stats?.dayStreak ?? "–"}
            </span>
            <span className="text-sm text-muted-foreground">
              {t("controlPanel.stats.dayStreak", { defaultValue: "day streak" })}
            </span>
          </div>
        </div>
        <div className="pt-4 border-t border-border">
          <p className="text-sm font-semibold text-foreground mb-0.5">
            {t("insights.voiceProfile.title", { defaultValue: "Your Voice Profile" })}
          </p>
          <p className="text-xs text-muted-foreground mb-2.5">
            {t("insights.voiceProfile.description", {
              defaultValue: "Discover how you use your voice.",
            })}
          </p>
          <div className="h-1.5 rounded-full bg-[var(--color-progress-track)] overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${voiceProfileProgress * 100}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {voiceProfileWordsRemaining > 0
              ? t("insights.voiceProfile.unlocksIn", {
                  defaultValue: "Unlocks in {{count}} words",
                  count: voiceProfileWordsRemaining,
                })
              : t("insights.voiceProfile.unlocked", { defaultValue: "Unlocked" })}
          </p>
        </div>
        {isConnected && <UpcomingMeetings events={events} isLoading={eventsLoading} />}
      </div>
    </div>
  );
}
