import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Upload, FileAudio, X, AlertCircle, FolderOpen, Plus, Settings } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "../ui/button";
import { cn } from "../lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";
import type { FolderItem } from "../../types/electron";
import { findDefaultFolder, MEETINGS_FOLDER_NAME } from "./shared";
import { useAuth } from "../../hooks/useAuth";
import { useSettings } from "../../hooks/useSettings";
import { withSessionRefresh } from "../../lib/auth";
import { getAllReasoningModels } from "../../models/ModelRegistry";
import {
  useSettingsStore,
  selectIsCloudCleanupMode,
  selectResolvedUploadTranscription,
  getSettings,
} from "../../stores/settingsStore";
import { generateNoteTitle } from "../../utils/generateTitle";
import { prependSpeakerTimeline } from "../../utils/speakerTimeline";
import logger from "../../utils/logger";
import { getBaseLanguageCode } from "../../utils/languageSupport";

type UploadState = "idle" | "selected" | "transcribing" | "complete" | "error";

interface QueuedFile {
  id: string;
  name: string;
  path: string;
  size: string;
  sizeBytes: number;
  status: "queued" | "transcribing" | "complete" | "error";
  error?: string;
  noteId?: number;
}

const SUPPORTED_EXTENSIONS = ["mp3", "wav", "m4a", "webm", "ogg", "oga", "flac", "aac"];

const BYOK_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB — hard limit for bring-your-own-key
const CLOUD_FREE_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB — free plan cloud limit
const CLOUD_PRO_MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB — pro plan cloud limit

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface UploadAudioViewProps {
  onNoteCreated?: (noteId: number, folderId: number | null) => void;
  onOpenSettings?: (section: string) => void;
}

