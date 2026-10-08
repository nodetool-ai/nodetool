/**
 * Large-document preview benchmark: opens the shipped Serein example (hundreds
 * of tracks, mostly text and shape motion graphics) in the editor, plays it,
 * and records what the preview costs. See TIMELINE_PREVIEW_PERF.md.
 *
 * Wall-clock numbers depend on the GPU; on a software adapter they measure the
 * adapter. The work counts (uploads, render passes, pixels drawn, compute
 * invocations, bitmap cache) do not, so they are what the assertions read.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { SHAPE_BITMAP_CACHE_BUDGET_BYTES } from "../../src/components/timeline/preview/shapeRender";
import { TEXT_BITMAP_CACHE_BUDGET_BYTES } from "../../src/components/timeline/preview/textRender";
import { readTrpcBatchId } from "../../src/components/timeline/perf/trpcInput";

const REPORT_DIR = process.env.TIMELINE_PERF_REPORT_DIR ?? join(tmpdir(), "nodetool-timeline-perf-reports");
const EXAMPLE = process.env.TIMELINE_LARGE_EXAMPLE ?? "serein";
const PLAY_MS = Number(process.env.TIMELINE_LARGE_PLAY_MS ?? 10_000);
const SEQUENCE_ID = `timeline-large-perf-${EXAMPLE}`;
const FULL_HD_BYTES = 1920 * 1080 * 4;

interface GpuWork {
  renderPasses: number;
  renderPixels: number;
  computeDispatches: number;
  computeInvocations: number;
}

interface PerfState {
  rafs: number[];
  submits: number[];
  uploads: number;
  uploadBytes: number;
  fullFrameUploads: number;
  failures: string[];
  gpu: GpuWork;
}

interface BitmapCache {
  textBytes: number;
  shapeBytes: number;
  peakTextBytes: number;
  peakShapeBytes: number;
}

function loadSequence(): Record<string, unknown> {
  const path = join(
    process.cwd(),
    "..",
    "packages/base-nodes/nodetool/examples/timelines",
    `${EXAMPLE}.timeline.json`
  );
  const doc = JSON.parse(readFileSync(path, "utf8")) as {
    fps: number;
    width: number;
    height: number;
    durationMs: number;
    document: Record<string, unknown> & { markers?: unknown[] };
  };
  return {
    id: SEQUENCE_ID,
    projectId: "default",
    name: `Large timeline benchmark (${EXAMPLE})`,
    fps: doc.fps,
    width: doc.width,
    height: doc.height,
    durationMs: doc.durationMs,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...doc.document,
    markers: doc.document.markers ?? []
  };
}

async function serveSequence(page: Page, sequence: Record<string, unknown>): Promise<void> {
  await page.route(/\/trpc\/[^?]*timeline\.get/, async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as unknown;
    const isBatch = Array.isArray(payload);
    const body = (isBatch ? payload : [payload]) as unknown[];
    const requestUrl = new URL(route.request().url());
    const operations = requestUrl.pathname.split("/").pop()?.split(",") ?? [];
    const rawInput = route.request().postData() ?? requestUrl.searchParams.get("input");
    const input: unknown = rawInput ? (JSON.parse(rawInput) as unknown) : {};
    operations.forEach((operation, index) => {
      if (operation === "timeline.get" && readTrpcBatchId(input, index) === SEQUENCE_ID) {
        body[index] = { result: { data: sequence } };
      }
    });
    await route.fulfill({ status: 200, contentType: "application/json", json: isBatch ? body : body[0] });
  });
}

/**
 * Counts the preview's own diagnostics and every GPU command it encodes. A
 * scissored pass counts only its scissor; a full pass counts its target.
 */
