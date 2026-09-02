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
import type { CompositorBlendMode, MatteMode } from "./sceneModel.js";
import {
  IDENTITY_TRANSFORM,
  buildTransformMatrix,
  containBaseScale
} from "./transform.js";
import {
  transitionTransform,
  type ResolvedTransition
} from "./transition.js";

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
  /**
   * The clip's shape mask, already rasterized as coverage in alpha — the host
   * owns a canvas and this does not, so `drawMask` runs there (the same split
   * that makes a text layer arrive as pixels). Any size: the mask is sampled in
   * normalized space, so the source's own resolution and a smaller raster land
   * on the same pixels. `invert` is baked into the raster.
   */
  shapeMask?: FrameLayerPixels;
  /**
   * The track matte driving this layer's alpha. `layer` is the matte source as
   * an ordinary layer — it is rendered to its own texture and read, never
   * blended onto the frame.
   */
  matte?: FrameMatte;
  effects?: ClipEffect[];
  trackEffects?: TrackEffect[];
  /**
   * The cut this layer is part of, from the scene model. Its opacity is
   * already in `opacity`; the offset, scale, reveal mask and dip solid it
   * names are rendered here.
   */
  transition?: ResolvedTransition;
}

/** A track matte with its source layer's pixels already in hand. */
export interface FrameMatte {
  mode: MatteMode;
  invert: boolean;
  layer: FrameLayer;
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
  /** One 1×1 texture per colour a `dipToColor` transition fades through. */
  private readonly solids = new Map<string, GPUTexture>();
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
   * Upload a layer's pixels, run its effects and mask, place it, and — when it
   * is matted — replace all of that with the matted composite (D6). Null when
   * the layer has no drawable source.
   */
  private resolveLayer(layer: FrameLayer): ResolvedLayer | null {
    const item = this.resolvePlacedLayer(layer);
    if (!item || !layer.matte) return item;
    return this.applyMatte(layer, item, layer.matte);
  }

  /**
   * Compose a matted layer and its matte source into their own frame-sized
   * textures, read the named channel out of the source, and multiply it into
   * the layer's alpha.
   *
   * Frame-sized rather than source-sized because a matte is positioned by its
   * own clip: where its keyhole falls is only expressible once both layers are
   * placed. The matte source is resolved through {@link resolvePlacedLayer}
   * rather than {@link resolveLayer}, so a matte can never drive a matte.
   */
  private applyMatte(
    layer: FrameLayer,
    item: ResolvedLayer,
    matte: FrameMatte
  ): ResolvedLayer | null {
    const source = this.resolvePlacedLayer(matte.layer);
    // No matte source pixels means an empty keyhole. Drawing the layer unmatted
    // would show everything the matte was there to hide, so it draws nothing.
    if (!source) return null;

    const composed = this.composeToTexture(`matte:${layer.id}`, [
      // The layer's own opacity and blend mode meet the frame once, when this
      // texture blends; on its own surface it is an opaque source-over draw.
      { ...item, opacity: 1, blendMode: "normal", zIndex: 0 }
    ]);
    const keyhole = this.composeToTexture(`mattesrc:${layer.id}`, [
      { ...source, blendMode: "normal", zIndex: 0 }
    ]);
    const coverage = this.effects.deriveMask(
      `matte-mask:${layer.id}`,
      keyhole,
      this.width,
      this.height,
      matte.mode,
      matte.invert
    );
    return {
      texture: this.effects.applyMask(
        `matte-apply:${layer.id}`,
        composed,
        this.width,
        this.height,
        coverage,
        this.width,
        this.height
      ),
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      zIndex: layer.zIndex,
      // The composite is frame-sized, so it blends 1:1: the layer's placement
      // already ran when it was drawn onto its own texture.
      invAffine: this.placementOf({}, this.width, this.height),
      borderRadius: 0
    };
  }

