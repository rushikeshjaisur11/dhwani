import React, { useState } from "react";
import {
  Home,
  MessageSquare,
  NotebookPen,
  BookOpen,
  Upload,
  Blocks,
  BarChart3,
  Settings,
  UserPlus,
  Search,
  Scissors,
  Palette,
  Wand2,
  FileText,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "./lib/utils";
import { getCachedPlatform } from "../utils/platform";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import InviteTeammateDialog from "./InviteTeammateDialog";
import CreateWorkspaceDialog from "./CreateWorkspaceDialog";
import { useWorkspace } from "../hooks/useWorkspace";
import { WORKSPACES_ENABLED } from "../lib/features";

const platform = getCachedPlatform();

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
}

export default function ControlPanelSidebar({
  activeView,
  onViewChange,
  onOpenSettings,
  onOpenSearch,
  updateAction,
}: ControlPanelSidebarProps) {
  const { t } = useTranslation();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const { active: activeWorkspace } = useWorkspace();

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
    { id: "chat", label: t("sidebar.chat"), icon: MessageSquare },
    { id: "personal-notes", label: t("sidebar.notes"), icon: NotebookPen },
    { id: "upload", label: t("sidebar.upload"), icon: Upload },
    { id: "integrations", label: t("sidebar.integrations"), icon: Blocks },
  ];

  return (
    <div className="w-56 h-full shrink-0 border-r border-border/15 dark:border-white/6 flex flex-col bg-surface-1/60 dark:bg-surface-1">
      <div
        className="w-full h-10 shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {WORKSPACES_ENABLED && (
        <div className="px-3 pt-2 pb-2">
          <WorkspaceSwitcher userName={null} />
        </div>
      )}

      {onOpenSearch && (
        <div className="px-2.5 pt-1 pb-2">
          <button
            onClick={onOpenSearch}
            className="group flex items-center w-full h-9 px-3 rounded-lg border border-border/70 dark:border-white/25 bg-transparent hover:bg-foreground/5 dark:hover:bg-white/5 transition-colors gap-2 outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
          >
            <Search size={14} className="text-muted-foreground/50 shrink-0" />
            <span className="flex-1 text-sm text-left text-muted-foreground/50">
              {t("commandSearch.shortPlaceholder")}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded border border-border bg-surface-2 text-[11px] font-medium text-muted-foreground leading-none">
                {platform === "darwin" ? "⌘" : "Ctrl"}
              </kbd>
              <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded border border-border bg-surface-2 text-[11px] font-medium text-muted-foreground leading-none">
                K
              </kbd>
            </div>
          </button>
        </div>
      )}

      <nav className="flex flex-col gap-1 px-2.5 pt-2 pb-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "group relative flex items-center gap-3 w-full h-10 px-3 rounded-lg outline-none transition-colors duration-150 text-left",
                "focus-visible:ring-1 focus-visible:ring-primary/30",
                isActive
                  ? "bg-card shadow-sm dark:bg-surface-raised"
                  : "hover:bg-foreground/4 dark:hover:bg-white/4 active:bg-foreground/6"
              )}
            >
              <Icon
                size={18}
                className={cn(
                  "shrink-0 transition-colors duration-150",
                  isActive
                    ? "text-foreground"
                    : "text-foreground/60 group-hover:text-foreground/75 dark:text-foreground/55 dark:group-hover:text-foreground/70"
                )}
              />
              <span
                className={cn(
                  "text-sm transition-colors duration-150",
                  isActive
                    ? "text-foreground font-semibold"
                    : "text-foreground/80 group-hover:text-foreground dark:text-foreground/75 dark:group-hover:text-foreground/90"
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="px-2.5 pb-2 space-y-1">
        {updateAction && (
          <div className="px-1 pb-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            {updateAction}
          </div>
        )}

        {WORKSPACES_ENABLED && (
          <button
            onClick={() => (activeWorkspace ? setInviteOpen(true) : setCreateWorkspaceOpen(true))}
            aria-label={
              activeWorkspace ? t("sidebar.inviteTeammate") : t("sidebar.createWorkspace")
            }
            className="group flex items-center gap-3 w-full h-10 px-3 rounded-lg text-left outline-none hover:bg-foreground/4 dark:hover:bg-white/4 focus-visible:ring-1 focus-visible:ring-primary/30 transition-colors duration-150"
          >
            <UserPlus
              size={18}
              className="shrink-0 text-foreground/60 group-hover:text-foreground/75 dark:text-foreground/50 dark:group-hover:text-foreground/65 transition-colors duration-150"
            />
            <span className="text-sm text-foreground/80 group-hover:text-foreground dark:text-foreground/70 dark:group-hover:text-foreground/85 transition-colors duration-150">
              {activeWorkspace ? t("sidebar.inviteTeammate") : t("sidebar.createWorkspace")}
            </span>
          </button>
        )}

        <button
          onClick={onOpenSettings}
          aria-label={t("sidebar.settings")}
          className="group flex items-center gap-3 w-full h-10 px-3 rounded-lg text-left outline-none hover:bg-foreground/4 dark:hover:bg-white/4 focus-visible:ring-1 focus-visible:ring-primary/30 transition-colors duration-150"
        >
          <Settings
            size={18}
            className="shrink-0 text-foreground/60 group-hover:text-foreground/75 dark:text-foreground/50 dark:group-hover:text-foreground/65 transition-colors duration-150"
          />
          <span className="text-sm text-foreground/80 group-hover:text-foreground dark:text-foreground/70 dark:group-hover:text-foreground/85 transition-colors duration-150">
            {t("sidebar.settings")}
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
