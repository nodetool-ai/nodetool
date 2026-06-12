/**
 * Realtime workflow performance test.
 *
 * Drives the perf harness page (perf-realtime.html), which runs a parametric
 * synth patch in the real browser-runner Web Worker, and measures:
 *
 *  - main thread: CPU (CDP Performance.TaskDuration delta / wall time), JS
 *    heap growth + GC sawtooth, event-loop lag, long tasks (harness-reported)
 *  - worker: event-loop lag (GC pauses show up as spikes) sampled from inside
 *    the worker via worker.evaluate — no production instrumentation needed
 *  - agent-cluster memory: performance.measureUserAgentSpecificMemory with
 *    per-realm attribution (page vs worker). Requires the harness page to be
 *    cross-origin isolated — vite.config's perfPageIsolationPlugin sets
 *    COOP/COEP for /perf-realtime only. Falls back to null when unavailable.
 *  - stream health: achieved vs expected chunk rate (a CPU-bound worker
 *    falls below realtime; broken pacing runs hot)
 *
 * The default 60s duration is deliberate: memory pressure and GC cadence
 * only become visible once rolling buffers hit their caps (~22s) and the
 * heap reaches steady state.
 *
 * Knobs: PERF_VOICES (default 8), PERF_DURATION_MS (default 60000).
 *
 * Run:
 *   cd web && npx playwright test tests/benchmarks/realtime-perf.spec.ts --project=chromium
 *
 * Skipped in CI — perf numbers on shared runners are noise.
 */
import { test, expect } from "@playwright/test";
import type { Page, Worker } from "@playwright/test";

const VOICES = Number(process.env.PERF_VOICES ?? 8);
const DURATION_MS = Number(process.env.PERF_DURATION_MS ?? 60_000);
/** "voices" = N independent chains; "complex" = full modular patch
 * (clock, S&H pitch CV, FM/filter LFOs, ADSR/VCA, mixer tree → 1 output). */
const PATCH = process.env.PERF_PATCH === "complex" ? "complex" : "voices";
/** PERF_PLAYBACK=1: route the output into a real AudioContext + worklet and
 * report buffer health. Runs HEADED — clock-skew diagnosis needs the real
 * audio-hardware clock; headless fake audio is paced by the system clock. */
const PLAYBACK = process.env.PERF_PLAYBACK === "1";

/** Worker timer ticks arriving this late are almost certainly GC pauses. */
const GC_PAUSE_THRESHOLD_MS = 20;

const percentile = (sorted: number[], p: number): number =>
  sorted.length === 0
    ? 0
    : sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

interface AgentMemory {
  totalBytes: number;
  windowBytes: number;
  workerBytes: number;
}

/**
 * Post-GC retained memory per realm (page vs worker). The UA forces a GC
 * before reporting, so consecutive measurements compare *retained* heap —
 * the leak signal — rather than transient garbage.
 */
const measureAgentMemory = (page: Page): Promise<AgentMemory | null> =>
  page.evaluate(async () => {
    interface Breakdown {
      bytes: number;
      attribution: Array<{ scope?: string }>;
    }
    const perf = performance as Performance & {
      measureUserAgentSpecificMemory?: () => Promise<{
        bytes: number;
        breakdown: Breakdown[];
      }>;
    };
    if (!crossOriginIsolated || !perf.measureUserAgentSpecificMemory) {
      return null;
    }
    let result: { bytes: number; breakdown: Breakdown[] } | null;
    try {
      // The UA resolves this on the next major GC (forcing one after a
      // randomized delay) — under sustained streaming load that trigger can
      // starve, so cap the wait rather than hang the test.
      result = await Promise.race([
        perf.measureUserAgentSpecificMemory(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 30_000))
      ]);
    } catch {
      // Headless-shell / stripped builds expose the API but refuse it.
      return null;
    }
    if (!result) return null;
    let workerBytes = 0;
    let windowBytes = 0;
    for (const entry of result.breakdown) {
      const isWorker = entry.attribution.some((a) =>
        (a.scope ?? "").includes("Worker")
      );
      if (isWorker) workerBytes += entry.bytes;
      else windowBytes += entry.bytes;
    }
    return { totalBytes: result.bytes, windowBytes, workerBytes };
  });

