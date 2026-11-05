import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { Encoder } from "node-av";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import type { TimelineSequence } from "@nodetool-ai/timeline";
import { renderTimelineComposited } from "../src/nodes/timeline/compositeRender.js";

const observed = vi.hoisted(() => ({ active: 0, peak: 0, writes: 0, failSecondWrite: false,
  onWrite: undefined as undefined | (() => void) }));
// Instrument the real encoder. Every open, write, finish and abort calls libav.
vi.mock("@nodetool-ai/runtime/media", async (original) => {
  const actual = await original<typeof import("@nodetool-ai/runtime/media")>();
  return { ...actual, openVideoFrameEncoder: async (opts: Parameters<typeof actual.openVideoFrameEncoder>[0]) => {
    const encoder = await actual.openVideoFrameEncoder(opts);
    observed.active++;
    observed.peak = Math.max(observed.peak, observed.active);
    let closed = false;
    let writes = 0;
    const close = (): void => { if (!closed) { closed = true; observed.active--; } };
    return { ...encoder,
      write: async (bytes: Uint8Array) => {
        writes++;
        if (observed.failSecondWrite && writes === 2) {
          expect((await stat(opts.outPath)).isFile()).toBe(true);
          // Exercise native validation after the first frame created the file.
          bytes = new Uint8Array(0);
        }
        const pending = encoder.write(bytes);
        observed.writes++;

        await pending;
      },
      finish: async () => { try { await encoder.finish(); } finally { close(); } },
      abort: async () => { try { await encoder.abort(); } finally { close(); } }
    };
  } };
});
const sequence = { id: "admission", name: "Admission", width: 1920, height: 1080,
  fps: 10, durationMs: 200, tracks: [{id: "v", type: "video", index: 0, visible: true}],
  clips: [{id: "s", trackId: "v", mediaType: "shape", startMs: 0, durationMs: 10000,
    shapeStyle: {kind: "rect", fill: "#5984ad"}}] } as TimelineSequence;
const options = {sequence, width: 1920, height: 1080, fps: 10, durationMs: 200,
  resolveAssetPath: async () => null};
afterEach(() => { vi.unstubAllEnvs(); observed.onWrite = undefined; observed.failSecondWrite = false; });
for (const workingFormat of ["rgba8unorm", "rgba16float"] as const) {
  it.each([1, 2])(`bounds real ${workingFormat} renders and rejects a queued abort at cap %i`, async (cap) => {
    vi.stubEnv("NODETOOL_TIMELINE_RENDER_CONCURRENCY", String(cap));
    const dir = await mkdtemp(join(tmpdir(), "a42-admission-"));
    observed.peak = 0;
    const start = performance.now();
    try {
      // Three jobs exceed both caps. Enqueue a fourth before any await can admit it.
      const jobs = Array.from({length: 3}, (_, i) => renderTimelineComposited({ ...options,
        workingFormat, outPath: join(dir, `${i}.mp4`) }));
      const controller = new AbortController();
      const cancelled = renderTimelineComposited({...options, workingFormat,
        signal: controller.signal, outPath: join(dir, "queued.mp4")});
      controller.abort();
      await expect(cancelled).rejects.toMatchObject({name: "AbortError"});
      const results = await Promise.all(jobs);
      expect(results.every(result => result.complete)).toBe(true);
      expect(observed.peak).toBe(cap);
      expect(observed.active).toBe(0);
      for (let i = 0; i < 3; i++) expect((await stat(join(dir, `${i}.mp4`))).size).toBeGreaterThan(0);
      await expect(stat(join(dir, "queued.mp4"))).rejects.toMatchObject({code: "ENOENT"});
      process.stdout.write(JSON.stringify({cap, workingFormat, adapter: results[0].adapter,
        elapsedMs: performance.now() - start, peakRssMiB: process.resourceUsage().maxRSS / 1024}) + "\n");
    } finally { await rm(dir, {recursive: true, force: true}); }
  }, 120000); // Three 1080p software renders plus cold driver startup on shared CI.
}
it("drains active native writes across 30 aborts and removes failed output", async () => {
  vi.stubEnv("NODETOOL_TIMELINE_RENDER_CONCURRENCY", "1");
  const dir = await mkdtemp(join(tmpdir(), "a42-abort-"));
  const rss: number[] = [];
  let nativeEncodes = 0;
  const encode = Encoder.prototype.encodeAll;
  const encodeSpy = vi.spyOn(Encoder.prototype, "encodeAll").mockImplementation(function (this: Encoder, ...args) {
    const pending = encode.apply(this, args);
    if (args[0]) {
      nativeEncodes++;
      observed.onWrite?.();
    }
    return pending;
  });
  const device = await getNodeGPUDevice();
  try {
    for (let i = 0; i < 30; i++) {
      const controller = new AbortController();
      const before = nativeEncodes;
      // Abort inside real encodeAll, after submission and before its promise settles.
      observed.onWrite = () => controller.abort();
      const outPath = join(dir, `${i}.mp4`);
      // Vitest async matchers retain assertion callbacks until this test ends.
      // Use node:assert here so the RSS probe does not retain aborted renders.
      await assert.rejects(renderTimelineComposited({...options, outPath, durationMs: 10000,
        workingFormat: i % 2 ? "rgba16float" : "rgba8unorm", signal: controller.signal
      }), {name: "AbortError"});
      expect(nativeEncodes).toBe(before + 1);
      expect(observed.active).toBe(0);
      await expect(stat(outPath)).rejects.toMatchObject({code: "ENOENT"});
      encodeSpy.mockClear();
      if (globalThis.gc) {
        await device.queue.onSubmittedWorkDone();
        globalThis.gc();
        await new Promise(resolve => setTimeout(resolve, 0));
        globalThis.gc();
      }
      rss.push(process.memoryUsage().rss / 1024 / 1024);
    }
    observed.onWrite = undefined;
    observed.failSecondWrite = true;
    const outPath = join(dir, "failure.mp4");
    await expect(renderTimelineComposited({...options, outPath})).rejects.toThrow("Expected a 1920x1080 RGBA frame");
    observed.failSecondWrite = false;
    await expect(stat(outPath)).rejects.toMatchObject({code: "ENOENT"});
    const completed = await renderTimelineComposited({...options, outPath: join(dir, "recovery.mp4")});
    expect(completed.complete).toBe(true);
    expect(await getNodeGPUDevice()).toBe(device);
    process.stdout.write(JSON.stringify({adapter: completed.adapter, abortRssMiB: rss,
      peakRssMiB: process.resourceUsage().maxRSS / 1024, cachedDeviceReused: true, forcedGc: Boolean(globalThis.gc)}) + "\n");
  } finally { encodeSpy.mockRestore(); await rm(dir, {recursive: true, force: true}); }
}, 180000); // Thirty 1080p native writes and GPU renders on software CI.
