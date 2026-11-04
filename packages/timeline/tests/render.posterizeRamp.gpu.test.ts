import { expect, it } from "vitest";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { HeadlessFrameCompositor } from "../src/render/frameCompositor.js";

it("preserves byte-origin Posterize bands over a full ramp", async () => {
  const device = await getNodeGPUDevice();
  console.log("Posterize adapter", device.adapterInfo);
  const rgba = Uint8Array.from({ length: 256 * 4 }, (_, i) => i % 4 === 3 ? 255 : Math.floor(i / 4));
  const renderers = (["rgba8unorm", "rgba16float"] as const).map(workingFormat =>
    new HeadlessFrameCompositor(device, 256, 1, { workingFormat }));
  try {
    for (const levels of [2, 3, 4, 5, 7, 16, 64, 128, 255, 256]) {
      const layers = [{ id: "ramp", source: { rgba, width: 256, height: 1 }, opacity: 1, zIndex: 0, blendMode: "normal" as const,
        effects: [{ id: "posterize", type: "posterize" as const, enabled: true, levels }] }];
      const byte = await renderers[0].renderFrame(layers);
      const float = await renderers[1].renderFrame(layers);
      for (let x = 0; x < 256; x++) {
        const expected = Math.round(Math.min(1, Math.floor(x * levels / 255) / (levels - 1)) * 255);
        expect.soft(Math.abs(float[x * 4] - byte[x * 4]), `levels=${levels} code=${x}`).toBeLessThanOrEqual(1);
        expect.soft(Math.abs(float[x * 4] - expected), `oracle levels=${levels} code=${x}`).toBeLessThanOrEqual(1);
      }
    }
  } finally { renderers.forEach(r => r.dispose()); }
}, 60000);
