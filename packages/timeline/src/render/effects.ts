import type {
  ClipEffect,
  CurvePoint,
  TrackEffect,
  TrackSharpenEffect,
  TrackVignetteEffect,
  TrackChromaKeyEffect
} from "../types.js";
import {
  isClipBlurEffect,
  isClipChromaKeyEffect,
  isClipColorEffect,
  isClipCurvesEffect,
  isClipDropShadowEffect,
  isClipGlowEffect,
  isClipLevelsEffect,
  isClipLiftGammaGainEffect,
  isClipSharpenEffect,
  isClipVignetteEffect
} from "../types.js";
import {
  createDefaultRegistry,
  createGPUContextFromDevice,
  createExecutor,
  createLabeledTexture,
  createRecipeRunner,
  LabeledTexture,
  colorCdlV1,
  colorCurvesV1,
  colorGradeV1,
  colorLevelsV1,
  colorLiftGammaGainV1,
  blurGaussianV1,
  filtersGlowV1,
  mixerDropShadowV1,
  sharpenUnsharpMaskV1,
  vignetteV1,
  chromaKeyV1,
  maskApplyV1,
  maskFromImageV1,
  alphaPremulToStraightV1,
  alphaStraightToPremulV1,
  type AlphaMode,
  type GPUContext,
  type Executor,
  type RecipeModule,
  type RecipeRunner,
  type ShaderModule,
  type ShaderRegistry
} from "@nodetool-ai/gpu/pool";
import * as d from "typegpu/data";
import type { AnyWgslStruct, Infer } from "typegpu/data";
import { parseCssColorOrBlack } from "./color.js";

interface AggregatedColor {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  temperature: number;
  tint: number;
  shadows: number;
  highlights: number;
}

const NEUTRAL_COLOR: AggregatedColor = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  hue: 0,
  temperature: 0,
  tint: 0,
  shadows: 0,
  highlights: 0
};

interface IntermediatePool {
  width: number;
  height: number;
  textures: [LabeledTexture, LabeledTexture];
  /** Currently holds the latest pixel state (input to next pass). */
  currentIndex: 0 | 1;
}

/**
 * Read at pool-allocation time, not module load: under Node the WebGPU flag
 * namespaces are installed on `globalThis` by the Dawn adapter when a device is
 * acquired, so a module-scope read would throw on import in every server
 * process — including the ones that only want the scene model.
 */
function intermediateUsage(): number {
  return (
    GPUTextureUsage.TEXTURE_BINDING |
    GPUTextureUsage.STORAGE_BINDING |
    GPUTextureUsage.COPY_SRC |
    GPUTextureUsage.COPY_DST |
    // The mask modules are fragment passes, so an intermediate they write into
    // is a render attachment as well as a storage texture.
    GPUTextureUsage.RENDER_ATTACHMENT
  );
}

/** `mask.fromImage@1`'s channel selector: 0 alpha, 1 luminance. */
const MASK_FROM_IMAGE_MODE = { alpha: 0, luma: 1 } as const;

/**
 * GPU pre-pass for a clip's effect chain. The caller passes a source GPU
 * texture + `ClipEffect[]` and gets back a texture — the original if nothing
 * applies, otherwise a processed intermediate. Intermediates are pooled by
 * layer id + source dimensions, so a clip sitting still reallocates nothing.
 *
 * Every effect is a shared module from `@nodetool-ai/gpu` — a `ShaderModule`
 * through the shared `Executor`, or, for glow and drop shadow, a
 * `RecipeModule` through the `RecipeRunner` (D7). No host-side uniform packing
 * or bind-group construction lives here, and the parameters each type takes
 * are the ones `packages/image-nodes` already settled for the same modules.
 */
export class WebGPUEffectsProcessor {
  private device: GPUDevice;
  private ctx: GPUContext;
  private executor: Executor;
  /** Glow and drop shadow are recipes — a small DAG of the single-pass
   *  modules — so they need the runner and a registry to resolve their ops. */
  private recipes: RecipeRunner;
  private registry: ShaderRegistry;

