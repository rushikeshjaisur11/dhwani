import { useMemo, useState, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { Loader2, Sparkles, X, Mic, Trash2, Archive, Search } from "lucide-react";
import TranscriptionItem from "./ui/TranscriptionItem";
import TranscriptDetailView from "./ui/TranscriptDetailView";
import { Kbd } from "./ui/Kbd";
import type { TranscriptionItem as TranscriptionItemType } from "../types/electron";
import { formatHotkeyLabel } from "../utils/hotkeys";
import { formatDateGroup } from "../utils/dateFormatting";
import { cn } from "./lib/utils";
import { useUpcomingEvents } from "../hooks/useUpcomingEvents";
import { useSettingsStore } from "../stores/settingsStore";

interface HistoryViewProps {
  history: TranscriptionItemType[];
  isLoading: boolean;
  hotkey: string;
  aiCTADismissed: boolean;
  setAiCTADismissed: (dismissed: boolean) => void;
  useCleanupModel: boolean;
  copyToClipboard: (text: string) => void;
  deleteTranscription: (id: number) => void;
  clearAllTranscriptions: () => void;
  onOpenSettings: (section?: string) => void;
  onOpenSearch: () => void;
  onShowAudioInFolder: (id: number) => void;
  onRetryTranscription: (id: number, options?: { isRecover?: boolean }) => Promise<void>;
  showDiscarded: boolean;
  onToggleDiscarded: () => void;
}

export default function HistoryView({
  history,
  isLoading,
  hotkey,
  aiCTADismissed,
  setAiCTADismissed,
  useCleanupModel,
  copyToClipboard,
  deleteTranscription,
  clearAllTranscriptions,
  onOpenSettings,
  onOpenSearch,
  onShowAudioInFolder,
  onRetryTranscription,
  showDiscarded,
  onToggleDiscarded,
}: HistoryViewProps) {
  const { t } = useTranslation();
  const dataRetentionEnabled = useSettingsStore((s) => s.dataRetentionEnabled);
  const { isConnected } = useUpcomingEvents();
  const [selectedTranscript, setSelectedTranscript] = useState<TranscriptionItemType | null>(null);

  useEffect(() => {
    localStorage.removeItem("promoBannerDismissed");
  }, []);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchExpanded(true);
        // Small delay to allow the input to mount/expand before focusing
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [searchQuery, setSearchQuery] = useState("");

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history;
    const lowerQuery = searchQuery.toLowerCase();
    return history.filter((item) => {
      const textMatch = item.text?.toLowerCase().includes(lowerQuery);
      const appMatch = item.target_app?.toLowerCase().includes(lowerQuery);
      return textMatch || appMatch;
    });
  }, [history, searchQuery]);

  const flattenedHistory = useMemo(() => {
    if (filteredHistory.length === 0) return [];
    
    type FlatItem = 
      | { type: "header"; id: string; label: string; isFirstGroup: boolean }
      | { type: "item"; id: string; item: TranscriptionItemType; isFirstInGroup: boolean; isLastInGroup: boolean; isSingleItem: boolean };

    const items: FlatItem[] = [];
    let currentLabel: string | null = null;
    let groupStartIndex = -1;

    for (let i = 0; i < filteredHistory.length; i++) {
      const item = filteredHistory[i];
      const label = formatDateGroup(item.timestamp, t);

      if (label !== currentLabel) {
        if (groupStartIndex !== -1) {
           (items[items.length - 1] as any).isLastInGroup = true;
        }
        items.push({ type: "header", id: `header-${label}`, label, isFirstGroup: items.length === 0 });
        currentLabel = label;
        groupStartIndex = items.length;
      }
      
      items.push({
        type: "item",
        id: `item-${item.id}`,
        item,
        isFirstInGroup: items.length === groupStartIndex,
        isLastInGroup: false,
        isSingleItem: false,
      });
    }
    
    if (items.length > 0) {
      (items[items.length - 1] as any).isLastInGroup = true;
    }
    
    for (const row of items) {
       if (row.type === "item" && row.isFirstInGroup && row.isLastInGroup) row.isSingleItem = true;
    }

    return items;
  }, [filteredHistory, t]);

  const discardedToggle = (
    <button
      onClick={onToggleDiscarded}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-muted-foreground/60 hover:!text-foreground hover:!bg-black/5 dark:hover:!bg-white/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 transition-all duration-200"
    >
      <Archive size={11} />
      <span>
        {showDiscarded
          ? t("controlPanel.history.discarded.hide")
          : t("controlPanel.history.discarded.show")}
      </span>
    </button>
  );

  const [promoDismissed, setPromoDismissed] = useState(
    () => localStorage.getItem("promoBannerDismissed") === "true"
  );
  const [promoClosing, setPromoClosing] = useState(false);
  const dismissPromo = () => {
    setPromoClosing(true);
    setTimeout(() => {
      localStorage.setItem("promoBannerDismissed", "true");
      setPromoDismissed(true);
    }, 180);
  };

  const scrollElementRef = useRef<Element | null>(null);
  const [scrollElementReady, setScrollElementReady] = useState(false);

  useEffect(() => {
    const el = document.getElementById("main-scroll-container");
    if (el) {
      scrollElementRef.current = el;
      setScrollElementReady(true);
    }
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: scrollElementReady ? flattenedHistory.length : 0,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: (i) => (flattenedHistory[i]?.type === "header" ? 44 : 85),
    overscan: 5,
  });

  const [aiCtaClosing, setAiCtaClosing] = useState(false);
  const dismissAiCta = () => {
    setAiCtaClosing(true);
    setTimeout(() => {
      localStorage.setItem("aiCTADismissed", "true");
      setAiCTADismissed(true);
    }, 180);
  };

  const hotkeyParts = formatHotkeyLabel(hotkey)
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  // ponytail: no user-profile/name setting exists yet — persisted locally,
  // seeded with the real name, editable by changing localStorage.userName
  // until a proper Settings field exists.
  const userName = localStorage.getItem("userName") ?? "Rushikesh";

  return (
    <div className="px-3 pb-6 flex flex-col relative min-h-full">
      <div className="sticky top-0 z-20 bg-card pt-4 pb-2">
        <div className="mx-auto max-w-5xl @container">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="text-[clamp(14px,3.5cqw,24px)] font-medium text-foreground/70 flex flex-nowrap items-center gap-1.5 leading-tight whitespace-nowrap shrink-0 overflow-visible">
            <span className="shrink-0 min-w-max">
              {t("controlPanel.greeting", {
                defaultValue: "Hey {{name}}, get back into the flow with",
                name: userName,
              })}
            </span>
            {hotkeyParts.map((part, i) => (
              <span key={i} className="flex items-center gap-1 shrink-0">
                <Kbd className="text-xs font-bold px-1.5 py-0.5 bg-[#f5a94a] text-black border border-black rounded-md select-none h-6 flex items-center justify-center font-sans">
                  {part}
                </Kbd>
                {i < hotkeyParts.length - 1 && (
                  <span className="text-muted-foreground font-bold px-0.5">+</span>
                )}
              </span>
            ))}
          </div>
        </div>
        {!promoDismissed && (
          <div
            className={cn(
              "mb-4 relative rounded-[24px] overflow-hidden p-8 shadow-md bg-gradient-to-r from-[#1c2226] via-[#2f2824] to-[#1c201a]",
              "transition-[opacity,transform] duration-200 ease-in",
              promoClosing ? "opacity-0 scale-[0.98]" : "opacity-100 scale-100"
            )}
          >
                <button
                  onClick={dismissPromo}
                  aria-label={t("common.close")}
                  className="absolute top-4 right-4 z-10 p-1 rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-colors"
                >
                  <X size={12} />
                </button>
                <div className="relative z-[1] max-w-md">
                  <h3 className="text-white text-2xl mb-1.5 font-serif font-normal">
                    Transform works anywhere you write
                  </h3>
                  <p className="text-white/75 text-xs mb-6 max-w-sm leading-relaxed">
                    Apply a Transform to rewrite, clean up, or restructure text after you dictate.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onOpenSettings("intelligence")}
                      className="h-8 px-4 rounded-full bg-white hover:bg-white/90 text-black text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Try it out
                    </button>
                    <button
                      onClick={() => {}}
                      className="text-xs font-semibold text-white/80 hover:text-white transition-colors cursor-pointer"
                    >
                      How it works
                    </button>
                  </div>
                </div>
                {/* Visual floating app bubbles representing integrations */}
                <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden md:flex items-center justify-center gap-4 select-none pointer-events-none">
                  <div className="relative w-44 h-24">
                    {/* Notion Bubble */}
                    <div className="absolute top-0 right-10 w-7 h-7 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-md">
                      <span className="text-[10px] text-white font-bold">N</span>
                    </div>
                    {/* Slack Bubble */}
                    <div className="absolute bottom-2 left-6 w-8 h-8 rounded-full bg-[#3F0F3F]/80 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-md">
                      <span className="text-[10px] text-white font-bold">#</span>
                    </div>
                    {/* Gmail Bubble */}
                    <div className="absolute bottom-0 right-12 w-8 h-8 rounded-full bg-[#EA4335]/80 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-md">
                      <span className="text-[10px] text-white font-bold">M</span>
                    </div>
                    {/* LinkedIn Bubble */}
                    <div className="absolute top-6 left-20 w-8 h-8 rounded-full bg-[#0077B5]/80 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-md">
                      <span className="text-[10px] text-white font-bold">in</span>
                    </div>
                  </div>
                </div>
              </div>
        )}
        {history.length === 0 && <div className="mb-2 flex justify-end">{discardedToggle}</div>}
        {!useCleanupModel && !aiCTADismissed && (
          <div
            className={cn(
              "mb-4 relative rounded-2xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4",
              "transition-[opacity,transform] duration-200 ease-in",
              aiCtaClosing ? "opacity-0 scale-[0.98]" : "opacity-100 scale-100"
            )}
          >
            <button
              onClick={dismissAiCta}
              aria-label={t("common.close")}
              className="absolute top-2 right-2 p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <X size={14} />
            </button>
            <div className="flex items-start gap-3 pr-6">
              <div className="shrink-0 w-8 h-8 rounded-md bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                <Sparkles size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground mb-0.5">
                  {t("controlPanel.aiCta.title")}
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  {t("controlPanel.aiCta.description")}
                </p>
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onOpenSettings("intelligence")}
                >
                  {t("controlPanel.aiCta.enable")}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="w-full flex items-center justify-between mb-2 relative px-1 group">
          <h2 className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest pl-1">
            Recent Transcriptions
          </h2>
          <div 
            className={cn(
              "relative flex items-center h-8 rounded-full transition-all duration-300 ease-out border overflow-hidden",
              isSearchExpanded || searchQuery 
                ? "w-48 sm:w-64 bg-black/5 dark:bg-white/5 border-transparent focus-within:border-primary/50 focus-within:bg-transparent" 
                : "w-8 bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
            )}
            onClick={() => {
              if (!isSearchExpanded) {
                setIsSearchExpanded(true);
                setTimeout(() => searchInputRef.current?.focus(), 50);
              }
            }}
          >
            <div className={cn("absolute left-0 flex items-center justify-center h-8 w-8 text-muted-foreground transition-all duration-300", isSearchExpanded || searchQuery ? "text-foreground" : "")}>
              <Search className="h-3.5 w-3.5" strokeWidth={2} />
            </div>
            
            <input 
              ref={searchInputRef}
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearchQuery("");
                  setIsSearchExpanded(false);
                  searchInputRef.current?.blur();
                }
              }}
              onBlur={() => {
                if (!searchQuery) setIsSearchExpanded(false);
              }}
              placeholder={t("common.search", "Search...")}
              className={cn(
                "w-full h-full bg-transparent border-none outline-none text-xs placeholder:text-muted-foreground text-foreground py-1 pl-8 transition-opacity duration-300",
                isSearchExpanded || searchQuery ? "opacity-100 pr-8" : "opacity-0 pr-0 pointer-events-none"
              )}
            />

            {(isSearchExpanded || searchQuery) && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent blur when clicking clear
                  setSearchQuery("");
                  searchInputRef.current?.focus();
                }}
                className={cn(
                  "absolute right-0 h-8 w-8 flex items-center justify-center text-muted-foreground/50 hover:text-foreground transition-all duration-300",
                  searchQuery ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"
                )}
              >
                <div className="bg-black/10 dark:bg-white/10 rounded-full p-0.5 hover:bg-black/20 dark:hover:bg-white/20 transition-colors">
                  <X size={10} strokeWidth={2.5} />
                </div>
              </button>
            )}
            
            {(!searchQuery && isSearchExpanded) && (
              <div className="absolute right-2 flex items-center justify-center pointer-events-none transition-opacity duration-300">
                <Kbd className="text-[9px] font-sans px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-muted-foreground border-none shadow-none tracking-wider font-medium">
                  {navigator.platform.includes("Mac") ? "⌘F" : "Ctrl F"}
                </Kbd>
              </div>
            )}
          </div>
        </div>

      </div>
      </div>

      <div className="mx-auto max-w-5xl @container w-full flex-1">
        <div className="flex gap-6">
          <div className="min-w-0 flex-1">
            {isConnected && (
              <div className="flex items-center gap-1.5 pb-2.5">
                <Mic size={12} className="text-muted-foreground" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("upcoming.transcriptions")}
                </span>
              </div>
            )}
            {!dataRetentionEnabled && (
              <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 px-4 py-3 flex items-center gap-2.5">
                <span className="text-amber-600 dark:text-amber-400 shrink-0 text-sm">⊘</span>
                <p className="text-xs text-amber-700 dark:text-amber-300/90 leading-relaxed">
                  {t("controlPanel.history.dataRetentionDisabled")}
                </p>
              </div>
            )}
            {isLoading && history.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card/50 dark:bg-card/60 backdrop-blur-sm shadow-sm">
                <div className="flex items-center justify-center gap-2 py-8">
                  <Loader2 size={14} className="animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">{t("controlPanel.loading")}</span>
                </div>
              </div>
            ) : history.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card/50 dark:bg-card/60 backdrop-blur-sm shadow-sm">
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <svg
                    className="text-foreground dark:text-white mb-5"
                    width="64"
                    height="64"
                    viewBox="0 0 64 64"
                    fill="none"
                  >
                    <rect
                      x="24"
                      y="6"
                      width="16"
                      height="28"
                      rx="8"
                      fill="currentColor"
                      fillOpacity={0.04}
                      stroke="currentColor"
                      strokeOpacity={0.1}
                    />
                    <rect
                      x="28"
                      y="12"
                      width="8"
                      height="3"
                      rx="1.5"
                      fill="currentColor"
                      fillOpacity={0.06}
                    />
                    <path
                      d="M18 28c0 7.7 6.3 14 14 14s14-6.3 14-14"
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity={0.07}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                    <line
                      x1="32"
                      y1="42"
                      x2="32"
                      y2="50"
                      stroke="currentColor"
                      strokeOpacity={0.07}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                    <line
                      x1="26"
                      y1="50"
                      x2="38"
                      y2="50"
                      stroke="currentColor"
                      strokeOpacity={0.07}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                    <path
                      d="M12 20a2 2 0 0 1 0 8"
                      stroke="currentColor"
                      strokeOpacity={0.04}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                    <path
                      d="M8 18a2 2 0 0 1 0 12"
                      stroke="currentColor"
                      strokeOpacity={0.03}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                    <path
                      d="M52 20a2 2 0 0 0 0 8"
                      stroke="currentColor"
                      strokeOpacity={0.04}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                    <path
                      d="M56 18a2 2 0 0 0 0 12"
                      stroke="currentColor"
                      strokeOpacity={0.03}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                  </svg>
                  <h3 className="text-xs font-semibold text-foreground/70 dark:text-foreground/60 mb-2">
                    {t("controlPanel.history.empty")}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-foreground/50 dark:text-foreground/25">
                    <span>{t("controlPanel.history.press")}</span>
                    <kbd className="inline-flex items-center h-5 px-1.5 rounded-sm bg-surface-1 dark:bg-white/6 border border-border/50 text-xs font-mono font-medium text-foreground/60 dark:text-foreground/40">
                      {formatHotkeyLabel(hotkey)}
                    </kbd>
                    <span>{t("controlPanel.history.toStart")}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="group pb-8">
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = flattenedHistory[virtualRow.index];

                    if (row.type === "header") {
                      return (
                        <div
                          key={virtualRow.index}
                          ref={rowVirtualizer.measureElement}
                          data-index={virtualRow.index}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                          className={!row.isFirstGroup ? "pt-8" : ""}
                        >
                          <div className="flex items-center justify-between mb-3 px-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                              {row.label}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        data-index={virtualRow.index}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                        className={row.isLastInGroup ? "pb-8" : ""}
                      >
                        <div
                          className={cn(
                            "border-x border-border/40 dark:border-white/10 bg-transparent overflow-hidden",
                            row.isFirstInGroup && "border-t rounded-t-[16px] shadow-sm",
                            row.isLastInGroup && "border-b rounded-b-[16px] shadow-sm",
                            !row.isFirstInGroup && "border-t border-border/30 dark:border-white/5"
                          )}
                        >
                          <TranscriptionItem
                            item={row.item}
                            onCopy={copyToClipboard}
                            onDelete={deleteTranscription}
                            onShowAudioInFolder={onShowAudioInFolder}
                            onRetryTranscription={onRetryTranscription}
                            onOpenSettings={() => onOpenSettings("transcription")}
                            onSelect={() => setSelectedTranscript(row.item)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {selectedTranscript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-card border border-border shadow-2xl rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
             <TranscriptDetailView 
               transcript={selectedTranscript} 
               onClose={() => setSelectedTranscript(null)} 
               t={t} 
             />
          </div>
        </div>
      )}
    </div>
  );
}
