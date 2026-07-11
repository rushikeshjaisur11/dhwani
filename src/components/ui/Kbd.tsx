import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Keycap chip — amber badge with a thin black border, used for rendering a
 * prominent hotkey callout (e.g. the greeting's "Ctrl" + "Win"). Modeled on
 * the Wispr Flow reference UI. For generic/muted shortcut hints (e.g. a
 * search bar's "Ctrl K"), use a plain <kbd> instead — amber is reserved for
 * the one hotkey the UI wants to draw attention to.
 */
function Kbd({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center px-2.5 py-1 rounded-md",
        "bg-[var(--color-keycap-bg)] text-[var(--color-keycap-text)] border border-[var(--color-keycap-border)]",
        "text-sm font-bold leading-none",
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}

export { Kbd };
