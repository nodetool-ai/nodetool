import { describe, expect, it } from "vitest";
import { createNative3DGame, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { benchmarkNativeGame, gameBenchmarkPercentiles } from "../src/commands/game-benchmark.js";

describe("native game benchmark", () => {
  it("uses nearest-rank percentiles and rejects empty input", () => {
    expect(gameBenchmarkPercentiles(Array.from({ length: 100 }, (_, index) => 100 - index))).toEqual({ p50: 50, p95: 95, p99: 99 });
    expect(() => gameBenchmarkPercentiles([])).toThrow();
    expect(() => gameBenchmarkPercentiles([NaN])).toThrow();
  });
  it("measures ticks and reports sampled allocations separately from heap delta", async () => {
    const report = await benchmarkNativeGame(createTopDownRoomGame("small-benchmark"), 5, 2, 7);
    expect(report).toMatchObject({ documentId: "small-benchmark", ticks: 5, warmupTicks: 2, seed: 7, perSystemUnavailableReason: null });
    expect(Object.keys(report.perSystemMs)).toEqual(["input", "scripts", "physics", "contacts", "gameplay", "presentation"]);
    for (const timing of Object.values(report.perSystemMs)) {
      expect([timing.p50, timing.p95, timing.p99].every(Number.isFinite)).toBe(true);
      expect(timing.p50).toBeGreaterThanOrEqual(0);
      expect(timing.p50).toBeLessThanOrEqual(timing.p95);
      expect(timing.p95).toBeLessThanOrEqual(timing.p99);
    }
    expect(report.tickMs.p99).toBeGreaterThan(0);
    expect(report.tickMs.p50).toBeLessThanOrEqual(report.tickMs.p95);
    expect(report.allocations.method).toContain("sampling");
    expect(report.heapDeltaBytes).toEqual(expect.any(Number));
  });
  it("reports all eight systems from a real 3D session", async () => {
    const report = await benchmarkNativeGame(createNative3DGame("small-spatial-benchmark"), 3, 1, 7);
    expect(Object.keys(report.perSystemMs)).toEqual(["input", "scripts", "character", "physics", "contacts", "gameplay", "animation", "presentation"]);
    expect(report.perSystemUnavailableReason).toBeNull();
    for (const timing of Object.values(report.perSystemMs)) {
      expect([timing.p50, timing.p95, timing.p99].every(Number.isFinite)).toBe(true);
      expect(timing.p50).toBeGreaterThanOrEqual(0);
      expect(timing.p50).toBeLessThanOrEqual(timing.p95);
      expect(timing.p95).toBeLessThanOrEqual(timing.p99);
    }
  });
  it("rejects invalid sampling counts before starting a session", async () => {
    await expect(benchmarkNativeGame(createTopDownRoomGame("invalid-benchmark"), 0)).rejects.toThrow("Invalid benchmark");
  });
});
