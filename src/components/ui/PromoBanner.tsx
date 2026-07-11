import { X } from "lucide-react";
import { cn } from "../lib/utils";

interface PromoBannerProps {
  title: React.ReactNode;
  description: React.ReactNode;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  onDismiss?: () => void;
  className?: string;
}

// ponytail: no licensed photography bundled — uses a dark gradient mesh
// instead of the blurred-photo backgrounds Wispr uses per page. Swap the
// `bg-gradient-to-br` below for a real background-image if art is added.
export default function PromoBanner({
  title,
  description,
  primaryAction,
  secondaryAction,
  onDismiss,
  className,
}: PromoBannerProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden p-6 shadow-md",
        "bg-gradient-to-br from-[#2a3038] via-[#3a3226] to-[#1f2420]",
        className
      )}
    >
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute top-3.5 right-3.5 z-10 p-1.5 rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-colors"
        >
          <X size={14} />
        </button>
      )}
      <div className="relative z-[1] max-w-md">
        <h3 className="font-serif italic text-white text-2xl mb-1.5 leading-snug">{title}</h3>
        <p className="text-white/65 text-sm mb-4 leading-relaxed">{description}</p>
        {(primaryAction || secondaryAction) && (
          <div className="flex items-center gap-4">
            {primaryAction && (
              <button
                onClick={primaryAction.onClick}
                className="h-8 px-3.5 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors"
              >
                {primaryAction.label}
              </button>
            )}
            {secondaryAction && (
              <button
                onClick={secondaryAction.onClick}
                className="text-sm font-medium text-white/85 hover:text-white transition-colors"
              >
                {secondaryAction.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function BetaBadge() {
  return (
    <span className="inline-flex items-center h-5 px-2 rounded-md bg-foreground text-background text-[11px] font-semibold">
      Beta
    </span>
  );
}
