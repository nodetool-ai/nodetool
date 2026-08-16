/**
 * HeadlessFrameCompositor — composite one timeline frame without a canvas.
 *
 * Drives the same {@link WebGPULayerCompositor} and the same effects pre-pass
 * the editor's preview uses, with the same placement math
 * ({@link buildTransformMatrix} → inverse affine), so a frame rendered on a
 * server is the frame the user previewed. The only difference from the browser
 * compositor is the boundary: sources arrive as CPU RGBA buffers instead of
 * `<video>`/`<img>` elements, and the result is read back to a CPU buffer
 * instead of presented to a swap chain.
 *
 * The instance is reused across every frame of a render: source textures are
 * kept per layer id (re-uploaded only when their pixels change), and the
 * readback buffer is allocated once.
 */

import { blendModeGpuId } from "@nodetool-ai/gpu";
import {
  WebGPULayerCompositor,
  forwardClipMatrixToInverseAffine
} from "@nodetool-ai/gpu/webgpu";

import type { AnimationSampleMask, WipeDirection } from "../animation/index.js";
import type { ClipEffect, ClipTransform, TrackEffect } from "../types.js";
import { WebGPUEffectsProcessor } from "./effects.js";
import type { CompositorBlendMode } from "./sceneModel.js";
import {
  IDENTITY_TRANSFORM,
  buildTransformMatrix,
  containBaseScale
} from "./transform.js";

/** Shader edge codes (see `BLEND_COMPOSITE_FRAGMENT` params2). */
const WIPE_EDGE = {
  left: 1,
  right: 2,
  up: 3, // reveal from the layer's top edge
  down: 4 // reveal from the layer's bottom edge
} satisfies Record<WipeDirection, 1 | 2 | 3 | 4>;

function wipeParams(
  mask: AnimationSampleMask | undefined
): { edge: 1 | 2 | 3 | 4; progress: number; softness: number } | undefined {
  if (!mask) return undefined;
  return {
    edge: WIPE_EDGE[mask.direction],
    progress: mask.progress,
    softness: mask.softness
  };
}

/** Decoded straight-alpha RGBA8 pixels for one layer. */
export interface FrameLayerPixels {
  /** Row-major RGBA8, length = width * height * 4. */
  rgba: Uint8Array;
  width: number;
  height: number;
  /**
   * Changes whenever `rgba` holds different pixels. The compositor re-uploads
   * only when it changes, so a still image or a held caption costs one upload
   * for the whole render. Omit to upload every frame.
   */
  version?: string;
}

/** One layer of a frame, in the same shape the browser compositor consumes. */
export interface FrameLayer {
  /** Stable across frames for the same clip — keys the source texture. */
  id: string;
  source: FrameLayerPixels;
  opacity: number;
  blendMode: CompositorBlendMode;
  zIndex: number;
  transform?: ClipTransform;
  /** Rounded-corner radius in source pixels. */
  borderRadius?: number;
  mask?: AnimationSampleMask;
  effects?: ClipEffect[];
  trackEffects?: TrackEffect[];
}

/** `copyTextureToBuffer` requires a 256-byte-aligned `bytesPerRow`. */
const ROW_ALIGNMENT = 256;

const TEXTURE_FORMAT: GPUTextureFormat = "rgba8unorm";

interface SourceTexture {
  texture: GPUTexture;
  width: number;
  height: number;
  version: string;
}

export class HeadlessFrameCompositor {
  private readonly device: GPUDevice;
  private readonly core: WebGPULayerCompositor;
  private readonly effects: WebGPUEffectsProcessor;
  private readonly width: number;
  private readonly height: number;
  private readonly bytesPerRow: number;
  private readonly readback: GPUBuffer;
  private readonly sources = new Map<string, SourceTexture>();