// Unquantized performance.memory readings — required for the GC sawtooth
// analysis (bucketed values hide small collections). channel "chromium"
// forces the full Chromium binary (new headless): Playwright's default
// headless shell lacks measureUserAgentSpecificMemory. Must be top-level:
// these options force a dedicated browser worker.
test.use({
  channel: "chromium",
  ...(PLAYBACK ? { headless: false } : {}),
  launchOptions: {
    args: [
      "--enable-precise-memory-info",
      "--autoplay-policy=no-user-gesture-required"
    ]
  }
});

test.describe("Realtime workflow performance", () => {
  test.skip(process.env.CI === "true", "perf numbers on CI runners are noise");
  test.setTimeout(DURATION_MS + 180_000);

  test(`synth patch (${PATCH}): ${VOICES} voices for ${DURATION_MS}ms`, async ({
    page
  }) => {
    await page.goto("/perf-realtime.html", { waitUntil: "domcontentloaded" });

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");

    const getMetric = async (name: string): Promise<number> => {
      const { metrics } = await cdp.send("Performance.getMetrics");
      return metrics.find((m) => m.name === name)?.value ?? 0;
    };

    // The runner worker spawns when the harness initializes it; arm the
    // listener before starting the run.
    const workerPromise = page.waitForEvent("worker", {
      predicate: (w: Worker) => w.url().includes("browserRunner"),
      timeout: 60_000
    });

    const runPromise = page.evaluate(
      ({ voices, durationMs, patch, playback }) =>
        window.__realtimePerf.start({ voices, durationMs, patch, playback }),
      {
        voices: VOICES,
        durationMs: DURATION_MS,
        patch: PATCH as "voices" | "complex",
        playback: PLAYBACK
      }
    );

    const worker = await workerPromise;

    // Sample event-loop lag from inside the worker while the patch runs.
    // Sustained lag = CPU saturation; isolated spikes ≈ GC pauses.
    await worker.evaluate(() => {
      const g = globalThis as unknown as {
        __perf?: { lag: number[] };
        __perfTimer?: ReturnType<typeof setInterval>;
      };
      const samples: { lag: number[] } = { lag: [] };
      g.__perf = samples;
      const TICK = 20;
      let expected = performance.now() + TICK;
      g.__perfTimer = setInterval(() => {
        const now = performance.now();
        samples.lag.push(Math.max(0, now - expected));
        expected = now + TICK;
      }, TICK);
    });

    const pageTaskStart = await getMetric("TaskDuration");
    const wallStart = Date.now();

    // Retained-memory baseline a few seconds into the stream (worker up,
    // buffers filling). The call itself forces a GC, so the comparison
    // below is retained-vs-retained.
    await page.waitForTimeout(3000);
    const memoryStart = await measureAgentMemory(page);

    const summary = await runPromise;

    const wallSeconds = (Date.now() - wallStart) / 1000;
    const pageTaskEnd = await getMetric("TaskDuration");
    const memoryEnd = await measureAgentMemory(page);

    const workerSamples = await worker.evaluate(() => {
      const g = globalThis as unknown as {
        __perf?: { lag: number[] };
        __perfTimer?: ReturnType<typeof setInterval>;
      };
      if (g.__perfTimer) clearInterval(g.__perfTimer);
      return g.__perf ?? { lag: [] };
    });

    const workerLag = [...workerSamples.lag].sort((a, b) => a - b);
    const gcPauses = workerSamples.lag.filter(
      (l) => l > GC_PAUSE_THRESHOLD_MS
    );
    const heap = summary.heap;

    const report = {
      config: {
        voices: VOICES,
        durationMs: DURATION_MS,
        patch: PATCH,
        nodes: summary.nodeCount,
        edges: summary.edgeCount,
        outputStreams: summary.outputStreams
      },
      stream: {
        chunkRateRatio: Number(summary.chunkRateRatio.toFixed(3)),
        totalAudioChunks: summary.totalAudioChunks,
        messageCountsByType: summary.messageCountsByType,
        runError: summary.runError ?? null
      },
      mainThread: {
        // Fraction of wall time the page's main thread spent in tasks.
        cpu: Number(((pageTaskEnd - pageTaskStart) / wallSeconds).toFixed(3)),
        heap: heap
          ? {
              start: mb(heap.start),
              end: mb(heap.end),
              peak: mb(heap.peak),
              growthMbPerMin: Number(heap.growthMbPerMin.toFixed(2)),
              gcEvents: heap.gcEvents,
              gcReclaimedMb: Number(heap.gcReclaimedMb.toFixed(1))
            }
          : null,
        lagMs: summary.mainThreadLagMs,
        longTasks: summary.longTasks
      },
      worker: {
        lagMs: {
          p50: Number(percentile(workerLag, 50).toFixed(2)),
          p95: Number(percentile(workerLag, 95).toFixed(2)),
          p99: Number(percentile(workerLag, 99).toFixed(2)),
          max: Number((workerLag[workerLag.length - 1] ?? 0).toFixed(2))
        },
        gcPauses: {
          count: gcPauses.length,
          perMinute: Number(
            (gcPauses.length / (wallSeconds / 60)).toFixed(2)
          ),
          maxMs: Number(
            (gcPauses.length > 0 ? Math.max(...gcPauses) : 0).toFixed(2)
          )
        }
      },
      playback: summary.playback
        ? (() => {
            const s = summary.playback.stats;
            const first = s[0];
            const last = s[s.length - 1];
            const seconds = first && last ? (last.t - first.t) / 1000 : 0;
            // Buffer drift in source frames per second over the run. With
            // matched clocks this is ~0; a steady slope is producer/consumer
            // clock skew (negative ⇒ heading for underruns, positive ⇒
            // heading for live-mode stale drops).
            const slope =
              first && last && seconds > 0
                ? (last.buffered - first.buffered) / seconds
                : 0;
            return {
              contextSampleRate: summary.playback.contextSampleRate,
              underruns: summary.playback.underruns,
              droppedFrames: summary.playback.droppedFrames,
              bufferedFrames: {
                first: first?.buffered ?? 0,
                last: last?.buffered ?? 0,
                min: Math.min(...s.map((x) => x.buffered)),
                max: Math.max(...s.map((x) => x.buffered))
              },
              bufferSlopeFramesPerSec: Number(slope.toFixed(2)),
              impliedClockSkewPpm: Number(((slope / 24000) * 1e6).toFixed(0)),
              timeline: s
                .filter((_, i) => i % 5 === 0)
                .map((x) => `${Math.round(x.t / 1000)}s:${x.buffered}f/${x.underruns}u/${x.droppedFrames}d`)
            };
          })()
        : null,
      retainedMemory:
        memoryStart && memoryEnd
          ? {
              page: {
                start: mb(memoryStart.windowBytes),
                end: mb(memoryEnd.windowBytes),
                growth: mb(memoryEnd.windowBytes - memoryStart.windowBytes)
              },
              worker: {
                start: mb(memoryStart.workerBytes),
                end: mb(memoryEnd.workerBytes),
                growth: mb(memoryEnd.workerBytes - memoryStart.workerBytes)
              }
            }
          : null
    };

    console.log(
      `\n=== realtime perf (${VOICES} voices, ${DURATION_MS}ms) ===\n` +
        JSON.stringify(report, null, 2)
    );

    expect(summary.runError).toBeUndefined();
    // Realtime health: the worker must sustain (close to) the realtime chunk
    // rate. 0.8 is deliberately generous — this guards against collapse, not
    // jitter; read the logged report for the actual numbers.
    expect(summary.chunkRateRatio).toBeGreaterThan(0.8);
    // And the stream must not run hot (producing faster than realtime would
    // mean pacing is broken and buffers grow without bound).
    expect(summary.chunkRateRatio).toBeLessThan(1.2);
    // Memory pressure: with capped rolling buffers the main-thread heap must
    // reach steady state. Generous bound — this catches unbounded growth,
    // not GC noise.
    if (heap && DURATION_MS >= 30_000) {
      expect(heap.growthMbPerMin).toBeLessThan(50);
    }
    // Retained worker memory must not climb across the run (post-GC vs
    // post-GC). 64MB headroom absorbs measurement jitter.
    if (memoryStart && memoryEnd) {
      expect(memoryEnd.workerBytes - memoryStart.workerBytes).toBeLessThan(
        64 * 1024 * 1024
      );
    }
  });
});
