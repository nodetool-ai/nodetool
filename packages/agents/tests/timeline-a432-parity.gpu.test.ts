import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { HeadlessFrameCompositor, type FrameLayer } from "@nodetool-ai/timeline/frame-compositor";
import { computeActiveLayers, resolveAnimatedLayerProps } from "@nodetool-ai/timeline/scene";
import { expect, it } from "vitest";
import { names, width, height, original, fixtureDocument } from "../../timeline/tests/a432Fixture.js";
import { renderTimelineFrames } from "../src/timeline-preview/frames.js";
import { createRenderChild, type RenderChildRequest } from "../src/timeline-preview/render-child-client.js";

function errorCodes(a: ArrayLike<number>, b: ArrayLike<number>) {
  expect(a.length).toBe(width * height * 4);
  expect(b.length).toBe(a.length);
  let max = 0, total = 0;
  for (let i = 0; i < a.length; i++) {
    const error = Math.abs(a[i] - b[i]);
    max = Math.max(max, error);
    total += error;
  }
  return { max, mean: total / a.length };
}

it("compares full-resolution migrated agent PNG and child delivery with undithered server RGBA8", async () => {
  const device = await getNodeGPUDevice();
  const assets = new Map<string, Uint8Array>();
  for (const id of ["original-a", "original-b"]) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(width, height);
    image.data.set(original(id === "original-b"));
    ctx.putImageData(image, 0, 0);
    assets.set(id, new Uint8Array(canvas.toBuffer("image/png")));
  }
  const results = [];
  let ramp: Uint8Array | undefined;
  const directory = await mkdtemp(join(tmpdir(), "a432-agent-"));
  const adapterPath = join(directory, "adapter.json");
  const previousAdapterPath = process.env.A432_CHILD_ADAPTER;
  process.env.A432_CHILD_ADAPTER = adapterPath;
  try {
    for (const name of names) {
      const sequence = fixtureDocument(name);
      const layers: FrameLayer[] = computeActiveLayers(sequence.tracks, sequence.clips, 500).map(layer => {
        const anim = resolveAnimatedLayerProps(layer, 500, sequence);
        return { id: layer.clip.id, source: { rgba: original(layer.clip.id === "original-b"), width, height },
          opacity: anim.opacity, zIndex: -layer.trackIndex, blendMode: layer.blendMode,
          effects: anim.effects ?? layer.effects, transform: anim.transform, transition: layer.transition };
      });
      const server = new HeadlessFrameCompositor(device, width, height, { workingFormat: "rgba8unorm" });
      const child = await createRenderChild(undefined, new URL("./fixtures/a432-render-child.ts", import.meta.url));
      let childPixels: Uint8Array | undefined;
      let childRequest: RenderChildRequest | undefined;
      try {
        // Observe the real IPC response without replacing any rendering. The
        // default production path still loads PNGs, resolves layers and encodes.
        const agent = await renderTimelineFrames({ sequence, width, timesMs: [500],
          loadAsset: async id => assets.get(id) ?? null,
          renderChild: { dispose: () => child.dispose(), render: async request => {
            childRequest = request;
            const result = await child.render(request);
            childPixels = result.pixels;
            return result;
          } } });
        const childAdapter: unknown = JSON.parse(await readFile(adapterPath, "utf8"));
        const serverAdapter = { vendor: device.adapterInfo.vendor, device: device.adapterInfo.device, description: device.adapterInfo.description };
        expect(childAdapter).toEqual(serverAdapter);
        expect(agent.complete, JSON.stringify({ ...agent, frames: agent.frames.map(frame => ({ ...frame, png: undefined })) })).toBe(true);
        expect(agent.effectsNotApplied).toEqual([]);
        expect(agent.frames).toHaveLength(1);
        expect(agent.frames[0].width).toBe(width);
        expect(agent.frames[0].height).toBe(height);
        expect(agent.frames[0].time_ms).toBe(500);
        expect(childRequest).toBeDefined();
        expect(childPixels).toBeDefined();
        if (!childRequest || !childPixels) throw new Error("Agent did not render through the child");
        expect(childRequest.layers).toHaveLength(layers.length);
        for (const layer of layers) {
          const actual = childRequest.layers.find(item => item.id === layer.id);
          expect(actual).toBeDefined();
          if (!actual) throw new Error("Missing original layer");
          expect([actual.source.width, actual.source.height]).toEqual([width, height]);
          expect(Buffer.from(actual.source.rgba).equals(Buffer.from(layer.source.rgba))).toBe(true);
          expect(actual.opacity).toBe(layer.opacity);
          expect(actual.effects).toEqual(layer.effects);
        }
        // Both hosts clear to opaque black. Alpha resolve is identity here and
        // RGBA8 delivery does not dither. No low-alpha straight-RGB amplification.
        const working = await server.renderWorkingFrame(layers, [], {});
        expect(working.representation).toBe("rgba8unorm");
        if (working.representation !== "rgba8unorm") throw new Error("FP16 must stay off");
        if (name === "ramp") ramp = working.data.slice();
        if (name === "blur" || name === "grain") {
          if (!ramp) throw new Error("Missing ramp control");
          expect(Buffer.from(working.data).equals(Buffer.from(ramp))).toBe(false);
        }
        expect(working.data.some((value, index) => index % 4 !== 3 && value > 0)).toBe(true);
        expect(working.data.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
        const delivery = await server.renderFrame(layers, [], {});
        const decoded = await loadImage(Buffer.from(agent.frames[0].png));
        expect([decoded.width, decoded.height]).toEqual([width, height]);
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(decoded, 0, 0);
        const png = ctx.getImageData(0, 0, width, height).data;
        const childError = errorCodes(working.data, childPixels);
        const pngError = errorCodes(working.data, png);
        const deliveryError = errorCodes(delivery, png);
        const pngRoundTrip = errorCodes(childPixels, png);
        const serverResolve = errorCodes(working.data, delivery);
        // One code allows adjacent UNORM rounding, as in browser/server A43.2.
        // PNG is lossless and these frames are opaque, so its budget is zero.
        const tolerance = 1;
        results.push({ name, renderer: "Node/Dawn server vs agent Node/Dawn child + Skia PNG",
          workingFormat: "rgba8unorm", childAdapter, childError, pngError, deliveryError, pngRoundTrip, serverResolve, tolerance });
        expect(childError.max).toBeLessThanOrEqual(tolerance);
        expect(pngError.max).toBeLessThanOrEqual(tolerance);
        expect(deliveryError.max).toBeLessThanOrEqual(tolerance);
        expect(pngRoundTrip.max).toBe(0);
        expect(serverResolve.max).toBe(0);
      } finally {
        await child.dispose();
        server.dispose();
      }
    }
    // The child probe records the cached device used by the real renderer.
    const report = { adapter: { vendor: device.adapterInfo.vendor, device: device.adapterInfo.device,
      description: device.adapterInfo.description }, vulkanICD: process.env.VK_DRIVER_FILES, results };
    process.stdout.write(JSON.stringify(report) + "\n");
    if (process.env.A432_REPORT) await writeFile(process.env.A432_REPORT, JSON.stringify(report, null, 2));
  } finally {
    if (previousAdapterPath === undefined) delete process.env.A432_CHILD_ADAPTER;
    else process.env.A432_CHILD_ADAPTER = previousAdapterPath;
    await rm(directory, { recursive: true, force: true });
  }
  // Six cold children can each use the production 30 s deadline, plus parent
  // composition, PNG I/O and teardown. This is a correctness timeout, not SLA.
}, 240_000);
