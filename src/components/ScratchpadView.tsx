import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pin, PinOff, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import PromoBanner, { BetaBadge } from "./ui/PromoBanner";
import { Toggle } from "./ui/toggle";
import HotkeyInput from "./ui/HotkeyInput";
import { formatHotkeyLabel } from "../utils/hotkeys";
import type { NoteItem } from "../types/electron";

const FLOW_BAR_KEY = "scratchpadAddToFlowBar";
const NOTE_TYPE = "scratchpad";
const PINNED_KEY = "scratchpadPinnedNoteIds";

function loadPinnedIds(): Set<number> {
  try {
    const raw = JSON.parse(localStorage.getItem(PINNED_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

export default function ScratchpadView() {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [addToFlowBar, setAddToFlowBar] = useState(
    () => localStorage.getItem(FLOW_BAR_KEY) === "true"
  );
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [scratchpadKey, setScratchpadKey] = useState("");
  const [editingKey, setEditingKey] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(loadPinnedIds);

  useEffect(() => {
    localStorage.setItem(FLOW_BAR_KEY, String(addToFlowBar));
  }, [addToFlowBar]);

  const togglePin = useCallback((id: number) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(PINNED_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const loadNotes = useCallback(async () => {
    const items = ((await window.electronAPI?.getNotes?.(NOTE_TYPE, 50, null)) ??
      []) as NoteItem[];
    setNotes(items);
  }, []);

  useEffect(() => {
    void loadNotes();
    void window.electronAPI?.getScratchpadKey?.().then((key) => setScratchpadKey(key || ""));
  }, [loadNotes]);

  const openOverlay = useCallback((payload?: { noteId?: number; newNote?: boolean }) => {
    void window.electronAPI?.openScratchpadOverlay?.(payload);
  }, []);

  const saveShortcut = useCallback(async (hotkey: string) => {
    const result = await window.electronAPI?.registerScratchpadHotkey?.(hotkey);
    if (result?.success) setScratchpadKey(hotkey);
    setEditingKey(false);
  }, []);

  const removeNote = useCallback(
    async (id: number) => {
      await window.electronAPI?.deleteNote?.(id);
      void loadNotes();
    },
    [loadNotes]
  );

  const visibleNotes = (
    query.trim()
      ? notes.filter(
          (n) =>
            n.title.toLowerCase().includes(query.toLowerCase()) ||
            n.content.toLowerCase().includes(query.toLowerCase())
        )
      : notes
  )
    .slice()
    .sort((a, b) => Number(pinnedIds.has(b.id)) - Number(pinnedIds.has(a.id)));

  return (
    <div className="px-5 py-4 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-foreground">{t("scratchpad.title")}</h2>
          <BetaBadge />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{t("scratchpad.addToFlowBar")}</span>
          <Toggle checked={addToFlowBar} onChange={setAddToFlowBar} />
          {editingKey ? (
            <div className="w-48">
              <HotkeyInput
                value={scratchpadKey}
                autoFocus
                onChange={(hotkey) => void saveShortcut(hotkey)}
                onClear={() => void saveShortcut("")}
                onBlur={() => setEditingKey(false)}
                slotName="scratchpad"
              />
            </div>
          ) : (
            <button
              onClick={() => setEditingKey(true)}
              className="h-7 px-2.5 rounded-md border border-border bg-muted/50 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {scratchpadKey ? formatHotkeyLabel(scratchpadKey) : t("scratchpad.enableShortcut")}
            </button>
          )}
        </div>
      </div>

      <PromoBanner
        title={t("scratchpad.bannerTitle")}
        description={t("scratchpad.bannerDescription")}
        primaryAction={{
          label: t("scratchpad.startNewNote"),
          onClick: () => openOverlay({ newNote: true }),
        }}
      />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-serif text-lg text-foreground">{t("scratchpad.recents")}</h3>
          <div className="flex items-center gap-1">
            {searching ? (
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => {
                  if (!query.trim()) setSearching(false);
                }}
                placeholder={t("scratchpad.searchPlaceholder", {
                  defaultValue: "Search notes...",
                })}
                className="h-7 w-44 rounded-md border border-border bg-transparent px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
            ) : (
              <button
                onClick={() => setSearching(true)}
                title={t("scratchpad.searchPlaceholder", { defaultValue: "Search notes..." })}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
              >
                <Search size={14} />
              </button>
            )}
            <button
              onClick={() => openOverlay({ newNote: true })}
              title={t("scratchpad.startNewNote")}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => void loadNotes()}
              title={t("scratchpad.refresh", { defaultValue: "Refresh" })}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {visibleNotes.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("scratchpad.noNotesFound")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleNotes.map((note) => (
              <div
                key={note.id}
                onClick={() => openOverlay({ noteId: note.id })}
                className="group relative w-full cursor-pointer rounded-xl border border-border bg-card p-4 hover:bg-muted/40 transition-colors"
              >
                <p className="text-sm font-medium text-foreground truncate pr-14">
                  {note.title || "Untitled"}
                </p>
                <p className="mt-1 text-sm text-foreground/70 line-clamp-2 pr-14">
                  {note.content}
                </p>
                <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePin(note.id);
                    }}
                    title={
                      pinnedIds.has(note.id)
                        ? t("scratchpad.unpin", { defaultValue: "Unpin" })
                        : t("scratchpad.pin", { defaultValue: "Pin" })
                    }
                    className={[
                      "flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-black/5 hover:text-foreground",
                      pinnedIds.has(note.id) ? "text-foreground" : "",
                    ].join(" ")}
                  >
                    {pinnedIds.has(note.id) ? <Pin size={13} /> : <PinOff size={13} />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeNote(note.id);
                    }}
                    title={t("scratchpad.deleteNote", { defaultValue: "Delete note" })}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
