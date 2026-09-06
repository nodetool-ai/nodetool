/**
 * The WebGPU compositing rules every timeline render surface draws through.
 *
 * {@link GpuFrameCompositor} is the whole of it: placement, the effects
 * pre-pass, shape masks, track mattes, transition geometry, the dip solid, and
 * the precomposite pass that lets a group's effects and blend mode act on its
 * children together. It is generic in what a layer's pixels arrive as, because
 * that is the only thing its two hosts disagree about — the server hands it CPU
 * RGBA buffers, the editor hands it `<video>` elements and `ImageBitmap`s — and
 * a rule that lived in both would drift, which is exactly what happened while
 * the browser kept a compositor of its own.
 *
 * {@link HeadlessFrameCompositor} is the server host: CPU pixels in, one
 * frame's RGBA read back out. The editor's host lives in `web/` and differs
 * only in uploading through `copyExternalImageToTexture` and presenting to a
 * swap chain instead of a buffer.
 *
 * An instance is reused across every frame of a render: source textures are
 * kept per layer id (re-uploaded only when their pixels change), the
 * precomposite textures per group id, and the readback buffer is allocated
 * once. Everything the GPU holds is owned by the instance and released in
 * `dispose`, so a throw mid-frame leaks nothing.
 */

import { blendModeGpuId } from "@nodetool-ai/gpu";
import {
  BLIT_FRAGMENT,
  FULLSCREEN_QUAD_VERTEX,
  UNPREMULTIPLY_FRAGMENT,
  WebGPULayerCompositor,
  forwardClipMatrixToInverseAffine,
  type InverseAffine
} from "@nodetool-ai/gpu/webgpu";

import type { AnimationSampleMask, WipeDirection } from "../animation/index.js";
import type { ClipEffect, ClipTransform, TrackEffect } from "../types.js";
import { parseCssColorOrBlack } from "./color.js";
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

/**
 * One layer of a frame.
 *
 * `TSource` is whatever the host's uploader turns into a texture: decoded CPU
 * pixels on the server, a `<video>`/`ImageBitmap` in the editor.
 */
export interface FrameLayer<TSource = FrameLayerPixels> {
  /** Stable across frames for the same clip — keys the source texture. */
  id: string;
  source: TSource;
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
  shapeMask?: TSource;
  /**
   * The track matte driving this layer's alpha. `layer` is the matte source as
   * an ordinary layer — it is rendered to its own texture and read, never
   * blended onto the frame.
   */
  matte?: FrameMatte<TSource>;
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
export interface FrameMatte<TSource = FrameLayerPixels> {
  mode: MatteMode;
  invert: boolean;
  layer: FrameLayer<TSource>;
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

const TEXTURE_FORMAT: GPUTextureFormat = "rgba8unorm";

/** A layer's pixels, once the host has them in a texture. */
export interface GpuSourceTexture {
  texture: GPUTexture;
  width: number;
  height: number;
}

/**
 * How a host gets a layer's pixels onto the GPU. `id` is stable across frames
 * for the same layer, so a host caches its texture under it and re-uploads only
 * when the pixels change. Null means the source is not drawable yet — a video
 * mid-seek, an image still decoding — and the layer contributes nothing to this
 * frame.
 */
export type GpuSourceUploader<TSource> = (
  id: string,
  source: TSource
) => GpuSourceTexture | null;

/** What a host needs to tell the compositor about its own texture cache. */
export interface GpuFrameCompositorOptions<TSource> {
  /** Distinguishes this instance's GPU labels from another's. */
  label?: string;
  upload: GpuSourceUploader<TSource>;
  /**
   * The source ids still in use after this frame. A host drops whatever its
   * cache holds beyond them, the way the compositor drops its own intermediates.
   */
  retainSources?: (live: ReadonlySet<string>) => void;
}

/** The result of compositing one frame: where it landed, and how much drew. */
export interface GpuCompositeResult {
  /** The accumulation texture holding the finished frame. */
  texture: GPUTexture;
  /** How many of the given layers resolved to pixels. */
  drawn: number;
}

export class GpuFrameCompositor<TSource = FrameLayerPixels> {
  private readonly device: GPUDevice;
  private readonly core: WebGPULayerCompositor;
  private readonly effects: WebGPUEffectsProcessor;
  private readonly label: string;
  private readonly upload: GpuSourceUploader<TSource>;
  private readonly retainSources: (live: ReadonlySet<string>) => void;
  private width: number;
  private height: number;
  /**
   * The sequence's own resolution — the space `transform.position` and a
   * transition's frame-relative offset are expressed in. Equal to the frame
   * size unless a host says otherwise, which the editor does because its canvas
   * tracks the viewport and the device pixel ratio.
   */
  private refWidth = 0;
  private refHeight = 0;
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