export default function UploadAudioView({ onNoteCreated, onOpenSettings }: UploadAudioViewProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<{
    name: string;
    path: string;
    size: string;
    sizeBytes: number;
  } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [chunkProgress, setChunkProgress] = useState<{
    chunksTotal: number;
    chunksCompleted: number;
  } | null>(null);
  const progressCleanupRef = useRef<(() => void) | null>(null);
  const runIdRef = useRef(0);

  // null = not in batch mode (single-file flow above, unchanged). Non-null =
  // batch mode: multiple files queued and processed one at a time.
  const [batchFiles, setBatchFiles] = useState<QueuedFile[] | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const batchRunIdRef = useRef(0);

  // Direct-audio-URL import (not YouTube/video pages -- see audioUrlImport.js).
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [urlImporting, setUrlImporting] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [providerReady, setProviderReady] = useState<boolean | null>(null);
  const [diarizationAvailable, setDiarizationAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.getDiarizationModelStatus?.().then((status) => {
      if (!cancelled) setDiarizationAvailable(!!(status?.available && status?.modelsDownloaded));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { isSignedIn } = useAuth();
  const isProUser = false; // local-only build: no cloud subscription

  const { openaiApiKey, groqApiKey, xaiApiKey, mistralApiKey, customTranscriptionApiKey } =
    useSettings();

  const {
    useLocalWhisper,
    whisperModel,
    localTranscriptionProvider,
    parakeetModel,
    cloudTranscriptionProvider,
    cloudTranscriptionModel,
    cloudTranscriptionBaseUrl,
    cloudTranscriptionMode,
  } = useSettingsStore(useShallow(selectResolvedUploadTranscription));

  const cortiClientId = useSettingsStore((s) => s.cortiClientId);
  const cortiClientSecret = useSettingsStore((s) => s.cortiClientSecret);
  const cortiEnvironment = useSettingsStore((s) => s.cortiEnvironment);
  const cortiTenant = useSettingsStore((s) => s.cortiTenant);
  const preferredLanguage = useSettingsStore((s) => s.preferredLanguage);
  const speakerDiarizationEnabled = useSettingsStore((s) => s.speakerDiarizationEnabled);
  const isCloudCleanup = useSettingsStore(selectIsCloudCleanupMode);
  const effectiveCleanupModel = useSettingsStore((s) =>
    selectIsCloudCleanupMode(s) ? "" : s.cleanupModel
  );
  const useCleanupModel = useSettingsStore((s) => s.useCleanupModel);

  const isOpenWhisprCloud =
    isSignedIn && cloudTranscriptionMode === "openwhispr" && !useLocalWhisper;

  // Mode detection
  const isByok = !useLocalWhisper && !isOpenWhisprCloud;

  // Mode-aware file size validation
  // Local: no limits at all
  // BYOK: 25 MB hard max regardless of plan
  // Cloud free: 25 MB max (upgrade to Pro for more)
  // Cloud pro: 500 MB max
  let fileTooLarge = false;
  let requiresUpgrade = false;
  let byokTooLarge = false;
  let isLargeFile = false;

  if (file) {
    if (useLocalWhisper) {
      // Local transcription: no file size restrictions
    } else if (cloudTranscriptionProvider === "custom") {
      // Custom endpoints (e.g. local whisper.cpp): no file size restrictions
    } else if (isByok) {
      byokTooLarge = file.sizeBytes > BYOK_MAX_FILE_SIZE;
    } else {
      // Cloud (OpenWhispr) — user is always signed in here
      fileTooLarge = file.sizeBytes > CLOUD_PRO_MAX_FILE_SIZE;
      requiresUpgrade = !isProUser && file.sizeBytes > CLOUD_FREE_MAX_FILE_SIZE;
      isLargeFile = file.sizeBytes > CLOUD_FREE_MAX_FILE_SIZE;
    }
  }

  useEffect(() => {
    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, []);

  useEffect(() => {
    window.electronAPI.getFolders?.().then((f) => {
      setFolders(f);
      const personal = findDefaultFolder(f);
      if (personal) setSelectedFolderId(String(personal.id));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkProviderReady = async () => {
      if (isOpenWhisprCloud) {
        setProviderReady(true);
        return;
      }
      if (!useLocalWhisper) {
        if (cloudTranscriptionProvider === "custom") {
          // Custom providers only need a base URL; API key is truly optional
          if (!cancelled) setProviderReady(!!cloudTranscriptionBaseUrl?.trim());
        } else if (cloudTranscriptionProvider === "corti") {
          if (!cancelled) setProviderReady(!!(cortiClientId && cortiClientSecret));
        } else {
          const key =
            cloudTranscriptionProvider === "openai"
              ? openaiApiKey
              : cloudTranscriptionProvider === "groq"
                ? groqApiKey
                : cloudTranscriptionProvider === "xai"
                  ? xaiApiKey
                  : cloudTranscriptionProvider === "mistral"
                    ? mistralApiKey
                    : customTranscriptionApiKey;
          if (!cancelled) setProviderReady(!!key);
        }
        return;
      }
      if (localTranscriptionProvider === "nvidia") {
        const r = await window.electronAPI.listParakeetModels?.();
        if (!cancelled)
          setProviderReady(
            !!(r?.success && r.models.some((m: { downloaded?: boolean }) => m.downloaded))
          );
      } else {
        const r = await window.electronAPI.listWhisperModels?.();
        if (!cancelled)
          setProviderReady(
            !!(r?.success && r.models.some((m: { downloaded?: boolean }) => m.downloaded))
          );
      }
    };
    checkProviderReady();
    return () => {
      cancelled = true;
    };
  }, [
    isOpenWhisprCloud,
    useLocalWhisper,
    localTranscriptionProvider,
    cloudTranscriptionProvider,
    cloudTranscriptionBaseUrl,
    openaiApiKey,
    groqApiKey,
    xaiApiKey,
    mistralApiKey,
    customTranscriptionApiKey,
    cortiClientId,
    cortiClientSecret,
  ]);

  const getActiveModelLabel = (): string => {
    if (isOpenWhisprCloud) return t("notes.upload.openwhisprCloud");
    if (useLocalWhisper) {
      if (localTranscriptionProvider === "nvidia")
        return `Parakeet · ${parakeetModel || "default"}`;
      return `Whisper · ${whisperModel || "base"}`;
    }
    const name =
      cloudTranscriptionProvider === "custom"
        ? t("notes.upload.custom")
        : cloudTranscriptionProvider.charAt(0).toUpperCase() + cloudTranscriptionProvider.slice(1);
    return `${name} · ${cloudTranscriptionModel}`;
  };

  const getActiveApiKey = (): string => {
    switch (cloudTranscriptionProvider) {
      case "openai":
        return openaiApiKey;
      case "groq":
        return groqApiKey;
      case "xai":
        return xaiApiKey;
      case "mistral":
        return mistralApiKey;
      case "custom":
        return customTranscriptionApiKey || "";
      default:
        return "";
    }
  };

  const generateTitle = async (text: string): Promise<string> => {
    if (!useCleanupModel) return "";
    if (!getSettings().autoGenerateNoteTitle) return "";
    const model = isCloudCleanup ? "" : effectiveCleanupModel || getAllReasoningModels()[0]?.value;
    if (!model && !isCloudCleanup) return "";
    return generateNoteTitle(text, model);
  };

  const queueFromPaths = async (paths: string[]) => {
    const entries = await Promise.all(
      paths.map(async (filePath, index) => {
        const name = filePath.split(/[/\\]/).pop() || "audio";
        const sizeBytes = (await window.electronAPI.getFileSize?.(filePath)) ?? 0;
        return {
          id: `${filePath}-${index}`,
          name,
          path: filePath,
          size: sizeBytes ? formatFileSize(sizeBytes) : "",
          sizeBytes,
          status: "queued" as const,
        };
      })
    );
    setBatchFiles(entries);
    setError(null);
  };

  const handleBrowse = async () => {
    const res = await window.electronAPI.selectAudioFile();
    if (res.canceled) return;

    const paths = res.filePaths && res.filePaths.length > 0 ? res.filePaths : res.filePath ? [res.filePath] : [];
    if (paths.length === 0) return;

    if (paths.length > 1) {
      await queueFromPaths(paths);
      return;
    }

    const filePath = paths[0];
    const name = filePath.split(/[/\\]/).pop() || "audio";
    const sizeBytes = (await window.electronAPI.getFileSize?.(filePath)) ?? 0;
    setFile({
      name,
      path: filePath,
      size: sizeBytes ? formatFileSize(sizeBytes) : "",
      sizeBytes,
    });
    setState("selected");
    setError(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      return SUPPORTED_EXTENSIONS.includes(ext);
    });
    if (dropped.length === 0) return;

    if (dropped.length > 1) {
      const paths = dropped
        .map((f) => window.electronAPI.getPathForFile(f))
        .filter((p): p is string => !!p);
      if (paths.length > 0) void queueFromPaths(paths);
      return;
    }

    const f = dropped[0];
    const filePath = window.electronAPI.getPathForFile(f);
    if (!filePath) return;
    setFile({ name: f.name, path: filePath, size: formatFileSize(f.size), sizeBytes: f.size });
    setState("selected");
    setError(null);
  };

  const handleImportUrl = async () => {
    const url = urlValue.trim();
    if (!url) return;
    setUrlImporting(true);
    setUrlError(null);
    try {
      const res = await window.electronAPI.downloadAudioUrl(url);
      if (res.success && res.filePath) {
        setFile({
          name: res.fileName || url.split("/").pop() || "audio",
          path: res.filePath,
          size: res.sizeBytes ? formatFileSize(res.sizeBytes) : "",
          sizeBytes: res.sizeBytes ?? 0,
        });
        setState("selected");
        setUrlValue("");
        setShowUrlInput(false);
      } else {
        setUrlError(res.error || t("notes.upload.urlImport.failed"));
      }
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : t("notes.upload.urlImport.failed"));
    } finally {
      setUrlImporting(false);
    }
  };

  const reset = () => {
    if (progressRef.current) clearInterval(progressRef.current);
    if (progressCleanupRef.current) progressCleanupRef.current();
    progressCleanupRef.current = null;
    setState("idle");
    setFile(null);
    setResult(null);
    setNoteId(null);
    setError(null);
    setProgress(0);
    setChunkProgress(null);
    batchRunIdRef.current++;
    setBatchFiles(null);
    setBatchRunning(false);
    setShowUrlInput(false);
    setUrlValue("");
    setUrlError(null);
    const personal = findDefaultFolder(folders);
    if (personal) setSelectedFolderId(String(personal.id));
  };

  const cancelTranscription = () => {
    runIdRef.current++;
    reset();
  };

  // Shared by the single-file flow (handleTranscribe) and batch upload
  // (handleBatchTranscribe) -- picks the same provider/mode branch either
  // way, just for one file path at a time.
  const transcribeFilePath = async (
    filePath: string
  ): Promise<{ success: boolean; text?: string; error?: string; code?: string }> => {
    if (isOpenWhisprCloud) {
      return withSessionRefresh(async () => {
        const r = await window.electronAPI.transcribeAudioFileCloud!(filePath);
        if (!r.success && r.code) {
          throw Object.assign(new Error(r.error || "Cloud transcription failed"), {
            code: r.code,
          });
        }
        return r;
      });
    }
    if (useLocalWhisper) {
      return window.electronAPI.transcribeAudioFile(filePath, {
        provider: localTranscriptionProvider as "whisper" | "nvidia",
        model: localTranscriptionProvider === "nvidia" ? parakeetModel : whisperModel,
      });
    }
    return window.electronAPI.transcribeAudioFileByok!({
      filePath,
      apiKey: getActiveApiKey(),
      baseUrl: cloudTranscriptionBaseUrl || "",
      model: cloudTranscriptionModel,
      provider: cloudTranscriptionProvider,
      language: getBaseLanguageCode(preferredLanguage) || "en",
      environment: cortiEnvironment,
      tenant: cortiTenant,
    });
  };

  // Same on-device diarization the meeting-recording pipeline already uses
  // (diarizationManager in the main process), run against an upload/URL-
  // imported file after transcription. Best-effort: any failure, or
  // diarization being disabled/not downloaded, just returns the transcript
  // unchanged -- this must never block a note from being saved.
  const maybeAddSpeakerTimeline = async (text: string, filePath: string): Promise<string> => {
    if (!speakerDiarizationEnabled || !diarizationAvailable) return text;
    try {
      const res = await window.electronAPI.diarizeUploadedAudio?.(filePath);
      if (res?.success && res.segments?.length) {
        return prependSpeakerTimeline(text, res.segments);
      }
    } catch (error) {
      logger.warn(
        "Upload diarization failed",
        { error: error instanceof Error ? error.message : String(error) },
        "notes"
      );
    }
    return text;
  };

  const handleTranscribe = async () => {
    if (!file) return;
    const runId = ++runIdRef.current;
    setState("transcribing");
    setError(null);
    setProgress(0);
    setChunkProgress(null);

    const startSimulatedProgress = () => {
      progressRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            if (progressRef.current) clearInterval(progressRef.current);
            return prev;
          }
          return prev + Math.random() * 6;
        });
      }, 500);
    };

    const isCloudChunked = isOpenWhisprCloud && isLargeFile;
    const localMayChunk = useLocalWhisper && localTranscriptionProvider !== "nvidia";
    const useChunkProgress = isCloudChunked || localMayChunk;

    if (useChunkProgress) {
      progressCleanupRef.current =
        window.electronAPI.onUploadTranscriptionProgress?.((data) => {
          if (data.chunksTotal > 0) {
            if (progressRef.current) {
              clearInterval(progressRef.current);
              progressRef.current = null;
            }
            setChunkProgress({
              chunksTotal: data.chunksTotal,
              chunksCompleted: data.chunksCompleted,
            });
            setProgress((data.chunksCompleted / data.chunksTotal) * 90);
          }
        }) ?? null;

      // Local whisper's segmenting decision happens server-side (duration-based);
      // start the simulated bar as a fallback in case this specific upload isn't
      // actually segmented — cancelled above the moment a real event arrives.
      if (!isCloudChunked) {
        startSimulatedProgress();
      }
    } else {
      startSimulatedProgress();
    }

    try {
      const res = await transcribeFilePath(file.path);

      if (runId !== runIdRef.current) return;

      if (progressRef.current) clearInterval(progressRef.current);
      if (progressCleanupRef.current) progressCleanupRef.current();
      progressCleanupRef.current = null;

      if (res.success && res.text) {
        setProgress(100);
        setResult(res.text);

        const textFallback = res.text.trim().split(/\s+/).slice(0, 6).join(" ");
        const fallbackTitle =
          textFallback.length > 0
            ? textFallback + (res.text.trim().split(/\s+/).length > 6 ? "..." : "")
            : file.name.replace(/\.[^.]+$/, "");
        const aiTitle = await generateTitle(res.text);
        if (runId !== runIdRef.current) return;
        const title = aiTitle || fallbackTitle;

        const noteContent = await maybeAddSpeakerTimeline(res.text, file.path);
        if (runId !== runIdRef.current) return;

        const folderId = selectedFolderId ? Number(selectedFolderId) : null;
        const noteRes = await window.electronAPI.saveNote(
          title,
          noteContent,
          "upload",
          file.name,
          null,
          folderId
        );
        if (noteRes.success && noteRes.note) setNoteId(noteRes.note.id);
        setState("complete");
      } else {
        setProgress(0);
        setError(
          res.code === "NO_SPEECH_DETECTED"
            ? t("notes.upload.noSpeechDetected")
            : res.error || t("notes.upload.transcriptionFailed")
        );
        setState("error");
      }
    } catch (err) {
      if (runId !== runIdRef.current) return;
      if (progressRef.current) clearInterval(progressRef.current);
      if (progressCleanupRef.current) progressCleanupRef.current();
      progressCleanupRef.current = null;
      setProgress(0);
      setError(err instanceof Error ? err.message : t("notes.upload.errorOccurred"));
      setState("error");
    }
  };

  // Batch upload: processes queued files one at a time (not in parallel --
  // local whisper-server/parakeet are single sidecar processes, and cloud
  // providers have per-request rate limits). No simulated progress bar or
  // chunk-progress subscription per item, unlike the single-file flow above
  // -- a per-item status icon is enough for a queue.
  const handleBatchTranscribe = async () => {
    if (!batchFiles || batchFiles.length === 0) return;
    const runId = ++batchRunIdRef.current;
    setBatchRunning(true);

    for (const item of batchFiles) {
      if (runId !== batchRunIdRef.current) return;

      setBatchFiles((prev) =>
        prev
          ? prev.map((f) => (f.id === item.id ? { ...f, status: "transcribing" } : f))
          : prev
      );

      try {
        const res = await transcribeFilePath(item.path);
        if (runId !== batchRunIdRef.current) return;

        if (res.success && res.text) {
          const textFallback = res.text.trim().split(/\s+/).slice(0, 6).join(" ");
          const fallbackTitle =
            textFallback.length > 0
              ? textFallback + (res.text.trim().split(/\s+/).length > 6 ? "..." : "")
              : item.name.replace(/\.[^.]+$/, "");
          const aiTitle = await generateTitle(res.text);
          if (runId !== batchRunIdRef.current) return;
          const title = aiTitle || fallbackTitle;

          const noteContent = await maybeAddSpeakerTimeline(res.text, item.path);
          if (runId !== batchRunIdRef.current) return;

          const folderId = selectedFolderId ? Number(selectedFolderId) : null;
          const noteRes = await window.electronAPI.saveNote(
            title,
            noteContent,
            "upload",
            item.name,
            null,
            folderId
          );
          setBatchFiles((prev) =>
            prev
              ? prev.map((f) =>
                  f.id === item.id
                    ? { ...f, status: "complete", noteId: noteRes.note?.id }
                    : f
                )
              : prev
          );
        } else {
          setBatchFiles((prev) =>
            prev
              ? prev.map((f) =>
                  f.id === item.id
                    ? {
                        ...f,
                        status: "error",
                        error:
                          res.code === "NO_SPEECH_DETECTED"
                            ? t("notes.upload.noSpeechDetected")
                            : res.error || t("notes.upload.transcriptionFailed"),
                      }
                    : f
                )
              : prev
          );
        }
      } catch (err) {
        if (runId !== batchRunIdRef.current) return;
        setBatchFiles((prev) =>
          prev
            ? prev.map((f) =>
                f.id === item.id
                  ? {
                      ...f,
                      status: "error",
                      error: err instanceof Error ? err.message : t("notes.upload.errorOccurred"),
                    }
                  : f
              )
            : prev
        );
      }
    }

    if (runId === batchRunIdRef.current) setBatchRunning(false);
  };

  const removeQueuedFile = (id: string) => {
    setBatchFiles((prev) => {
      const next = prev ? prev.filter((f) => f.id !== id) : prev;
      return next && next.length > 0 ? next : null;
    });
  };

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const res = await window.electronAPI.createFolder(trimmed);
    if (res.success && res.folder) {
      setFolders((prev) => [...prev, res.folder!]);
      const newId = String(res.folder.id);
      setSelectedFolderId(newId);
      if (noteId != null) {
        window.electronAPI.updateNote(noteId, { folder_id: res.folder.id });
      }
    }
    setNewFolderName("");
    setShowNewFolderDialog(false);
  };

  const handleFolderChange = (val: string) => {
    if (val === "__create_new__") {
      setShowNewFolderDialog(true);
      return;
    }
    setSelectedFolderId(val);
    if (noteId != null) {
      window.electronAPI.updateNote(noteId, { folder_id: Number(val) });
    }
  };

  const getTranscribingLabel = (): string => {
    if (isOpenWhisprCloud) return t("notes.upload.transcribingCloud");
    if (useLocalWhisper) return t("notes.upload.transcribingLocal");
    return t("notes.upload.transcribingProvider", { provider: cloudTranscriptionProvider });
  };

  return (
    <div className="flex flex-col items-center h-full overflow-y-auto px-6">
      <div
        className="w-full max-w-md shrink-0 my-auto"
        style={{ animation: "float-up 0.4s ease-out" }}
      >
        <div className="max-w-[320px] mx-auto">
          {batchFiles && (
            <BatchView
              t={t}
              files={batchFiles}
              running={batchRunning}
              onStart={handleBatchTranscribe}
              onRemove={removeQueuedFile}
              onCancel={reset}
              onOpenNote={onNoteCreated}
              selectedFolderId={selectedFolderId}
            />
          )}

          {!batchFiles && state === "idle" && providerReady === false && (
            <NoProviderView t={t} onOpenSettings={() => onOpenSettings?.("uploadTranscription")} />
          )}

          {!batchFiles && state === "idle" && providerReady !== false && (
            <IdleView
              t={t}
              getActiveModelLabel={getActiveModelLabel}
              handleDrop={handleDrop}
              handleBrowse={handleBrowse}
              isDragOver={isDragOver}
              setIsDragOver={setIsDragOver}
              showUrlInput={showUrlInput}
              setShowUrlInput={setShowUrlInput}
              urlValue={urlValue}
              setUrlValue={setUrlValue}
              urlImporting={urlImporting}
              urlError={urlError}
              handleImportUrl={handleImportUrl}
            />
          )}

          {state === "selected" && file && (
            <SelectedView
              t={t}
              file={file}
              getActiveModelLabel={getActiveModelLabel}
              reset={reset}
              handleTranscribe={handleTranscribe}
              requiresUpgrade={!!requiresUpgrade}
              fileTooLarge={fileTooLarge}
              isLargeFile={isLargeFile}
              isOpenWhisprCloud={isOpenWhisprCloud}
              byokTooLarge={byokTooLarge}
            />
          )}

          {state === "transcribing" && (
            <TranscribingView
              t={t}
              progress={progress}
              getTranscribingLabel={getTranscribingLabel}
              file={file}
              chunkProgress={chunkProgress}
              onCancel={cancelTranscription}
            />
          )}

          {state === "complete" && result && (
            <CompleteView
              t={t}
              result={result}
              folders={folders}
              selectedFolderId={selectedFolderId}
              handleFolderChange={handleFolderChange}
              noteId={noteId}
              onNoteCreated={onNoteCreated}
              reset={reset}
            />
          )}

          {state === "error" && error && (
            <ErrorView t={t} error={error} reset={reset} handleTranscribe={handleTranscribe} />
          )}
        </div>
      </div>

      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent className="sm:max-w-95">
          <DialogHeader>
            <DialogTitle>{t("notes.upload.newFolder")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/50">
              {t("notes.upload.folderName")}
            </label>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={t("notes.folders.folderName")}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowNewFolderDialog(false);
                setNewFolderName("");
              }}
            >
              {t("notes.upload.cancel")}
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              {t("notes.upload.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface NoProviderViewProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  onOpenSettings: () => void;
}

function NoProviderView({ t, onOpenSettings }: NoProviderViewProps) {
  return (
    <div
      className="flex flex-col items-center gap-4 py-2"
      style={{ animation: "float-up 0.4s ease-out" }}
    >
      <div className="w-10 h-10 rounded-[10px] bg-linear-to-b from-foreground/5 to-foreground/2 dark:from-white/8 dark:to-white/3 border border-foreground/8 dark:border-white/8 flex items-center justify-center">
        <Settings
          size={17}
          strokeWidth={1.5}
          className="text-foreground/25 dark:text-foreground/35"
        />
      </div>
      <div className="text-center">
        <h2 className="text-xs font-semibold text-foreground mb-1">
          {t("notes.upload.noProviderTitle")}
        </h2>
        <p className="text-xs text-foreground/30 leading-relaxed max-w-60">
          {t("notes.upload.noProviderDescription")}
        </p>
      </div>
      <Button variant="default" size="sm" className="h-7 text-xs px-4" onClick={onOpenSettings}>
        {t("notes.upload.noProviderAction")}
      </Button>
    </div>
  );
}

interface IdleViewProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  getActiveModelLabel: () => string;
  handleDrop: (e: React.DragEvent) => void;
  handleBrowse: () => void;
  isDragOver: boolean;
  setIsDragOver: (v: boolean) => void;
  showUrlInput: boolean;
  setShowUrlInput: (v: boolean) => void;
  urlValue: string;
  setUrlValue: (v: string) => void;
  urlImporting: boolean;
  urlError: string | null;
  handleImportUrl: () => void;
}