function instrument(fullHdBytes: number): void {
  const state: PerfState = {
    rafs: [],
    submits: [],
    uploads: 0,
    uploadBytes: 0,
    fullFrameUploads: 0,
    failures: [],
    gpu: { renderPasses: 0, renderPixels: 0, computeDispatches: 0, computeInvocations: 0 }
  };
  (window as unknown as { __timelineLargePerf: PerfState }).__timelineLargePerf = state;
  (window as unknown as { __nodetoolTimelinePerf: (event: { kind: string; at: number; width?: number; height?: number }) => void }).__nodetoolTimelinePerf = (event) => {
    if (event.kind === "compositor-submit") state.submits.push(event.at);
    if (event.kind === "source-upload") {
      const bytes = (event.width ?? 0) * (event.height ?? 0) * 4;
      state.uploads += 1;
      state.uploadBytes += bytes;
      if (bytes >= fullHdBytes) state.fullFrameUploads += 1;
    }
  };
  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const text = args.map(String).join(" ");
    const stage = /"stage":"([^"]+)"/.exec(text)?.[1];
    if (stage) state.failures.push(stage);
    originalError(...args);
  };
  const tick = (now: number): void => {
    state.rafs.push(now);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  if (typeof GPUCommandEncoder === "undefined") return;
  type Sized = { __pixels?: number };
  const createView = GPUTexture.prototype.createView;
  GPUTexture.prototype.createView = function (this: GPUTexture, descriptor?: GPUTextureViewDescriptor) {
    const view = createView.call(this, descriptor) as GPUTextureView & Sized;
    view.__pixels = this.width * this.height;
    return view;
  };
  const beginRenderPass = GPUCommandEncoder.prototype.beginRenderPass;
  GPUCommandEncoder.prototype.beginRenderPass = function (this: GPUCommandEncoder, descriptor: GPURenderPassDescriptor) {
    state.gpu.renderPasses += 1;
    const pass = beginRenderPass.call(this, descriptor) as GPURenderPassEncoder & Sized;
    const attachments = Array.from(descriptor.colorAttachments);
    pass.__pixels = (attachments[0]?.view as (GPUTextureView & Sized) | undefined)?.__pixels ?? 0;
    return pass;
  };
  const setScissorRect = GPURenderPassEncoder.prototype.setScissorRect;
  GPURenderPassEncoder.prototype.setScissorRect = function (this: GPURenderPassEncoder & Sized, x: number, y: number, width: number, height: number) {
    this.__pixels = width * height;
    return setScissorRect.call(this, x, y, width, height);
  };
  const draw = GPURenderPassEncoder.prototype.draw;
  GPURenderPassEncoder.prototype.draw = function (this: GPURenderPassEncoder & Sized, ...args: Parameters<GPURenderPassEncoder["draw"]>) {
    state.gpu.renderPixels += this.__pixels ?? 0;
    return draw.apply(this, args);
  };
  const dispatch = GPUComputePassEncoder.prototype.dispatchWorkgroups;
  GPUComputePassEncoder.prototype.dispatchWorkgroups = function (this: GPUComputePassEncoder, x: number, y = 1, z = 1) {
    state.gpu.computeDispatches += 1;
    // The effect modules dispatch 8×8 workgroups.
    state.gpu.computeInvocations += x * y * z * 64;
    return dispatch.call(this, x, y, z);
  };
}

async function readState(page: Page): Promise<PerfState> {
  return page.evaluate(() => (window as unknown as { __timelineLargePerf: PerfState }).__timelineLargePerf);
}

async function readBitmapCache(page: Page): Promise<BitmapCache | undefined> {
  return page.evaluate(() => (window as unknown as { __timelineBitmapCache?: BitmapCache }).__timelineBitmapCache);
}

function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

function perFrame(work: GpuWork, frames: number): GpuWork {
  const divide = (value: number): number => (frames > 0 ? Math.round(value / frames) : 0);
  return {
    renderPasses: divide(work.renderPasses),
    renderPixels: divide(work.renderPixels),
    computeDispatches: divide(work.computeDispatches),
    computeInvocations: divide(work.computeInvocations)
  };
}

