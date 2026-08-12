import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { MessageCircleQuestion, Search, Users } from "lucide-react";
import { cn } from "./lib/utils";
import type { NoteItem } from "../types/electron.js";
import { normalizeDbDate } from "../utils/dateFormatting";

export interface MeetingSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNoteSelect: (noteId: number, folderId: number | null) => void;
}

function relativeTime(dateStr: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const date = normalizeDbDate(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return t("notes.list.timeNow");
  if (minutes < 60) return t("notes.list.minutesAgo", { count: minutes });
  if (hours < 24) return t("notes.list.hoursAgo", { count: hours });
  if (days < 7) return t("notes.list.daysAgo", { count: days });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function stripMarkdownPreview(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "")
    .replace(/[*_~`]+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n+/g, " ")
    .trim();
}

const SNIPPET_LENGTH = 160;

export default function MeetingSearchDialog({
  open,
  onOpenChange,
  onNoteSelect,
}: MeetingSearchDialogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchVersionRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setHasSearched(false);
  }, [open]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    const version = ++searchVersionRef.current;
    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const notes = await window.electronAPI.semanticSearchNotes(query, 10, "meeting");
        if (searchVersionRef.current === version) {
          setResults(notes);
          setHasSearched(true);
          setIsSearching(false);
        }
      } catch {
        if (searchVersionRef.current === version) {
          setIsSearching(false);
          setHasSearched(true);
        }
      }
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[18%] z-50 w-full max-w-xl translate-x-[-50%]",
            "rounded-2xl border border-border/60 bg-surface-2 shadow-[0_16px_64px_-12px_rgba(0,0,0,0.3)] overflow-hidden",
            "dark:bg-surface-2 dark:border-white/10 dark:shadow-[0_16px_64px_-12px_rgba(0,0,0,0.8)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=open]:slide-in-from-top-[44%] data-[state=closed]:slide-out-to-top-[44%]",
            "data-[state=open]:slide-in-from-left-1/2 data-[state=closed]:slide-out-to-left-1/2"
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {t("notes.meetingSearch.title")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {t("notes.meetingSearch.description")}
          </DialogPrimitive.Description>

          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/30 bg-background/20">
            <MessageCircleQuestion size={16} className="shrink-0 text-muted-foreground/50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("notes.meetingSearch.placeholder")}
              autoFocus
              className="flex-1 text-sm text-foreground placeholder:text-muted-foreground/40"
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                boxShadow: "none",
                padding: 0,
              }}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors outline-none"
              >
                ✕
              </button>
            )}
          </div>

          <div className="overflow-y-auto max-h-[420px] p-2 scroll-smooth">
            {!query.trim() ? (
              <div className="flex flex-col items-center justify-center gap-1.5 py-10 px-6 text-center">
                <Users size={18} className="text-muted-foreground/30 mb-1" />
                <p className="text-xs text-muted-foreground/50">
                  {t("notes.meetingSearch.emptyState")}
                </p>
              </div>
            ) : isSearching && results.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <p className="text-xs text-muted-foreground/50">
                  {t("notes.meetingSearch.searching")}
                </p>
              </div>
            ) : hasSearched && results.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <p className="text-xs text-muted-foreground/50">
                  {t("notes.meetingSearch.noResults")}
                </p>
              </div>
            ) : (
              results.map((note) => {
                const preview = stripMarkdownPreview(
                  note.enhanced_content || note.content || ""
                ).slice(0, SNIPPET_LENGTH);
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => {
                      onNoteSelect(note.id, note.folder_id ?? null);
                      onOpenChange(false);
                    }}
                    className="group flex items-start gap-2.5 w-full px-2.5 py-2.5 rounded-lg text-left transition-colors duration-100 outline-none hover:bg-foreground/4 dark:hover:bg-white/4"
                  >
                    <Users size={13} className="shrink-0 mt-0.5 text-muted-foreground/40" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className={cn(
                            "text-xs font-medium truncate",
                            note.title ? "text-foreground" : "italic text-muted-foreground/50"
                          )}
                        >
                          {note.title || t("notes.list.untitled")}
                        </p>
                        <span className="text-[10px] text-muted-foreground/35 tabular-nums shrink-0 ml-auto">
                          {relativeTime(note.updated_at, t)}
                        </span>
                      </div>
                      {preview && (
                        <p className="text-[11px] text-muted-foreground/55 mt-0.5 line-clamp-2">
                          {preview}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border/20 bg-muted/10 shadow-[0_-1px_15px_rgba(0,0,0,0.03)]">
            <Search size={11} className="text-muted-foreground/40" />
            <span className="text-[11px] text-muted-foreground/50">
              {t("notes.meetingSearch.footer")}
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
