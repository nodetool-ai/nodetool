// Run in a fresh Node process with --import tsx. The supervising test owns
// the deadline and records natural exit separately from receiving results.
import { renderTimelineComposited } from "../../src/nodes/timeline/compositeRender.ts";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { mkdtemp, rm, stat, readdir, readlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mode = process.argv[2];
const workingFormat = process.argv[3] ?? "rgba8unorm";
const dir = await mkdtemp(join(tmpdir(), "a42-"));
const sequence = {
  id: "qualification", name: "Qualification", width: 1920, height: 1080,
  fps: 10, durationMs: 200, tracks: [{id: "v", type: "video", index: 0, visible: true}],
  clips: [{id: "shape", trackId: "v", mediaType: "shape", startMs: 0,
    durationMs: 10000, shapeStyle: {kind: "rect", fill: "#5984ad"}}]
};
const options = { sequence, width: 1920, height: 1080, fps: 10,
  durationMs: 200, resolveAssetPath: async () => null, workingFormat,
  outPath: join(dir, "output.mp4") };
try {
  const start = performance.now();
  if (mode === "missing") {
    try {
      await renderTimelineComposited(options);
      throw new Error("Missing-driver render unexpectedly succeeded");
    } catch (error) {
      if (error.name !== "CompositorUnavailableError") throw error;
      console.log(JSON.stringify({mode, adapter: null, rejectionMs: performance.now() - start,
        name: error.name, message: error.message}));
      // Deliberately no process.exit: this case must drain the event loop.
      process.exitCode = 0;
    }
  } else {
    const cold = await renderTimelineComposited(options);
    const coldMs = performance.now() - start;
    const device = await getNodeGPUDevice();
    const warmStart = performance.now();
    await renderTimelineComposited({...options, outPath: join(dir, "warm.mp4")});
    const warmMs = performance.now() - warmStart;
    const controller = new AbortController();
    let abortedAt;
    let abortMs;
    const cancelledPath = join(dir, "cancel.mp4");
    try {
      await renderTimelineComposited({...options, outPath: cancelledPath, durationMs: 10000,
        signal: controller.signal, onProgress: () => {
          if (!controller.signal.aborted) { abortedAt = performance.now(); controller.abort(); }
        }});
      throw new Error("Cancelled render unexpectedly succeeded");
    } catch (error) {
      if (error.name !== "AbortError") throw error;
      abortMs = performance.now() - abortedAt;
    }
    const partialBytes = await stat(cancelledPath).then(s => s.size, () => null);
    // Observe delayed cleanup too, without mistaking it for prompt cleanup.
    await new Promise(resolve => setTimeout(resolve, 1000));
    const openOutputFds = [];
    for (const fd of await readdir("/proc/self/fd")) {
      const target = await readlink(`/proc/self/fd/${fd}`).catch(() => "");
      if (target.startsWith(dir)) openOutputFds.push(target);
    }
    console.log(JSON.stringify({mode, workingFormat, adapter: cold.adapter,
      coldMs, warmMs, abortMs, partialBytes,
      partialBytesAfterOneSecond: await stat(cancelledPath).then(s => s.size, () => null),
      openOutputFds, cachedDeviceReused: device === await getNodeGPUDevice(),
      peakRssMiB: process.resourceUsage().maxRSS / 1024}));
  }
} finally {
  await rm(dir, {recursive: true, force: true});
}
