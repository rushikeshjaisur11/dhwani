import { describe, it, expect } from "vitest";
import { computePeaks } from "./audioWaveform";

describe("computePeaks", () => {
  it("returns an all-zero array for silence", () => {
    const silence = new Float32Array(1000);
    const peaks = computePeaks(silence, 10);
    expect(peaks.length).toBe(10);
    expect(Array.from(peaks).every((p) => p === 0)).toBe(true);
  });

  it("downsamples to exactly numPeaks buckets", () => {
    const data = new Float32Array(997); // deliberately not evenly divisible
    for (let i = 0; i < data.length; i++) data[i] = 0.5;
    const peaks = computePeaks(data, 50);
    expect(peaks.length).toBe(50);
  });

  it("captures the max absolute amplitude within each bucket", () => {
    const data = new Float32Array(100);
    data[45] = -0.9; // negative spike — abs() should still pick it up
    const peaks = computePeaks(data, 10);
    // sample 45 falls in bucket 4 (buckets of 10 samples each)
    expect(peaks[4]).toBeCloseTo(0.9);
    expect(peaks[0]).toBe(0);
    expect(peaks[9]).toBe(0);
  });

  it("handles empty channel data without throwing", () => {
    const peaks = computePeaks(new Float32Array(0), 20);
    expect(peaks.length).toBe(20);
    expect(Array.from(peaks).every((p) => p === 0)).toBe(true);
  });

  it("handles numPeaks of 0", () => {
    const peaks = computePeaks(new Float32Array(10), 0);
    expect(peaks.length).toBe(0);
  });
});