  private pools = new Map<string, IntermediatePool>();

  constructor(device: GPUDevice) {
    this.device = device;
    this.ctx = createGPUContextFromDevice(device);
    this.executor = createExecutor();
    this.recipes = createRecipeRunner();
    this.registry = createDefaultRegistry();
  }

  /**
   * Run the effects chain on `source` and return a GPU texture with the
   * processed pixels. If no effects are enabled, returns `source` itself
   * (caller should not destroy it on the assumption it's owned).
   *
   * `sourceAlpha` is how `source` stores its color, and it is also how the
   * result comes back: decoded media arrives straight and leaves straight, a
   * precomposite's own accumulation arrives premultiplied and leaves
   * premultiplied. Every effect module writes premultiplied, so a straight
   * source ends with one convert back — which is the pass that was missing.
   * Without it the blend shader read a graded layer's premultiplied RGB as
   * straight and darkened it by its own alpha a second time, invisible only
   * because an opaque layer's two conventions coincide.
   *
   * Order: the track key first, on pixels nothing has graded; then the clip's
   * own new-type effects in the order the document lists them; then the
   * aggregated clip+track colour and blur, and the track sharpen and vignette.
   * The aggregate is one pass over both scopes, so a clip `color` cannot hold
   * a position in the document order — that is what makes the two halves
   * separate stages rather than one list.
   */
  process(
    poolKey: string,
    source: GPUTexture,
    width: number,
    height: number,
    clipEffects: ClipEffect[],
    trackEffects: TrackEffect[] = [],
    sourceAlpha: AlphaMode = "straight"
  ): GPUTexture {
    const enabledClip = clipEffects.filter((e) => e.enabled);
    const enabledTrack = trackEffects.filter((e) => e.enabled);

    // Aggregate color & blur across clip + track scopes.
    const color = aggregateColor(enabledClip, enabledTrack);
    const blurRadius = aggregateBlurRadius(enabledClip, enabledTrack);
    const sharpen = enabledTrack.find(
      (e): e is TrackSharpenEffect => e.type === "sharpen"
    );
    const vignette = enabledTrack.find(
      (e): e is TrackVignetteEffect => e.type === "vignette"
    );
    const chromaKey = enabledTrack.find(
      (e): e is TrackChromaKeyEffect => e.type === "chromaKey"
    );

    const colorActive = isColorActive(color);
    const blurActive = blurRadius >= 0.5;
    const sharpenActive = sharpen != null && sharpen.amount > 0.001;
    const vignetteActive = vignette != null && vignette.intensity > 0.001;
    const chromaKeyActive = chromaKey != null && chromaKey.tolerance > 0.001;
    const shaderClip = enabledClip.filter(isShaderStepEffect);

    if (
      !colorActive &&
      !blurActive &&
      !sharpenActive &&
      !vignetteActive &&
      !chromaKeyActive &&
      shaderClip.length === 0
    ) {
      return source;
    }

    const pool = this.getPool(poolKey, width, height);
    const encoder = this.device.createCommandEncoder({
      label: `preview-effects-${poolKey}`
    });

    // Decoded media arrives straight-alpha (uploaded with
    // `premultipliedAlpha: false`), which is what `sourceAlpha` defaults to.
    // Wrap it with that label and feed it to the first
    // effect: the Executor's auto-bridge inserts `alphaStraightToPremulV1`
    // ahead of effects that need premul input (everything except chromaKey),
    // and chromaKey itself takes straight directly — so there's no redundant
    // straight→premul→straight round-trip when chromaKey runs first.
    const sourceLabeled = new LabeledTexture(source, {
      label: `preview-effects-${poolKey}-src`,
      format: "rgba8unorm",
      width,
      height,
      meta: { colorSpace: "srgb", alpha: sourceAlpha, bindingKind: "texture_2d" }
    });
    let pendingFirst = true;

    /** The texture the next pass reads, and the pool slot it writes. */
    const pick = (): { input: LabeledTexture; outIdx: 0 | 1 } => ({
      input: pendingFirst ? sourceLabeled : pool.textures[pool.currentIndex],
      outIdx: pendingFirst ? 0 : ((1 - pool.currentIndex) as 0 | 1)
    });

    /**
     * Record what the pass just wrote. The label is the module's own declared
     * output alpha, so the next pass's contract is checked — and bridged —
     * against what is actually in the texture rather than against the
     * allocation-time guess.
     */
    const settle = (outIdx: 0 | 1, alpha: AlphaMode): void => {
      pool.textures[outIdx].meta.alpha = alpha;
      pool.currentIndex = outIdx;
      pendingFirst = false;
    };

    const step = <S extends AnyWgslStruct>(
      module: ShaderModule<S>,
      params: Infer<S>
    ): void => {
      const { input, outIdx } = pick();
      const [wgX, wgY] = module.workgroupSize;
      this.executor.encode({
        ctx: this.ctx,
        module,
        encoder,
        inputs: { source: input },
        output: pool.textures[outIdx],
        params,
        dispatch:
          module.kind === "fragment"
            ? { kind: "fragment" }
            : {
                kind: "compute",
                x: Math.ceil(width / wgX),
                y: Math.ceil(height / wgY),
                z: 1
              }
      });
      settle(outIdx, module.io.output.alpha);
    };

    const stepRecipe = <P>(module: RecipeModule<P>, params: P): void => {
      const { input, outIdx } = pick();
      this.recipes.encode({
        ctx: this.ctx,
        module,
        encoder,
        inputs: { source: input },
        output: pool.textures[outIdx],
        params,
        registry: this.registry,
        executor: this.executor
      });
      settle(outIdx, module.io.output.alpha);
    };

    if (chromaKeyActive && chromaKey) {
      const [r, g, b] = colorChannels(chromaKey.keyColor);
      step(chromaKeyV1, {
        keyColor: d.vec3f(r, g, b),
        tolerance: chromaKey.tolerance,
        softness: chromaKey.softness,
        spill: chromaKey.spill
      });
    }
    for (const effect of shaderClip) {
      this.stepClipEffect(effect, width, height, step, stepRecipe);
    }
    if (colorActive) {
      step(colorGradeV1, { ...color });
    }
    if (blurActive) {
      const sigma = blurRadius / 3;
      step(blurGaussianV1, {
        radius: blurRadius,
        sigma,
        direction: d.vec2f(1, 0)
      });
      step(blurGaussianV1, {
        radius: blurRadius,
        sigma,
        direction: d.vec2f(0, 1)
      });
    }
    if (sharpenActive && sharpen) {
      step(sharpenUnsharpMaskV1, {
        amount: sharpen.amount,
        threshold: sharpen.threshold
      });
    }
    if (vignetteActive && vignette) {
      step(vignetteV1, {
        intensity: vignette.intensity,
        radius: vignette.radius,
        softness: vignette.softness
      });
    }
    // Hand back what the caller gave us. Nothing downstream re-reads the
    // module contracts, so a mislabeled texture here is a silently wrong
    // picture rather than a loud failure.
    if (
      !pendingFirst &&
      sourceAlpha === "straight" &&
      pool.textures[pool.currentIndex].meta.alpha === "premultiplied"
    ) {
      step(alphaPremulToStraightV1, alphaPremulToStraightV1.paramDefaults);
    }

    this.device.queue.submit([encoder.finish()]);
    return pool.textures[pool.currentIndex].texture;
  }

