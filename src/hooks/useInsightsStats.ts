import { useCallback, useEffect, useState } from "react";

type InsightsStats = Awaited<ReturnType<typeof window.electronAPI.getInsightsStats>>;
type InsightsActivity = Awaited<ReturnType<typeof window.electronAPI.getInsightsActivity>>;

// Shared by ContextPanel + InsightsView so both refetch on the same events
// instead of each fetching once on mount and going stale. Root cause of the
// "stats don't update" bug: getInsightsStats() was only ever called in a
// useEffect([]), with no subscription to the onTranscriptionAdded event the
// history list already uses (src/stores/transcriptionStore.ts).
export function useInsightsStats() {
  const [stats, setStats] = useState<InsightsStats | null>(null);

  const refetch = useCallback(() => {
    window.electronAPI.getInsightsStats().then(setStats);
  }, []);

  useEffect(() => {
    refetch();

    const disposers: Array<() => void> = [];
    if (window.electronAPI?.onTranscriptionAdded) {
      const dispose = window.electronAPI.onTranscriptionAdded(refetch);
      if (typeof dispose === "function") disposers.push(dispose);
    }
    if (window.electronAPI?.onTranscriptionDeleted) {
      const dispose = window.electronAPI.onTranscriptionDeleted(refetch);
      if (typeof dispose === "function") disposers.push(dispose);
    }

    return () => disposers.forEach((dispose) => dispose());
  }, [refetch]);

  return { stats, refetch };
}

// Range-scoped chart data (dictation frequency, avg word count, time saved)
// for InsightsView's date-range filter. Same refetch-on-event wiring as
// useInsightsStats above, plus refetch whenever rangeDays changes.
export function useInsightsActivity(rangeDays: number | null) {
  const [activity, setActivity] = useState<InsightsActivity | null>(null);

  const refetch = useCallback(() => {
    window.electronAPI.getInsightsActivity(rangeDays).then(setActivity);
  }, [rangeDays]);

  useEffect(() => {
    refetch();

    const disposers: Array<() => void> = [];
    if (window.electronAPI?.onTranscriptionAdded) {
      const dispose = window.electronAPI.onTranscriptionAdded(refetch);
      if (typeof dispose === "function") disposers.push(dispose);
    }
    if (window.electronAPI?.onTranscriptionDeleted) {
      const dispose = window.electronAPI.onTranscriptionDeleted(refetch);
      if (typeof dispose === "function") disposers.push(dispose);
    }

    return () => disposers.forEach((dispose) => dispose());
  }, [refetch]);

  return { activity, refetch };
}
