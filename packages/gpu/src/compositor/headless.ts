/**
 * Headless layer compositing — the host-agnostic "composite N layers, read
 * back pixels" path used by server-side / Node.js callers.
 *
 * It drives the same {@link WebGPULayerCompositor} the sketch editor and the
 * timeline preview use, so the blend math is identical across browser and
 * Node. The only thing that differs is the boundary: instead of presenting to
 * a canvas, this acquires the final accumulation texture and copies it back to
 * a CPU buffer. Decode (bytes → RGBA) and encode (RGBA → PNG/JPEG) are the
 * caller's job — they stay in the codec layer, not here.
 *
 * Layers are stacked at (0, 0) at their native size against a canvas of the
 * given dimensions (identity screen→texel map). The shader bounds-checks each
 * layer, so layers smaller than the canvas leave the surrounding pixels
 * untouched, and layers larger than the canvas are cropped to the top-left —
 * matching a `top: 0, left: 0` paste.
 */

import { WebGPULayerCompositor } from "./compositor.js";
import { FULLSCREEN_QUAD_VERTEX, UNPREMULTIPLY_FRAGMENT } from "./shaders.js";
import {
  layerTransformToInverseAffine,
  type LayerTransform2D
} from "./transform.js";

/** One input layer: straight-alpha RGBA8 pixels plus per-layer state. */
export interface HeadlessLayer {
  /** Straight (non-premultiplied) RGBA8, row-major, length = width*height*4. */
  rgba: Uint8Array;
  width: number;
  height: number;
  /** Layer opacity in [0, 1]. */
  opacity: number;
  /** Canonical blend-mode gpuId (see blendModes.ts). */
  blendModeId: number;
  /**
   * Placement on the canvas. Omitted → the layer's top-left sits at the canvas
   * origin at native size (an untransformed top-left paste).
   */
  transform?: LayerTransform2D;
}

/** Composited output: straight-alpha RGBA8 at the requested canvas size. */
export interface HeadlessCompositeResult {
  rgba: Uint8Array;
  width: number;
  height: number;
}

/** `copyTextureToBuffer` requires a 256-byte-aligned `bytesPerRow`. */
const ROW_ALIGNMENT = 256;

/**
 * Composite `layers` (bottom-first) onto a transparent canvas and read the
 * result back to a CPU buffer. Pure WebGPU given a `device`; works against a
 * browser, Electron, or Node.js Dawn device alike.
 */
export async function compositeLayersHeadless(
  device: GPUDevice,
  layers: HeadlessLayer[],
  canvasWidth: number,
  canvasHeight: number
): Promise<HeadlessCompositeResult> {
  const width = Math.max(1, Math.floor(canvasWidth));
  const height = Math.max(1, Math.floor(canvasHeight));
  const format: GPUTextureFormat = "rgba8unorm";

  const compositor = new WebGPULayerCompositor(device, format, "nearest");
  compositor.ensureSize(width, height);
  const texA = compositor.textureA;
  const texB = compositor.textureB;
  if (!texA || !texB) {
    compositor.dispose();
    throw new Error("Compositor failed to allocate accumulation textures");
  }

  const sources: GPUTexture[] = [];
  const encoder = device.createCommandEncoder({ label: "headless-composite" });

  // Seed the read texture transparent so the first blend pass composites
  // layer 0 over nothing.
  const clear = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: texA.createView(),
        loadOp: "clear",
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        storeOp: "store"
      }
    ]
  });
  clear.end();

  compositor.beginFrame();
  let read = texA;
  let write = texB;
  for (const layer of layers) {
    const lw = Math.max(1, Math.floor(layer.width));
    const lh = Math.max(1, Math.floor(layer.height));
    const source = device.createTexture({
      label: "headless-composite-layer",
      size: { width: lw, height: lh },
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    // Re-wrap as an ArrayBuffer-backed view: `writeTexture` rejects
    // SharedArrayBuffer-backed sources under the DOM WebGPU typings.
    const data = new Uint8Array(
      layer.rgba.buffer as ArrayBuffer,
      layer.rgba.byteOffset,
      layer.rgba.byteLength
    );
    device.queue.writeTexture(
      { texture: source },
      data,
      { bytesPerRow: lw * 4, rowsPerImage: lh },
      { width: lw, height: lh }
    );
    sources.push(source);

    const transform =
      layer.transform ?? {
        x: lw / 2,
        y: lh / 2,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      };
    compositor.renderBlendPass(encoder, read, write, {
      source,
      opacity: layer.opacity,
      blendModeId: layer.blendModeId,
      canvasW: width,
      canvasH: height,
      invAffine: layerTransformToInverseAffine(transform, lw, lh)
    });
    // Swap: the texture we just wrote becomes the next pass's read.
    const next = read;
    read = write;
    write = next;
  }

  // `read` now holds the final composite (premultiplied). Resolve it to
  // straight alpha on the GPU instead of un-premultiplying per pixel on the
  // CPU: a full-screen pass that divides RGB by alpha, into its own texture.
  const final = read;
  const resolved = device.createTexture({
    label: "headless-composite-resolved",
    size: { width, height },
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
  });
  const resolveModule = device.createShaderModule({
    label: "headless-composite-unpremultiply",
    code: `${FULLSCREEN_QUAD_VERTEX}\n${UNPREMULTIPLY_FRAGMENT}`
  });
  const resolvePipeline = device.createRenderPipeline({
    label: "headless-composite-unpremultiply",
    layout: "auto",
    vertex: { module: resolveModule, entryPoint: "vs_main" },
    fragment: {
      module: resolveModule,
      entryPoint: "fs_unpremultiply",
      targets: [{ format }]
    },
    primitive: { topology: "triangle-strip" }
  });
  const resolvePass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: resolved.createView(),
        loadOp: "clear",
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        storeOp: "store"
      }
    ]
  });
  resolvePass.setPipeline(resolvePipeline);
  resolvePass.setBindGroup(
    0,
    device.createBindGroup({
      layout: resolvePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: final.createView() }]
    })
  );
  resolvePass.draw(4);
  resolvePass.end();

  const bytesPerRow = Math.ceil((width * 4) / ROW_ALIGNMENT) * ROW_ALIGNMENT;
  const readback = device.createBuffer({
    label: "headless-composite-readback",
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });
  encoder.copyTextureToBuffer(
    { texture: resolved },
    { buffer: readback, bytesPerRow, rowsPerImage: height },
    { width, height }
  );
  device.queue.submit([encoder.finish()]);
  await readback.mapAsync(GPUMapMode.READ);
  const mapped = new Uint8Array(readback.getMappedRange());
  // Pixels are already straight-alpha; just drop the 256-byte row padding
  // `copyTextureToBuffer` requires (a per-row memcpy, no per-pixel math).
  const rgba = new Uint8Array(width * height * 4);
  const rowBytes = width * 4;
  for (let row = 0; row < height; row++) {
    rgba.set(
      mapped.subarray(row * bytesPerRow, row * bytesPerRow + rowBytes),
      row * rowBytes
    );
  }
  readback.unmap();
  readback.destroy();
  resolved.destroy();

  for (const source of sources) {
    source.destroy();
  }
  compositor.dispose();

  return { rgba, width, height };
}