  /**
   * Encode one clip effect as its shader step, with the parameters
   * `packages/image-nodes/src/nodes/lib-image-*.ts` already settled for the
   * same modules (D7). Only the units the timeline document differs in are
   * converted here: pixel offsets become UV, a control-point curve becomes the
   * parametric knobs `color.curves@1` takes.
   */
  private stepClipEffect(
    effect: ClipEffect,
    width: number,
    height: number,
    step: <S extends AnyWgslStruct>(
      module: ShaderModule<S>,
      params: Infer<S>
    ) => void,
    stepRecipe: <P>(module: RecipeModule<P>, params: P) => void
  ): void {
    if (isClipGlowEffect(effect)) {
      // `color` tints the bloom, which `filters.glow@1` has no knob for; the
      // bloom takes the source's own colour. Threshold and softness are the
      // recipe's defaults, which is what `lib.image.effects.Glow` ships.
      stepRecipe(filtersGlowV1, {
        threshold: filtersGlowV1.paramDefaults.threshold,
        softness: filtersGlowV1.paramDefaults.softness,
        radius: effect.radius,
        intensity: effect.intensity
      });
      return;
    }
    if (isClipDropShadowEffect(effect)) {
      const [r, g, b] = colorChannels(effect.color);
      // The document offsets in source pixels the way a layer's transform
      // does; `mixer.shadowCompose@1` samples the shadow at `uv - offset`, so
      // a positive offset already casts right and down.
      stepRecipe(mixerDropShadowV1, {
        color: d.vec4f(r, g, b, 1),
        offsetX: effect.offsetX / Math.max(1, width),
        offsetY: effect.offsetY / Math.max(1, height),
        radius: effect.blur,
        intensity: effect.opacity ?? 1
      });
      return;
    }
    if (isClipVignetteEffect(effect)) {
      // `lib.image.filter.Vignette`'s own default radius: the clip effect
      // carries no midpoint, so the vignette starts where that node starts.
      step(vignetteV1, {
        intensity: effect.amount,
        radius: vignetteV1.paramDefaults.radius,
        softness: effect.softness
      });
      return;
    }
    if (isClipSharpenEffect(effect)) {
      // `radius` has no knob on `filters.sharpen.unsharpMask@1` — its kernel
      // is fixed — so it is carried in the document and not applied here.
      step(sharpenUnsharpMaskV1, {
        amount: effect.amount,
        threshold: sharpenUnsharpMaskV1.paramDefaults.threshold
      });
      return;
    }
    if (isClipChromaKeyEffect(effect)) {
      const [r, g, b] = colorChannels(effect.color);
      step(chromaKeyV1, {
        keyColor: d.vec3f(r, g, b),
        tolerance: effect.tolerance,
        softness: effect.softness,
        spill: effect.spill ?? chromaKeyV1.paramDefaults.spill
      });
      return;
    }
    if (isClipCurvesEffect(effect)) {
      const master = fitCurve(effect.master);
      step(colorCurvesV1, {
        blackPoint: master.blackPoint,
        whitePoint: master.whitePoint,
        shadows: master.shadows,
        midtones: master.midtones,
        highlights: master.highlights,
        redMidtones: channelMidtones(effect.r),
        greenMidtones: channelMidtones(effect.g),
        blueMidtones: channelMidtones(effect.b)
      });
      return;
    }
    if (isClipLevelsEffect(effect)) {
      // `color.levels@1` is per-channel and the clip effect is not, so the one
      // triple drives all three. It has no output range, so a narrowed one is
      // a second pass: `color.cdl@1` with power 1 is exactly `in × slope +
      // offset`.
      step(colorLevelsV1, {
        rBlack: effect.inBlack,
        rGamma: effect.gamma,
        rWhite: effect.inWhite,
        gBlack: effect.inBlack,
        gGamma: effect.gamma,
        gWhite: effect.inWhite,
        bBlack: effect.inBlack,
        bGamma: effect.gamma,
        bWhite: effect.inWhite
      });
      const slope = effect.outWhite - effect.outBlack;
      if (Math.abs(slope - 1) > 0.001 || Math.abs(effect.outBlack) > 0.001) {
        step(colorCdlV1, {
          ...colorCdlV1.paramDefaults,
          slopeR: slope,
          slopeG: slope,
          slopeB: slope,
          offsetR: effect.outBlack,
          offsetG: effect.outBlack,
          offsetB: effect.outBlack
        });
      }
      return;
    }
    if (isClipLiftGammaGainEffect(effect)) {
      const [liftR, liftG, liftB] = effect.lift;
      const [gammaR, gammaG, gammaB] = effect.gamma;
      const [gainR, gainG, gainB] = effect.gain;
      // The masters are the shader's neutrals: the document expresses the whole
      // grade per channel, the way `lib.image.color_grading.LiftGammaGain`
      // passes its own per-channel props alongside untouched masters.
      step(colorLiftGammaGainV1, {
        ...colorLiftGammaGainV1.paramDefaults,
        liftR,
        liftG,
        liftB,
        gammaR,
        gammaG,
        gammaB,
        gainR,
        gainG,
        gainB
      });
    }
  }

