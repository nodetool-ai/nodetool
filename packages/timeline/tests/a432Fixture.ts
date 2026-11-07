import { makeClip, makeClipVersion, makeSequence, makeTrack } from "../src/defaults.js";
import { computeActiveLayers, resolveAnimatedLayerProps } from "../src/render/sceneModel.js";
import { HeadlessFrameCompositor, GpuFrameCompositor, type FrameLayer } from "../src/render/frameCompositor.js";
import { copyWorkingRows, frameReadbackLayout, type WorkingFormat } from "@nodetool-ai/gpu/webgpu";
import { workingValues } from "./workingCapture.js";

export const names = ["ramp", "low-alpha", "fade", "crossfade", "blur", "grain"] as const;
export const width = 768, height = 432;
// These are the original full-resolution asset bytes. Neither host decodes a
// proxy or rasterizes a replacement. Two assets differ in channel order.
export function original(second: boolean): Uint8Array {
  const bytes = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const ramp = y >= height / 2 && x >= width / 3 && x < width * 2 / 3
      ? 255 : Math.round(x * 255 / (width - 1));
    bytes.set(second ? [255 - ramp, ramp, 96, 255] : [ramp, ramp, ramp, 255], i);
  }
  return bytes;
}
export function fixtureDocument(name: typeof names[number]) {
  const track = makeTrack({ id: "v", type: "video", index: 0 });
  const first = makeClip({ id: "original-a", currentAssetId: "original-a", status: "generated", versions: [makeClipVersion({ id: "a", assetId: "original-a" })], trackId: "v", name, startMs: 0,
    durationMs: 1000, mediaType: "image", opacity: name === "low-alpha" ? 1 / 16 : 1,
    fadeInMs: name === "fade" ? 1000 : 0,
    fadeOutMs: name === "crossfade" ? 1000 : 0,
    effects: name === "blur" ? [{ id: "blur", type: "blur", enabled: true, radius: 6 }]
      : name === "grain" ? [{ id: "grain", type: "grain", enabled: true, seed: 7, amount: 0.3, size: 1 }] : [] });
  const second = makeClip({ ...first, id: "original-b", currentAssetId: "original-b", versions: [makeClipVersion({ id: "b", assetId: "original-b" })], fadeInMs: 1000, fadeOutMs: 0 });
  return makeSequence({ width, height, fps: 30, durationMs: 1000, tracks: [track],
    clips: name === "crossfade" ? [first, second] : [first] });
}
export async function renderFixture(device: GPUDevice, name: typeof names[number], workingFormat: WorkingFormat, browserUpload = false, document = fixtureDocument(name)): Promise<number[]> {
  const layers: FrameLayer[] = computeActiveLayers(document.tracks, document.clips, 500).map(layer => {
    const anim = resolveAnimatedLayerProps(layer, 500, document);
    return { id: layer.clip.id, source: { rgba: original(layer.clip.id === "original-b"), width, height },
      opacity: anim.opacity, zIndex: -layer.trackIndex, blendMode: layer.blendMode,
      effects: anim.effects ?? layer.effects, transform: anim.transform, transition: layer.transition };
  });
  device.pushErrorScope("validation");
  if (layers.length !== (name === "crossfade" ? 2 : 1)) throw new Error("Missing fixture layers");
  if (browserUpload) {
    const bitmaps = await Promise.all(layers.map(layer =>
      createImageBitmap(new ImageData(Uint8ClampedArray.from(layer.source.rgba), width, height))));
    const textures: GPUTexture[] = [];
    const compositor = new GpuFrameCompositor<ImageBitmap>(device, width, height, {
      workingFormat,
      upload: (_id, source) => {
        const texture = device.createTexture({ size: [width, height], format: "rgba8unorm",
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST |
            GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT });
        textures.push(texture);
        // Matches the browser preview's still-image upload contract.
        device.queue.copyExternalImageToTexture({ source, flipY: false },
          { texture, premultipliedAlpha: false }, { width, height });
        return { texture, width, height };
      }
    });
    const layout = frameReadbackLayout(width, height, workingFormat);
    const buffer = device.createBuffer({ size: layout.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    try {
      const { texture } = compositor.composite(layers.map((layer, i) => ({
        id: layer.id, source: bitmaps[i], opacity: layer.opacity, zIndex: layer.zIndex,
        blendMode: layer.blendMode, effects: layer.effects, transform: layer.transform,
        transition: layer.transition
      })),
        [], { r: 0, g: 0, b: 0, a: 0 });
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: layout.bytesPerRow }, { width, height });
      device.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      const metadata = { width, height, alpha: "premultiplied" as const,
        interpretation: "unknown" as const, bytesPerRow: layout.rowBytes };
      const frame = workingFormat === "rgba16float"
        ? { ...metadata, representation: workingFormat, data: copyWorkingRows(buffer.getMappedRange(), width, height, workingFormat) }
        : { ...metadata, representation: workingFormat, data: copyWorkingRows(buffer.getMappedRange(), width, height, workingFormat) };
      const error = await device.popErrorScope();
      if (error) throw new Error(error.message);
      const values = workingValues(frame);
      if (!values.every(Number.isFinite) || !values.some((v, i) => i % 4 !== 3 && v > 0)) throw new Error("Invalid or blank browser GPU frame");
      return values;
    } finally {
      buffer.destroy();
      compositor.dispose();
      textures.forEach(texture => texture.destroy());
      bitmaps.forEach(bitmap => bitmap.close());
    }
  }
  const compositor = new HeadlessFrameCompositor(device, width, height, { workingFormat });
  try {
    const frame = await compositor.renderWorkingFrame(layers, [], { alpha: true });
    if (frame.representation !== workingFormat) throw new Error("Wrong working format");
    const values = workingValues(frame);
    const error = await device.popErrorScope();
    if (error) throw new Error(error.message);
    if (!values.every(Number.isFinite) || !values.some(v => v > 0)) throw new Error("Invalid or blank GPU readback");
    return values;
  } finally { compositor.dispose(); }
}
