import * as React from "react";
import { X, Copy, Check, Info, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { ToastContext, type ToastProps } from "./useToast";

interface ToastState extends ToastProps {
  id: string;
  isExiting?: boolean;
  createdAt: number;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = React.useState<ToastState[]>([]);
  const timersRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const clearTimer = React.useCallback((id: string) => {
    const timer = timersRef.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timersRef.current[id];
    }
  }, []);

  const startExitAnimation = React.useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  const toast = React.useCallback(
    (props: Omit<ToastProps, "id">): string => {
      const id = Math.random().toString(36).substring(2, 11);
      const newToast: ToastState = {
        ...props,
        id,
        createdAt: Date.now(),
        duration: props.variant === "loading" ? 0 : props.duration,
      };

      setToasts((prev) => [...prev, newToast]);

      const isLoading = props.variant === "loading";
      const duration = isLoading ? 0 : (props.duration ?? (props.variant === "destructive" ? 6000 : 3500));
      if (duration > 0) {
        const timer = setTimeout(() => {
          startExitAnimation(id);
        }, duration);
        timersRef.current[id] = timer;
      }

      return id;
    },
    [startExitAnimation]
  );

  const dismiss = React.useCallback(
    (id?: string) => {
      if (id) {
        clearTimer(id);
        startExitAnimation(id);
      } else {
        const lastToast = toasts[toasts.length - 1];
        if (lastToast) {
          clearTimer(lastToast.id);
          startExitAnimation(lastToast.id);
        }
      }
    },
    [toasts, clearTimer, startExitAnimation]
  );

  const updateToast = React.useCallback(
    (id: string, patch: Partial<Omit<ToastProps, "id">>) => {
      clearTimer(id);
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch, createdAt: Date.now() } : t)));
      const duration = patch.duration ?? (patch.variant === "destructive" ? 6000 : 3500);
      if (patch.variant !== "loading" && duration > 0) {
        const timer = setTimeout(() => {
          startExitAnimation(id);
        }, duration);
        timersRef.current[id] = timer;
      }
    },
    [clearTimer, startExitAnimation]
  );

  const dismissAll = React.useCallback(() => {
    toasts.forEach((t) => clearTimer(t.id));
    setToasts([]);
  }, [toasts, clearTimer]);

  const promise = React.useCallback(
    <T,>(p: Promise<T>, opts: { loading: string; success: string | ((v: T) => string); error: string | ((e: unknown) => string) }): Promise<T> => {
      const id = toast({ title: opts.loading, variant: "loading" });
      return p.then(
        (value) => {
          const message = typeof opts.success === "function" ? opts.success(value) : opts.success;
          updateToast(id, { title: message, variant: "success" });
          return value;
        },
        (err) => {
          const message = typeof opts.error === "function" ? opts.error(err) : opts.error;
          updateToast(id, { title: message, variant: "destructive" });
          throw err;
        }
      );
    },
    [toast, updateToast]
  );

  const pauseTimer = React.useCallback(
    (id: string) => {
      clearTimer(id);
    },
    [clearTimer]
  );

  const resumeTimer = React.useCallback(
    (id: string, remainingTime: number) => {
      if (remainingTime > 0) {
        const timer = setTimeout(() => {
          startExitAnimation(id);
        }, remainingTime);
        timersRef.current[id] = timer;
      }
    },
    [startExitAnimation]
  );

  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id in timers) {
        clearTimeout(timers[id]);
      }
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss, dismissAll, promise, toastCount: toasts.length }}>
      {children}
      <ToastViewport
        toasts={toasts}
        onDismiss={dismiss}
        onPauseTimer={pauseTimer}
        onResumeTimer={resumeTimer}
      />
    </ToastContext.Provider>
  );
};

const ToastViewport: React.FC<{
  toasts: ToastState[];
  onDismiss: (id: string) => void;
  onPauseTimer: (id: string) => void;
  onResumeTimer: (id: string, remainingTime: number) => void;
}> = ({ toasts, onDismiss, onPauseTimer, onResumeTimer }) => {
  const isDictationPanel = React.useMemo(() => {
    return (
      window.location.pathname.indexOf("control") === -1 &&
      window.location.search.indexOf("panel=true") === -1
    );
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className={cn(
        "fixed z-[100] flex flex-col gap-1.5 pointer-events-none",
        isDictationPanel ? "bottom-20 right-6" : "bottom-5 right-5"
      )}
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          {...toast}
          onClose={() => onDismiss(toast.id)}
          onPauseTimer={() => onPauseTimer(toast.id)}
          onResumeTimer={(remaining) => onResumeTimer(toast.id, remaining)}
        />
      ))}
    </div>
  );
};

