import { useState } from "react";
import { X, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface MeetingBriefAttendee {
  email: string | null;
  displayName: string;
}

export interface MeetingBriefNote {
  id: number;
  title: string;
  updatedAt: string;
}

export interface MeetingBrief {
  attendees: MeetingBriefAttendee[];
  pastNotes: MeetingBriefNote[];
}

interface MeetingNotificationCardProps {
  title: string;
  body: string;
  startLabel: string;
  onStart?: () => void;
  onDismiss?: () => void;
  /** Controls the close button's hover fade. Ignored when `onDismiss` is absent. */
  closeVisible?: boolean;
  className?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Attendee + past-notes context. Renders nothing when absent/empty. */
  brief?: MeetingBrief | null;
  /** Called with a note id when a past-note item is clicked. */
  onOpenNote?: (noteId: number) => void;
}

/**
 * Presentational only — shared by the live always-on-top overlay
 * (`MeetingNotificationOverlay`) and the onboarding preview so the two never
 * drift. Behaviour (slide animation, IPC, hover) is layered on by the caller
 * via `className` and the handler props.
 */
export function MeetingNotificationCard({
  title,
  body,
  startLabel,
  onStart,
  onDismiss,
  closeVisible = true,
  className = "",
  onMouseEnter,
  onMouseLeave,
  brief,
  onOpenNote,
}: MeetingNotificationCardProps) {
  const { t } = useTranslation();
  const [showPastNotes, setShowPastNotes] = useState(false);
  const attendeeNames = brief?.attendees.map((a) => a.displayName).filter(Boolean) ?? [];
  const pastNotes = brief?.pastNotes ?? [];

  return (
    <div
      className={[
        "relative",
        "bg-card dark:bg-surface-2",
        "border border-border/40 dark:border-border-subtle/40",
        "rounded-xl shadow-lg p-2.5",
        className,
      ].join(" ")}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={[
            "absolute -left-2.5 -top-2.5 z-10 size-6 rounded-full",
            "flex items-center justify-center",
            "bg-card dark:bg-surface-2 border border-border/40 dark:border-border-subtle/40 shadow-sm",
            "text-muted-foreground/70 hover:text-foreground hover:bg-muted",
            "transition-all duration-150",
            closeVisible ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none",
          ].join(" ")}
        >
          <X className="size-3" />
        </button>
      )}

      <div className="flex items-center gap-2.5">
        <div className="shrink-0 bg-primary/10 rounded-md p-1">
          <svg viewBox="0 0 1024 1024" className="w-4.5 h-4.5">
            <defs>
              <linearGradient id="dhwaniMeetingCardGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8B6EF0" />
                <stop offset="100%" stopColor="#4A34A8" />
              </linearGradient>
            </defs>
            <rect width="1024" height="1024" rx="224" fill="url(#dhwaniMeetingCardGradient)" />
            <rect x="284" y="592" width="72" height="260" rx="36" fill="white" />
            <rect x="412" y="452" width="72" height="400" rx="36" fill="white" />
            <rect x="540" y="312" width="72" height="540" rx="36" fill="white" />
            <rect x="668" y="172" width="72" height="680" rx="36" fill="white" />
            <circle cx="704" cy="158" r="42" fill="#F5A94A" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-foreground leading-tight truncate">
            {title}
          </p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{body}</p>
        </div>

        <button
          onClick={onStart}
          className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors"
        >
          {startLabel}
        </button>
      </div>

      {attendeeNames.length > 0 && (
        <div className="mt-1.5 pl-[30px]">
          <p className="text-[10.5px] text-muted-foreground/80 truncate">
            {t("meetings.brief.with", { names: attendeeNames.join(", ") })}
          </p>

          {pastNotes.length > 0 && (
            <>
              <button
                onClick={() => setShowPastNotes((v) => !v)}
                className="mt-1 flex items-center gap-0.5 text-[10.5px] font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {t("meetings.brief.pastNotesToggle", { count: pastNotes.length })}
                <ChevronDown
                  className={[
                    "size-3 transition-transform duration-150",
                    showPastNotes ? "rotate-180" : "",
                  ].join(" ")}
                />
              </button>

              {showPastNotes && (
                <ul className="mt-1 space-y-0.5">
                  {pastNotes.map((note) => (
                    <li key={note.id}>
                      <button
                        onClick={() => onOpenNote?.(note.id)}
                        className="w-full text-left text-[10.5px] text-foreground/80 hover:text-primary hover:underline truncate transition-colors"
                        title={note.title}
                      >
                        {note.title || t("meetings.brief.untitledNote")}
                        <span className="text-muted-foreground/60">
                          {" · "}
                          {new Date(note.updatedAt).toLocaleDateString()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
