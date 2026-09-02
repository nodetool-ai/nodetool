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
 * kept per layer id (re-uploaded only when their pixels change), the
 * precomposite textures per group id, and the readback buffer is allocated
 * once. Everything the GPU holds is owned by the instance and released in
 * {@link HeadlessFrameCompositor.dispose}, so a throw mid-frame leaks nothing.
 */

import { blendModeGpuId } from "@nodetool-ai/gpu";
import {
  FULLSCREEN_QUAD_VERTEX,
  UNPREMULTIPLY_FRAGMENT,
  WebGPULayerCompositor,
  forwardClipMatrixToInverseAffine,
  type InverseAffine
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
  /** The layer's group matrix, from the scene model. Composes as `parent × own`. */
  parentMatrix?: Float32Array;
  /**
   * The precomposite this layer renders into instead of the main stack, from
   * the scene model. Absent on every layer of a document with no precompositing
   * group, which is the path that allocates no intermediate texture.
   */
  precomposeGroupId?: string;
  /** Rounded-corner radius in source pixels. */
  borderRadius?: number;
  mask?: AnimationSampleMask;
  effects?: ClipEffect[];
  trackEffects?: TrackEffect[];
}

/**
 * A group that composites its children into an intermediate frame-sized
 * texture, runs its effect chain on the composed picture, and blends the result
 * once.
 *
 * Mirrors `PrecompositeLayer` from the scene model with `trackIndex` already
 * resolved to a `zIndex`, the way {@link FrameLayer} mirrors `ActiveLayer`.
 */
export interface FramePrecomposite {
  /** The group clip's id — what a layer names in `precomposeGroupId`, and what
   * keys the intermediate texture across frames. */
  id: string;
  /** Composite order of the blended result, ascending. */
  zIndex: number;
  opacity: number;
  blendMode: CompositorBlendMode;
  /** Run once on the composed texture, not once per child. */
  effects?: ClipEffect[];
  /** Set when a precompositing group holds this one: the texture it renders into. */
  precomposeGroupId?: string;
}