const variantConfig = {
  default: {
    icon: Info,
    tintVar: "var(--color-flow-accent)",
    progressClass: "bg-(--color-flow-accent)/40",
  },
  destructive: {
    icon: AlertCircle,
    tintVar: "var(--color-destructive)",
    progressClass: "bg-(--color-destructive)/30",
  },
  success: {
    icon: CheckCircle2,
    tintVar: "var(--color-success)",
    progressClass: "bg-(--color-success)/30",
  },
  loading: {
    icon: Loader2,
    tintVar: "var(--color-flow-accent)",
    progressClass: "bg-(--color-flow-accent)/40",
  },
};

const Toast: React.FC<
  ToastState & {
    onClose?: () => void;
    onPauseTimer: () => void;
    onResumeTimer: (remaining: number) => void;
  }
> = ({
  title,
  description,
  action,
  variant = "default",
  duration = 3500,
  isExiting,
  createdAt,
  onClose,
  onPauseTimer,
  onResumeTimer,
}) => {
  const config = variantConfig[variant];
  const pausedAtRef = React.useRef<number | null>(null);
  const [copied, setCopied] = React.useState(false);
  const isDestructive = variant === "destructive";

  const handleMouseEnter = () => {
    pausedAtRef.current = Date.now();
    onPauseTimer();
  };

  const handleMouseLeave = () => {
    if (pausedAtRef.current && duration > 0) {
      const elapsed = pausedAtRef.current - createdAt;
      const remaining = Math.max(duration - elapsed, 500);
      onResumeTimer(remaining);
    }
    pausedAtRef.current = null;
  };

  const handleCopyError = async () => {
    if (!description) return;
    try {
      await navigator.clipboard.writeText(description);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const message = title || description;
  const detail = title && description ? description : undefined;

  return (
    <div
      className={cn(
        "group toast-surface pointer-events-auto relative flex w-80 max-w-[90vw]",
        "rounded-[5px]",
        "transition-[opacity,transform] duration-200 ease-out",
        isExiting
          ? "opacity-0 translate-x-2 scale-[0.98]"
          : "opacity-100 translate-x-0 scale-100 animate-in slide-in-from-right-4 fade-in-0 duration-300"
      )}
      style={{ "--toast-tint": config.tintVar } as React.CSSProperties}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-start gap-2 flex-1 min-w-0 px-2.5 py-2">
        <div className="flex items-start pt-2 pl-2.5 shrink-0">
          <config.icon
            className={cn("size-4", variant === "loading" && "animate-spin")}
            style={{ color: config.tintVar }}
            aria-hidden="true"
          />
        </div>
        <div className="flex-1 min-w-0">
          {message && (
            <div className="text-xs font-medium leading-tight text-neutral-900 dark:text-white/90">{message}</div>
          )}
          {detail &&
            (isDestructive ? (
              <div
                className={cn(
                  "text-xs leading-snug mt-1 px-1.5 py-1 rounded-[3px] font-mono",
                  "bg-white/4 border border-white/6",
                  "text-red-300/80"
                )}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <span className="select-all wrap-break-word min-w-0">{detail}</span>
                  <button
                    onClick={handleCopyError}
                    className={cn(
                      "shrink-0 p-0.5 rounded-xs mt-px",
                      "text-white/30 hover:text-white/70",
                      "hover:bg-white/6",
                      "transition-colors duration-150"
                    )}
                    aria-label="Copy error"
                  >
                    {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs leading-snug mt-0.5 text-neutral-600 dark:text-white/45">{detail}</div>
            ))}
        </div>

        {action && <div className="shrink-0 self-center">{action}</div>}
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className={cn(
            "absolute -left-2 -top-2 size-6 rounded-full",
            "flex items-center justify-center",
            "bg-surface-3 dark:bg-surface-raised border border-border-subtle",
            "text-neutral-600 dark:text-white/70 hover:text-neutral-900 dark:hover:text-white hover:bg-surface-raised dark:hover:bg-surface-3",
            "opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100",
            "transition-all duration-150",
            "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
          )}
        >
          <X className="size-3" />
          <span className="sr-only">Close</span>
        </button>
      )}

      {duration > 0 && (
        <div className="absolute bottom-0 left-0.5 right-0 h-px overflow-hidden">
          <div
            className={cn("h-full", config.progressClass)}
            style={{
              animation: `toast-progress ${duration}ms linear forwards`,
            }}
          />
        </div>
      )}
    </div>
  );
};
