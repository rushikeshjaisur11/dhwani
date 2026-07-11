import { useCallback, useEffect, useState } from "react";

type InsightsStats = Awaited<ReturnType<typeof window.electronAPI.getInsightsStats>>;

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