  /**
   * Multiply a coverage texture's alpha into `source`'s and answer the masked
   * pixels, straight-alpha — which is how the blend shader reads a source.
   *
   * `mask.apply@1` works in premultiplied space (it scales RGB by coverage too,
   * so the result stays valid premultiplied), so a straight source is bridged
   * in by the Executor and converted back here. Skipping that second convert is
   * what darkened a half-covered pixel: the blend shader would scale RGB by
   * alpha a second time.
   *
   * `coverage` may be any size — it is sampled in normalized space, so a mask
   * rasterized at the source's own resolution and one rasterized smaller both
   * land on the same pixels.
   */
  applyMask(
    poolKey: string,
    source: GPUTexture,
    width: number,
    height: number,
    coverage: GPUTexture,
    coverageWidth: number,
    coverageHeight: number,
    sourceAlpha: "straight" | "premultiplied" = "straight"
  ): GPUTexture {
    const pool = this.getPool(poolKey, width, height);
    const encoder = this.device.createCommandEncoder({
      label: `preview-mask-${poolKey}`
    });
    this.executor.encode({
      ctx: this.ctx,
      module: maskApplyV1,
      encoder,
      inputs: {
        source: this.label(source, `${poolKey}-src`, width, height, sourceAlpha),
        // The raster carries its coverage in alpha with white RGB, which is
        // already valid premultiplied — labelling it so skips a bridge pass
        // that would change nothing.
        mask: this.label(
          coverage,
          `${poolKey}-cov`,
          coverageWidth,
          coverageHeight,
          "premultiplied"
        )
      },
      output: pool.textures[0],
      params: { invert: 0 },
      dispatch: { kind: "fragment" }
    });
    pool.textures[0].meta.alpha = maskApplyV1.io.output.alpha;
    const [wgX, wgY] = alphaPremulToStraightV1.workgroupSize;
    this.executor.encode({
      ctx: this.ctx,
      module: alphaPremulToStraightV1,
      encoder,
      inputs: { source: pool.textures[0] },
      output: pool.textures[1],
      params: alphaPremulToStraightV1.paramDefaults,
      dispatch: {
        kind: "compute",
        x: Math.ceil(width / wgX),
        y: Math.ceil(height / wgY),
        z: 1
      }
    });
    pool.textures[1].meta.alpha = alphaPremulToStraightV1.io.output.alpha;
    pool.currentIndex = 1;
    this.device.queue.submit([encoder.finish()]);
    return pool.textures[1].texture;
  }