function IdleView({
  t,
  getActiveModelLabel,
  handleDrop,
  handleBrowse,
  isDragOver,
  setIsDragOver,
  showUrlInput,
  setShowUrlInput,
  urlValue,
  setUrlValue,
  urlImporting,
  urlError,
  handleImportUrl,
}: IdleViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // Delegate to handleBrowse which uses Electron's file dialog;
    // the hidden input is for keyboard-triggered file selection only.
    handleBrowse();
    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleBrowse();
    }
  };

  return (
    <>
      <div className="flex flex-col items-center mb-5">
        <div className="w-10 h-10 rounded-[10px] bg-linear-to-b from-foreground/5 to-foreground/[0.02] dark:from-white/8 dark:to-white/3 border border-foreground/8 dark:border-white/8 flex items-center justify-center mb-4">
          <Upload
            size={17}
            strokeWidth={1.5}
            className="text-foreground/25 dark:text-foreground/35"
          />
        </div>
        <h2 className="text-xs font-semibold text-foreground mb-1">{t("notes.upload.title")}</h2>
        <p className="text-xs text-foreground/25">
          {t("notes.upload.using", { model: getActiveModelLabel() })}
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.m4a,.webm,.ogg,.oga,.flac,.aac"
        onChange={handleFileInputChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      <div
        role="button"
        tabIndex={0}
        aria-label={t("notes.upload.dropOrBrowse")}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragOver(false);
        }}
        onClick={handleBrowse}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative rounded-lg p-8 text-center cursor-pointer transition-[background-color,border-color,transform] duration-300 group",
          "bg-surface-1 dark:bg-surface-2",
          "border border-foreground/6 dark:border-white/6",
          "hover:bg-surface-2 dark:hover:bg-surface-3 hover:border-foreground/12 dark:hover:border-white/10",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30",
          isDragOver && "border-primary/30 bg-primary/[0.04] dark:bg-primary/[0.06] scale-[1.01]"
        )}
        style={isDragOver ? { animation: "drag-pulse 1.5s ease-in-out infinite" } : undefined}
      >
        <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500">
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/[0.02] dark:via-white/[0.03] to-transparent"
            style={{ animation: "shimmer-slide 3s ease-in-out infinite" }}
          />
        </div>

        {!isDragOver ? (
          <div className="flex flex-col items-center gap-2 relative">
            <div className="w-8 h-8 rounded-full bg-foreground/[0.03] dark:bg-white/[0.04] flex items-center justify-center mb-1">
              <Upload
                size={14}
                className="text-foreground/20 dark:text-foreground/30 group-hover:text-foreground/40 transition-colors"
              />
            </div>
            <p className="text-xs text-foreground/35 group-hover:text-foreground/50 transition-colors">
              {t("notes.upload.dropOrBrowse")}
            </p>
            <p className="text-xs text-foreground/15 tracking-wide">
              {t("notes.upload.supportedFormats")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 relative">
            <Upload size={18} className="text-primary/60" />
            <p className="text-xs text-primary/60 font-medium">{t("notes.upload.dropToUpload")}</p>
          </div>
        )}
      </div>

      {!showUrlInput ? (
        <button
          type="button"
          onClick={() => setShowUrlInput(true)}
          className="mt-3 w-full text-center text-xs text-foreground/25 hover:text-foreground/45 transition-colors"
        >
          {t("notes.upload.urlImport.toggle")}
        </button>
      ) : (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Input
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              placeholder={t("notes.upload.urlImport.placeholder")}
              autoFocus
              disabled={urlImporting}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleImportUrl();
              }}
              className="h-8 text-xs"
            />
            <Button
              variant="default"
              size="sm"
              onClick={handleImportUrl}
              disabled={urlImporting || !urlValue.trim()}
              className="h-8 text-xs px-3 shrink-0"
            >
              {urlImporting ? t("notes.upload.urlImport.importing") : t("notes.upload.urlImport.import")}
            </Button>
          </div>
          {urlError && <p className="text-xs text-destructive/60 px-1">{urlError}</p>}
        </div>
      )}
    </>
  );
}