  constructor(
    device: GPUDevice,
    width: number,
    height: number,
    options: GpuFrameCompositorOptions<TSource>
  ) {
    this.device = device;
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.label = options.label ?? "timeline";
    this.upload = options.upload;
    this.retainSources = options.retainSources ?? (() => {});
    this.core = new WebGPULayerCompositor(
      device,
      TEXTURE_FORMAT,
      "linear",
      this.label
    );
    this.core.ensureSize(this.width, this.height);
    this.effects = new WebGPUEffectsProcessor(device);
  }

  /**
   * Change the frame size. The intermediates are frame-sized, so they are
   * dropped and rebuilt at the new one; the host's own source textures are
   * source-sized and unaffected.
   */
  resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.core.ensureSize(w, h);
    this.precompCore?.ensureSize(w, h);
    for (const texture of this.precompTargets.values()) texture.destroy();
    this.precompTargets.clear();
  }

  /** Set the sequence resolution a stored transform is expressed against. */
  setReferenceSize(width: number, height: number): void {
    this.refWidth = width;
    this.refHeight = height;
  }

  /** The reference width in force: the host's, or the frame's. */
  private get referenceWidth(): number {
    return this.refWidth || this.width;
  }

  private get referenceHeight(): number {
    return this.refHeight || this.height;
  }

  /**
   * Copy `from` onto `view` — how a host presents the composited frame to a
   * swap chain it owns and this does not.
   */
  blit(encoder: GPUCommandEncoder, from: GPUTexture, view: GPUTextureView): void {
    this.core.blit(encoder, from, view);
  }

  /**
   * Composite `layers` over `clearValue` and return the accumulation texture
   * holding the frame, plus how many layers actually drew.
   *
   * A layer naming a group in `precomposites` renders into that group's own
   * texture first, and the texture blends once at the group's z with the
   * group's opacity, blend mode and effect chain. With no precomposites this is
   * the single-pass path: the second compositor is never built.
   *
   * The work is submitted before this returns, so a host records whatever it
   * does with the frame — a readback, a blit to a swap chain — in an encoder of
   * its own and submits that after.
   */
  composite(
    layers: readonly FrameLayer<TSource>[],
    precomposites: readonly FramePrecomposite[] = [],
    clearValue: GPUColor = { r: 0, g: 0, b: 0, a: 1 }
  ): GpuCompositeResult {
    const ordered = [...layers].sort((a, b) => a.zIndex - b.zIndex);
    this.retainOnly(ordered, precomposites);

    const readStart = this.core.textureA;
    const writeStart = this.core.textureB;
    if (!readStart || !writeStart) {
      throw new Error("Compositor failed to allocate accumulation textures");
    }

    // One encoder for the whole frame. Every layer's effects, every mask and
    // matte, and every precomposite record into it, so a frame with M graded
    // layers, P groups and K mattes is one queue submission instead of one per
    // call. Commands inside an encoder execute in the order they were
    // recorded, which is the same ordering the separate submissions gave.
    const encoder = this.device.createCommandEncoder({
      label: `${this.label}-frame`
    });

    // Every group and matte in this frame records into `encoder` before one
    // submit, so the precomposite core's uniform ring is reset here, once, and
    // each pass below takes its own slot. Resetting it per group would hand
    // the second group the first group's buffers while those commands are
    // still pending.
    this.precompCore?.beginFrame();
    const { stack, drawn } = this.composePrecomposites(
      ordered,
      precomposites,
      encoder
    );

    const seed = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: readStart.createView(),
          clearValue,
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });
    seed.end();