  /**
   * Read a matte source's alpha or luminance out as coverage — RGB zeroed,
   * value in alpha — which is the shape {@link applyMask} consumes.
   *
   * A luma matte weights the luminance by the coverage the matte source was
   * drawn with, the way the Canvas 2D path does: outside the matte clip's own
   * pixels there is no picture, and an unweighted read would key on whatever
   * colour the transparent region happens to carry. `mask.fromImage@1` divides
   * its premultiplied input back out to read straight colour, so the weight is
   * put back by premultiplying once more before the pass — the texture handed
   * to the Executor is premultiplied and labelled straight, and the bridge it
   * inserts is the second multiply.
   */
  deriveMask(
    poolKey: string,
    source: GPUTexture,
    width: number,
    height: number,
    mode: "alpha" | "luma",
    invert: boolean,
    sourceAlpha: "straight" | "premultiplied" = "straight"
  ): GPUTexture {
    const pool = this.getPool(poolKey, width, height);
    const encoder = this.device.createCommandEncoder({
      label: `preview-matte-${poolKey}`
    });
    const weighted =
      mode === "luma"
        ? this.premultiplyForLuma(
            encoder,
            pool,
            source,
            poolKey,
            width,
            height,
            sourceAlpha
          )
        : this.label(source, `${poolKey}-src`, width, height, sourceAlpha);
    this.executor.encode({
      ctx: this.ctx,
      module: maskFromImageV1,
      encoder,
      inputs: {
        source: weighted
      },
      output: pool.textures[0],
      params: { mode: MASK_FROM_IMAGE_MODE[mode], invert: invert ? 1 : 0 },
      dispatch: { kind: "fragment" }
    });
    pool.textures[0].meta.alpha = maskFromImageV1.io.output.alpha;
    pool.currentIndex = 0;
    this.device.queue.submit([encoder.finish()]);
    return pool.textures[0].texture;
  }

