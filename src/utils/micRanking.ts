import { isBuiltInMicrophone } from "./audioDeviceUtils";

export interface RankableMicDevice {
  deviceId: string;
  label: string;
}

// Web Audio only gives us a label string to go on -- no real signal-quality
// metrics without actually sampling audio, which would mean grabbing the mic
// just to rank it. These are label heuristics, not a guarantee, but they
// keep auto-selection from landing on something that is reliably wrong.
const VIRTUAL_DEVICE_PATTERNS = [
  "stereo mix",
  "what u hear",
  "wave out mix",
  "loopback",
  "monitor of",
  "cable input",
  "cable output",
  "voicemeeter",
  "virtual audio",
  "virtual cable",
];

const DEDICATED_MIC_PATTERNS = ["headset", "headphone", "usb", "airpods", "bluetooth"];

function isVirtualDevice(label: string): boolean {
  const lower = label.toLowerCase();
  return VIRTUAL_DEVICE_PATTERNS.some((pattern) => lower.includes(pattern));
}

function isCommunicationsAlias(label: string): boolean {
  // Windows exposes both "Microphone (Realtek Audio)" and a duplicate
  // "Communications - Microphone (Realtek Audio)" / "Default - ..." entry
  // for the same physical device. These aliases work fine but are
  // redundant; skip them when a real (unprefixed) counterpart also exists.
  return /^(communications|default)\s*-\s*/i.test(label.trim());
}

function isDedicatedMic(label: string): boolean {
  const lower = label.toLowerCase();
  return DEDICATED_MIC_PATTERNS.some((pattern) => lower.includes(pattern));
}

// Higher score = better auto-selection candidate. Devices that score at or
// below EXCLUDE_THRESHOLD are never auto-selected (still shown/selectable
// manually in Settings, just not the default guess).
export const EXCLUDE_THRESHOLD = -1000;

export function scoreMicDevice(device: RankableMicDevice, allDevices: RankableMicDevice[]): number {
  const label = device.label || "";

  if (isVirtualDevice(label)) return EXCLUDE_THRESHOLD;

  if (isCommunicationsAlias(label)) {
    const strippedName = label.replace(/^(communications|default)\s*-\s*/i, "").trim();
    const hasRealCounterpart = allDevices.some(
      (d) => d.deviceId !== device.deviceId && d.label.trim() === strippedName
    );
    if (hasRealCounterpart) return EXCLUDE_THRESHOLD;
  }

  let score = 0;
  if (isDedicatedMic(label)) score += 100;
  if (isBuiltInMicrophone(label)) score += 50;
  return score;
}

// Ranks devices best-first. Excluded devices (virtual/alias) are dropped
// entirely rather than sorted to the bottom, since callers generally want
// "candidates worth picking from," not a full ranked list including junk.
// Stable relative order (platform enumeration order) breaks ties.
export function rankMicDevices(devices: RankableMicDevice[]): RankableMicDevice[] {
  return devices
    .map((device, index) => ({ device, index, score: scoreMicDevice(device, devices) }))
    .filter((entry) => entry.score > EXCLUDE_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.device);
}

export function pickBestMicDevice(devices: RankableMicDevice[]): RankableMicDevice | null {
  return rankMicDevices(devices)[0] ?? null;
}
