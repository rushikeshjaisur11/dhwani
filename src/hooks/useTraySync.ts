import { useEffect } from "react";
import { useSettings } from "./useSettings";

// Pushes the renderer-only state the tray's Microphone/Languages submenus
// need (device labels only exist via WebRTC in the renderer; settings live
// in the renderer's Zustand store) and applies selections made from the tray.
export function useTraySync() {
  const {
    selectedMicDeviceId,
    setSelectedMicDeviceId,
    preferredLanguage,
    updateTranscriptionSettings,
  } = useSettings();

  useEffect(() => {
    let cancelled = false;

    const pushMicrophones = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices
          .filter((d) => d.kind === "audioinput")
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
          }));
        if (!cancelled) {
          window.electronAPI.syncTrayMicrophones?.(audioInputs, selectedMicDeviceId);
        }
      } catch {
        // no mic permission yet — tray shows an empty/disabled submenu until granted
      }
    };

    pushMicrophones();
    navigator.mediaDevices.addEventListener?.("devicechange", pushMicrophones);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.("devicechange", pushMicrophones);
    };
  }, [selectedMicDeviceId]);

  useEffect(() => {
    window.electronAPI.syncTrayLanguage?.(preferredLanguage);
  }, [preferredLanguage]);

  useEffect(() => {
    const unsubMic = window.electronAPI.onTraySelectMicrophone?.((deviceId) => {
      setSelectedMicDeviceId(deviceId);
    });
    const unsubLang = window.electronAPI.onTraySelectLanguage?.((code) => {
      updateTranscriptionSettings({ preferredLanguage: code });
    });
    return () => {
      unsubMic?.();
      unsubLang?.();
    };
  }, [setSelectedMicDeviceId, updateTranscriptionSettings]);
}