  /**
   * The matte source with its coverage folded into RGB, labelled straight so
   * the Executor's bridge multiplies it in a second time — which is what
   * survives `mask.fromImage@1` dividing the association back out.
   */
  private premultiplyForLuma(
    encoder: GPUCommandEncoder,
    pool: IntermediatePool,
    source: GPUTexture,
    poolKey: string,
    width: number,
    height: number,
    sourceAlpha: "straight" | "premultiplied"
  ): LabeledTexture {
    if (sourceAlpha === "premultiplied") {
      return this.label(source, `${poolKey}-src`, width, height, "straight");
    }
    const [wgX, wgY] = alphaStraightToPremulV1.workgroupSize;
    this.executor.encode({
      ctx: this.ctx,
      module: alphaStraightToPremulV1,
      encoder,
      inputs: {
        source: this.label(source, `${poolKey}-src`, width, height, "straight")
      },
      output: pool.textures[1],
      params: alphaStraightToPremulV1.paramDefaults,
      dispatch: {
        kind: "compute",
        x: Math.ceil(width / wgX),
        y: Math.ceil(height / wgY),
        z: 1
      }
    });
    pool.textures[1].meta.alpha = alphaStraightToPremulV1.io.output.alpha;
    return this.label(
      pool.textures[1].texture,
      `${poolKey}-weighted`,
      width,
      height,
      "straight"
    );
  }

  /** Wrap a raw texture with the metadata the Executor validates against. */
  private label(
    texture: GPUTexture,
    label: string,
    width: number,
    height: number,
    alpha: "straight" | "premultiplied"
  ): LabeledTexture {
    return new LabeledTexture(texture, {
      label: `preview-effects-${label}`,
      format: "rgba8unorm",
      width,
      height,
      meta: { colorSpace: "srgb", alpha, bindingKind: "texture_2d" }
    });
  }

  private getPool(key: string, width: number, height: number): IntermediatePool {
    const existing = this.pools.get(key);
    if (existing && existing.width === width && existing.height === height) {
      return existing;
    }
    if (existing) {
      existing.textures[0].destroy();
      existing.textures[1].destroy();
    }
    // `alpha` here is only the label a fresh, never-written texture carries.
    // Every pass re-labels its output with what that module declares it wrote,
    // so the Executor bridges against the pixels rather than the allocation.
    const make = (label: string): LabeledTexture =>
      createLabeledTexture(this.device, {
        label,
        width,
        height,
        format: "rgba8unorm",
        usage: intermediateUsage(),
        meta: { colorSpace: "srgb", alpha: "premultiplied" }
      });
    const pool: IntermediatePool = {
      width,
      height,
      textures: [make(`preview-effects-${key}-a`), make(`preview-effects-${key}-b`)],
      currentIndex: 0
    };
    this.pools.set(key, pool);
    return pool;
  }

