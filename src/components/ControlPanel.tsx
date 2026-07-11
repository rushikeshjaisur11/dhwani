import React, { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { Download, RefreshCw, Loader2, AlertTriangle, Zap, ChevronLeft, Bell } from "lucide-react";
import PostMigrationOnboarding from "./PostMigrationOnboarding";
import { ConfirmDialog, AlertDialog } from "./ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { useDialogs } from "../hooks/useDialogs";
import { useHotkey } from "../hooks/useHotkey";
import { useTraySync } from "../hooks/useTraySync";
import { useToast } from "./ui/useToast";
import { useUpdater } from "../hooks/useUpdater";
import { useSettings } from "../hooks/useSettings";
import { useAuth } from "../hooks/useAuth";
import {
  useTranscriptions,
  useShowDiscarded,
  initializeTranscriptions,
  removeTranscription as removeFromStore,
  updateTranscription as updateInStore,
  clearTranscriptions as clearStore,
} from "../stores/transcriptionStore";
import { useSettingsStore } from "../stores/settingsStore";
import {
  useIsMeetingMode,
  useIsNarrowWindow,
  useMeetingRecordingStore,
} from "../stores/meetingRecordingStore";
import ControlPanelSidebar, { type ControlPanelView } from "./ControlPanelSidebar";
import MeetingRecordingMount from "./MeetingRecordingMount";
import MeetingRecordingPill from "./notes/MeetingRecordingPill";
import WindowControls from "./WindowControls";

import { getCachedPlatform } from "../utils/platform";
import { isAccessibilitySkipped } from "../utils/permissions";
import {
  setActiveNoteId,
  setActiveFolderId,
  useActiveNoteId,
  initializeNotes,
} from "../stores/noteStore";
import { fetchProviders as fetchStreamingProviders } from "../stores/streamingProvidersStore";
import HistoryView from "./HistoryView";
import ContextPanel from "./ContextPanel";
import BackgroundActionToastListener from "./notes/BackgroundActionToastListener";
import { syncService } from "../services/SyncService.js";
import AcceptInvitationModal from "./AcceptInvitationModal";
import {
  consumePendingInvitationToken,
  clearPendingInvitationToken,
} from "../utils/pendingInvitationToken";
import { WORKSPACES_ENABLED } from "../lib/features";

const platform = getCachedPlatform();

const SettingsModal = React.lazy(() => import("./SettingsModal"));
const PersonalNotesView = React.lazy(() => import("./notes/PersonalNotesView"));
const DictionaryView = React.lazy(() => import("./DictionaryView"));
const InsightsView = React.lazy(() => import("./InsightsView"));
const UploadAudioView = React.lazy(() => import("./notes/UploadAudioView"));
const IntegrationsView = React.lazy(() => import("./IntegrationsView"));
const SnippetsView = React.lazy(() => import("./SnippetsView"));
const StyleView = React.lazy(() => import("./StyleView"));
const TransformsView = React.lazy(() => import("./TransformsView"));
const ScratchpadView = React.lazy(() => import("./ScratchpadView"));
const ChatView = React.lazy(() => import("./chat/ChatView"));
const CommandSearch = React.lazy(() => import("./CommandSearch"));

interface ControlPanelProps {
  /** Open the settings modal at this section on mount (e.g. after onboarding). */
  initialSettingsSection?: string;
}

export default function ControlPanel({ initialSettingsSection }: ControlPanelProps = {}) {
  const { t } = useTranslation();
  const userName = localStorage.getItem("userName") ?? "Rushikesh";
  const history = useTranscriptions();
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(!!initialSettingsSection);
  const [showPostMigration, setShowPostMigration] = useState(false);
  const [settingsSection, setSettingsSection] = useState<string | undefined>(
    initialSettingsSection
  );
  const [aiCTADismissed, setAiCTADismissed] = useState(
    () => localStorage.getItem("aiCTADismissed") === "true"
  );
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const showDiscarded = useShowDiscarded();
  const [activeView, setActiveView] = useState<ControlPanelView>("home");
  const isMeetingMode = useIsMeetingMode();
  const isNarrowWindow = useIsNarrowWindow();
  const activeNoteId = useActiveNoteId();
  const isSidePanelLayout =
    isMeetingMode || (isNarrowWindow && activeView === "personal-notes" && activeNoteId != null);
  const recordingNoteId = useMeetingRecordingStore((s) => s.recordingNoteId);
  const recordingFolderId = useMeetingRecordingStore((s) => s.recordingFolderId);
  const [meetingRecordingRequest, setMeetingRecordingRequest] = useState<{
    noteId: number;
    folderId: number;
    event: any;
  } | null>(null);
  const [gpuAccelAvailable, setGpuAccelAvailable] = useState<{ cuda: boolean; vulkan: boolean }>({
    cuda: false,
    vulkan: false,
  });
  const [gpuBannerDismissed, setGpuBannerDismissed] = useState(
    () => localStorage.getItem("gpuBannerDismissedUnified") === "true"
  );
  const updateReadyToastShown = useRef(false);
  const updateErrorToastShown = useRef<Error | null>(null);
  const { hotkey } = useHotkey();
  const { toast } = useToast();
  useTraySync();

  useEffect(() => {
    return window.electronAPI.onOpenSettingsSection?.((section) => {
      setSettingsSection(section);
      setShowSettings(true);
    });
  }, []);
  const {
    useLocalWhisper,
    localTranscriptionProvider,
    useCleanupModel,
    setUseLocalWhisper,
    setCloudTranscriptionMode,
  } = useSettings();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();

  const {
    status: updateStatus,
    downloadProgress,
    isDownloading,
    isInstalling,
    downloadUpdate,
    installUpdate,
    error: updateError,
  } = useUpdater();

  const {
    confirmDialog,
    alertDialog,
    showConfirmDialog,
    showAlertDialog,
    hideConfirmDialog,
    hideAlertDialog,
  } = useDialogs();

  const loadTranscriptions = useCallback(
    async (includeDiscarded?: boolean) => {
      try {
        setIsLoading(true);
        await initializeTranscriptions(undefined, includeDiscarded);
      } catch {
        showAlertDialog({
          title: t("controlPanel.history.couldNotLoadTitle"),
          description: t("controlPanel.history.couldNotLoadDescription"),
        });
      } finally {
        setIsLoading(false);
      }
    },
    [showAlertDialog, t]
  );

  useEffect(() => {
    loadTranscriptions();
  }, [loadTranscriptions]);

  useEffect(() => {
    const { noteFilesEnabled, noteFilesPath } = useSettingsStore.getState();
    if (!noteFilesEnabled) return;
    window.electronAPI?.noteFilesSetEnabled?.(true, noteFilesPath || undefined, {
      skipRebuild: true,
    });
  }, []);

  useEffect(() => {
    if (platform !== "darwin") return;
    window.electronAPI?.getPostMigrationState?.().then((state) => {
      if (state?.justMigrated) setShowPostMigration(true);
    });
  }, []);

  const dismissPostMigrationPermanently = useCallback(async () => {
    await window.electronAPI?.markBundleMigrated?.();
    setShowPostMigration(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = platform === "darwin" ? e.metaKey : e.ctrlKey;
      if (mod && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
      } else if (mod && e.key === ",") {
        e.preventDefault();
        setShowSettings(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (updateStatus.updateDownloaded && !isDownloading) {
      if (!updateReadyToastShown.current) {
        updateReadyToastShown.current = true;
        toast({
          title: t("controlPanel.update.readyTitle"),
          description: t("controlPanel.update.readyDescription"),
          variant: "success",
        });
      }
    } else {
      updateReadyToastShown.current = false;
    }
  }, [updateStatus.updateDownloaded, isDownloading, toast, t]);

  useEffect(() => {
    if (updateError && updateError !== updateErrorToastShown.current) {
      updateErrorToastShown.current = updateError;
      toast({
        title: t("controlPanel.update.problemTitle"),
        description: t("controlPanel.update.problemDescription"),
        variant: "destructive",
      });
    }
    if (!updateError) {
      updateErrorToastShown.current = null;
    }
  }, [updateError, toast, t]);

  useEffect(() => {
    if (!WORKSPACES_ENABLED) return;
    const unsubscribe = window.electronAPI?.onWorkspaceInvitationToken?.((token) => {
      setInvitationToken(token);
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (!WORKSPACES_ENABLED || !authLoaded || !isSignedIn) return;
    const pending = consumePendingInvitationToken();
    if (pending) {
      setInvitationToken(pending);
      clearPendingInvitationToken();
    }
  }, [authLoaded, isSignedIn]);

  useEffect(() => {
    if (platform === "darwin" || gpuBannerDismissed) return;
    const detect = async () => {
      const results = { cuda: false, vulkan: false };
      if (useLocalWhisper && localTranscriptionProvider === "whisper") {
        try {
          const status = await window.electronAPI?.getCudaWhisperStatus?.();
          if (status?.gpuInfo.hasNvidiaGpu && !status.downloaded) results.cuda = true;
        } catch {}
      }
      if (useCleanupModel) {
        try {
          const [gpu, vulkan] = await Promise.all([
            window.electronAPI?.detectVulkanGpu?.(),
            window.electronAPI?.getLlamaVulkanStatus?.(),
          ]);
          if (gpu?.available && !vulkan?.downloaded) results.vulkan = true;
        } catch {}
      }
      setGpuAccelAvailable(results);
    };
    detect();
  }, [useLocalWhisper, localTranscriptionProvider, useCleanupModel, gpuBannerDismissed]);

  useEffect(() => {
    const drain = async () => {
      const data = await window.electronAPI?.getPendingMeetingNoteNavigation?.();
      if (!data) return;
      setActiveFolderId(data.folderId);
      setActiveNoteId(data.noteId);
      setActiveView("personal-notes");
      setMeetingRecordingRequest({
        noteId: data.noteId,
        folderId: data.folderId,
        event: data.event,
      });
      initializeNotes(null, 50, data.folderId);
      if (
        data.trigger === "hotkey" &&
        useSettingsStore.getState().meetingHotkeyLayoutMode === "side-panel"
      ) {
        window.electronAPI?.snapToMeetingMode?.();
      }
    };
    drain();
    const cleanup = window.electronAPI?.onMeetingNoteNavigationPending?.(drain);
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    const cleanup = window.electronAPI?.onNavigateToNote?.((data) => {
      if (data.folderId) {
        setActiveFolderId(data.folderId);
        initializeNotes(null, 50, data.folderId);
      }
      setActiveNoteId(data.noteId);
      setActiveView("personal-notes");
    });
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    const cleanup = window.electronAPI?.onShowSettings?.(() => {
      setShowSettings(true);
    });
    return () => cleanup?.();
  }, []);

  // When accessibility is missing on macOS, open the permissions settings page
  useEffect(() => {
    const cleanup = window.electronAPI?.onAccessibilityMissing?.(async () => {
      if (isAccessibilitySkipped()) return;
      const migration = await window.electronAPI?.getPostMigrationState?.();
      if (migration?.justMigrated) return;
      setSettingsSection("privacyData");
      setShowSettings(true);
      toast({
        title: t("controlPanel.accessibilityMissing.title"),
        description: t("controlPanel.accessibilityMissing.description"),
        duration: 10000,
      });
    });
    return () => cleanup?.();
  }, [toast, t]);

  useEffect(() => {
    syncService.syncAll().catch(console.error);
  }, []);

  useEffect(() => {
    fetchStreamingProviders();
  }, []);

  const handleMeetingRecordingRequestHandled = useCallback(
    () => setMeetingRecordingRequest(null),
    []
  );

  const handleExitMeetingMode = useCallback(() => {
    window.electronAPI?.restoreFromMeetingMode?.();
  }, []);

  const copyToClipboard = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast({
          title: t("controlPanel.history.copiedTitle"),
          description: t("controlPanel.history.copiedDescription"),
          variant: "success",
          duration: 2000,
        });
      } catch (err) {
        toast({
          title: t("controlPanel.history.couldNotCopyTitle"),
          description: t("controlPanel.history.couldNotCopyDescription"),
          variant: "destructive",
        });
      }
    },
    [toast, t]
  );

  const deleteTranscription = useCallback(
    async (id: number) => {
      showConfirmDialog({
        title: t("controlPanel.history.deleteTitle"),
        description: t("controlPanel.history.deleteDescription"),
        onConfirm: async () => {
          try {
            const result = await window.electronAPI.deleteTranscription(id);
            if (result.success) {
              removeFromStore(id);
              syncService.syncAll().catch(console.error);
            } else {
              showAlertDialog({
                title: t("controlPanel.history.couldNotDeleteTitle"),
                description: t("controlPanel.history.couldNotDeleteDescription"),
              });
            }
          } catch {
            showAlertDialog({
              title: t("controlPanel.history.couldNotDeleteTitle"),
              description: t("controlPanel.history.couldNotDeleteDescriptionGeneric"),
            });
          }
        },
        variant: "destructive",
      });
    },
    [showConfirmDialog, showAlertDialog, t]
  );

  const clearAllTranscriptions = useCallback(() => {
    showConfirmDialog({
      title: t("controlPanel.history.clearAllTitle"),
      description: t("controlPanel.history.clearAllDescription"),
      onConfirm: async () => {
        try {
          const result = await window.electronAPI.clearTranscriptions();
          if (result.success) {
            clearStore();
            syncService.syncAll().catch(console.error);
            toast({
              title: t("controlPanel.history.clearAllSuccess"),
              variant: "success",
              duration: 2000,
            });
          } else {
            showAlertDialog({
              title: t("controlPanel.history.clearAllErrorTitle"),
              description: t("controlPanel.history.clearAllErrorDescription"),
            });
          }
        } catch {
          showAlertDialog({
            title: t("controlPanel.history.clearAllErrorTitle"),
            description: t("controlPanel.history.clearAllErrorDescription"),
          });
        }
      },
      variant: "destructive",
    });
  }, [showConfirmDialog, showAlertDialog, toast, t]);

  const showAudioInFolder = useCallback(
    async (id: number) => {
      try {
        const result = await window.electronAPI.showAudioInFolder(id);
        if (!result?.success) {
          toast({
            title: t("controlPanel.history.audioNotFound"),
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: t("controlPanel.history.audioNotFound"),
          variant: "destructive",
        });
      }
    },
    [toast, t]
  );

  const retryTranscription = useCallback(
    async (id: number, options?: { isRecover?: boolean }) => {
      try {
        const s = useSettingsStore.getState();
        const result = await window.electronAPI.retryTranscription(id, {
          useLocalWhisper: s.useLocalWhisper,
          localTranscriptionProvider: s.localTranscriptionProvider,
          cloudTranscriptionMode: s.cloudTranscriptionMode,
          cloudTranscriptionProvider: s.cloudTranscriptionProvider,
          cloudTranscriptionModel: s.cloudTranscriptionModel,
          cloudTranscriptionBaseUrl: s.cloudTranscriptionBaseUrl,
          parakeetModel: s.parakeetModel,
          whisperModel: s.whisperModel,
          preferredLanguage: s.preferredLanguage,
          transcriptionMode: s.transcriptionMode,
          remoteTranscriptionType: s.remoteTranscriptionType,
          remoteTranscriptionUrl: s.remoteTranscriptionUrl,
        });
        if (result.success && result.transcription) {
          const rawText = result.transcription.text;
          let finalTranscription = result.transcription;

          // Apply AI reasoning if enabled
          if (useCleanupModel) {
            try {
              const [
                { default: ReasoningService },
                { getEffectiveCleanupModel, isCloudCleanupMode, getSettings },
              ] = await Promise.all([
                import("../services/ReasoningService"),
                import("../stores/settingsStore"),
              ]);
              const model = getEffectiveCleanupModel();
              const isCloud = isCloudCleanupMode();
              if (model || isCloud) {
                const agentName = localStorage.getItem("agentName") || null;
                const reasonedText = await ReasoningService.processText(rawText, model, agentName, {
                  disableThinking: getSettings().cleanupDisableThinking,
                });
                if (reasonedText && reasonedText !== rawText) {
                  const updated = await window.electronAPI.updateTranscriptionText(
                    id,
                    reasonedText,
                    rawText
                  );
                  if (updated.success && updated.transcription) {
                    finalTranscription = updated.transcription;
                  }
                }
              }
            } catch {
              // Reasoning failed — keep the raw STT result
            }
          }

          updateInStore(finalTranscription);
          toast({
            title: t(
              options?.isRecover
                ? "controlPanel.history.discarded.recovered"
                : "controlPanel.history.retrySuccess"
            ),
          });
        } else {
          toast({
            title: t("controlPanel.history.retryError"),
            description: result.error,
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: t("controlPanel.history.retryError"),
          variant: "destructive",
        });
      }
    },
    [toast, t, useCleanupModel]
  );

  const toggleShowDiscarded = useCallback(() => {
    loadTranscriptions(!showDiscarded);
  }, [loadTranscriptions, showDiscarded]);

  const handleUpdateClick = async () => {
    if (updateStatus.updateDownloaded) {
      showConfirmDialog({
        title: t("controlPanel.update.installTitle"),
        description: t("controlPanel.update.installDescription"),
        onConfirm: async () => {
          try {
            await installUpdate();
          } catch (error) {
            toast({
              title: t("controlPanel.update.couldNotInstallTitle"),
              description: t("controlPanel.update.couldNotInstallDescription"),
              variant: "destructive",
            });
          }
        },
      });
    } else if (updateStatus.updateAvailable && !isDownloading) {
      try {
        await downloadUpdate();
      } catch (error) {
        toast({
          title: t("controlPanel.update.couldNotDownloadTitle"),
          description: t("controlPanel.update.couldNotDownloadDescription"),
          variant: "destructive",
        });
      }
    }
  };

  const getUpdateButtonContent = () => {
    if (isInstalling) {
      return (
        <>
          <Loader2 size={14} className="animate-spin" />
          <span>{t("controlPanel.update.installing")}</span>
        </>
      );
    }
    if (isDownloading) {
      return (
        <>
          <Loader2 size={14} className="animate-spin" />
          <span>{Math.round(downloadProgress)}%</span>
        </>
      );
    }
    if (updateStatus.updateDownloaded) {
      return (
        <>
          <RefreshCw size={14} />
          <span>{t("controlPanel.update.installButton")}</span>
        </>
      );
    }
    if (updateStatus.updateAvailable) {
      return (
        <>
          <Download size={14} />
          <span>{t("controlPanel.update.availableButton")}</span>
        </>
      );
    }
    return null;
  };

  const hasUpdateNotification =
    !updateStatus.isDevelopment && (updateStatus.updateAvailable || updateStatus.updateDownloaded);

  const handleNotificationAction = async () => {
    setShowNotifications(false);
    await handleUpdateClick();
  };

  return (
    <div className="h-screen bg-background flex flex-col">
      <MeetingRecordingMount />
      <MeetingRecordingPill
        activeView={activeView}
        activeNoteId={activeNoteId}
        onReturnToNote={() => {
          setActiveView("personal-notes");
          setActiveFolderId(recordingFolderId);
          setActiveNoteId(recordingNoteId);
        }}
      />
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={hideConfirmDialog}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant={confirmDialog.variant}
      />

      <AlertDialog
        open={alertDialog.open}
        onOpenChange={hideAlertDialog}
        title={alertDialog.title}
        description={alertDialog.description}
        onOk={() => {}}
      />

      <PostMigrationOnboarding
        open={showPostMigration}
        onOpenChange={setShowPostMigration}
        onDone={dismissPostMigrationPermanently}
      />

      {showSettings && (
        <Suspense fallback={null}>
          <SettingsModal
            open={showSettings}
            onOpenChange={(open) => {
              setShowSettings(open);
              if (!open) setSettingsSection(undefined);
            }}
            initialSection={settingsSection}
          />
        </Suspense>
      )}

      {WORKSPACES_ENABLED && (
        <AcceptInvitationModal
          token={invitationToken}
          onClose={() => setInvitationToken(null)}
          isSignedIn={isSignedIn}
          onSignIn={() => {
            setInvitationToken(null);
          }}
        />
      )}

      {showSearch && (
        <Suspense fallback={null}>
          <CommandSearch
            open={showSearch}
            onOpenChange={setShowSearch}
            transcriptions={history}
            onNoteSelect={(id, folderId) => {
              if (folderId) setActiveFolderId(folderId);
              setActiveNoteId(id);
              setActiveView("personal-notes");
            }}
            onTranscriptSelect={() => {
              setActiveView("home");
            }}
          />
        </Suspense>
      )}

      {/* Top Window Bar (spans full width) */}
      <div
        className="flex items-center justify-between w-full h-11 shrink-0 px-4 mt-1.5 select-none"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-2.5"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {/* Sidebar toggle icon (styled static placeholder for layout parity) */}
          <button
            onClick={() => {}}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-foreground/75 hover:text-foreground transition-colors cursor-pointer"
            title="Toggle Sidebar"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>

          {/* User Profile Avatar */}
          <div
            onClick={() => {
              setSettingsSection("general");
              setShowSettings(true);
            }}
            className="w-6 h-6 rounded-full bg-[#EDE4FB] border border-[#C4B0F7]/40 flex items-center justify-center text-[11px] font-bold text-[#2B1A47] cursor-pointer hover:opacity-90 select-none uppercase"
            title={t("sidebar.settings")}
          >
            {userName.charAt(0)}
          </div>
        </div>

        {/* Drag space in the middle */}
        <div className="flex-1 h-full" />

        <div
          className="flex items-center gap-2.5"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {/* Notification Bell */}
          <Popover open={showNotifications} onOpenChange={setShowNotifications}>
            <PopoverTrigger asChild>
              <button
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-foreground/75 hover:text-foreground transition-colors relative cursor-pointer"
                title={t("controlPanel.notifications.title")}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {hasUpdateNotification && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-primary rounded-full" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0">
              <div className="px-3 py-2.5 border-b border-border/40 text-sm font-semibold">
                {t("controlPanel.notifications.title")}
              </div>
              {hasUpdateNotification ? (
                <button
                  onClick={handleNotificationAction}
                  disabled={isDownloading || isInstalling}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer disabled:cursor-default"
                >
                  <Bell size={14} className="mt-0.5 shrink-0 text-primary" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {updateStatus.updateDownloaded
                        ? t("controlPanel.notifications.updateDownloadedTitle")
                        : t("controlPanel.notifications.updateAvailableTitle")}
                    </div>
                    <div className="text-xs text-foreground/60 mt-0.5">
                      {updateStatus.updateDownloaded
                        ? t("controlPanel.notifications.updateDownloadedDescription")
                        : t("controlPanel.notifications.updateAvailableDescription")}
                    </div>
                  </div>
                </button>
              ) : (
                <div className="px-3 py-4 text-sm text-foreground/50 text-center">
                  {t("controlPanel.notifications.empty")}
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Window Controls */}
          {platform !== "darwin" && <WindowControls />}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div
          className="shrink-0 overflow-hidden transition-[width] duration-300 ease-out"
          style={{ width: isSidePanelLayout ? 0 : undefined }}
        >
          <ControlPanelSidebar
            activeView={activeView}
            onViewChange={setActiveView}
            onOpenSearch={() => setShowSearch(true)}
            onOpenSettings={() => {
              setSettingsSection(undefined);
              setShowSettings(true);
            }}
            updateAction={
              !updateStatus.isDevelopment &&
              (updateStatus.updateAvailable ||
                updateStatus.updateDownloaded ||
                isDownloading ||
                isInstalling) ? (
                <Button
                  variant={updateStatus.updateDownloaded ? "default" : "outline"}
                  size="sm"
                  onClick={handleUpdateClick}
                  disabled={isInstalling || isDownloading}
                  className="gap-1.5 text-xs w-full h-7"
                >
                  {getUpdateButtonContent()}
                </Button>
              ) : undefined
            }
          />
        </div>

        {/* Main Content Card (Middle) */}
        <main className="flex-1 flex flex-col overflow-hidden m-3 mt-0 mr-3 mb-3 bg-card rounded-[24px] border border-border/40 dark:border-white/5 shadow-sm">
          {isSidePanelLayout && (
            <div
              className="h-12 flex items-center px-4 border-b border-border/10 shrink-0"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <Button
                variant="outline-flat"
                size="sm"
                onClick={handleExitMeetingMode}
                className="h-7 px-2.5 pl-1.5 gap-1"
              >
                <ChevronLeft size={14} strokeWidth={1.8} />
                {t("controlPanel.backToNotes")}
              </Button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {(gpuAccelAvailable.cuda || gpuAccelAvailable.vulkan) &&
              activeView === "home" &&
              !gpuBannerDismissed && (
                <div className="max-w-3xl mx-auto w-full p-4 pb-0">
                  <div className="rounded-lg border border-primary/20 dark:border-primary/15 bg-primary/5 p-3">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 w-8 h-8 rounded-md bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
                        <Zap size={16} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground mb-0.5">
                          {t("controlPanel.gpu.bannerTitle")}
                        </p>
                        <p className="text-xs text-muted-foreground mb-2">
                          {t("controlPanel.gpu.bannerDescription")}
                        </p>
                        <div className="flex items-center gap-3">
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              setSettingsSection(
                                gpuAccelAvailable.cuda ? "transcription" : "intelligence"
                              );
                              setShowSettings(true);
                            }}
                          >
                            {t("controlPanel.gpu.enableButton")}
                          </Button>
                          <button
                            onClick={() => {
                              setGpuBannerDismissed(true);
                              localStorage.setItem("gpuBannerDismissedUnified", "true");
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {t("controlPanel.gpu.dismissButton")}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {activeView === "home" && (
              <HistoryView
                history={history}
                isLoading={isLoading}
                hotkey={hotkey}
                aiCTADismissed={aiCTADismissed}
                setAiCTADismissed={setAiCTADismissed}
                useCleanupModel={useCleanupModel}
                copyToClipboard={copyToClipboard}
                deleteTranscription={deleteTranscription}
                clearAllTranscriptions={clearAllTranscriptions}
                onShowAudioInFolder={showAudioInFolder}
                onRetryTranscription={retryTranscription}
                showDiscarded={showDiscarded}
                onToggleDiscarded={toggleShowDiscarded}
                onOpenSettings={(section) => {
                  setSettingsSection(section);
                  setShowSettings(true);
                }}
              />
            )}
            {activeView === "chat" && (
              <Suspense fallback={null}>
                <ChatView />
              </Suspense>
            )}
            {activeView === "personal-notes" && (
              <Suspense fallback={null}>
                <PersonalNotesView
                  onOpenSettings={(section) => {
                    setSettingsSection(section);
                    setShowSettings(true);
                  }}
                  onOpenSearch={() => setShowSearch(true)}
                  meetingRecordingRequest={meetingRecordingRequest}
                  onMeetingRecordingRequestHandled={handleMeetingRecordingRequestHandled}
                />
              </Suspense>
            )}
            {activeView === "dictionary" && (
              <Suspense fallback={null}>
                <DictionaryView />
              </Suspense>
            )}
            {activeView === "insights" && (
              <Suspense fallback={null}>
                <InsightsView />
              </Suspense>
            )}
            {activeView === "upload" && (
              <Suspense fallback={null}>
                <UploadAudioView
                  onNoteCreated={(noteId, folderId) => {
                    setActiveNoteId(noteId);
                    if (folderId) setActiveFolderId(folderId);
                    setActiveView("personal-notes");
                  }}
                  onOpenSettings={(section) => {
                    setSettingsSection(section);
                    setShowSettings(true);
                  }}
                />
              </Suspense>
            )}
            {activeView === "integrations" && (
              <Suspense fallback={null}>
                <IntegrationsView />
              </Suspense>
            )}
            {activeView === "snippets" && (
              <Suspense fallback={null}>
                <SnippetsView />
              </Suspense>
            )}
            {activeView === "style" && (
              <Suspense fallback={null}>
                <StyleView />
              </Suspense>
            )}
            {activeView === "transforms" && (
              <Suspense fallback={null}>
                <TransformsView />
              </Suspense>
            )}
            {activeView === "scratchpad" && (
              <Suspense fallback={null}>
                <ScratchpadView />
              </Suspense>
            )}
          </div>
        </main>
        <ContextPanel activeView={activeView} />
      </div>
      <BackgroundActionToastListener />
    </div>
  );
}
