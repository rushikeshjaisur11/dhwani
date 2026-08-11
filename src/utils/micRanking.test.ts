import { describe, it, expect } from "vitest";
import { rankMicDevices, pickBestMicDevice, scoreMicDevice } from "./micRanking";

describe("micRanking", () => {
  it("excludes virtual/loopback devices entirely", () => {
    const devices = [
      { deviceId: "a", label: "Stereo Mix (Realtek Audio)" },
      { deviceId: "b", label: "Microphone (Realtek Audio)" },
    ];
    const ranked = rankMicDevices(devices);
    expect(ranked.map((d) => d.deviceId)).toEqual(["b"]);
  });

  it("excludes a Communications/Default alias when the real device is also present", () => {
    const devices = [
      { deviceId: "a", label: "Microphone (Realtek Audio)" },
      { deviceId: "b", label: "Communications - Microphone (Realtek Audio)" },
      { deviceId: "c", label: "Default - Microphone (Realtek Audio)" },
    ];
    const ranked = rankMicDevices(devices);
    expect(ranked.map((d) => d.deviceId)).toEqual(["a"]);
  });

  it("keeps a Communications-prefixed device when no real counterpart exists", () => {
    const devices = [{ deviceId: "a", label: "Communications - Headset Microphone" }];
    const ranked = rankMicDevices(devices);
    expect(ranked.map((d) => d.deviceId)).toEqual(["a"]);
  });

  it("ranks a dedicated USB/headset mic above a generic built-in mic", () => {
    const devices = [
      { deviceId: "a", label: "Built-in Microphone" },
      { deviceId: "b", label: "USB Headset Microphone" },
    ];
    const ranked = rankMicDevices(devices);
    expect(ranked.map((d) => d.deviceId)).toEqual(["b", "a"]);
  });

  it("ranks a built-in mic above an unrecognized generic device", () => {
    const devices = [
      { deviceId: "a", label: "Line In (Realtek Audio)" },
      { deviceId: "b", label: "Built-in Microphone" },
    ];
    const ranked = rankMicDevices(devices);
    expect(ranked.map((d) => d.deviceId)).toEqual(["b", "a"]);
  });

  it("preserves enumeration order as a tiebreaker between equally scored devices", () => {
    const devices = [
      { deviceId: "a", label: "Microphone Array (Realtek Audio)" },
      { deviceId: "b", label: "Line In (Realtek Audio)" },
    ];
    const ranked = rankMicDevices(devices);
    expect(ranked.map((d) => d.deviceId)).toEqual(["a", "b"]);
  });

  it("pickBestMicDevice returns the top-ranked device", () => {
    const devices = [
      { deviceId: "a", label: "Stereo Mix (Realtek Audio)" },
      { deviceId: "b", label: "Built-in Microphone" },
      { deviceId: "c", label: "USB Headset Microphone" },
    ];
    expect(pickBestMicDevice(devices)?.deviceId).toBe("c");
  });

  it("pickBestMicDevice returns null when every device is excluded", () => {
    const devices = [{ deviceId: "a", label: "Stereo Mix (Realtek Audio)" }];
    expect(pickBestMicDevice(devices)).toBeNull();
  });

  it("pickBestMicDevice returns null for an empty device list", () => {
    expect(pickBestMicDevice([])).toBeNull();
  });

  it("scoreMicDevice returns the exclude threshold for virtual devices", () => {
    expect(scoreMicDevice({ deviceId: "a", label: "VoiceMeeter Input" }, [])).toBe(-1000);
  });
});