    this.core.beginFrame();
    const texture = this.blendStack(
      encoder,
      this.core,
      stack,
      readStart,
      writeStart
    );
    this.device.queue.submit([encoder.finish()]);
    return { texture, drawn };
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
  private resolveLayer(
    layer: FrameLayer<TSource>,
    encoder: GPUCommandEncoder
  ): ResolvedLayer | null {
    const item = this.resolvePlacedLayer(layer, encoder);
    if (!item || !layer.matte) return item;
    return this.applyMatte(layer, item, layer.matte, encoder);
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
    layer: FrameLayer<TSource>,
    item: ResolvedLayer,
    matte: FrameMatte<TSource>,
    encoder: GPUCommandEncoder
  ): ResolvedLayer | null {
    const source = this.resolvePlacedLayer(matte.layer, encoder);
    // No matte source pixels means an empty keyhole. Drawing the layer unmatted
    // would show everything the matte was there to hide, so it draws nothing.
    if (!source) return null;

    const composed = this.composeToTexture(
      `matte:${layer.id}`,
      [
        // The layer's own opacity and blend mode meet the frame once, when
        // this texture blends; on its own surface it is an opaque source-over
        // draw.
        { ...item, opacity: 1, blendMode: "normal", zIndex: 0 }
      ],
      [],
      encoder
    );
    const keyhole = this.composeToTexture(
      `mattesrc:${layer.id}`,
      [{ ...source, blendMode: "normal", zIndex: 0 }],
      [],
      encoder
    );
    const coverage = this.effects.deriveMask(
      `matte-mask:${layer.id}`,
      keyhole,
      this.width,
      this.height,
      matte.mode,
      matte.invert,
      "straight",
      encoder
    );
    return {
      texture: this.effects.applyMask(
        `matte-apply:${layer.id}`,
        composed,
        this.width,
        this.height,
        coverage,
        this.width,
        this.height,
        "straight",
        encoder
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
  private resolvePlacedLayer(
    layer: FrameLayer<TSource>,
    encoder: GPUCommandEncoder
  ): ResolvedLayer | null {
    const src = this.upload(layer.id, layer.source);
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
            trackEffects,
            "straight",
            encoder
          )
        : src.texture;

    // Both the upload and the effects chain hand back straight alpha, which is
    // what `applyMask` bridges from and what the blend shader reads a source
    // as — so a layer with effects, a mask, both or neither reaches the blend
    // in one convention.
    const coverage = layer.shapeMask
      ? this.upload(`${layer.id}#mask`, layer.shapeMask)
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
          "straight",
          encoder
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
            this.referenceWidth,
            this.referenceHeight
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
    layer: Pick<FrameLayer<TSource>, "transform" | "parentMatrix">,
    sourceWidth: number,
    sourceHeight: number
  ): InverseAffine {
    const matrix = buildTransformMatrix(
      layer.transform ?? IDENTITY_TRANSFORM,
      containBaseScale(sourceWidth, sourceHeight, this.width, this.height),
      this.referenceWidth,
      this.referenceHeight,
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
  private dipSolidFor(layer: FrameLayer<TSource>): ResolvedLayer | null {
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
          this.referenceWidth,
          this.referenceHeight
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
    const rgb = dipColorBytes(color);
    const texture = this.device.createTexture({
      label: `${this.label}-solid-${color}`,
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
    layers: readonly FrameLayer<TSource>[],
    precomposites: readonly FramePrecomposite[],
    encoder: GPUCommandEncoder
  ): { stack: ResolvedLayer[]; drawn: number } {
    let drawn = 0;
    if (precomposites.length === 0) {
      const stack: ResolvedLayer[] = [];
      for (const layer of layers) {
        const item = this.resolveLayer(layer, encoder);
        if (!item) continue;
        drawn += 1;
        const solid = this.dipSolidFor(layer);
        if (solid) stack.push(solid);
        stack.push(item);
      }
      return { stack, drawn };
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
      const item = this.resolveLayer(layer, encoder);
      if (!item) continue;
      drawn += 1;
      // The solid shares the layer's z and is pushed first, so the stable sort
      // that orders the stack keeps it beneath the clip it dips into.
      const solid = this.dipSolidFor(layer);
      if (solid) assign(layer.precomposeGroupId, solid);
      assign(layer.precomposeGroupId, item);
    }

    for (const group of precomposites) {
      const children = byGroup.get(group.id) ?? [];
      if (children.length === 0) continue;
      const texture = this.renderPrecomposite(group, children, encoder);
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
    return { stack, drawn };
  }

  /**
   * Composite one group's children over transparency, run the group's effects
   * on the result, and leave it in the group's own texture as straight alpha —
   * which is how the blend shader reads a source.
   */
  private renderPrecomposite(
    group: FramePrecomposite,
    children: readonly ResolvedLayer[],
    encoder: GPUCommandEncoder
  ): GPUTexture {
    return this.composeToTexture(
      group.id,
      children,
      group.effects ?? [],
      encoder
    );
  }

  /**
   * Composite `children` over transparency into the texture `key` names, run
   * `effects` on the result, and leave it there as straight alpha — which is
   * how the blend shader reads a source.
   */
  private composeToTexture(
    key: string,
    children: readonly ResolvedLayer[],
    effects: ClipEffect[] = [],
    frameEncoder?: GPUCommandEncoder
  ): GPUTexture {
    const core = this.precompositeCore();
    const read = core.textureA;
    const write = core.textureB;
    if (!read || !write) {
      throw new Error("Compositor failed to allocate precomposite textures");
    }

    const composeEncoder =
      frameEncoder ??
      this.device.createCommandEncoder({
        label: `${this.label}-precomp-${key}`
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
    // With a frame encoder the ring was reset once at the top of the frame
    // (see `composite`); resetting here would alias this pass's uniforms
    // with the previous group's.
    if (!frameEncoder) core.beginFrame();
    const composed = this.blendStack(
      composeEncoder,
      core,
      [...children].sort((a, b) => a.zIndex - b.zIndex),
      read,
      write
    );
    // Without a frame encoder this has to be submitted here, because the
    // effects pass below and a group above read this texture through their own
    // submissions and only submit order puts the write first. With one, record
    // order does the same job and the frame submits once.
    if (!frameEncoder) this.device.queue.submit([composeEncoder.finish()]);

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
      "premultiplied",
      frameEncoder
    );

    const target = this.precompositeTarget(key);
    const resolveEncoder =
      frameEncoder ??
      this.device.createCommandEncoder({
        label: `${this.label}-precomp-resolve-${key}`
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
    if (!frameEncoder) this.device.queue.submit([resolveEncoder.finish()]);
    return target;
  }

  private precompositeCore(): WebGPULayerCompositor {
    let core = this.precompCore;
    if (!core) {
      core = new WebGPULayerCompositor(
        this.device,
        TEXTURE_FORMAT,
        "linear",
        `${this.label}-precomp`
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
        label: `${this.label}-precomp-target-${id}`,
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
        label: `${this.label}-unpremultiply`,
        code: `${FULLSCREEN_QUAD_VERTEX}\n${UNPREMULTIPLY_FRAGMENT}`
      });
      pipeline = this.device.createRenderPipeline({
        label: `${this.label}-unpremultiply`,
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
    layers: readonly FrameLayer<TSource>[],
    precomposites: readonly FramePrecomposite[]
  ): void {
    // A matte source never appears in `layers`, and its textures are keyed off
    // the layer it mattes, so the sweep walks both.
    const live = new Set<string>();
    const liveTargets = new Set(precomposites.map((p) => p.id));
    const effectKeys = new Set<string>();
    const visit = (layer: FrameLayer<TSource>): void => {
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

    this.retainSources(live);
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

  dispose(): void {
    for (const texture of this.precompTargets.values()) texture.destroy();
    this.precompTargets.clear();
    for (const texture of this.solids.values()) texture.destroy();
    this.solids.clear();
    this.effects.dispose();
    this.core.dispose();
    this.precompCore?.dispose();
    this.precompCore = null;
  }
}

/** `copyTextureToBuffer` requires a 256-byte-aligned `bytesPerRow`. */
const ROW_ALIGNMENT = 256;

interface SourceTexture {
  texture: GPUTexture;
  width: number;
  height: number;
  version: string;
}

/**
 * The accumulation format for a motion-blurred frame.
 *
 * `rgba16float` and not `rgba8unorm`: a sample contributes 1/N of its value, and
 * at N = 8 that is 1/8 of a byte-quantized channel — under an 8-bit target every
 * sample below 8/255 would round to nothing and the smear would develop banding
 * at its faint end, which is exactly where a blur lives.
 */
const BLUR_ACCUMULATION_FORMAT: GPUTextureFormat = "rgba16float";

/** One instant of a motion-blurred frame: the scene resolved at that time. */
export interface FrameSample<TSource = FrameLayerPixels> {
  layers: FrameLayer<TSource>[];
  precomposites?: readonly FramePrecomposite[];
}

/** Per-frame choices for {@link HeadlessFrameCompositor.renderFrame}. */
export interface HeadlessRenderFrameOptions {
  /**
   * Seed the frame fully transparent instead of opaque black, and return
   * straight (un-premultiplied) alpha. What an alpha export writes to a
   * container that carries it; off by default, so every existing caller keeps
   * the opaque ground it already had.
   */
  alpha?: boolean;
}

/**
 * Divide the premultiplied colour back out of every pixel, in place.
 *
 * A fully transparent pixel keeps its zero colour: there is no colour to
 * recover from `0 × 0`, and inventing one would print noise into the parts of
 * an alpha export nothing drew.
 */
export function unpremultiplyInPlace(rgba: Uint8Array): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a === 0 || a === 255) continue;
    rgba[i] = Math.min(255, Math.round((rgba[i] * 255) / a));
    rgba[i + 1] = Math.min(255, Math.round((rgba[i + 1] * 255) / a));
    rgba[i + 2] = Math.min(255, Math.round((rgba[i + 2] * 255) / a));
  }
}

/**
 * Composite one timeline frame without a canvas: CPU pixels in, straight-alpha
 * RGBA8 out.
 *
 * The server-side host of {@link GpuFrameCompositor}. Everything about what a
 * frame looks like is the compositor's; what is here is the boundary — a
 * texture cache keyed by layer id and versioned by the pixels, and the readback
 * buffer the finished frame is copied through.
 */
export class HeadlessFrameCompositor {
  private readonly device: GPUDevice;
  private readonly compositor: GpuFrameCompositor<FrameLayerPixels>;
  private readonly width: number;
  private readonly height: number;
  private readonly bytesPerRow: number;
  /**
   * Two readback buffers, used in turn.
   *
   * With one buffer a frame's copy cannot be recorded until the previous
   * frame's map has resolved and the buffer is unmapped, so the copy of frame
   * k+1 is serialized behind the CPU-side mapping of frame k. Alternating
   * means the buffer a frame copies into is never the one still mapped, so the
   * copy and the composite behind it can be submitted while the previous
   * frame's map is still in flight. The pixels are unchanged: each frame still
   * reads back the buffer it wrote.
   */
  private readonly readbacks: readonly [GPUBuffer, GPUBuffer];
  private readbackIndex = 0;
  private readonly sources = new Map<string, SourceTexture>();
  /**
   * The motion-blur half, built on the first frame that asks for more than one
   * sample and never at all for a render with blur off. Kept as three lazy
   * fields rather than an object so the single-sample path allocates nothing.
   */
  private blurAccumulation: GPUTexture | null = null;
  private blurResolveTarget: GPUTexture | null = null;
  private blurAccumulatePipeline: GPURenderPipeline | null = null;
  private blurResolvePipeline: GPURenderPipeline | null = null;

  constructor(device: GPUDevice, width: number, height: number) {
    this.device = device;
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.compositor = new GpuFrameCompositor<FrameLayerPixels>(
      device,
      this.width,
      this.height,
      {
        label: "timeline-headless",
        upload: (id, pixels) => this.uploadPixels(id, pixels),
        retainSources: (live) => {
          for (const [id, entry] of this.sources) {
            if (live.has(id)) continue;
            entry.texture.destroy();
            this.sources.delete(id);
          }
        }
      }
    );
    this.bytesPerRow =
      Math.ceil((this.width * 4) / ROW_ALIGNMENT) * ROW_ALIGNMENT;
    const makeReadback = (index: number): GPUBuffer =>
      device.createBuffer({
        label: `timeline-headless-readback-${index}`,
        size: this.bytesPerRow * this.height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
      });
    this.readbacks = [makeReadback(0), makeReadback(1)];
  }

  /**
   * Composite `layers` and return the frame as straight-alpha RGBA8 at the
   * compositor's resolution.
   *
   * The ground is opaque black unless `options.alpha` is set, which seeds the
   * frame fully transparent instead — what an alpha export needs, and the same
   * seed `drawTimelineFrame` takes on the Canvas 2D side.
   */
  async renderFrame(
    layers: FrameLayer[],
    precomposites: readonly FramePrecomposite[] = [],
    options: HeadlessRenderFrameOptions = {}
  ): Promise<Uint8Array> {
    const alpha = options.alpha === true;
    const { texture } = this.compositor.composite(layers, precomposites, {
      r: 0,
      g: 0,
      b: 0,
      a: alpha ? 0 : 1
    });

    const readback = this.nextReadback();
    const encoder = this.device.createCommandEncoder({
      label: "timeline-headless-readback"
    });
    encoder.copyTextureToBuffer(
      { texture },
      {
        buffer: readback,
        bytesPerRow: this.bytesPerRow,
        rowsPerImage: this.height
      },
      { width: this.width, height: this.height }
    );
    this.device.queue.submit([encoder.finish()]);

    // The accumulation is premultiplied. Over an opaque-black seed every pixel
    // ends at alpha 1, where premultiplied and straight alpha coincide, so
    // dropping the 256-byte row padding is all that is left to do. Over a
    // transparent seed they do not coincide: the colour has to be divided back
    // out, or every partly-transparent pixel exports darkened.
    const rgba = await this.readMapped(readback);
    if (alpha) unpremultiplyInPlace(rgba);
    return rgba;
  }

  /**
   * Composite every instant of one shutter window and return their average as
   * straight-alpha RGBA8 — a motion-blurred frame (D10).
   *
   * A sample is the whole scene resolved at a sub-frame time
   * ({@link motionBlurSampleTimes} decides which), so the caller builds N layer
   * sets and this composites and folds each in turn. One sample takes the
   * unblurred path exactly, byte for byte: blur off must render what it rendered
   * before blur existed.
   *
   * **Premultiplied throughout, un-premultiplied once at the end.** Each sample
   * leaves the compositor's accumulation premultiplied, and the mean of N
   * premultiplied samples *is* the premultiplied mean — averaging colours that
   * had already been divided by their own alphas would weight a nearly
   * transparent sample's colour as heavily as an opaque one's and lighten the
   * leading edge of every smear. So the fold adds premultiplied values, and the
   * resolve pass divides the summed colour by the summed alpha once. Over an
   * opaque ground the summed alpha is 1 and that division is the identity, which
   * is why one resolve pipeline serves both grounds.
   */
  async renderFrameSamples(
    samples: readonly FrameSample[],
    options: HeadlessRenderFrameOptions = {}
  ): Promise<Uint8Array> {
    if (samples.length === 0) {
      throw new Error("A frame needs at least one sample to composite");
    }
    if (samples.length === 1) {
      return this.renderFrame(
        samples[0].layers,
        samples[0].precomposites ?? [],
        options
      );
    }

    const alpha = options.alpha === true;
    const clearValue = { r: 0, g: 0, b: 0, a: alpha ? 0 : 1 };
    const accumulation = this.blurAccumulationTexture();
    const weight = 1 / samples.length;

    for (let i = 0; i < samples.length; i++) {
      const { texture } = this.compositor.composite(
        samples[i].layers,
        samples[i].precomposites ?? [],
        clearValue
      );
      // Folded per sample rather than batched: the compositor hands back its
      // own ping-pong texture, and the next sample overwrites it.
      this.foldBlurSample(accumulation, texture, weight, i === 0);
    }

    const resolved = this.resolveBlurAccumulation(accumulation);
    const readback = this.nextReadback();
    const encoder = this.device.createCommandEncoder({
      label: "timeline-headless-blur-readback"
    });
    encoder.copyTextureToBuffer(
      { texture: resolved },
      {
        buffer: readback,
        bytesPerRow: this.bytesPerRow,
        rowsPerImage: this.height
      },
      { width: this.width, height: this.height }
    );
    this.device.queue.submit([encoder.finish()]);
    // The resolve pass already divided the colour back out, so unlike
    // `renderFrame` there is no CPU un-premultiply left to do.
    return this.readMapped(readback);
  }

  /** Add one composited sample into the accumulation at `weight`. */
  private foldBlurSample(
    accumulation: GPUTexture,
    texture: GPUTexture,
    weight: number,
    first: boolean
  ): void {
    const [pipeline] = this.buildBlurPipelines();
    const encoder = this.device.createCommandEncoder({
      label: "timeline-headless-blur-fold"
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: accumulation.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          // Only the first sample clears: every later one adds to what is there.
          loadOp: first ? "clear" : "load",
          storeOp: "store"
        }
      ]
    });
    pass.setPipeline(pipeline);
    // `src × constant + dst`, so the weight rides in the blend constant and the
    // fragment shader stays a plain texel read.
    pass.setBlendConstant({ r: weight, g: weight, b: weight, a: weight });
    pass.setBindGroup(
      0,
      this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: texture.createView() }]
      })
    );
    pass.draw(4);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  /** Divide the summed colour by the summed alpha into a readable RGBA8 texture. */
  private resolveBlurAccumulation(accumulation: GPUTexture): GPUTexture {
    const target = this.blurResolveTexture();
    const [, pipeline] = this.buildBlurPipelines();
    const encoder = this.device.createCommandEncoder({
      label: "timeline-headless-blur-resolve"
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(
      0,
      this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: accumulation.createView() }]
      })
    );
    pass.draw(4);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    return target;
  }

  private blurAccumulationTexture(): GPUTexture {
    let texture = this.blurAccumulation;
    if (!texture) {
      texture = this.device.createTexture({
        label: "timeline-headless-blur-accumulation",
        size: { width: this.width, height: this.height },
        format: BLUR_ACCUMULATION_FORMAT,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
      });
      this.blurAccumulation = texture;
    }
    return texture;
  }

  private blurResolveTexture(): GPUTexture {
    let texture = this.blurResolveTarget;
    if (!texture) {
      texture = this.device.createTexture({
        label: "timeline-headless-blur-resolve",
        size: { width: this.width, height: this.height },
        format: TEXTURE_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
      });
      this.blurResolveTarget = texture;
    }
    return texture;
  }

  /** The fold and resolve pipelines, built together on the first blurred frame. */
  private buildBlurPipelines(): [GPURenderPipeline, GPURenderPipeline] {
    if (!this.blurAccumulatePipeline) {
      const module = this.device.createShaderModule({
        label: "timeline-headless-blur-fold",
        code: `${FULLSCREEN_QUAD_VERTEX}\n${BLIT_FRAGMENT}`
      });
      this.blurAccumulatePipeline = this.device.createRenderPipeline({
        label: "timeline-headless-blur-fold",
        layout: "auto",
        vertex: { module, entryPoint: "vs_main" },
        fragment: {
          module,
          entryPoint: "fs_blit",
          targets: [
            {
              format: BLUR_ACCUMULATION_FORMAT,
              blend: {
                color: {
                  srcFactor: "constant",
                  dstFactor: "one",
                  operation: "add"
                },
                alpha: {
                  srcFactor: "constant",
                  dstFactor: "one",
                  operation: "add"
                }
              }
            }
          ]
        },
        primitive: { topology: "triangle-strip" }
      });
    }
    if (!this.blurResolvePipeline) {
      const module = this.device.createShaderModule({
        label: "timeline-headless-blur-resolve",
        code: `${FULLSCREEN_QUAD_VERTEX}\n${UNPREMULTIPLY_FRAGMENT}`
      });
      this.blurResolvePipeline = this.device.createRenderPipeline({
        label: "timeline-headless-blur-resolve",
        layout: "auto",
        vertex: { module, entryPoint: "vs_main" },
        fragment: {
          module,
          entryPoint: "fs_unpremultiply",
          targets: [{ format: TEXTURE_FORMAT }]
        },
        primitive: { topology: "triangle-strip" }
      });
    }
    return [this.blurAccumulatePipeline, this.blurResolvePipeline];
  }

  /** Map the readback buffer and drop its 256-byte row padding. */
  /** The buffer this frame reads back through — the one the last frame did not. */
  private nextReadback(): GPUBuffer {
    const buffer = this.readbacks[this.readbackIndex];
    this.readbackIndex = this.readbackIndex === 0 ? 1 : 0;
    return buffer;
  }

  private async readMapped(readback: GPUBuffer): Promise<Uint8Array> {
    await readback.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(readback.getMappedRange());
    const rgba = new Uint8Array(this.width * this.height * 4);
    const rowBytes = this.width * 4;
    for (let row = 0; row < this.height; row++) {
      rgba.set(
        mapped.subarray(row * this.bytesPerRow, row * this.bytesPerRow + rowBytes),
        row * rowBytes
      );
    }
    readback.unmap();
    return rgba;
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
    this.blurAccumulation?.destroy();
    this.blurAccumulation = null;
    this.blurResolveTarget?.destroy();
    this.blurResolveTarget = null;
    this.compositor.dispose();
    for (const readback of this.readbacks) readback.destroy();
  }
}

/**
 * A dip colour to bytes. The GPU path needs the channels a Canvas 2D
 * `fillStyle` would parse for it, so it reads the same CSS grammar the 2D path
 * gets for free; an unparseable string dips to black rather than not at all.
 */
function dipColorBytes(color: string): { r: number; g: number; b: number } {
  const { r, g, b } = parseCssColorOrBlack(color);
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}
