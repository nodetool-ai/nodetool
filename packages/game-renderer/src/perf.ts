import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, LaunchOptions } from "playwright";
import { z } from "zod";
import { gameFrameBudgets, type GameInputFrame3D } from "@nodetool-ai/protocol";
import { resolveGameFrameBudgets, resolveGameTimeBudgets } from "./frame-budget.js";
import { launchStandaloneChromium, serveStandaloneDirectory, type StandaloneServer } from "./static-server.js";

export interface GamePerfOptions {
  /** Route replayed with `advance` before live play. */
  readonly inputs?: readonly Omit<GameInputFrame3D, "loaded">[];
  /** Measured seconds of live play. */
  readonly seconds?: number;
  /** Seconds of live play before the measurement, so loading and first compiles stay out of it. */
  readonly warmupSeconds?: number;
  /** Uses SwiftShader instead of the machine GPU. Frame times then say nothing about real hardware. */
  readonly software?: boolean;
  /** Keeps Chromium's frame rate limit and vsync. Without it, frame times show the real cost of a frame. */
  readonly vsync?: boolean;
  readonly executablePath?: string;
  readonly signal?: AbortSignal;
}

export interface GamePerfPercentiles {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

export type GamePerfMetric = "frameMs" | "drawCalls" | "triangles" | "programGrowth";

export interface GamePerfOverrun {
  readonly metric: GamePerfMetric;
  readonly value: number;
  readonly budget: number;
}

export interface GamePerfReport {
  /** True when the player loaded and played without errors. Budget overruns do not change it. */
  readonly ok: boolean;
  readonly gpu: { readonly renderer: string; readonly adapterType: "hardware" | "software" | "unknown" };
  readonly canvas: { readonly width: number; readonly height: number };
  readonly vsync: boolean;
  readonly routeTicks: number;
  readonly seconds: number;
  /** Frames the player rendered in the measured window. */
  readonly renderedFrames: number;
  readonly fps: number;
  /** Time between consecutive rendered frames. */
  readonly frameMs: GamePerfPercentiles;
  /** Draw calls and triangles per frame, including shadow and depth passes. */
  readonly drawCalls: GamePerfPercentiles;
  readonly triangles: GamePerfPercentiles;
  /** Shader programs at the start and end of the measured window. Growth means new program variants during play. */
  readonly programs: { readonly start: number; readonly end: number; readonly growth: number };
  readonly ticks: { readonly start: number; readonly end: number };
  readonly budget: { readonly limits: Readonly<Record<GamePerfMetric, number>>; readonly overruns: readonly GamePerfOverrun[] };
  readonly status: string;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

const perfDocument = z.object({ schemaVersion: z.literal(3), performance: z.object({ budgets: gameFrameBudgets.optional() }).optional() });
const frameStats = z.object({ frameNumber: z.number(), tick: z.number(), drawCalls: z.number(), triangles: z.number(), programs: z.number() });
const measured = z.object({
  intervals: z.array(z.number()), drawCalls: z.array(z.number()), triangles: z.array(z.number()),
  start: frameStats, end: frameStats, elapsedMs: z.number()
});

const ROUTE_CHUNK = 10_000;

/** Nearest-rank percentiles, the same method `game bench` uses. */
export function gamePerfPercentiles(samples: readonly number[]): GamePerfPercentiles {
  if (samples.length === 0) { return { p50: 0, p95: 0, p99: 0, max: 0 }; }
  const sorted = [...samples].sort((left, right) => left - right);
  const percentile = (fraction: number): number => sorted[Math.ceil(sorted.length * fraction) - 1];
  return { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: sorted[sorted.length - 1] };
}

function chromiumArgs(options: GamePerfOptions): string[] {
  const gpu = options.software
    ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    : [...process.platform === "darwin" ? ["--use-angle=metal"] : [], "--enable-gpu", "--ignore-gpu-blocklist"];
  return options.vsync ? gpu : [...gpu, "--disable-gpu-vsync", "--disable-frame-rate-limit"];
}

/**
 * Plays an exported 3D player in Chromium and measures frame time during live play. The route runs first
 * with `advance`, then the player resumes and the window after the warmup is measured.
 */
export async function measureStandaloneGame3D(directory: string, options: GamePerfOptions = {}): Promise<GamePerfReport> {
  const seconds = options.seconds ?? 10;
  const warmupSeconds = options.warmupSeconds ?? 2;
  const inputs = options.inputs ?? [];
  if (!Number.isFinite(seconds) || seconds < 0.5 || seconds > 600) { throw new Error("Perf seconds must be between 0.5 and 600"); }
  if (!Number.isFinite(warmupSeconds) || warmupSeconds < 0 || warmupSeconds > 120) { throw new Error("Perf warmup must be between 0 and 120 seconds"); }
  options.signal?.throwIfAborted();
  const root = await realpath(directory);
  const document = perfDocument.parse(JSON.parse(await readFile(join(root, "game.json"), "utf8")));
  const budgets = document.performance?.budgets;
  const counts = resolveGameFrameBudgets(budgets);
  const limits = { frameMs: resolveGameTimeBudgets(budgets).frameMs, drawCalls: counts.drawCalls, triangles: counts.triangles, programGrowth: 0 };
  const errors = new Set<string>();
  const warnings: string[] = [];
  let browser: Browser | undefined;
  let server: StandaloneServer | undefined;
  const closeBrowser = (): void => { void browser?.close(); };
  options.signal?.addEventListener("abort", closeBrowser, { once: true });
  try {
    server = await serveStandaloneDirectory(root);
    const origin = server.origin;
    const launchOptions: LaunchOptions = { headless: true, args: chromiumArgs(options) };
    if (options.executablePath) { launchOptions.executablePath = options.executablePath; }
    browser = await launchStandaloneChromium(launchOptions);
    options.signal?.throwIfAborted();
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === origin) { return route.continue(); }
      errors.add(`Outside network request: ${route.request().url()}`);
      return route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    page.setDefaultTimeout(120_000);
    page.on("pageerror", (error) => errors.add(error.message));
    page.on("console", (message) => { if (message.type() === "error") { errors.add(message.text()); } });
    await page.goto(origin);
    await page.waitForFunction(() => Boolean(window.nativeGame3DPlayer) || /failed|error|missing|could not/i.test(window.document.getElementById("status")?.textContent ?? ""));
    const loadStatus = await page.locator("#status").textContent() ?? "";
    if (!(await page.evaluate(() => Boolean(window.nativeGame3DPlayer)))) { throw new Error(`Player did not start: ${loadStatus}`); }
    const gpu = await page.evaluate(() => {
      const context = window.document.createElement("canvas").getContext("webgl2");
      const debug = context?.getExtension("WEBGL_debug_renderer_info");
      const renderer: unknown = context && debug ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unknown";
      return typeof renderer === "string" ? renderer : "unknown";
    });
    const adapterType = /swiftshader|llvmpipe|lavapipe|software/i.test(gpu) ? "software" : gpu === "unknown" ? "unknown" : "hardware";
    if (!options.software && adapterType !== "hardware") { warnings.push(`Chromium used a ${adapterType} renderer (${gpu}). Frame times do not reflect the machine GPU.`); }
    for (let index = 0; index < inputs.length; index += ROUTE_CHUNK) {
      options.signal?.throwIfAborted();
      await page.evaluate(async (chunk) => { await window.nativeGame3DPlayer.advance(chunk); }, inputs.slice(index, index + ROUTE_CHUNK));
    }
    const raw = await page.evaluate(async ({ warmupMs, measureMs }) => {
      const player = window.nativeGame3DPlayer;
      player.resume();
      await new Promise<void>((resolve) => { setTimeout(resolve, warmupMs); });
      const start = player.stats();
      const intervals: number[] = [];
      const drawCalls: number[] = [];
      const triangles: number[] = [];
      let lastFrame = start.frameNumber;
      const began = performance.now();
      let lastRendered = began;
      let now = began;
      await new Promise<void>((resolve) => {
        const sample = (time: number): void => {
          now = time;
          const stats = player.stats();
          if (stats.frameNumber !== lastFrame) {
            intervals.push(time - lastRendered);
            drawCalls.push(stats.drawCalls);
            triangles.push(stats.triangles);
            lastFrame = stats.frameNumber;
            lastRendered = time;
          }
          if (time - began < measureMs) { requestAnimationFrame(sample); } else { resolve(); }
        };
        requestAnimationFrame(sample);
      });
      return { intervals, drawCalls, triangles, start, end: player.stats(), elapsedMs: now - began };
    }, { warmupMs: warmupSeconds * 1000, measureMs: seconds * 1000 });
    const result = measured.parse(raw);
    const canvas = await page.evaluate(() => {
      const element = window.document.getElementById("game");
      return element instanceof HTMLCanvasElement ? { width: element.width, height: element.height } : { width: 0, height: 0 };
    });
    const status = await page.locator("#status").textContent() ?? "";
    if (/failed|error|missing|unavailable|could not|lost/i.test(status)) { errors.add(`Player status: ${status}`); }
    // The first interval starts at the first rAF, not at a rendered frame, so it is left out.
    const frameMs = gamePerfPercentiles(result.intervals.slice(1));
    const drawCalls = gamePerfPercentiles(result.drawCalls);
    const triangles = gamePerfPercentiles(result.triangles);
    const renderedFrames = result.end.frameNumber - result.start.frameNumber;
    if (renderedFrames < 2) { errors.add(`Player rendered ${renderedFrames} frames in ${seconds} s of live play`); }
    const growth = result.end.programs - result.start.programs;
    const sample: Record<GamePerfMetric, number> = { frameMs: frameMs.p95, drawCalls: drawCalls.p95, triangles: triangles.p95, programGrowth: growth };
    const overruns = (Object.keys(limits) as GamePerfMetric[]).flatMap((metric) => sample[metric] > limits[metric] ? [{ metric, value: sample[metric], budget: limits[metric] }] : []);
    return { ok: errors.size === 0, gpu: { renderer: gpu, adapterType }, canvas, vsync: options.vsync === true, routeTicks: inputs.length, seconds,
      renderedFrames, fps: result.elapsedMs > 0 ? renderedFrames * 1000 / result.elapsedMs : 0, frameMs, drawCalls, triangles,
      programs: { start: result.start.programs, end: result.end.programs, growth }, ticks: { start: result.start.tick, end: result.end.tick },
      budget: { limits, overruns }, status, warnings, errors: [...errors] };
  } finally {
    options.signal?.removeEventListener("abort", closeBrowser);
    await browser?.close();
    await server?.close();
  }
}

export function formatGamePerfOverrun(overrun: GamePerfOverrun): string {
  switch (overrun.metric) {
    case "frameMs": return `Perf budget exceeded: frame p95 ${overrun.value.toFixed(2)} ms (budget ${overrun.budget} ms)`;
    case "programGrowth": return `Perf budget exceeded: ${overrun.value} new shader programs during steady play (budget 0)`;
    case "drawCalls": return `Perf budget exceeded: draw call p95 ${overrun.value} (budget ${overrun.budget})`;
    case "triangles": return `Perf budget exceeded: triangle p95 ${overrun.value} (budget ${overrun.budget})`;
  }
}
