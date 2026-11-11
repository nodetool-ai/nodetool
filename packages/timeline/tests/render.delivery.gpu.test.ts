import { expect, it, vi } from "vitest";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { FULLSCREEN_QUAD_VERTEX, UNPREMULTIPLY_FRAGMENT } from "@nodetool-ai/gpu/webgpu";
import { HeadlessFrameCompositor, type FrameLayer } from "../src/render/frameCompositor.js";
import { workingValues } from "./workingCapture.js";

it("quantizes resolved RGB with a stable unbiased delivery tile and undithered alpha", async () => {
  const device = await getNodeGPUDevice();
  process.stderr.write(`delivery adapter: ${JSON.stringify({ vendor: device.adapterInfo.vendor, architecture: device.adapterInfo.architecture, device: device.adapterInfo.device, description: device.adapterInfo.description })}\n`);
  const renderer = new HeadlessFrameCompositor(device, 8, 8, { workingFormat: "rgba16float" });
  let maximum = 0, bias = 0;
  // Native DeliveryFrame's row-major Bayer matrix, independent of WGSL bit arithmetic.
  const ranks = [
    0,32,8,40,2,34,10,42, 48,16,56,24,50,18,58,26,
    12,44,4,36,14,46,6,38, 60,28,52,20,62,30,54,22,
    3,35,11,43,1,33,9,41, 51,19,59,27,49,17,57,25,
    15,47,7,39,13,45,5,37, 63,31,55,23,61,29,53,21
  ];
  expect(new Set(ranks).size).toBe(64);
  expect(ranks.reduce((sum, rank) => sum + (rank + 0.5) / 64 - 0.5, 0)).toBe(0);
  try {
    for (const code of [0, 0.25, 1.5, 12.3, 63.7, 127.25, 200.6, 254.75, 255]) {
      const layer: FrameLayer = {
        id: "patch", source: { rgba: new Uint8Array([255, 255, 255, 255]), width: 1, height: 1 },
        opacity: code / 255, blendMode: "normal", zIndex: 0
      };
      const raw = workingValues(await renderer.renderWorkingFrame([layer]));
      const reference = raw[0] * 255;
      expect(new Set(raw.filter((_, i) => i % 4 === 0)).size).toBe(1);
      const result = await renderer.renderFrame([layer]);
      process.stderr.write(`patch intended=${code} working=${reference} delivered=${result.filter((_, i) => i % 4 === 0).reduce((a, b) => a + b, 0) / 64}\n`);
      expect(await renderer.renderFrame([layer])).toEqual(result);
      let sum = 0;
      for (let i = 0; i < result.length; i += 4) {
        maximum = Math.max(maximum, Math.abs(result[i] - reference));
        sum += result[i] - reference;
        const expected = Math.max(0, Math.min(255, Math.floor(reference + (ranks[i / 4] + 0.5) / 64)));
        expect(Array.from(result.slice(i, i + 3))).toEqual([expected, expected, expected]);
        expect(result[i + 3]).toBe(255);
      }
      bias = Math.max(bias, Math.abs(sum / 64));
      expect(workingValues(await renderer.renderWorkingFrame([layer]))).toEqual(raw);
      expect(await renderer.renderFrameSamples([{ layers: [layer] }, { layers: [layer] }])).toEqual(result);
    }
    process.stderr.write(`delivery max=${maximum} codes, maximum tile bias=${bias} codes\n`);
    expect(maximum).toBeLessThanOrEqual(1);
    expect(bias).toBeLessThan(0.1);
    for (const alpha of [0, 1, 3, 128, 255]) {
      const translucent: FrameLayer = {
        id: "patch", source: { rgba: new Uint8Array([128, 64, 32, alpha]), width: 1, height: 1 },
        opacity: 1, blendMode: "normal", zIndex: 0
      };
      const raw = workingValues(await renderer.renderWorkingFrame([translucent], [], { alpha: true }));
      const result = await renderer.renderFrame([translucent], [], { alpha: true });
      for (let i = 0; i < result.length; i++) {
        const a = raw[i - i % 4 + 3];
        const code = a > 0 ? raw[i] / a * 255 : 0;
        const expected = i % 4 === 3 ? Math.round(a * 255)
          : Math.max(0, Math.min(255, Math.floor(code + (ranks[Math.floor(i / 4)] + 0.5) / 64)));
        expect(result[i]).toBe(expected);
      }
    }
  } finally { renderer.dispose(); }
});


it("keeps the resolved byte shader and delivery unchanged when FP16 is off", async () => {
  const device = await getNodeGPUDevice();
  const shaders = vi.spyOn(device, "createShaderModule");
  const renderer = new HeadlessFrameCompositor(device, 8, 8);
  try {
    const result = await renderer.renderFrame([{
      id: "source", source: { rgba: new Uint8Array([160, 80, 40, 128]), width: 1, height: 1 },
      opacity: 1, blendMode: "normal", zIndex: 0
    }]);
    for (let i = 0; i < result.length; i += 4) {
      expect(Array.from(result.slice(i, i + 4))).toEqual([80, 40, 20, 255]);
    }
    expect(shaders.mock.calls.find(([d]) => d.label === "timeline-headless-resolve")?.[0].code)
      .toBe(`${FULLSCREEN_QUAD_VERTEX}\n${UNPREMULTIPLY_FRAGMENT}`);
  } finally {
    renderer.dispose(); shaders.mockRestore();
  }
});
