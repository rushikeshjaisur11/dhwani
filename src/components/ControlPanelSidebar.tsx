import React, { useState } from "react";
import {
  Home,
  BookOpen,
  BarChart3,
  Settings,
  UserPlus,
  Search,
  Scissors,
  Palette,
  Wand2,
  FileText,
  Gift,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "./lib/utils";
import { getCachedPlatform } from "../utils/platform";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import InviteTeammateDialog from "./InviteTeammateDialog";
import CreateWorkspaceDialog from "./CreateWorkspaceDialog";
import { useWorkspace } from "../hooks/useWorkspace";
import { WORKSPACES_ENABLED } from "../lib/features";
import { useSettingsStore } from "../stores/settingsStore";

const platform = getCachedPlatform();

// Keep type definition for compatibility with existing routes/state references
export type ControlPanelView =
  | "home"
  | "insights"
  | "dictionary"
  | "snippets"
  | "style"
  | "transforms"
  | "scratchpad"
  | "chat"
  | "personal-notes"
  | "upload"
  | "integrations";

interface ControlPanelSidebarProps {
  activeView: ControlPanelView;
  onViewChange: (view: ControlPanelView) => void;
  onOpenSettings: () => void;
  onOpenSearch?: () => void;
  updateAction?: React.ReactNode;
  isCollapsed?: boolean;
}

export default function ControlPanelSidebar({
  activeView,
  onViewChange,
  onOpenSettings,
  onOpenSearch,
  updateAction,
  isCollapsed = false,
}: ControlPanelSidebarProps) {
  const { t } = useTranslation();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const { active: activeWorkspace } = useWorkspace();
  const setIsSidebarCollapsed = useSettingsStore((s) => s.setIsSidebarCollapsed);

  // Redefined navigation items to only include the 7 views shown in the Flow screenshots
  const navItems: {
    id: ControlPanelView;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }[] = [
    { id: "home", label: t("sidebar.home"), icon: Home },
    { id: "insights", label: t("sidebar.insights"), icon: BarChart3 },
    { id: "dictionary", label: t("sidebar.dictionary"), icon: BookOpen },
    { id: "snippets", label: t("sidebar.snippets"), icon: Scissors },
    { id: "style", label: t("sidebar.style"), icon: Palette },
    { id: "transforms", label: t("sidebar.transforms"), icon: Wand2 },
    { id: "scratchpad", label: t("sidebar.scratchpad"), icon: FileText },
  ];

  return (
    <div
      className={cn(
        "absolute top-0 left-0 h-full flex flex-col bg-transparent z-30 overflow-hidden",
        "transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
        isCollapsed ? "w-14 border-r border-border/10" : "w-56"
      )}
    >
      {/* Header spacing */}
      <div
        className="w-full h-4 shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {/* Rebranded Dhwani / Pro Trial Header */}
      <div className={cn("flex items-center px-5 pt-2 pb-3 select-none", isCollapsed ? "justify-center px-0" : "gap-2")}>
        {/* Soundwave/Logo Icon */}
        <div className="flex items-end gap-[3.5px] h-4 shrink-0 justify-center">
          <div className="w-[3px] h-2 bg-foreground dark:bg-white rounded-full" />
          <div className="w-[3px] h-4 bg-foreground dark:bg-white rounded-full animate-pulse" />
          <div className="w-[3px] h-2.5 bg-foreground dark:bg-white rounded-full" />
          <div className="w-[3px] h-3.5 bg-foreground dark:bg-white rounded-full" />
        </div>
        <span
          className={cn(
            "font-bold tracking-tight text-lg text-foreground whitespace-nowrap overflow-hidden transition-all duration-300",
            isCollapsed ? "opacity-0 w-0" : "opacity-100"
          )}
        >
          Dhwani
        </span>
      </div>

      {WORKSPACES_ENABLED && (
        <div className="px-3 pt-2 pb-2">
          <WorkspaceSwitcher userName={null} />
        </div>
      )}

      {onOpenSearch && (
        <div className="px-2.5 pt-1 pb-2">
          <button
            onClick={onOpenSearch}
            className={cn(
              "group flex items-center w-full h-9 rounded-lg border border-border/50 dark:border-white/15 bg-white/40 dark:bg-white/5 hover:bg-foreground/5 dark:hover:bg-white/10 transition-all outline-none focus-visible:ring-1 focus-visible:ring-primary/30",
              isCollapsed ? "px-0 justify-center" : "px-3 justify-start gap-2"
            )}
          >
            <Search size={14} className="text-muted-foreground/50 shrink-0" />
            <span
              className={cn(
                "text-[13px] text-left text-muted-foreground/50 transition-all duration-300 whitespace-nowrap overflow-hidden",
                isCollapsed ? "opacity-0 w-0 flex-none" : "flex-1 opacity-100 w-auto"
              )}
            >
              {t("commandSearch.shortPlaceholder")}
            </span>
            <div
              className={cn(
                "flex items-center gap-1 shrink-0 transition-all duration-300 overflow-hidden",
                isCollapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
              )}
            >
              <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded border border-border bg-surface-2 text-[10px] font-medium text-muted-foreground leading-none">
                {platform === "darwin" ? "⌘" : "Ctrl"}
              </kbd>
              <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded border border-border bg-surface-2 text-[10px] font-medium text-muted-foreground leading-none">
                K
              </kbd>
            </div>
          </button>
        </div>
      )}

      <nav className="flex flex-col gap-0.5 px-2.5 pt-2 pb-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "group relative flex items-center w-full h-10 rounded-lg outline-none transition-colors duration-150 text-left",
                "focus-visible:ring-1 focus-visible:ring-primary/30",
                isActive
                  ? "bg-white shadow-sm border border-border/10 dark:bg-surface-raised"
                  : "hover:bg-foreground/4 dark:hover:bg-white/4 active:bg-foreground/6",
                isCollapsed ? "px-0 justify-center" : "px-3 justify-start gap-3"
              )}
            >
              <Icon
                size={16}
                className={cn(
                  "shrink-0 transition-all duration-150 group-hover:scale-110",
                  isActive
                    ? "text-foreground"
                    : "text-foreground/60 group-hover:text-foreground/75 dark:text-foreground/55 dark:group-hover:text-foreground/70"
                )}
              />
              <span
                className={cn(
                  "text-[13px] transition-all duration-300 whitespace-nowrap overflow-hidden",
                  isActive
                    ? "text-foreground font-semibold"
                    : "text-foreground/80 group-hover:text-foreground dark:text-foreground/75 dark:group-hover:text-foreground/90",
                  isCollapsed ? "opacity-0 w-0" : "opacity-100 w-auto ml-1"
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="px-2.5 pb-4 space-y-0.5">
        {updateAction && (
          <div className="px-1 pb-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            {updateAction}
          </div>
        )}

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className={cn(
            "group flex items-center w-full h-9 rounded-lg text-left outline-none hover:bg-foreground/4 dark:hover:bg-white/4 focus-visible:ring-1 focus-visible:ring-primary/30 transition-colors duration-150",
            isCollapsed ? "px-0 justify-center" : "px-3 justify-start gap-3"
          )}
        >
          <Settings
            size={16}
            className="shrink-0 text-foreground/60 group-hover:text-foreground/75 dark:text-foreground/50 dark:group-hover:text-foreground/65 transition-colors duration-150"
          />
          <span
            className={cn(
              "text-xs text-foreground/80 group-hover:text-foreground dark:text-foreground/70 dark:group-hover:text-foreground/85 transition-all duration-300 whitespace-nowrap overflow-hidden",
              isCollapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
            )}
          >
            Settings
          </span>
        </button>

        {/* Help */}
        <button
          onClick={() => {
            window.electronAPI?.openExternal?.(
              "https://github.com/rushikeshjaisur11/dhwani/blob/main/README.md"
            );
          }}
          className={cn(
            "group flex items-center w-full h-9 rounded-lg text-left outline-none hover:bg-foreground/4 dark:hover:bg-white/4 focus-visible:ring-1 focus-visible:ring-primary/30 transition-colors duration-150",
            isCollapsed ? "px-0 justify-center" : "px-3 justify-start gap-3"
          )}
        >
          <HelpCircle
            size={16}
            className="shrink-0 text-foreground/60 group-hover:text-foreground/75 dark:text-foreground/50 dark:group-hover:text-foreground/65 transition-colors duration-150"
          />
          <span
            className={cn(
              "text-xs text-foreground/80 group-hover:text-foreground dark:text-foreground/70 dark:group-hover:text-foreground/85 transition-all duration-300 whitespace-nowrap overflow-hidden",
              isCollapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
            )}
          >
            Help
          </span>
        </button>

        {/* Toggle Collapse */}
        <button
          onClick={() => setIsSidebarCollapsed(!isCollapsed)}
          className={cn(
            "group flex items-center w-full h-9 rounded-lg text-left outline-none hover:bg-foreground/4 dark:hover:bg-white/4 focus-visible:ring-1 focus-visible:ring-primary/30 transition-colors duration-150",
            isCollapsed ? "px-0 justify-center" : "px-3 justify-start gap-3"
          )}
        >
          {isCollapsed ? (
            <PanelLeftOpen size={16} className="shrink-0 text-foreground/60 group-hover:text-foreground/75 dark:text-foreground/50 dark:group-hover:text-foreground/65 transition-colors duration-150" />
          ) : (
            <PanelLeftClose size={16} className="shrink-0 text-foreground/60 group-hover:text-foreground/75 dark:text-foreground/50 dark:group-hover:text-foreground/65 transition-colors duration-150" />
          )}
          <span
            className={cn(
              "text-xs text-foreground/80 group-hover:text-foreground dark:text-foreground/70 dark:group-hover:text-foreground/85 transition-all duration-300 whitespace-nowrap overflow-hidden",
              isCollapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
            )}
          >
            {isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          </span>
        </button>
      </div>

      {WORKSPACES_ENABLED && activeWorkspace && (
        <InviteTeammateDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          workspaceId={activeWorkspace.id}
          workspaceName={activeWorkspace.name}
        />
      )}
      {WORKSPACES_ENABLED && (
        <CreateWorkspaceDialog open={createWorkspaceOpen} onOpenChange={setCreateWorkspaceOpen} />
      )}
    </div>
  );
}
