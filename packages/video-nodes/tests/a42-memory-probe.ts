/** Manual A42 diagnostic: node --expose-gc --import tsx tests/a42-memory-probe.ts <mode> <count>. */
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Encoder } from "node-av";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { HeadlessFrameCompositor } from "@nodetool-ai/timeline/render";
import { ensureGoogleFonts } from "@nodetool-ai/timeline/fonts/google-node";
import type { TimelineSequence } from "@nodetool-ai/timeline";
import { NodeRasterizer } from "../src/nodes/timeline/rasterizers.js";
import { renderTimelineComposited } from "../src/nodes/timeline/compositeRender.js";
const mode = process.argv[2] ?? "abort";
const count = Number(process.argv[3] ?? 200);
const sequence = {
  id: "probe",
  name: "Probe",
  width: 1920,
  height: 1080,
  fps: 10,
  durationMs: 200,
  tracks: [{ id: "v", type: "video", index: 0, visible: true }],
  clips: [
    {
      id: "s",
      trackId: "v",
      mediaType: "shape",
      startMs: 0,
      durationMs: 10000,
      shapeStyle: { kind: "rect", fill: "#5984ad" }
    }
  ]
} as TimelineSequence;
const dir = await mkdtemp(join(tmpdir(), "a42-gap-probe-"));
const device = ["abort", "success", "compositor", "frames"].includes(mode)
  ? await getNodeGPUDevice()
  : null;
let controller: AbortController | undefined;
const encode = Encoder.prototype.encodeAll;
if (mode === "abort")
  Encoder.prototype.encodeAll = function (...args) {
    const pending = encode.apply(this, args);
    if (args[0]) controller?.abort();
    return pending;
  };
async function iteration(i: number): Promise<void> {
  if (mode === "rasterizer") {
    new NodeRasterizer(1920, 1080).shape({ kind: "rect", fill: "#5984ad" });
    return;
  }
  if (mode === "fonts") {
    await ensureGoogleFonts(sequence);
    return;
  }
  if (mode === "compositor") {
    const c = new HeadlessFrameCompositor(device!, 1920, 1080, {
      workingFormat: i % 2 ? "rgba16float" : "rgba8unorm"
    });
    try {
      await c.renderFrame([]);
    } finally {
      c.dispose();
    }
    return;
  }
  controller = new AbortController();
  try {
    await renderTimelineComposited({
      sequence,
      width: 1920,
      height: 1080,
      fps: 10,
      durationMs: 200,
      workingFormat: i % 2 ? "rgba16float" : "rgba8unorm",
      resolveAssetPath: async () => null,
      outPath: join(dir, "out.mp4"),
      signal: controller.signal,
      ...(mode === "frames" ? { writeFrame: async () => {} } : {})
    });
    if (mode === "abort") throw new Error("Expected abort");
  } catch (e) {
    if (!(mode === "abort" && e instanceof Error && e.name === "AbortError"))
      throw e;
  }
  await rm(join(dir, "out.mp4"), { force: true });
}
try {
  console.log(
    JSON.stringify({
      mode,
      adapter: device
        ? [
            device.adapterInfo?.vendor,
            device.adapterInfo?.device,
            device.adapterInfo?.description
          ].join(" / ")
        : null
    })
  );
  for (let i = 1; i <= count; i++) {
    while (
      Number(
        (await readFile("/proc/meminfo", "utf8")).match(
          /MemAvailable:\s+(\d+)/
        )?.[1]
      ) <
      5 * 1024 * 1024
    ) {
      console.log("Waiting for 5 GiB available");
      await new Promise((r) => setTimeout(r, 10000));
    }
    await iteration(i);
    await device?.queue.onSubmittedWorkDone();
    globalThis.gc?.();
    await new Promise((r) => setTimeout(r, 0));
    globalThis.gc?.();
    if (i === 1 || i % 10 === 0)
      console.log(
        JSON.stringify({
          mode,
          i,
          ...Object.fromEntries(
            Object.entries(process.memoryUsage()).map(([k, v]) => [
              k,
              Math.round((v / 1048576) * 100) / 100
            ])
          )
        })
      );
  }
} finally {
  Encoder.prototype.encodeAll = encode;
  await rm(dir, { recursive: true, force: true });
}
process.exit(0);
