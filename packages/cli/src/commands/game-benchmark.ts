import { Session } from "node:inspector/promises";
import { performance } from "node:perf_hooks";
import { arch, cpus, platform } from "node:os";
import { createGameSession3D, createScriptedGameSession, validateAnyGame } from "@nodetool-ai/game-runtime";
import type { AnyGameDocument } from "@nodetool-ai/protocol";

export interface GameBenchmarkPercentiles {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
}

export function gameBenchmarkPercentiles(samples: readonly number[]): GameBenchmarkPercentiles {
  if (samples.length === 0 || samples.some((value) => !Number.isFinite(value) || value < 0)) { throw new Error("Benchmark samples must be nonempty, finite and nonnegative"); }
  const sorted = [...samples].sort((left, right) => left - right);
  const percentile = (fraction: number): number => sorted[Math.ceil(sorted.length * fraction) - 1];
  return { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) };
}

export interface GameBenchmarkReport {
  readonly documentId: string;
  readonly seed: number;
  readonly ticks: number;
  readonly warmupTicks: number;
  readonly tickMs: GameBenchmarkPercentiles;
  readonly scriptMs: GameBenchmarkPercentiles;
  readonly scriptCalls: number;
  readonly perSystemMs: null;
  readonly perSystemUnavailableReason: string;
  readonly heapDeltaBytes: number;
  readonly allocations: { readonly sampledBytes: number; readonly ticks: number; readonly samplingIntervalBytes: number; readonly method: string };
  readonly machine: { readonly platform: string; readonly architecture: string; readonly cpu: string; readonly node: string };
}

/** Measure the fixed simulation tick, including rendering-frame construction. */
export async function benchmarkNativeGame(document: AnyGameDocument, ticks = 1200, warmupTicks = 300, seed = 1): Promise<GameBenchmarkReport> {
  if (![ticks, warmupTicks, seed].every(Number.isSafeInteger) || ticks < 1 || ticks > 100_000 || warmupTicks < 0 || warmupTicks > 100_000 || seed < 0 || seed > 0xffffffff) { throw new Error("Invalid benchmark tick count, warmup or seed"); }
  const validation = validateAnyGame(document);
  if (!validation.valid) { throw new Error(validation.diagnostics.map((issue) => issue.message).join(", ")); }
  const session = document.schemaVersion === 3 ? await createGameSession3D(document, seed) : await createScriptedGameSession(document, seed);
  const input = { pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } };
  const profiler = new Session();
  const samplingIntervalBytes = 32768;
  let connected = false;
  let sampling = false;
  try {
    for (let index = 0; index < warmupTicks; index++) { session.step(input); }
    const heapBefore = process.memoryUsage().heapUsed;
    const tickSamples: number[] = [];
    const scriptSamples: number[] = [];
    let scriptCalls = 0;
    for (let index = 0; index < ticks; index++) {
      const start = performance.now();
      const result = session.step(input);
      tickSamples.push(performance.now() - start);
      scriptSamples.push(result.scriptStats?.durationMs ?? 0);
      scriptCalls += result.scriptStats?.calls ?? 0;
    }
    const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
    profiler.connect();
    connected = true;
    const samplingOptions = { samplingInterval: samplingIntervalBytes, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true };
    await profiler.post("HeapProfiler.startSampling", samplingOptions);
    sampling = true;
    const allocationTicks = Math.min(ticks, 10);
    for (let index = 0; index < allocationTicks; index++) { session.step(input); }
    const { profile } = await profiler.post("HeapProfiler.stopSampling");
    sampling = false;
    let sampledBytes = 0;
    const nodes = [profile.head];
    for (let index = 0; index < nodes.length; index++) {
      sampledBytes += nodes[index].selfSize;
      nodes.push(...nodes[index].children);
    }
    return { documentId: document.id, seed, ticks, warmupTicks, tickMs: gameBenchmarkPercentiles(tickSamples), scriptMs: gameBenchmarkPercentiles(scriptSamples), scriptCalls,
      perSystemMs: null, perSystemUnavailableReason: "Per-system timing requires the W2 runtime system pipeline", heapDeltaBytes,
      allocations: { sampledBytes, ticks: allocationTicks, samplingIntervalBytes, method: "V8 sampling heap profiler with collected allocations included. Statistical byte estimate, excludes WASM allocations" },
      machine: { platform: platform(), architecture: arch(), cpu: cpus()[0]?.model ?? "unknown", node: process.version } };
  } finally {
    try {
      if (sampling) { await profiler.post("HeapProfiler.stopSampling"); }
    } finally {
      if (connected) { profiler.disconnect(); }
      session.dispose();
    }
  }
}