  constructor(device: GPUDevice, width: number, height: number) {
    this.device = device;
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.core = new WebGPULayerCompositor(
      device,
      TEXTURE_FORMAT,
      "linear",
      "timeline-headless"
    );
    this.core.ensureSize(this.width, this.height);
    this.effects = new WebGPUEffectsProcessor(device);
    this.bytesPerRow =
      Math.ceil((this.width * 4) / ROW_ALIGNMENT) * ROW_ALIGNMENT;
    this.readback = device.createBuffer({
      label: "timeline-headless-readback",
      size: this.bytesPerRow * this.height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
  }

  /**
   * Composite `layers` over opaque black and return the frame as straight-alpha
   * RGBA8 at the compositor's resolution.
   */
  async renderFrame(layers: FrameLayer[]): Promise<Uint8Array> {
    const ordered = [...layers].sort((a, b) => a.zIndex - b.zIndex);
    this.retainOnly(ordered);

    const readStart = this.core.textureA;
    const writeStart = this.core.textureB;
    if (!readStart || !writeStart) {
      throw new Error("Compositor failed to allocate accumulation textures");
    }

    const encoder = this.device.createCommandEncoder({
      label: "timeline-headless-frame"
    });

    let readTex = readStart;
    let writeTex = writeStart;
    // Seed the accumulation with opaque black — the same background the
    // preview composites over.
    const seed = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: readTex.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });
    seed.end();

    this.core.beginFrame();
    for (const layer of ordered) {
      const src = this.uploadSource(layer);
      if (!src) continue;

      const clipEffects = layer.effects ?? [];
      const trackEffects = layer.trackEffects ?? [];
      const processed =
        clipEffects.length > 0 || trackEffects.length > 0
          ? this.effects.process(
              layer.id,
              src.texture,
              src.width,
              src.height,
              clipEffects,
              trackEffects
            )
          : src.texture;

      const matrix = buildTransformMatrix(
        layer.transform ?? IDENTITY_TRANSFORM,
        containBaseScale(src.width, src.height, this.width, this.height),
        this.width,
        this.height
      );
      const invAffine = forwardClipMatrixToInverseAffine(
        matrix,
        src.width,
        src.height,
        this.width,
        this.height
      );

      const radiusPx = layer.borderRadius ?? 0;
      const radiusNormalized =
        radiusPx > 0
          ? Math.min(0.5, radiusPx / Math.min(src.width, src.height))
          : 0;

      this.core.renderBlendPass(encoder, readTex, writeTex, {
        source: processed,
        opacity: layer.opacity,
        blendModeId: blendModeGpuId(layer.blendMode),
        canvasW: this.width,
        canvasH: this.height,
        invAffine,
        borderRadius: radiusNormalized,
        wipe: wipeParams(layer.mask)
      });

      const tmp = readTex;
      readTex = writeTex;
      writeTex = tmp;
    }

    encoder.copyTextureToBuffer(
      { texture: readTex },
      {
        buffer: this.readback,
        bytesPerRow: this.bytesPerRow,
        rowsPerImage: this.height
      },
      { width: this.width, height: this.height }
    );
    this.device.queue.submit([encoder.finish()]);

    await this.readback.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(this.readback.getMappedRange());
    // The accumulation is premultiplied, but the opaque-black seed leaves every
    // pixel at alpha 1, where premultiplied and straight alpha coincide — so
    // dropping the 256-byte row padding is all that is left to do.
    const rgba = new Uint8Array(this.width * this.height * 4);
    const rowBytes = this.width * 4;
    for (let row = 0; row < this.height; row++) {
      rgba.set(
        mapped.subarray(row * this.bytesPerRow, row * this.bytesPerRow + rowBytes),
        row * rowBytes
      );
    }
    this.readback.unmap();
    return rgba;
  }

  private retainOnly(layers: FrameLayer[]): void {
    const live = new Set(layers.map((l) => l.id));
    for (const [id, entry] of this.sources) {
      if (!live.has(id)) {
        entry.texture.destroy();
        this.sources.delete(id);
      }
    }
    this.effects.retainOnly(live);
  }

  private uploadSource(layer: FrameLayer): SourceTexture | null {
    const { rgba, width, height } = layer.source;
    if (width <= 0 || height <= 0) return null;
    if (rgba.length < width * height * 4) return null;

    let entry = this.sources.get(layer.id);
    if (!entry || entry.width !== width || entry.height !== height) {
      entry?.texture.destroy();
      entry = {
        texture: this.device.createTexture({
          label: `timeline-headless-source-${layer.id}`,
          size: { width, height },
          format: TEXTURE_FORMAT,
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.COPY_SRC |
            GPUTextureUsage.RENDER_ATTACHMENT
        }),
        width,
        height,
        version: ""
      };
      this.sources.set(layer.id, entry);
    }

    const version = layer.source.version;
    if (version === undefined || entry.version !== version) {
      // Re-wrap as an ArrayBuffer-backed view: `writeTexture` rejects
      // SharedArrayBuffer-backed sources under the DOM WebGPU typings.
      const data = new Uint8Array(
        rgba.buffer as ArrayBuffer,
        rgba.byteOffset,
        rgba.byteLength
      );
      this.device.queue.writeTexture(
        { texture: entry.texture },
        data,
        { bytesPerRow: width * 4, rowsPerImage: height },
        { width, height }
      );
      entry.version = version ?? "";
    }
    return entry;
  }

  dispose(): void {
    for (const entry of this.sources.values()) entry.texture.destroy();
    this.sources.clear();
    this.effects.dispose();
    this.core.dispose();
    this.readback.destroy();
  }
}
