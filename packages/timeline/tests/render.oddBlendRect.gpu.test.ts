import { expect, it } from "vitest";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { WebGPULayerCompositor } from "@nodetool-ai/gpu/webgpu";

it.each([
  { x: 11, y: 9, width: 20, height: 18 },
  { x: 11, y: 10, width: 20, height: 18 },
  { x: 10, y: 9, width: 20, height: 18 },
  { x: 11, y: 9, width: 54, height: 40 }
])("preserves the destination around an odd blend rectangle %j", async (rect) => {
  const device = await getNodeGPUDevice();
  const width = 65;
  const height = 49;
  const compositor = new WebGPULayerCompositor(device, "rgba8unorm", "linear");
  compositor.ensureSize(width, height);
  const accum = compositor.textureA!;
  const scratch = compositor.textureB!;
  const source = device.createTexture({
    size: [1, 1], format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
  });
  const bytesPerRow = 512;
  const readback = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });
  try {
    // A spatially varying destination detects neighbouring-texel reads as well
    // as the transparent top/left edges observed on D3D12/WARP.
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        pixels.set([x * 3, y * 5, (x + y) * 2, 255], (y * width + x) * 4);
      }
    }
    device.queue.writeTexture({ texture: accum }, pixels, { bytesPerRow: width * 4 }, [width, height]);
    compositor.beginFrame();
    const encoder = device.createCommandEncoder();
    compositor.renderBlendPassInRect(encoder, accum, scratch, {
      source, opacity: 0.7, blendModeId: 0, canvasW: width, canvasH: height,
      // The entire source is outside the frame, so blending must be identity.
      invAffine: { a: 1, b: 0, c: 0, d: 1, tx: -3000, ty: -3000 }
    }, rect);
    encoder.copyTextureToBuffer({ texture: accum }, { buffer: readback, bytesPerRow }, [width, height]);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const result = new Uint8Array(readback.getMappedRange());
    for (let y = 0; y < height; y++) {
      expect(result.slice(y * bytesPerRow, y * bytesPerRow + width * 4))
        .toEqual(pixels.slice(y * width * 4, (y + 1) * width * 4));
    }
    readback.unmap();
  } finally {
    readback.destroy();
    source.destroy();
    compositor.dispose();
  }
});
