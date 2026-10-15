import { afterEach, describe, expect, it, vi } from "vitest";
import { gameDocument, gameDocument3D, type AnyGameDocument } from "@nodetool-ai/protocol";
import * as runtime from "@nodetool-ai/game-runtime";
import { createNative3DGame, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { benchmarkNativeGame, gameBenchmarkPercentiles } from "../src/commands/game-benchmark.js";

function contactDocument(dimension: "2d" | "3d", lifetime?: number): AnyGameDocument {
  const behaviors = lifetime === undefined ? [] : [{ kind: "lifetime", ticks: lifetime }];
  if (dimension === "2d") {
    const document = createTopDownRoomGame("physics-counts-2d");
    const entities = [
      { id: "camera", transform2d: { x: 0, y: 0 }, camera2d: { width: 16, height: 9 } },
      { id: "body", transform2d: { x: 0, y: 0 }, body2d: { type: "kinematic" }, collider2d: { width: 1, height: 1 } },
      { id: "sensor", transform2d: { x: 0, y: 0 }, collider2d: { width: 2, height: 2, sensor: true }, behaviors },
      { id: "inactive", templateOnly: true, transform2d: { x: 0, y: 0 }, collider2d: { width: 1, height: 1 } }
    ];
    return gameDocument.parse({ ...document, scenes: [{ ...document.scenes[0], entities }] });
  }
  const document = createNative3DGame("physics-counts-3d");
  const entities = [
    { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } },
    { id: "body", transform3d: {}, body3d: { type: "dynamic", gravityScale: 0 }, collider3d: { kind: "sphere", radius: 0.5 } },
    { id: "sensor", transform3d: {}, body3d: { type: "static" }, collider3d: { kind: "sphere", radius: 1, sensor: true }, behaviors },
    { id: "inactive", templateOnly: true, transform3d: {}, body3d: { type: "static" }, collider3d: { kind: "sphere", radius: 0.5 } }
  ];
  return gameDocument3D.parse({ ...document, scenes: [{ ...document.scenes[0], entities }] });
}

afterEach(() => { vi.restoreAllMocks(); });

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
  describe.each(["2d", "3d"] as const)("%s physics counts", (dimension) => {
    it("reports active bodies and touching collider pairs from a real session", async () => {
      const report = await benchmarkNativeGame(contactDocument(dimension), 5, 2, 1);
      expect(report.physicsCounts).toEqual({ bodies: { p50: 2, p95: 2, p99: 2 }, contacts: { p50: 1, p95: 1, p99: 1 } });
    });
    it("excludes warmup ticks before the measured window", async () => {
      const report = await benchmarkNativeGame(contactDocument(dimension, 2), 5, 4, 1);
      expect(report.physicsCounts).toEqual({ bodies: { p50: 1, p95: 1, p99: 1 }, contacts: { p50: 0, p95: 0, p99: 0 } });
    });
    it("aggregates changing counts throughout the measured window", async () => {
      const report = await benchmarkNativeGame(contactDocument(dimension, 1), 5, 0, 1);
      expect(report.physicsCounts).toEqual({ bodies: { p50: 1, p95: 2, p99: 2 }, contacts: { p50: 0, p95: 1, p99: 1 } });
    });
    it("excludes allocation sampling ticks after the measured window", async () => {
      const report = await benchmarkNativeGame(contactDocument(dimension, 3), 3, 0, 1);
      expect(report.physicsCounts).toEqual({ bodies: { p50: 2, p95: 2, p99: 2 }, contacts: { p50: 1, p95: 1, p99: 1 } });
      expect(report.allocations.ticks).toBe(3);
    });
  });
  it("rejects missing physics telemetry instead of reporting zero counts", async () => {
    const createSession = runtime.createScriptedGameSession;
    vi.spyOn(runtime, "createScriptedGameSession").mockImplementationOnce(async (...args) => {
      const session = await createSession(...args);
      return { ...session, step(input) {
        const { physics: _physics, ...result } = session.step(input);
        return result;
      } };
    });
    await expect(benchmarkNativeGame(contactDocument("2d"), 1, 0, 1)).rejects.toThrow("Missing physics counts for measured benchmark tick");
  });
});
