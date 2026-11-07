import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { expect, it } from "vitest";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { sourcePixels } from "../../gpu/tests/fixtures/precisionScenes.js";
import { HeadlessFrameCompositor } from "../src/render/frameCompositor.js";
import type { KnownClipEffect } from "../src/types.js";

it("delivers A81 scenes through the production headless output", async () => {
  const device = await getNodeGPUDevice();
  const width = 768, height = 432;
  const directory = process.env.A81_DELIVERY_OUTPUT;
  const results = [];
  for (const scene of ["dark-fade", "sky", "grade-glow"] as const) {
    const rgba = sourcePixels(scene, width, height);
    const effects: KnownClipEffect[] = scene === "dark-fade" ? [
      { id: "fade", type: "exposure", enabled: true, exposure: -5 },
      { id: "lift", type: "exposure", enabled: true, exposure: 5 }
    ] : scene === "sky" ? [
      { id: "vignette", type: "vignette", enabled: true, amount: 0.65 },
      { id: "blur", type: "blur", enabled: true, radius: 6 }
    ] : [
      ...[-0.025, 0.035, -0.015, 0.02].map((brightness, i): KnownClipEffect => ({
        id: `grade-${i}`, type: "color", enabled: true, brightness, contrast: 1.03, saturation: 1.04, temperature: 0.03
      })),
      { id: "glow", type: "glow", enabled: true, radius: 12, intensity: 0.65 }
    ];
    const outputs = [];
    for (const workingFormat of ["rgba8unorm", "rgba16float"] as const) {
      const compositor = new HeadlessFrameCompositor(device, width, height, { workingFormat });
      try {
        const output = await compositor.renderFrame([{ id: scene, source: { rgba, width, height },
          opacity: 1, zIndex: 0, blendMode: "normal", effects }]);
        outputs.push(output);
        if (directory) {
          await mkdir(directory, { recursive: true });
          await sharp(output, { raw: { width, height, channels: 4 } }).png().toFile(join(directory, `${scene}-${workingFormat}.png`));
        }
      } finally { compositor.dispose(); }
    }
    let maximum = 0, total = 0, identityMaximum = 0, identityTotal = 0;
    for (let i = 0; i < rgba.length; i++) if (i % 4 !== 3) {
      const error = Math.abs(outputs[0][i] - outputs[1][i]);
      maximum = Math.max(maximum, error); total += error;
      const identity = Math.abs(outputs[1][i] - rgba[i]);
      identityMaximum = Math.max(identityMaximum, identity); identityTotal += identity;
    }
    const result = { scene, maximum, mean: total / (width * height * 3),
      identityMaximum, identityMean: identityTotal / (width * height * 3) };
    results.push(result);
    if (scene === "dark-fade") expect(identityMaximum).toBeLessThanOrEqual(1);
    else {
      expect(maximum, JSON.stringify(result)).toBeLessThanOrEqual(4);
      expect(result.mean, JSON.stringify(result)).toBeLessThanOrEqual(3);
    }
  }
  const report = { adapter: { vendor: device.adapterInfo.vendor, device: device.adapterInfo.device, description: device.adapterInfo.description }, results };
  if (directory) await writeFile(join(directory, "delivery.json"), JSON.stringify(report, null, 2));
}, 60000);
