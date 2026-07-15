import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronsUpDown, Plus, Check } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "./ui/popover";
import { useWorkspace } from "../hooks/useWorkspace";
import { cn } from "./lib/utils";
import CreateWorkspaceDialog from "./CreateWorkspaceDialog";
import { useSettingsStore } from "../stores/settingsStore";

function workspaceInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function WorkspaceSwitcher({ userName }: { userName?: string | null }) {
  const { t } = useTranslation();
  const { workspaces, active, setActive } = useWorkspace();
  const [createOpen, setCreateOpen] = useState(false);
  const isSidebarCollapsed = useSettingsStore((s) => s.isSidebarCollapsed);

  const label = active ? active.name : t("workspaces.switcher.personal");
  const initials = active ? workspaceInitials(active.name) : (userName?.[0]?.toUpperCase() ?? "P");

  return (
    <>
      <Popover>
        <PopoverTrigger
          className={cn(
            "group flex items-center w-full h-8 px-2 rounded-md outline-none gap-2",
            "hover:bg-foreground/5 dark:hover:bg-white/5 transition-all duration-300",
            "focus-visible:ring-1 focus-visible:ring-primary/30",
            isSidebarCollapsed ? "justify-center" : "justify-start"
          )}
        >
          <span
            className={cn(
              "shrink-0 w-5 h-5 rounded-md text-[10px] font-semibold flex items-center justify-center",
              active
                ? "bg-primary/12 text-primary"
                : "bg-foreground/8 text-foreground/70 dark:bg-white/8 dark:text-foreground/65"
            )}
          >
            {initials}
          </span>
          <span
            className={cn(
              "flex-1 text-xs text-left text-foreground/85 whitespace-nowrap overflow-hidden transition-all duration-300",
              isSidebarCollapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
            )}
          >
            {label}
          </span>
          <ChevronsUpDown
            size={12}
            className={cn(
              "text-foreground/40 shrink-0 transition-all duration-300",
              isSidebarCollapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
            )}
          />
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={4} className="w-72 p-3">
          <div className="mb-3 px-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium">
              {t("workspaces.switcher.workspaces")}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            {/* Personal Workspace Card */}
            <button
              onClick={() => setActive(null)}
              className={cn(
                "relative flex flex-col items-start gap-2 p-3 rounded-xl border text-left outline-none transition-all duration-200",
                "focus-visible:ring-1 focus-visible:ring-primary/30",
                !active
                  ? "bg-primary/5 border-primary/30 shadow-sm"
                  : "bg-card/50 border-border/50 hover:bg-foreground/5 dark:hover:bg-white/5 hover:border-border/80"
              )}
            >
              <div className="flex items-center justify-between w-full">
                <span
                  className={cn(
                    "shrink-0 w-8 h-8 rounded-lg text-xs font-semibold flex items-center justify-center",
                    !active
                      ? "bg-primary/15 text-primary"
                      : "bg-foreground/8 text-foreground/70 dark:bg-white/8 dark:text-foreground/65"
                  )}
                >
                  {userName?.[0]?.toUpperCase() ?? "P"}
                </span>
                {!active && (
                  <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <Check size={10} className="text-primary-foreground stroke-[3]" />
                  </div>
                )}
              </div>
              <div className="w-full">
                <div className="text-xs font-medium text-foreground truncate">{t("workspaces.switcher.personal")}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">Private to you</div>
              </div>
            </button>

            {/* Shared Workspaces */}
            {workspaces.map((ws) => {
              const isActive = active?.id === ws.id;
              return (
                <button
                  key={ws.id}
                  onClick={() => setActive(ws.id)}
                  className={cn(
                    "relative flex flex-col items-start gap-2 p-3 rounded-xl border text-left outline-none transition-all duration-200",
                    "focus-visible:ring-1 focus-visible:ring-primary/30",
                    isActive
                      ? "bg-primary/5 border-primary/30 shadow-sm"
                      : "bg-card/50 border-border/50 hover:bg-foreground/5 dark:hover:bg-white/5 hover:border-border/80"
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={cn(
                        "shrink-0 w-8 h-8 rounded-lg text-xs font-semibold flex items-center justify-center",
                        "bg-primary/15 text-primary"
                      )}
                    >
                      {workspaceInitials(ws.name)}
                    </span>
                    {isActive && (
                      <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <Check size={10} className="text-primary-foreground stroke-[3]" />
                      </div>
                    )}
                  </div>
                  <div className="w-full">
                    <div className="text-xs font-medium text-foreground truncate">{ws.name}</div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">Shared</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="h-px bg-border/40 w-full mb-3" />

          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 w-full h-8 px-2 rounded-lg text-xs font-medium text-foreground/80 hover:text-foreground hover:bg-foreground/5 dark:hover:bg-white/5 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
          >
            <div className="w-5 h-5 rounded flex items-center justify-center bg-foreground/5 dark:bg-white/5">
              <Plus size={12} className="text-foreground/70" />
            </div>
            {t("workspaces.switcher.create")}
          </button>
        </PopoverContent>
      </Popover>

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