test(`large timeline preview (${EXAMPLE}) loads and plays within its work budget`, async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const sequence = loadSequence();
  await serveSequence(page, sequence);
  await page.addInitScript(instrument, FULL_HD_BYTES);

  const started = Date.now();
  await page.goto(`/timeline/${SEQUENCE_ID}`, { waitUntil: "domcontentloaded" });
  const play = page.getByRole("button", { name: "Play" }).first();
  await play.waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForSelector("[data-preview-ready=true]", { state: "attached", timeout: 300_000 });
  const loadToReadyMs = Date.now() - started;
  const webgpu = await page.evaluate(() => "gpu" in navigator);

  const load = await readState(page);
  const loadCache = await readBitmapCache(page);
  await page.evaluate(() => {
    const state = (window as unknown as { __timelineLargePerf: PerfState }).__timelineLargePerf;
    state.rafs = [];
    state.submits = [];
    state.uploads = 0;
    state.uploadBytes = 0;
    state.fullFrameUploads = 0;
    state.gpu = { renderPasses: 0, renderPixels: 0, computeDispatches: 0, computeInvocations: 0 };
  });
  await play.click();
  await page.waitForTimeout(PLAY_MS);
  await page.keyboard.press("Space");
  const playback = await readState(page);
  const cache = await readBitmapCache(page);

  const intervals = playback.rafs.slice(1).map((now, index) => now - playback.rafs[index]!).sort((a, b) => a - b);
  const usedGpu = load.submits.length + playback.submits.length > 0;
  const report = {
    kind: "timeline-large-perf-v1",
    example: EXAMPLE,
    userAgent: await page.evaluate(() => navigator.userAgent),
    backend: usedGpu ? "webgpu" : "canvas2d",
    webgpuExposed: webgpu,
    loadToReadyMs,
    load: {
      firstSubmitMs: load.submits[0] ?? null,
      submits: load.submits.length,
      uploads: load.uploads,
      uploadMB: Math.round(load.uploadBytes / 1e6),
      fullFrameUploads: load.fullFrameUploads,
      gpuPerSubmit: perFrame(load.gpu, load.submits.length)
    },
    playback: {
      playMs: PLAY_MS,
      animationFrames: intervals.length,
      submits: playback.submits.length,
      submitsPerSecond: Math.round((playback.submits.length / (PLAY_MS / 1000)) * 10) / 10,
      frameIntervalP50Ms: Math.round(quantile(intervals, 0.5) * 10) / 10,
      frameIntervalP95Ms: Math.round(quantile(intervals, 0.95) * 10) / 10,
      frameIntervalMaxMs: Math.round((intervals.at(-1) ?? 0) * 10) / 10,
      uploads: playback.uploads,
      uploadMB: Math.round(playback.uploadBytes / 1e6),
      fullFrameUploads: playback.fullFrameUploads,
      gpuPerSubmit: perFrame(playback.gpu, playback.submits.length)
    },
    bitmapCache: { load: loadCache ?? null, playback: cache ?? null },
    failures: [...new Set([...load.failures, ...playback.failures])]
  };
  mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = join(REPORT_DIR, `timeline-large-${EXAMPLE}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`timeline large-document report: ${reportPath}\n${JSON.stringify(report, null, 2)}`);

  expect(report.failures).toEqual([]);
  if (!webgpu) return;
  expect(usedGpu, "WebGPU is exposed, so the preview must composite on it").toBe(true);
  // Text and shapes rasterize at their own size: only a clip that really
  // covers the frame uploads a frame-sized texture.
  expect(report.load.fullFrameUploads).toBeLessThan(report.load.uploads / 10);
  const peaks = cache ?? loadCache;
  expect(peaks?.peakTextBytes ?? 0).toBeLessThanOrEqual(TEXT_BITMAP_CACHE_BUDGET_BYTES);
  expect(peaks?.peakShapeBytes ?? 0).toBeLessThanOrEqual(SHAPE_BITMAP_CACHE_BUDGET_BYTES);
});