  releasePool(key: string): void {
    const pool = this.pools.get(key);
    if (!pool) return;
    pool.textures[0].destroy();
    pool.textures[1].destroy();
    this.pools.delete(key);
  }

  retainOnly(keys: Iterable<string>): void {
    const keep = new Set(keys);
    for (const key of [...this.pools.keys()]) {
      if (!keep.has(key)) this.releasePool(key);
    }
  }

  dispose(): void {
    for (const pool of this.pools.values()) {
      pool.textures[0].destroy();
      pool.textures[1].destroy();
    }
    this.pools.clear();
    this.ctx.scratch.dispose();
    this.ctx.uniformRing.dispose();
  }
}

function aggregateColor(
  clipEffects: ClipEffect[],
  trackEffects: TrackEffect[]
): AggregatedColor {
  const out: AggregatedColor = { ...NEUTRAL_COLOR };
  for (const e of clipEffects) {
    if (!isClipColorEffect(e)) continue;
    const c = e;
    out.brightness += c.brightness ?? 0;
    out.contrast *= c.contrast ?? 1;
    out.saturation *= c.saturation ?? 1;
    out.hue += c.hue ?? 0;
    out.temperature += c.temperature ?? 0;
    out.tint += c.tint ?? 0;
    out.shadows += c.shadows ?? 0;
    out.highlights += c.highlights ?? 0;
  }
  for (const e of trackEffects) {
    if (e.type !== "colorCorrection") continue;
    const c = e;
    out.brightness += c.brightness;
    out.contrast *= c.contrast;
    out.saturation *= c.saturation;
    out.hue += c.hue;
    out.temperature += c.temperature;
    out.tint += c.tint;
    out.shadows += c.shadows;
    out.highlights += c.highlights;
  }
  out.brightness = clamp(out.brightness, -1, 1);
  out.contrast = clamp(out.contrast, 0, 4);
  out.saturation = clamp(out.saturation, 0, 4);
  out.hue = ((out.hue % 360) + 540) % 360 - 180;
  out.temperature = clamp(out.temperature, -1, 1);
  out.tint = clamp(out.tint, -1, 1);
  out.shadows = clamp(out.shadows, -1, 1);
  out.highlights = clamp(out.highlights, -1, 1);
  return out;
}

function aggregateBlurRadius(
  clipEffects: ClipEffect[],
  trackEffects: TrackEffect[]
): number {
  let radius = 0;
  for (const e of clipEffects) {
    if (isClipBlurEffect(e)) radius += e.radius;
  }
  for (const e of trackEffects) {
    if (e.type === "videoBlur") radius += e.radius;
  }
  return Math.min(40, radius);
}

/**
 * A document colour to shader channels. The Canvas 2D path hands the same
 * string to `fillStyle`, so anything CSS accepts has to arrive here as the
 * same colour; an unparseable one falls back to opaque black rather than to a
 * colour that is in the frame on one host and not the other.
 */
function colorChannels(color: string): [number, number, number] {
  const { r, g, b } = parseCssColorOrBlack(color);
  return [r, g, b];
}

function isColorActive(c: AggregatedColor): boolean {
  return (
    Math.abs(c.brightness) > 0.001 ||
    Math.abs(c.contrast - 1) > 0.001 ||
    Math.abs(c.saturation - 1) > 0.001 ||
    Math.abs(c.hue) > 0.001 ||
    Math.abs(c.temperature) > 0.001 ||
    Math.abs(c.tint) > 0.001 ||
    Math.abs(c.shadows) > 0.001 ||
    Math.abs(c.highlights) > 0.001
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * The clip effects that run as their own step, in document order — everything
 * but `color` and `blur`, which fold into one aggregate pass across the clip
 * and track scopes.
 */
function isShaderStepEffect(effect: ClipEffect): boolean {
  return (
    isClipGlowEffect(effect) ||
    isClipDropShadowEffect(effect) ||
    isClipVignetteEffect(effect) ||
    isClipSharpenEffect(effect) ||
    isClipChromaKeyEffect(effect) ||
    isClipCurvesEffect(effect) ||
    isClipLevelsEffect(effect) ||
    isClipLiftGammaGainEffect(effect)
  );
}

/** The parametric knobs `color.curves@1` takes, fitted to a point list. */
interface CurveKnobs {
  blackPoint: number;
  whitePoint: number;
  shadows: number;
  midtones: number;
  highlights: number;
}

const IDENTITY_CURVE: CurveKnobs = {
  blackPoint: 0,
  whitePoint: 1,
  shadows: 0,
  midtones: 0,
  highlights: 0
};

/** Read a control-point curve at `x`: piecewise linear, flat past the ends. */
function sampleCurve(points: readonly CurvePoint[], x: number): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return x;
  if (x <= first.x) return first.y;
  if (x >= last.x) return last.y;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b || x > b.x) continue;
    const span = b.x - a.x;
    return span <= 0 ? b.y : a.y + ((x - a.x) / span) * (b.y - a.y);
  }
  return last.y;
}

