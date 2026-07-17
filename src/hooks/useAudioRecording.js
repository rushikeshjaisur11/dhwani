import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import AudioManager from "../helpers/audioManager";
import logger from "../utils/logger";
import { playStartCue, playStopCue } from "../utils/dictationCues";
import { getSettings } from "../stores/settingsStore";
import { expandSnippets } from "../utils/snippets";
import { getRecordingErrorTitle, getRecordingErrorDescription } from "../utils/recordingErrors";
import { isAccessibilitySkipped } from "../utils/permissions";
import { applyPolishToText, applyPipelinedPolishToText } from "./usePolish";
import { applyTransformToText } from "./useTransform";
import {
  getEffectiveTransformsSync,
  BUILTIN_POLISH_ID,
} from "../config/transforms/loadEffectiveTransforms";
import { shouldAttemptReplace } from "../helpers/instantPasteDecision";

export const useAudioRecording = (toast, options = {}) => {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCommandMode, setIsCommandMode] = useState(false);
  const isCommandModeRef = useRef(false);
  const [transcript, setTranscript] = useState("");
  const [partialTranscript, setPartialTranscript] = useState("");
  const [pipelinedChunks, setPipelinedChunks] = useState([]);
  const [isPipelining, setIsPipelining] = useState(false);
  const pipelinedChunksRef = useRef([]);
  const audioManagerRef = useRef(null);
  const pendingInstantPasteRef = useRef(null);
  const latestDictationIdRef = useRef(null);
  const startLockRef = useRef(false);
  const stopLockRef = useRef(false);
  const { onToggle } = options;

  const performStartRecording = useCallback(async ({ voiceAgentRequested = false } = {}) => {
    if (startLockRef.current) return false;
    startLockRef.current = true;
    try {
      if (!audioManagerRef.current) return false;

      const currentState = audioManagerRef.current.getState();
      if (currentState.isRecording || currentState.isProcessing) return false;

      audioManagerRef.current.setVoiceAgentRequested(voiceAgentRequested);
      setIsCommandMode(voiceAgentRequested);
      isCommandModeRef.current = voiceAgentRequested;

      // Retry STT config fetch if it wasn't loaded on mount (e.g. auth wasn't ready)
      if (!audioManagerRef.current.sttConfig) {
        const config = await window.electronAPI.getSttConfig?.();
        if (config?.success) {
          audioManagerRef.current.setSttConfig(config);
        }
      }

      const didStart = audioManagerRef.current.shouldUseStreaming()
        ? await audioManagerRef.current.startStreamingRecording()
        : await audioManagerRef.current.startRecording();

      if (didStart) {
        if (getSettings().pauseMediaOnDictation) {
          window.electronAPI?.pauseMediaPlayback?.();
        }
        window.electronAPI?.registerCancelHotkey?.("Escape");
        void playStartCue();
      }

      return didStart;
    } finally {
      startLockRef.current = false;
    }
  }, []);

  const performStopRecording = useCallback(async () => {
    if (stopLockRef.current) return false;
    stopLockRef.current = true;
    try {
      if (!audioManagerRef.current) return false;

      const currentState = audioManagerRef.current.getState();
      if (!currentState.isRecording && !currentState.isStreamingStartInProgress) return false;

      window.electronAPI?.unregisterCancelHotkey?.();

      if (currentState.isStreaming || currentState.isStreamingStartInProgress) {
        void playStopCue();
        return await audioManagerRef.current.stopStreamingRecording();
      }

      const didStop = audioManagerRef.current.stopRecording();

      if (didStop) {
        void playStopCue();
      }

      return didStop;
    } finally {
      stopLockRef.current = false;
    }
  }, []);

  useEffect(() => {
    audioManagerRef.current = new AudioManager();

    audioManagerRef.current.setCallbacks({
      onStateChange: ({ isRecording, isProcessing, isStreaming }) => {
        if (!isRecording) window.electronAPI?.unregisterCancelHotkey?.();
        setIsRecording(isRecording);
        setIsProcessing(isProcessing);
        setIsStreaming(isStreaming ?? false);
        if (!isRecording && !isProcessing) {
          setIsCommandMode(false);
          isCommandModeRef.current = false;
        }
        if (!isStreaming) {
          setPartialTranscript("");
          setIsPipelining(false);
          setPipelinedChunks([]);
          pipelinedChunksRef.current = [];
        }
      },
      onError: (error) => {
        if (error?.title !== "Paste Error") {
          window.electronAPI?.hideDictationPreview?.();
        }
        const title = getRecordingErrorTitle(error, t);
        const description = getRecordingErrorDescription(error, t);
        toast({
          title,
          description,
          variant: "destructive",
          duration: error.code === "AUTH_EXPIRED" ? 8000 : undefined,
        });
        if (getSettings().pauseMediaOnDictation) {
          window.electronAPI?.resumeMediaPlayback?.();
        }
      },
      onPartialTranscript: (text) => {
        setPartialTranscript(text);
      },
      onStreamingCommit: async (chunkText) => {
        if (!chunkText || !chunkText.trim()) return;

        const settings = getSettings();
        const isAutoApply = localStorage.getItem("autoApplyAfterDictation") === "true" && localStorage.getItem("transformsOptIn") === "true";
        const selectedId = localStorage.getItem("autoApplyTransformId") || BUILTIN_POLISH_ID;
        const isLinearTransform = selectedId === BUILTIN_POLISH_ID;
        const hasBackendStyling = settings.useCleanupModel;

        // If backend styling is on, OR (linear transform and auto-apply enabled), we can pipeline!
        if ((hasBackendStyling || (isAutoApply && isLinearTransform)) && !isCommandModeRef.current) {
          setIsPipelining(true);
          
          const rawChunk = chunkText.trim();
          const chunkId = Date.now().toString();
          
          // 1. Queue the raw chunk
          pipelinedChunksRef.current = [...pipelinedChunksRef.current, { id: chunkId, raw: rawChunk, polished: null }];
          setPipelinedChunks([...pipelinedChunksRef.current]);
          
          try {
            // 2. Fetch past polished text as context
            const pastContext = pipelinedChunksRef.current
                .filter(c => c.id !== chunkId && c.polished)
                .map(c => c.polished);
            
            // 3. Process this chunk using the backend reasoning service
            const polishedResult = await applyPipelinedPolishToText(rawChunk, pastContext, settings);
            
            // 4. Update the queue with the polished text
            pipelinedChunksRef.current = pipelinedChunksRef.current.map(c => 
                c.id === chunkId ? { ...c, polished: polishedResult } : c
            );
            setPipelinedChunks([...pipelinedChunksRef.current]);

          } catch (err) {
            logger.warn("Pipeline chunk processing failed", err);
            // Fallback: use raw text if LLM fails
            pipelinedChunksRef.current = pipelinedChunksRef.current.map(c => 
                c.id === chunkId ? { ...c, polished: rawChunk } : c
            );
            setPipelinedChunks([...pipelinedChunksRef.current]);
          }
        }
      },
      onRawTranscriptReady: async ({ text, dictationId, foregroundApp }) => {
        pendingInstantPasteRef.current = { rawText: text, dictationId, foregroundApp, pasted: false };
        latestDictationIdRef.current = dictationId;
        try {
          await audioManagerRef.current.safePaste(text, {
            restoreClipboard: !getSettings().keepTranscriptionInClipboard,
            allowClipboardFallback: isAccessibilitySkipped(),
          });
          if (pendingInstantPasteRef.current?.dictationId === dictationId) {
            pendingInstantPasteRef.current.pasted = true;
          }
        } catch (error) {
          logger.warn("Instant raw paste failed", { error: error?.message }, "clipboard");
        }
      },
      onTranscriptionComplete: async (result) => {
        if (getSettings().pauseMediaOnDictation) {
          window.electronAPI?.resumeMediaPlayback?.();
        }

        if (result.success) {
          const transcribedText = result.text?.trim();

          if (!transcribedText) {
            window.electronAPI?.hideDictationPreview?.();
            toast({
              title: t("hooks.audioRecording.noAudio.title"),
              description: t("hooks.audioRecording.noAudio.description"),
              variant: "default",
            });
            return;
          }

          result.text = expandSnippets(result.text, getSettings().snippets);

          let pipelinedResult = null;
          if (pipelinedChunksRef.current.length > 0) {
            pipelinedResult = pipelinedChunksRef.current.map(c => c.polished || c.raw).join(" ");
            const rawPipelined = pipelinedChunksRef.current.map(c => c.raw).join(" ");
            if (result.text.length > rawPipelined.length) {
               const tail = result.text.slice(rawPipelined.length).trim();
               if (tail) pipelinedResult += " " + tail;
            }
            result.text = pipelinedResult.trim();
          }

          // Auto Apply After Dictation (overlay transform menu): run the
          // selected transform on the transcript before pasting. Any failure
          // keeps the raw transcript.
          let transformWasApplied = false;
          if (
            !pipelinedResult &&
            localStorage.getItem("autoApplyAfterDictation") === "true" &&
            localStorage.getItem("transformsOptIn") === "true"
          ) {
            const selectedId = localStorage.getItem("autoApplyTransformId") || BUILTIN_POLISH_ID;
            try {
              let transformed;
              if (selectedId === BUILTIN_POLISH_ID) {
                transformed = await applyPolishToText(result.text);
              } else {
                const transform = getEffectiveTransformsSync().find((tr) => tr.id === selectedId);
                if (transform) transformed = await applyTransformToText(result.text, transform);
              }
              if (transformed) {
                result.text = transformed;
                transformWasApplied = true;
              }
            } catch (error) {
              logger.warn("Auto apply transform failed", { error: error?.message }, "transform");
            }
          }

          setTranscript(result.text);
          window.electronAPI?.completeDictationPreview?.({ text: result.text });

          const isStreaming = result.source?.includes("streaming");
          const { autoPasteEnabled, keepTranscriptionInClipboard } = getSettings();

          // The renderer window usually isn't focused while dictating into another
          // app, and Clipboard.writeText throws NotAllowedError without focus —
          // catch it here so a clipboard failure can't skip saveTranscription below.
          const writeClipboard = async (text) => {
            try {
              await navigator.clipboard.writeText(text);
            } catch (error) {
              logger.warn("Clipboard write failed", { error: error?.message }, "clipboard");
            }
          };

          const pending = pendingInstantPasteRef.current;
          const pendingMatches = pending && pending.dictationId === result.dictationId;
          const wasInstantPasted =
            result.instantPasteEligible &&
            pendingMatches &&
            pending.pasted &&
            !transformWasApplied;

          if (pendingMatches) {
            // Clear regardless of outcome so a stale record can never be
            // reused by a later dictation.
            pendingInstantPasteRef.current = null;
          }

          if (wasInstantPasted) {
            const textChanged = result.text !== pending.rawText;
            let foregroundAppMatches = true;
            try {
              const currentApp = await window.electronAPI?.getForegroundApp?.();
              foregroundAppMatches = (currentApp?.app ?? null) === (pending.foregroundApp?.app ?? null);
            } catch {
              foregroundAppMatches = false;
            }

            const shouldReplace = shouldAttemptReplace({
              autoPasteEnabled,
              textChanged,
              dictationIdMatches: latestDictationIdRef.current === pending.dictationId,
              foregroundAppMatches,
            });

            if (shouldReplace) {
              try {
                await window.electronAPI?.sendBackspaces?.([...pending.rawText].length);
                await audioManagerRef.current.safePaste(result.text, {
                  ...(isStreaming ? { fromStreaming: true } : {}),
                  restoreClipboard: !keepTranscriptionInClipboard,
                  allowClipboardFallback: isAccessibilitySkipped(),
                });
              } catch (error) {
                logger.warn("Instant-paste replace failed", { error: error?.message }, "clipboard");
              }
            }
            // Guardrails failed, or cleanup made no change: the raw paste
            // already delivered the final text — nothing further to do.
          } else if (autoPasteEnabled) {
            const pasteStart = performance.now();
            await audioManagerRef.current.safePaste(result.text, {
              ...(isStreaming ? { fromStreaming: true } : {}),
              restoreClipboard: !keepTranscriptionInClipboard,
              allowClipboardFallback: isAccessibilitySkipped(),
            });
            logger.info(
              "Paste timing",
              {
                pasteMs: Math.round(performance.now() - pasteStart),
                source: result.source,
                textLength: result.text.length,
              },
              "streaming"
            );
          } else if (keepTranscriptionInClipboard) {
            await writeClipboard(result.text);
          }

          audioManagerRef.current.saveTranscription(result.text, result.rawText ?? result.text, {
            clientTranscriptionId: result.clientTranscriptionId,
          });

          if (result.source === "openai" && getSettings().useLocalWhisper) {
            toast({
              title: t("hooks.audioRecording.fallback.title"),
              description: t("hooks.audioRecording.fallback.description"),
              variant: "default",
            });
          }

          if (audioManagerRef.current.shouldUseStreaming()) {
            audioManagerRef.current.warmupStreamingConnection();
          }
        }
      },
    });

    audioManagerRef.current.setContext("dictation");
    window.electronAPI.getSttConfig?.().then((config) => {
      if (config?.success && audioManagerRef.current) {
        audioManagerRef.current.setSttConfig(config);
        if (audioManagerRef.current.shouldUseStreaming()) {
          audioManagerRef.current.warmupStreamingConnection();
        }
      }
    });

    const handleToggle = async ({ voiceAgentRequested = false } = {}) => {
      if (!audioManagerRef.current) return;
      // Lazily warm the mic driver on first dictation use, not at launch. See #871.
      audioManagerRef.current.warmupMicDriver?.();
      const currentState = audioManagerRef.current.getState();

      if (!currentState.isRecording && !currentState.isProcessing) {
        await performStartRecording({ voiceAgentRequested });
      } else if (currentState.isRecording) {
        await performStopRecording();
      }
    };

    const handleStart = async () => {
      audioManagerRef.current?.warmupMicDriver?.();
      await performStartRecording();
    };

    const handleStop = async () => {
      await performStopRecording();
    };

    const disposeToggle = window.electronAPI.onToggleDictation(() => {
      handleToggle();
      onToggle?.();
    });

    const disposeVoiceAgentToggle = window.electronAPI.onToggleVoiceAgent?.(() => {
      handleToggle({ voiceAgentRequested: true });
      onToggle?.();
    });

    const disposeStart = window.electronAPI.onStartDictation?.(() => {
      handleStart();
      onToggle?.();
    });

    const disposeStop = window.electronAPI.onStopDictation?.(() => {
      handleStop();
      onToggle?.();
    });

    const handleNoAudioDetected = () => {
      if (getSettings().pauseMediaOnDictation) {
        window.electronAPI?.resumeMediaPlayback?.();
      }
      toast({
        title: t("hooks.audioRecording.noAudio.title"),
        description: t("hooks.audioRecording.noAudio.description"),
        variant: "default",
      });
    };

    const disposeNoAudio = window.electronAPI.onNoAudioDetected?.(handleNoAudioDetected);

    // Cleanup
    return () => {
      disposeToggle?.();
      disposeVoiceAgentToggle?.();
      disposeStart?.();
      disposeStop?.();
      disposeNoAudio?.();
      if (audioManagerRef.current) {
        audioManagerRef.current.cleanup();
      }
    };
  }, [toast, onToggle, performStartRecording, performStopRecording, t]);

  const cancelRecording = useCallback(async () => {
    if (audioManagerRef.current) {
      window.electronAPI?.unregisterCancelHotkey?.();
      const state = audioManagerRef.current.getState();
      if (getSettings().pauseMediaOnDictation) {
        window.electronAPI?.resumeMediaPlayback?.();
      }
      if (state.isStreaming) {
        return await audioManagerRef.current.stopStreamingRecording();
      }
      return audioManagerRef.current.cancelRecording();
    }
    return false;
  }, []);

  const cancelProcessing = () => {
    if (audioManagerRef.current) {
      return audioManagerRef.current.cancelProcessing();
    }
    return false;
  };

  const toggleListening = async () => {
    if (!isRecording && !isProcessing) {
      await performStartRecording();
    } else if (isRecording) {
      await performStopRecording();
    }
  };

  return {
    isRecording,
    isProcessing,
    isStreaming,
    isCommandMode,
    transcript,
    partialTranscript,
    startRecording: performStartRecording,
    stopRecording: performStopRecording,
    cancelRecording,
    cancelProcessing,
    toggleListening,
  };
};