  /**
   * Upload a layer's pixels, run its own effect chain and shape mask, and work
   * out where it sits. Null when the layer has no drawable source.
   */
  private resolvePlacedLayer(layer: FrameLayer): ResolvedLayer | null {
    const src = this.uploadPixels(layer.id, layer.source);
    if (!src) return null;

    const clipEffects = layer.effects ?? [];
    const trackEffects = layer.trackEffects ?? [];
    const graded =
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

    // The effects chain leaves premultiplied pixels behind; an unprocessed
    // source is straight. Saying which keeps `applyMask` from bridging alpha
    // the wrong way — and it always hands back straight, which is what the
    // blend shader reads a source as.
    const coverage = layer.shapeMask
      ? this.uploadPixels(`${layer.id}#mask`, layer.shapeMask)
      : null;
    const texture = coverage
      ? this.effects.applyMask(
          `mask:${layer.id}`,
          graded,
          src.width,
          src.height,
          coverage.texture,
          coverage.width,
          coverage.height,
          graded === src.texture ? "straight" : "premultiplied"
        )
      : graded;

    const radiusPx = layer.borderRadius ?? 0;
    return {
      texture,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      zIndex: layer.zIndex,
      invAffine: this.placementOf(
        {
          transform: transitionTransform(
            layer.transform,
            layer.transition,
            this.width,
            this.height
          ),
          parentMatrix: layer.parentMatrix
        },
        src.width,
        src.height
      ),
      borderRadius:
        radiusPx > 0
          ? Math.min(0.5, radiusPx / Math.min(src.width, src.height))
          : 0,
      // An animated wipe on the clip and a wipe transition both reduce to one
      // reveal; the clip's own wins, because it is the motion the author put
      // there.
      mask: layer.mask ?? layer.transition?.mask
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
   * The full-frame solid a layer's `dipToColor` fades through, as a layer
   * sitting immediately beneath it. Null when the layer names no dip, or when
   * the colour is one the GPU path cannot read.
   *
   * One texel stretched over the frame: the source size only decides how the
   * inverse affine maps screen pixels to texels, and every pixel of a solid
   * samples the same one.
   */
  private dipSolidFor(layer: FrameLayer): ResolvedLayer | null {
    const solid = layer.transition?.solid;
    if (!solid || solid.opacity <= 0) return null;
    const texture = this.solidTexture(solid.color);
    if (!texture) return null;
    return {
      texture,
      opacity: Math.min(1, solid.opacity),
      blendMode: "normal",
      zIndex: layer.zIndex,
      // The identity base makes the single texel cover clip space [-1,1]².
      invAffine: forwardClipMatrixToInverseAffine(
        buildTransformMatrix(
          IDENTITY_TRANSFORM,
          { x: 1, y: 1 },
          this.width,
          this.height
        ),
        1,
        1,
        this.width,
        this.height
      ),
      borderRadius: 0
    };
  }

  /** A 1×1 opaque texture of `color`, kept for the life of the compositor. */
  private solidTexture(color: string): GPUTexture | null {
    const cached = this.solids.get(color);
    if (cached) return cached;
    const rgb = parseHexColor(color);
    if (!rgb) return null;
    const texture = this.device.createTexture({
      label: `timeline-headless-solid-${color}`,
      size: { width: 1, height: 1 },
      format: TEXTURE_FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    this.device.queue.writeTexture(
      { texture },
      new Uint8Array([rgb.r, rgb.g, rgb.b, 255]),
      { bytesPerRow: 4, rowsPerImage: 1 },
      { width: 1, height: 1 }
    );
    this.solids.set(color, texture);
    return texture;
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
      const stack: ResolvedLayer[] = [];
      for (const layer of layers) {
        const item = this.resolveLayer(layer);
        if (!item) continue;
        const solid = this.dipSolidFor(layer);
        if (solid) stack.push(solid);
        stack.push(item);
      }
      return stack;
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
      if (!item) continue;
      // The solid shares the layer's z and is pushed first, so the stable sort
      // that orders the stack keeps it beneath the clip it dips into.
      const solid = this.dipSolidFor(layer);
      if (solid) assign(layer.precomposeGroupId, solid);
      assign(layer.precomposeGroupId, item);
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
    return this.composeToTexture(group.id, children, group.effects ?? []);
  }

  /**
   * Composite `children` over transparency into the texture `key` names, run
   * `effects` on the result, and leave it there as straight alpha — which is
   * how the blend shader reads a source.
   */
  private composeToTexture(
    key: string,
    children: readonly ResolvedLayer[],
    effects: ClipEffect[] = []
  ): GPUTexture {
    const core = this.precompositeCore();
    const read = core.textureA;
    const write = core.textureB;
    if (!read || !write) {
      throw new Error("Compositor failed to allocate precomposite textures");
    }

    const composeEncoder = this.device.createCommandEncoder({
      label: `timeline-headless-precomp-${key}`
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
      `precomp:${key}`,
      composed,
      this.width,
      this.height,
      effects,
      [],
      "premultiplied"
    );

    const target = this.precompositeTarget(key);
    const resolveEncoder = this.device.createCommandEncoder({
      label: `timeline-headless-precomp-resolve-${key}`
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
    // A matte source never appears in `layers`, and its textures are keyed off
    // the layer it mattes, so the sweep walks both.
    const live = new Set<string>();
    const liveTargets = new Set(precomposites.map((p) => p.id));
    const effectKeys = new Set<string>();
    const visit = (layer: FrameLayer): void => {
      live.add(layer.id);
      effectKeys.add(layer.id);
      if (layer.shapeMask) {
        live.add(`${layer.id}#mask`);
        effectKeys.add(`mask:${layer.id}`);
      }
      if (!layer.matte) return;
      liveTargets.add(`matte:${layer.id}`);
      liveTargets.add(`mattesrc:${layer.id}`);
      effectKeys.add(`matte-mask:${layer.id}`);
      effectKeys.add(`matte-apply:${layer.id}`);
      visit(layer.matte.layer);
    };
    for (const layer of layers) visit(layer);

    for (const [id, entry] of this.sources) {
      if (!live.has(id)) {
        entry.texture.destroy();
        this.sources.delete(id);
      }
    }
    for (const [id, texture] of this.precompTargets) {
      if (!liveTargets.has(id)) {
        texture.destroy();
        this.precompTargets.delete(id);
      }
    }
    // The effects processor is keyed by layer id for a clip's own chain and by
    // `precomp:<id>` for every composed texture, so both sets have to survive.
    for (const id of liveTargets) effectKeys.add(`precomp:${id}`);
    this.effects.retainOnly(effectKeys);
  }

  private uploadPixels(
    id: string,
    pixels: FrameLayerPixels
  ): SourceTexture | null {
    const { rgba, width, height } = pixels;
    if (width <= 0 || height <= 0) return null;
    if (rgba.length < width * height * 4) return null;

    let entry = this.sources.get(id);
    if (!entry || entry.width !== width || entry.height !== height) {
      entry?.texture.destroy();
      entry = {
        texture: this.device.createTexture({
          label: `timeline-headless-source-${id}`,
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
      this.sources.set(id, entry);
    }

    const version = pixels.version;
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
    for (const texture of this.solids.values()) texture.destroy();
    this.solids.clear();
    this.effects.dispose();
    this.core.dispose();
    this.precompCore?.dispose();
    this.precompCore = null;
    this.readback.destroy();
  }
}

/**
 * `#rgb` / `#rrggbb` to bytes. The GPU path needs the channels a Canvas 2D
 * `fillStyle` would parse for it; anything else (a named colour, `rgb(...)`)
 * is refused, and the dip then draws nothing rather than a wrong colour.
 */
function parseHexColor(
  color: string
): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const hex = match[1];
  const size = hex.length / 3;
  const channel = (index: number): number => {
    const digits = hex.slice(index * size, index * size + size);
    return Number.parseInt(size === 1 ? digits + digits : digits, 16);
  };
  return { r: channel(0), g: channel(1), b: channel(2) };
}
