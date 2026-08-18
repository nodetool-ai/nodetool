/**
 * The system-stats sampler feeds the Model Manager's hardware-fit
 * recommendations (`useHardwareProfile` in web). VRAM comes from an
 * `nvidia-smi` probe; these tests pin the parser so a driver-output quirk
 * degrades to "no GPU fields" instead of a bogus budget.
 */
import { describe, expect, it } from "vitest";
import {
  createSystemStatsSampler,
  parseNvidiaSmiGpuStats
} from "../src/system-stats.js";

describe("parseNvidiaSmiGpuStats", () => {
  it("parses a single GPU line (utilization %, memory MiB)", () => {
    const stats = parseNvidiaSmiGpuStats("37, 24576, 4096\n");
    expect(stats).toEqual({
      gpu_percent: 37,
      vram_total_gb: 24,
      vram_used_gb: 4,
      vram_percent: (4096 / 24576) * 100
    });
  });

  it("reports the GPU with the most memory, not a sum across GPUs", () => {
    const stats = parseNvidiaSmiGpuStats("90, 8192, 8000\n10, 49140, 1024\n");
    expect(stats?.vram_total_gb).toBeCloseTo(48, 1);
    expect(stats?.gpu_percent).toBe(10);
  });

  it("tolerates [N/A] utilization but still reports memory", () => {
    const stats = parseNvidiaSmiGpuStats("[N/A], 16384, 512\n");
    expect(stats?.vram_total_gb).toBe(16);
    expect(stats?.gpu_percent).toBe(0);
  });

  it("returns null for empty or unparseable output", () => {
    expect(parseNvidiaSmiGpuStats("")).toBeNull();
    expect(parseNvidiaSmiGpuStats("NVIDIA-SMI has failed\n")).toBeNull();
    expect(parseNvidiaSmiGpuStats("[N/A], [N/A], [N/A]\n")).toBeNull();
  });
});

describe("createSystemStatsSampler", () => {
  it("returns CPU/RAM stats synchronously even when no GPU probe has resolved", () => {
    const sample = createSystemStatsSampler()();
    expect(sample.cpu_percent).toBeGreaterThanOrEqual(0);
    expect(sample.memory_total_gb).toBeGreaterThan(0);
    // GPU fields are absent (not null/NaN) until a probe succeeds.
    expect(sample).not.toHaveProperty("vram_total_gb");
  });
});
