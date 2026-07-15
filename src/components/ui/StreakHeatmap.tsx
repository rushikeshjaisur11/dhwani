import { useTranslation } from "react-i18next";
import { useRef, useLayoutEffect } from "react";

interface DailyActivity {
  date: string; // YYYY-MM-DD
  words: number;
  count: number;
}

interface StreakHeatmapProps {
  dailyActivity: DailyActivity[];
  weeks?: number;
}

const LEVEL_THRESHOLDS = [0, 1, 200, 600]; // words -> level 0..3, anything above last = level 4

function levelForWords(words: number) {
  let level = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (words >= LEVEL_THRESHOLDS[i]) level = i;
  }
  return words > 0 ? Math.max(level, 1) : 0;
}

const LEVEL_CLASSES = [
  "bg-black/5 dark:bg-white/10",
  "bg-primary/25",
  "bg-primary/50",
  "bg-primary/75",
  "bg-primary",
];

// ponytail: plain CSS grid, not SVG/canvas — a 53x7 grid of divs is cheap and
// styles with Tailwind directly; revisit only if perf becomes an issue.
export default function StreakHeatmap({ dailyActivity, weeks = 53 }: StreakHeatmapProps) {
  const { t, i18n } = useTranslation();
  const activityByDate = new Map(dailyActivity.map((d) => [d.date, d]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const currentYear = today.getFullYear();
  const start = new Date(currentYear, 0, 1);
  start.setDate(start.getDate() - start.getDay()); // Start on the Sunday of the week containing Jan 1
  
  const end = new Date(currentYear, 11, 31);
  end.setDate(end.getDate() + (6 - end.getDay())); // End on the Saturday of the week containing Dec 31
  
  const totalDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const days: Date[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }

  const columns: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    columns.push(days.slice(i, i + 7));
  }

  const monthFormatter = new Intl.DateTimeFormat(i18n.language, { month: "short" });
  const weekdayFormatter = new Intl.DateTimeFormat(i18n.language, { weekday: "narrow" });

  const scrollRef = useRef<HTMLDivElement>(null);
  const todayIso = today.toISOString().slice(0, 10);
  const currentColumnIndex = columns.findIndex((col) =>
    col.some((d) => d.toISOString().slice(0, 10) === todayIso)
  );

  useLayoutEffect(() => {
    if (scrollRef.current && currentColumnIndex !== -1) {
      const colWidth = 14; // 11px width + 3px gap
      const offset = 24; // Left labels padding
      const targetScroll = offset + currentColumnIndex * colWidth - scrollRef.current.clientWidth / 2 + colWidth / 2;
      scrollRef.current.scrollLeft = targetScroll;
    }
  }, [currentColumnIndex]);

  return (
    <div className="overflow-x-auto custom-scrollbar pb-2" ref={scrollRef}>
      <div className="flex gap-[3px] mb-1 pl-6">
        {columns.map((col, i) => {
          const first = col[0];
          const showLabel = first.getDate() <= 7;
          return (
            <div key={i} className="w-[11px] text-[9px] text-muted-foreground shrink-0">
              {showLabel ? monthFormatter.format(first) : ""}
            </div>
          );
        })}
      </div>
      <div className="flex gap-[3px]">
        <div className="flex flex-col gap-[3px] pr-1">
          {columns[0].map((day, i) => (
            <div key={i} className="w-4 h-[11px] text-[9px] text-muted-foreground leading-[11px]">
              {i % 2 === 1 ? weekdayFormatter.format(day) : ""}
            </div>
          ))}
        </div>
        {columns.map((col, i) => (
          <div key={i} className="flex flex-col gap-[3px] shrink-0">
            {col.map((day, j) => {
              const isoDate = day.toISOString().slice(0, 10);
              const entry = activityByDate.get(isoDate);
              const level = levelForWords(entry?.words ?? 0);
              const isFuture = day > today;
              return (
                <div
                  key={j}
                  title={isFuture ? undefined : `${isoDate}: ${entry?.words ?? 0} words`}
                  className={`w-[11px] h-[11px] rounded-[2px] ${LEVEL_CLASSES[isFuture ? 0 : level]}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-muted-foreground">
        <span>{t("insights.streak.less", { defaultValue: "Less" })}</span>
        {LEVEL_CLASSES.map((cls, i) => (
          <div key={i} className={`w-[11px] h-[11px] rounded-[2px] ${cls}`} />
        ))}
        <span>{t("insights.streak.more", { defaultValue: "More" })}</span>
      </div>
    </div>
  );
}