interface BatchViewProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  files: QueuedFile[];
  running: boolean;
  onStart: () => void;
  onRemove: (id: string) => void;
  onCancel: () => void;
  onOpenNote?: (noteId: number, folderId: number | null) => void;
  selectedFolderId: string;
}

function BatchView({
  t,
  files,
  running,
  onStart,
  onRemove,
  onCancel,
  onOpenNote,
  selectedFolderId,
}: BatchViewProps) {
  const total = files.length;
  const completed = files.filter((f) => f.status === "complete").length;
  const errored = files.filter((f) => f.status === "error").length;
  const finished = !running && completed + errored === total && total > 0;

  const statusIcon = (status: QueuedFile["status"]) => {
    if (status === "complete") {
      return <span className="text-success text-xs">✓</span>;
    }
    if (status === "error") {
      return <AlertCircle size={12} className="text-destructive/60" />;
    }
    if (status === "transcribing") {
      return (
        <span className="w-2.5 h-2.5 rounded-full border-2 border-primary/30 border-t-primary/70 animate-spin inline-block" />
      );
    }
    return <span className="w-1.5 h-1.5 rounded-full bg-foreground/15 inline-block" />;
  };

  return (
    <div style={{ animation: "float-up 0.3s ease-out" }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-foreground">
          {t("notes.upload.batch.title", { count: total })}
        </h2>
        {(running || finished) && (
          <span className="text-xs text-foreground/30">
            {t("notes.upload.batch.progress", { completed: completed + errored, total })}
          </span>
        )}
      </div>

      <div className="rounded-lg border border-foreground/8 dark:border-white/6 bg-surface-1 dark:bg-surface-2 divide-y divide-foreground/6 dark:divide-white/6 max-h-64 overflow-y-auto mb-3">
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-2.5 px-3 py-2">
            <div className="w-4 flex items-center justify-center shrink-0">{statusIcon(f.status)}</div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground/70 truncate font-medium">{f.name}</p>
              {f.status === "error" && f.error ? (
                <p className="text-xs text-destructive/60 truncate mt-0.5">{f.error}</p>
              ) : (
                f.size && <p className="text-xs text-foreground/25 mt-0.5">{f.size}</p>
              )}
            </div>
            {f.status === "complete" && f.noteId != null && onOpenNote && (
              <button
                onClick={() =>
                  onOpenNote(f.noteId!, selectedFolderId ? Number(selectedFolderId) : null)
                }
                className="text-xs text-primary/60 hover:text-primary/80 shrink-0"
              >
                {t("notes.upload.openNote")}
              </button>
            )}
            {f.status === "queued" && !running && (
              <button
                onClick={() => onRemove(f.id)}
                className="text-foreground/15 hover:text-foreground/40 transition-colors p-0.5 rounded shrink-0"
              >
                <X size={11} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 justify-center">
        {!running && !finished && (
          <Button variant="default" size="sm" onClick={onStart} className="h-8 text-xs px-5">
            {t("notes.upload.batch.transcribeAll", { count: total })}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-8 text-xs text-foreground/35">
          {finished ? t("notes.upload.uploadAnother") : t("notes.upload.cancel")}
        </Button>
      </div>
    </div>
  );
}

interface SelectedViewProps {
  t: (key: string) => string;
  file: { name: string; path: string; size: string; sizeBytes: number };
  getActiveModelLabel: () => string;
  reset: () => void;
  handleTranscribe: () => void;
  requiresUpgrade: boolean;
  fileTooLarge: boolean;
  isLargeFile: boolean;
  isOpenWhisprCloud: boolean;
  byokTooLarge: boolean;
}

function SelectedView({
  t,
  file,
  getActiveModelLabel,
  reset,
  handleTranscribe,
  requiresUpgrade,
  fileTooLarge,
  isLargeFile,
  isOpenWhisprCloud,
  byokTooLarge,
}: SelectedViewProps) {
  const canTranscribe = !fileTooLarge && !requiresUpgrade && !byokTooLarge;

  return (
    <div style={{ animation: "float-up 0.3s ease-out" }}>
      <div className="rounded-lg border border-foreground/8 dark:border-white/6 bg-surface-1 dark:bg-surface-2 p-4 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[8px] bg-primary/8 dark:bg-primary/12 border border-primary/10 dark:border-primary/15 flex items-center justify-center shrink-0">
            <FileAudio size={15} className="text-primary/60" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-foreground/70 truncate font-medium">{file.name}</p>
            {file.size && <p className="text-xs text-foreground/25 mt-0.5">{file.size}</p>}
            <p className="text-xs text-foreground/20 mt-0.5">{getActiveModelLabel()}</p>
          </div>
          <button
            onClick={reset}
            className="text-foreground/15 hover:text-foreground/40 transition-colors p-1 rounded"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Cloud absolute limit (500 MB) */}
      {fileTooLarge && (
        <div className="rounded-lg border border-destructive/12 dark:border-destructive/15 bg-destructive/[0.03] px-3 py-2.5 mb-3">
          <p className="text-xs text-destructive/60 leading-relaxed">
            {t("notes.upload.fileTooLarge")}
          </p>
        </div>
      )}

      {/* BYOK file too large — shared explanation */}
      {byokTooLarge && (
        <div className="rounded-lg border border-primary/12 dark:border-primary/15 bg-primary/[0.03] px-3 py-2.5 mb-3">
          <p className="text-xs text-foreground/50 leading-relaxed">
            {t("notes.upload.byokTooLarge")}
          </p>
          <p className="text-xs text-foreground/35 leading-relaxed mt-1.5">
            {t("notes.upload.byokTooLargeDetail")}
          </p>
        </div>
      )}

      {/* Cloud large file info (Pro user, will be chunked) */}
      {isLargeFile && !requiresUpgrade && !fileTooLarge && isOpenWhisprCloud && (
        <p className="text-xs text-foreground/20 text-center mb-3">
          {t("notes.upload.largeFileNote")}
        </p>
      )}

      <div className="flex items-center gap-2 justify-center flex-wrap">
        {/* Normal: can transcribe */}
        {canTranscribe && (
          <Button
            variant="default"
            size="sm"
            onClick={handleTranscribe}
            className="h-8 text-xs px-5"
          >
            {t("notes.upload.transcribe")}
          </Button>
        )}

        {/* Cancel button — always shown */}
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="h-8 text-xs text-foreground/35"
        >
          {t("notes.upload.cancel")}
        </Button>
      </div>
    </div>
  );
}

interface TranscribingViewProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  progress: number;
  getTranscribingLabel: () => string;
  file: { name: string; path: string; size: string; sizeBytes: number } | null;
  chunkProgress: { chunksTotal: number; chunksCompleted: number } | null;
  onCancel: () => void;
}

function TranscribingView({
  t,
  progress,
  getTranscribingLabel,
  file,
  chunkProgress,
  onCancel,
}: TranscribingViewProps) {
  const hasChunkInfo = chunkProgress !== null && chunkProgress.chunksTotal > 0;

  return (
    <div className="flex flex-col items-center" style={{ animation: "float-up 0.3s ease-out" }}>
      <div className="flex items-end justify-center gap-[3px] h-10 mb-5">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="w-[3px] rounded-full bg-primary/40 dark:bg-primary/50 origin-bottom"
            style={{
              height: "100%",
              animation: `waveform-bar ${0.8 + i * 0.12}s ease-in-out infinite`,
              animationDelay: `${i * 0.08}s`,
            }}
          />
        ))}
      </div>

      <div className="w-full max-w-[200px] h-[3px] rounded-full bg-foreground/5 dark:bg-white/5 overflow-hidden mb-3">
        <div
          className="h-full rounded-full bg-primary/50 transition-[width] duration-500 ease-out"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      <p className="text-xs text-foreground/50 font-medium">{getTranscribingLabel()}</p>
      {hasChunkInfo ? (
        <p className="text-xs text-foreground/20 mt-1">
          {t("notes.upload.chunkProgress", {
            completed: chunkProgress.chunksCompleted,
            total: chunkProgress.chunksTotal,
          })}
        </p>
      ) : null}
      {!hasChunkInfo && file ? (
        <p className="text-xs text-foreground/20 mt-1 truncate max-w-50">{file.name}</p>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        onClick={onCancel}
        className="h-7 text-xs text-foreground/30 mt-4"
      >
        {t("notes.upload.cancelTranscription")}
      </Button>
    </div>
  );
}

interface CompleteViewProps {
  t: (key: string) => string;
  result: string;
  folders: FolderItem[];
  selectedFolderId: string;
  handleFolderChange: (val: string) => void;
  noteId: number | null;
  onNoteCreated?: (noteId: number, folderId: number | null) => void;
  reset: () => void;
}

function CompleteView({
  t,
  result,
  folders,
  selectedFolderId,
  handleFolderChange,
  noteId,
  onNoteCreated,
  reset,
}: CompleteViewProps) {
  return (
    <div className="flex flex-col items-center" style={{ animation: "float-up 0.3s ease-out" }}>
      <div className="relative w-12 h-12 mb-4">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            strokeWidth="1.5"
            className="stroke-success/15"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            strokeWidth="1.5"
            className="stroke-success/60"
            strokeDasharray="94.25"
            strokeLinecap="round"
            style={{ animation: "ring-fill 0.8s ease-out forwards" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-5 h-5 text-success/70" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="24"
              strokeDashoffset="24"
              style={{ animation: "draw-check 0.4s ease-out 0.5s forwards" }}
            />
          </svg>
        </div>
      </div>

      <p className="text-xs text-foreground/60 font-medium mb-1">
        {t("notes.upload.transcriptionComplete")}
      </p>
      <p className="text-xs text-foreground/25 max-w-[240px] text-center line-clamp-2 mb-4">
        {result.slice(0, 150)}
      </p>

      {folders.length > 0 && (
        <div className="flex items-center justify-center gap-2 mb-4">
          <FolderOpen size={12} className="text-foreground/20 shrink-0" />
          <Select value={selectedFolderId} onValueChange={handleFolderChange}>
            <SelectTrigger className="h-7 w-44 text-xs rounded-lg px-2.5 [&>svg]:h-3 [&>svg]:w-3">
              <SelectValue placeholder={t("notes.upload.selectFolder")} />
            </SelectTrigger>
            <SelectContent>
              {folders.map((f) => {
                const isMeetings = f.name === MEETINGS_FOLDER_NAME && !!f.is_default;
                return (
                  <SelectItem
                    key={f.id}
                    value={String(f.id)}
                    disabled={isMeetings}
                    className="text-xs py-1.5 pl-2.5 pr-7 rounded-md"
                  >
                    <span className="flex items-center gap-1.5">
                      {f.name}
                      {isMeetings && (
                        <span className="text-[8px] uppercase tracking-wider text-foreground/25 font-medium">
                          {t("notes.folders.soon")}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                );
              })}
              <SelectSeparator />
              <SelectItem value="__create_new__" className="text-xs py-1.5 pl-2.5 pr-7 rounded-md">
                <span className="flex items-center gap-1.5 text-primary/60">
                  <Plus size={11} />
                  {t("notes.upload.newFolder")}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center gap-2">
        {noteId != null && onNoteCreated && (
          <Button
            variant="default"
            size="sm"
            onClick={() =>
              onNoteCreated(noteId, selectedFolderId ? Number(selectedFolderId) : null)
            }
            className="h-8 text-xs"
          >
            {t("notes.upload.openNote")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="h-8 text-xs text-foreground/35"
        >
          {t("notes.upload.uploadAnother")}
        </Button>
      </div>
    </div>
  );
}

interface ErrorViewProps {
  t: (key: string) => string;
  error: string;
  reset: () => void;
  handleTranscribe: () => void;
}

function ErrorView({ t, error, reset, handleTranscribe }: ErrorViewProps) {
  return (
    <div style={{ animation: "float-up 0.3s ease-out" }}>
      <div className="rounded-lg border border-destructive/15 dark:border-destructive/20 bg-destructive/[0.06] dark:bg-destructive/[0.1] p-4 mb-4">
        <div className="flex items-start gap-2.5">
          <AlertCircle size={14} className="text-destructive/50 shrink-0 mt-0.5" />
          <p className="flex-1 text-xs text-destructive/70 leading-relaxed">{error}</p>
          <button
            onClick={reset}
            className="text-foreground/15 hover:text-foreground/30 transition-colors shrink-0 p-0.5 rounded"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleTranscribe}
          className="h-7 text-xs text-foreground/40"
        >
          {t("notes.upload.retry")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="h-7 text-xs text-foreground/25"
        >
          {t("notes.upload.startOver")}
        </Button>
      </div>
    </div>
  );
}
