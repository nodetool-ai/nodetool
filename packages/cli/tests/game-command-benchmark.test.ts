import { describe, expect, it } from "vitest";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { benchmarkNativeGame, gameBenchmarkPercentiles } from "../src/commands/game-benchmark.js";

describe("native game benchmark", () => {
  it("uses nearest-rank percentiles and rejects empty input", () => {
    expect(gameBenchmarkPercentiles(Array.from({ length: 100 }, (_, index) => 100 - index))).toEqual({ p50: 50, p95: 95, p99: 99 });
    expect(() => gameBenchmarkPercentiles([])).toThrow();
    expect(() => gameBenchmarkPercentiles([NaN])).toThrow();
  });
  it("measures ticks and reports sampled allocations separately from heap delta", async () => {
    const report = await benchmarkNativeGame(createTopDownRoomGame("small-benchmark"), 5, 2, 7);
    expect(report).toMatchObject({ documentId: "small-benchmark", ticks: 5, warmupTicks: 2, seed: 7, perSystemMs: null });
    expect(report.tickMs.p99).toBeGreaterThan(0);
    expect(report.tickMs.p50).toBeLessThanOrEqual(report.tickMs.p95);
    expect(report.allocations.method).toContain("sampling");
    expect(report.heapDeltaBytes).toEqual(expect.any(Number));
  });
  it("rejects invalid sampling counts before starting a session", async () => {
    await expect(benchmarkNativeGame(createTopDownRoomGame("invalid-benchmark"), 0)).rejects.toThrow("Invalid benchmark");
  });
});