/**
 * Fit a point list onto `color.curves@1`, which is parametric rather than a
 * LUT: a black/white remap, then a shadow lift, a midtone gamma and a
 * highlight roll.
 *
 * The toe and shoulder come from the knots that sit at 0 and 1 — a levels-style
 * curve is exact. The three bends are then solved in the shader's own order
 * from the quarter, mid and three-quarter samples, so a curve that moves only
 * one of them reproduces exactly and one that moves several is close. It is a
 * fit, not a translation: no set of three parameters draws an arbitrary curve.
 */
function fitCurve(points: readonly CurvePoint[]): CurveKnobs {
  const sorted = points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .slice()
    .sort((a, b) => a.x - b.x);
  if (sorted.length < 2) return IDENTITY_CURVE;

  let blackPoint = 0;
  let whitePoint = 1;
  for (const p of sorted) {
    if (p.y <= 0.001) blackPoint = clamp(p.x, 0, 1);
  }
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    if (p && p.y >= 0.999) whitePoint = clamp(p.x, 0, 1);
  }
  if (whitePoint - blackPoint < 0.01) return IDENTITY_CURVE;

  // Residual curve after the remap: what the three bends have to produce.
  const at = (u: number): number =>
    clamp(sampleCurve(sorted, blackPoint + u * (whitePoint - blackPoint)), 0, 1);
  const t25 = at(0.25);
  const t50 = at(0.5);
  const t75 = at(0.75);

  // Gamma first, from the midpoint: `pow(0.5, 1 / (1 + midtones)) = t50`.
  const midtones = clamp(Math.log(0.5) / Math.log(safeUnit(t50)) - 1, -0.9, 9);
  const gamma = 1 / (1 + midtones);

  // Shadows next: undo the gamma at the quarter tone to read what the lift
  // `u + shadows × u × (1 - u)` must have produced there.
  const shadows = clamp((Math.pow(t25, 1 / gamma) - 0.25) / 0.1875, -1, 1);

  // Highlights last, on the three-quarter tone the first two have already bent.
  const lifted = 0.75 + shadows * 0.75 * 0.25;
  const bent = Math.pow(clamp(lifted, 0, 1), gamma);
  const room = bent * (1 - bent);
  const highlights = room > 0.001 ? clamp((t75 - bent) / room, -1, 1) : 0;

  return { blackPoint, whitePoint, shadows, midtones, highlights };
}

/**
 * A per-channel curve reduces to that channel's midtone gamma, which is the
 * only per-channel knob `color.curves@1` has. Absent means neutral.
 */
function channelMidtones(points: readonly CurvePoint[] | undefined): number {
  if (!points || points.length < 2) return 0;
  const mid = clamp(sampleCurve(points, 0.5), 0, 1);
  return clamp(Math.log(0.5) / Math.log(safeUnit(mid)) - 1, -0.9, 9);
}

/** Keep a sample off 0 and 1, where the log solve has no answer. */
function safeUnit(v: number): number {
  return Math.min(0.999, Math.max(0.001, v));
}