/** A layer with its source texture resolved — the shape a blend pass consumes. */
interface ResolvedLayer {
  texture: GPUTexture;
  opacity: number;
  blendMode: CompositorBlendMode;
  zIndex: number;
  invAffine: InverseAffine;
  borderRadius: number;
  mask?: AnimationSampleMask;
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
  /**
   * The second compositor pass, built on the first frame that carries a
   * precompositing group and never at all for a document without one. Its own
   * ping-pong pair is what keeps a group's children off the main accumulation.
   */
  private precompCore: WebGPULayerCompositor | null = null;
  /** One finished, straight-alpha surface per precompositing group, by id. */
  private readonly precompTargets = new Map<string, GPUTexture>();
  /** Resolves a premultiplied accumulation to the straight alpha the blend
   *  shader reads a source as. Built with the second pass. */
  private unpremultiply: GPURenderPipeline | null = null;

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
   *
   * A layer naming a group in `precomposites` renders into that group's own
   * texture first, and the texture blends once at the group's z with the
   * group's opacity, blend mode and effect chain. With no precomposites this is
   * the single-pass path unchanged: the second compositor is never built.
   */
  async renderFrame(
    layers: FrameLayer[],
    precomposites: readonly FramePrecomposite[] = []
  ): Promise<Uint8Array> {
    const ordered = [...layers].sort((a, b) => a.zIndex - b.zIndex);
    this.retainOnly(ordered, precomposites);

    const readStart = this.core.textureA;
    const writeStart = this.core.textureB;
    if (!readStart || !writeStart) {
      throw new Error("Compositor failed to allocate accumulation textures");
    }

    const stack = this.composePrecomposites(ordered, precomposites);

    const encoder = this.device.createCommandEncoder({
      label: "timeline-headless-frame"
    });

    // Seed the accumulation with opaque black — the same background the
    // preview composites over.
    const seed = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: readStart.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });
    seed.end();

    this.core.beginFrame();
    const readTex = this.blendStack(
      encoder,
      this.core,
      stack,
      readStart,
      writeStart
    );

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

  /**
   * Blend `items` bottom-up over whatever `read` holds, ping-ponging between
   * the two accumulation textures, and answer the one holding the result. The
   * caller has already called `beginFrame` on `core` and seeded `read`.
   */
  private blendStack(
    encoder: GPUCommandEncoder,
    core: WebGPULayerCompositor,
    items: readonly ResolvedLayer[],
    read: GPUTexture,
    write: GPUTexture
  ): GPUTexture {
    let readTex = read;
    let writeTex = write;
    for (const item of items) {
      core.renderBlendPass(encoder, readTex, writeTex, {
        source: item.texture,
        opacity: item.opacity,
        blendModeId: blendModeGpuId(item.blendMode),
        canvasW: this.width,
        canvasH: this.height,
        invAffine: item.invAffine,
        borderRadius: item.borderRadius,
        wipe: wipeParams(item.mask)
      });
      const tmp = readTex;
      readTex = writeTex;
      writeTex = tmp;
    }
    return readTex;
  }

  /**
   * Upload a layer's pixels, run its own effect chain, and work out where it
   * sits. Null when the layer has no drawable source.
   */
  private resolveLayer(layer: FrameLayer): ResolvedLayer | null {
    const src = this.uploadSource(layer);
    if (!src) return null;

    const clipEffects = layer.effects ?? [];
    const trackEffects = layer.trackEffects ?? [];
    const texture =
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

    const radiusPx = layer.borderRadius ?? 0;
    return {
      texture,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      zIndex: layer.zIndex,
      invAffine: this.placementOf(layer, src.width, src.height),
      borderRadius:
        radiusPx > 0
          ? Math.min(0.5, radiusPx / Math.min(src.width, src.height))
          : 0,
      mask: layer.mask
    };
  }

  /** Where a source of this size lands on the frame, as the shader's affine. */
  private placementOf(
    layer: Pick<FrameLayer, "transform" | "parentMatrix">,
    sourceWidth: number,
    sourceHeight: number
  ): InverseAffine {
    const matrix = buildTransformMatrix(
      layer.transform ?? IDENTITY_TRANSFORM,
      containBaseScale(sourceWidth, sourceHeight, this.width, this.height),
      this.width,
      this.height,
      layer.parentMatrix
    );
    return forwardClipMatrixToInverseAffine(
      matrix,
      sourceWidth,
      sourceHeight,
      this.width,
      this.height
    );
  }

  /**
   * Render each precompositing group into its own texture and return the main
   * stack: the layers belonging to no group, plus one entry per group whose
   * texture blends onto the frame.
   *
   * `precomposites` arrives innermost first, so a nested group's finished
   * texture is already in hand when the group above renders. Every group's work
   * is submitted before the next one starts, which is what orders a nested
   * texture ahead of the read that consumes it.
   */
  private composePrecomposites(
    layers: readonly FrameLayer[],
    precomposites: readonly FramePrecomposite[]
  ): ResolvedLayer[] {
    if (precomposites.length === 0) {
      return layers
        .map((layer) => this.resolveLayer(layer))
        .filter((item): item is ResolvedLayer => item !== null);
    }

    const stack: ResolvedLayer[] = [];
    const byGroup = new Map<string, ResolvedLayer[]>();
    const assign = (groupId: string | undefined, item: ResolvedLayer): void => {
      if (!groupId) {
        stack.push(item);
        return;
      }
      const bucket = byGroup.get(groupId);
      if (bucket) bucket.push(item);
      else byGroup.set(groupId, [item]);
    };

    for (const layer of layers) {
      const item = this.resolveLayer(layer);
      if (item) assign(layer.precomposeGroupId, item);
    }

    for (const group of precomposites) {
      const children = byGroup.get(group.id) ?? [];
      if (children.length === 0) continue;
      const texture = this.renderPrecomposite(group, children);
      assign(group.precomposeGroupId, {
        texture,
        opacity: group.opacity,
        blendMode: group.blendMode,
        zIndex: group.zIndex,
        // The texture is frame-sized, so it composites 1:1: the group's own
        // matrix already rode into each child through `parentMatrix`.
        invAffine: this.placementOf({}, this.width, this.height),
        borderRadius: 0
      });
    }
    return stack;
  }

  /**
   * Composite one group's children over transparency, run the group's effects
   * on the result, and leave it in the group's own texture as straight alpha —
   * which is how the blend shader reads a source.
   */
  private renderPrecomposite(
    group: FramePrecomposite,
    children: readonly ResolvedLayer[]
  ): GPUTexture {
    const core = this.precompositeCore();
    const read = core.textureA;
    const write = core.textureB;
    if (!read || !write) {
      throw new Error("Compositor failed to allocate precomposite textures");
    }

    const composeEncoder = this.device.createCommandEncoder({
      label: `timeline-headless-precomp-${group.id}`
    });
    // Transparent, not black: the group's own pixels have to blend over what is
    // already on the frame, and a black seed would knock it out.
    const seed = composeEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: read.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });
    seed.end();
    core.beginFrame();
    const composed = this.blendStack(
      composeEncoder,
      core,
      [...children].sort((a, b) => a.zIndex - b.zIndex),
      read,
      write
    );
    // Submitted here rather than folded into the frame encoder: the effects
    // pass below and a group above both read this texture through their own
    // submissions, and only submit order puts the write first.
    this.device.queue.submit([composeEncoder.finish()]);

    // The accumulation is premultiplied. Saying so lets the effects chain run
    // on it directly, and one resolve at the end is then the only alpha
    // conversion in the whole precomposite.
    const graded = this.effects.process(
      `precomp:${group.id}`,
      composed,
      this.width,
      this.height,
      group.effects ?? [],
      [],
      "premultiplied"
    );

    const target = this.precompositeTarget(group.id);
    const resolveEncoder = this.device.createCommandEncoder({
      label: `timeline-headless-precomp-resolve-${group.id}`
    });
    const pass = resolveEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: target.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });
    const pipeline = this.unpremultiplyPipeline();
    pass.setPipeline(pipeline);
    pass.setBindGroup(
      0,
      this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: graded.createView() }]
      })
    );
    pass.draw(4);
    pass.end();
    this.device.queue.submit([resolveEncoder.finish()]);
    return target;
  }

  private precompositeCore(): WebGPULayerCompositor {
    let core = this.precompCore;
    if (!core) {
      core = new WebGPULayerCompositor(
        this.device,
        TEXTURE_FORMAT,
        "linear",
        "timeline-headless-precomp"
      );
      core.ensureSize(this.width, this.height);
      this.precompCore = core;
    }
    return core;
  }

  private precompositeTarget(id: string): GPUTexture {
    let target = this.precompTargets.get(id);
    if (!target) {
      target = this.device.createTexture({
        label: `timeline-headless-precomp-target-${id}`,
        size: { width: this.width, height: this.height },
        format: TEXTURE_FORMAT,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
      });
      this.precompTargets.set(id, target);
    }
    return target;
  }

  private unpremultiplyPipeline(): GPURenderPipeline {
    let pipeline = this.unpremultiply;
    if (!pipeline) {
      const module = this.device.createShaderModule({
        label: "timeline-headless-unpremultiply",
        code: `${FULLSCREEN_QUAD_VERTEX}\n${UNPREMULTIPLY_FRAGMENT}`
      });
      pipeline = this.device.createRenderPipeline({
        label: "timeline-headless-unpremultiply",
        layout: "auto",
        vertex: { module, entryPoint: "vs_main" },
        fragment: {
          module,
          entryPoint: "fs_unpremultiply",
          targets: [{ format: TEXTURE_FORMAT }]
        },
        primitive: { topology: "triangle-strip" }
      });
      this.unpremultiply = pipeline;
    }
    return pipeline;
  }

  private retainOnly(
    layers: FrameLayer[],
    precomposites: readonly FramePrecomposite[]
  ): void {
    const live = new Set(layers.map((l) => l.id));
    for (const [id, entry] of this.sources) {
      if (!live.has(id)) {
        entry.texture.destroy();
        this.sources.delete(id);
      }
    }
    const liveGroups = new Set(precomposites.map((p) => p.id));
    for (const [id, texture] of this.precompTargets) {
      if (!liveGroups.has(id)) {
        texture.destroy();
        this.precompTargets.delete(id);
      }
    }
    // The effects processor is keyed by layer id for a clip's own chain and by
    // `precomp:<id>` for a group's, so both sets have to survive the sweep.
    for (const id of liveGroups) live.add(`precomp:${id}`);
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
    for (const texture of this.precompTargets.values()) texture.destroy();
    this.precompTargets.clear();
    this.effects.dispose();
    this.core.dispose();
    this.precompCore?.dispose();
    this.precompCore = null;
    this.readback.destroy();
  }
}
