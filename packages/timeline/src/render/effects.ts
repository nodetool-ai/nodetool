import type { TemporalSources } from "./denoise.js";
import { stabilizationNeutral } from "./stabilization.js";
import { secondaryCurveTransfer, secondaryNeutral } from "./secondaryColor.js";
import { hueSatCurvesNeutral, hueSatCurvesTransfer } from "./hueSatCurves.js";
import { curveTransfer } from "./curveTransfer.js";
import { GENERATOR_MODES, STYLIZE_MODES, type ClipEffect, type TrackEffect } from "../types.js";
import {
  isClipBlurEffect,
  isClipDenoiseEffect, isClipStabilizeEffect, isClipDebandEffect, isClipSecondaryColorEffect, isClipHueSatCurvesEffect, isClipExposureEffect,
  isClipChromaKeyEffect,
  isClipColorEffect,
  isClipCurvesEffect,
  isClipDropShadowEffect,
  isClipGlowEffect,
  isClipLevelsEffect,
  isClipLiftGammaGainEffect,
  isClipSharpenEffect,
  isClipVignetteEffect,
  isClipGrainEffect
} from "../types.js";
import {
  createDefaultRegistry,
  createGPUContextFromDevice,
  createExecutor,
  createLabeledTexture,
  createRecipeRunner,
  LabeledTexture,
  filtersDenoiseSpatialV1, filtersDenoiseTemporalV1, transformStabilizeV1, filterDebandV1, colorSecondaryV1, colorHueSatCurvesV1, colorExposureLinearV1,
  colorCdlV1,
  colorCurveTransferV1,
  colorGradeV1,
  colorLevelsV1,
  colorLiftGammaGainV1,
  blurGaussianV1,
  filtersGlowV1,
  mixerDropShadowV1,
  sharpenUnsharpMaskV1,
  sharpenGaussianV1,
  vignetteV2,
  filtersGrainV2,
  filtersPixelateV1,
  colorPosterizeV1,
  colorCubeLutV1,
  transformSpherizeV1,
  filtersVisualFxV1,
  chromaKeyV1,
  maskApplyV1,
  maskMixV1,
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
import { parseCubeLut, type CubeLut } from "./cubeLut.js";
import { trackEffectsAsClipEffects } from "./trackEffects.js";
import { effectMaskCoverage, effectMasksOf, isMaskedEffect } from "../effectMasks.js";

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
  /** The input of a masked effect, held for the mix after it. */
  saved?: LabeledTexture;
}

interface CachedCoverage {
  key: string;
  texture: GPUTexture;
}

interface CachedLut {
  texture: LabeledTexture;
  parsed: CubeLut;
}

const floatBits = new DataView(new ArrayBuffer(4));

function float16Bits(value: number): number {
  floatBits.setFloat32(0, value, true);
  const bits = floatBits.getUint32(0, true);
  const sign = (bits >>> 16) & 0x8000;
  const exponent = ((bits >>> 23) & 0xff) - 112;
  const fraction = bits & 0x7fffff;
  if (exponent <= 0) {
    if (exponent < -10) return sign;
    const subnormal = (fraction | 0x800000) >>> (1 - exponent);
    return sign | ((subnormal + 0x1000) >>> 13);
  }
  if (exponent >= 31) return sign | 0x7bff;
  return sign | ((exponent << 10) + ((fraction + 0x1000) >>> 13));
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
  private lutTextures = new Map<string, CachedLut>();
  private coverages = new Map<string, CachedCoverage>();

  constructor(device: GPUDevice, private readonly workingFormat: "rgba8unorm" | "rgba16float" = "rgba8unorm") {
    this.device = device;
    this.ctx = createGPUContextFromDevice(device);
    this.executor = createExecutor();
    this.recipes = createRecipeRunner();
    this.registry = createDefaultRegistry();
  }

  /** Start a frame whose effect passes share the caller's command buffer. */
  beginSubmission(): void {
    this.ctx.uniformRing.beginSubmission();
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
   * `trackEffects` arrives in the legacy track spelling and is converted to
   * clip effects at the door, so every stage below reads one vocabulary and
   * {@link WebGPUEffectsProcessor.stepClipEffect} is the only place that knows
   * which shader module an effect type is.
   *
   * Order: source noise reduction and stabilization, then the track key and the clip's
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
    sourceAlpha: AlphaMode = "straight",
    /**
     * Record into the caller's encoder instead of one of this call's own.
     *
     * A frame with several graded layers, a precomposite and a matte used to
     * submit one command buffer per call — each submit is a queue round trip,
     * and the GPU idles between them. Given an encoder, this records and lets
     * the caller submit the frame once. Omitted, it behaves as it always did.
     */
    frameEncoder?: GPUCommandEncoder,
    temporalSources?: TemporalSources<GPUTexture>
  ): GPUTexture {
    const enabledClip = clipEffects.filter((e) => e.enabled && !(isMaskedEffect(e) && (isClipColorEffect(e) || isClipBlurEffect(e))));
    const maskedAggregates = clipEffects.filter((e) => isMaskedEffect(e) && (isClipColorEffect(e) || isClipBlurEffect(e)));
    const enabledTrack = trackEffectsAsClipEffects(trackEffects).filter(
      (e) => e.enabled
    );

    // Aggregate color & blur across clip + track scopes.
    const color = aggregateColor(enabledClip, enabledTrack);
    const blurRadius = aggregateBlurRadius(enabledClip, enabledTrack);
    const sharpen = enabledTrack.find(isClipSharpenEffect);
    const vignette = enabledTrack.find(isClipVignetteEffect);
    const chromaKey = enabledTrack.find(isClipChromaKeyEffect);

    const colorActive = isColorActive(color);
    const blurActive = blurRadius >= 0.5;
    const sharpenActive = sharpen != null && sharpen.amount > 0.001;
    const vignetteActive = vignette != null && vignette.amount > 0.001;
    const chromaKeyActive = chromaKey != null && chromaKey.tolerance > 0.001;
    const shaderClip = [
      ...clipEffects.filter((e) => e.enabled && (isShaderStepEffect(e) || maskedAggregates.includes(e))),
      ...enabledTrack.filter(isClipExposureEffect)
    ];

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

    if (!frameEncoder) {
      this.ctx.uniformRing.beginSubmission();
    }
    const workingFormat = this.workingFormat === "rgba16float" && source.format === "rgba16float" ? "rgba16float" : "rgba8unorm";
    const pool = this.getPool(poolKey, width, height, workingFormat);
    const encoder =
      frameEncoder ??
      this.device.createCommandEncoder({
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
      format: source.format,
      width,
      height,
      meta: { colorSpace: "encoded-sdr", alpha: sourceAlpha, bindingKind: "texture_2d" }
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
      const inputs: Record<string, LabeledTexture> = {source: input};
      if (module.id === filtersDenoiseTemporalV1.id) {
        if (!temporalSources) { throw new Error("Temporal noise reduction requires neighboring source frames."); }
        for (const key of ["before", "after"] as const) {
          const texture = temporalSources[key];
          inputs[key] = new LabeledTexture(texture, {label: `${poolKey}-denoise-${key}`, format: texture.format, width: texture.width, height: texture.height,
            meta: {colorSpace: "encoded-sdr", alpha: "straight", bindingKind: "texture_2d"}});
        }
      }
      this.executor.encode({
        ctx: this.ctx,
        workingFormat,
        module,
        encoder,
        inputs,
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
        workingFormat,
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

    for (const effect of shaderClip.filter(isClipDenoiseEffect)) { this.stepClipEffect(effect, width, height, step, stepRecipe); }
    for (const effect of shaderClip.filter(isClipStabilizeEffect)) { this.stepClipEffect(effect, width, height, step, stepRecipe); }
    if (chromaKeyActive && chromaKey) {
      this.stepClipEffect(chromaKey, width, height, step, stepRecipe);
    }
    for (const effect of shaderClip.filter(effect => !isClipStabilizeEffect(effect) && !isClipDenoiseEffect(effect))) {
      if (effect.type === "lut" && typeof effect.cube === "string") {
        const { texture: lut, parsed } = this.getLutTexture(effect.cube);
        const { input, outIdx } = pick();
        this.executor.encode({
          ctx: this.ctx,
        workingFormat,
          module: colorCubeLutV1,
          encoder,
          inputs: { source: input, lut },
          output: pool.textures[outIdx],
          params: {
            size: parsed.size,
            intensity: typeof effect.intensity === "number" ? effect.intensity : 1,
            domainMin: d.vec4f(...parsed.domainMin, 0),
            domainMax: d.vec4f(...parsed.domainMax, 0)
          },
          dispatch: { kind: "fragment" }
        });
        settle(outIdx, colorCubeLutV1.io.output.alpha);
      } else if (isMaskedEffect(effect)) {
        let before: LabeledTexture;
        if (pendingFirst) {
          before = sourceLabeled;
        } else {
          const current = pool.textures[pool.currentIndex];
          pool.saved ??= this.makeIntermediate(`preview-effects-${poolKey}-saved`, width, height, workingFormat);
          encoder.copyTextureToTexture({ texture: current.texture }, { texture: pool.saved.texture }, [width, height, 1]);
          pool.saved.meta.alpha = current.meta.alpha;
          before = pool.saved;
        }
        if (isClipColorEffect(effect)) {
          const own = aggregateColor([effect], []);
          if (isColorActive(own)) step(colorGradeV1, { ...own });
        } else if (isClipBlurEffect(effect)) {
          const radius = aggregateBlurRadius([effect], []);
          if (radius >= 0.5) {
            step(blurGaussianV1, { radius, sigma: radius / 3, direction: d.vec2f(1, 0) });
            step(blurGaussianV1, { radius, sigma: radius / 3, direction: d.vec2f(0, 1) });
          }
        } else {
          this.stepClipEffect(effect, width, height, step, stepRecipe);
        }
        if (pendingFirst) continue;
        const coverage = this.coverageTexture(poolKey, effect, width, height);
        const { input, outIdx } = pick();
        this.executor.encode({
          ctx: this.ctx,
          workingFormat,
          module: maskMixV1,
          encoder,
          inputs: {
            source: input,
            base: before,
            mask: this.label(coverage, `${poolKey}-effect-mask`, width, height, "premultiplied")
          },
          output: pool.textures[outIdx],
          params: { amount: 1 },
          dispatch: { kind: "fragment" }
        });
        settle(outIdx, maskMixV1.io.output.alpha);
      } else {
        this.stepClipEffect(effect, width, height, step, stepRecipe);
      }
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
      this.stepClipEffect(sharpen, width, height, step, stepRecipe);
    }
    if (vignetteActive && vignette) {
      this.stepClipEffect(vignette, width, height, step, stepRecipe);
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

    if (!frameEncoder) this.device.queue.submit([encoder.finish()]);
    return pool.textures[pool.currentIndex].texture;
  }

  /**
   * Encode one clip effect as its shader step, with the parameters
   * `packages/image-nodes/src/nodes/lib-image-*.ts` already settled for the
   * same modules (D7). Only the units the timeline document differs in are
   * converted here: pixel offsets become UV and control-point curves become
   * transfer samples.
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
    if (isClipDenoiseEffect(effect)) {
      if ((effect.temporalStrength ?? 0) > 0) { step(filtersDenoiseTemporalV1, {strength: effect.temporalStrength!}); }
      if ((effect.lumaStrength ?? 0) > 0 || (effect.chromaStrength ?? 0) > 0) {
        step(filtersDenoiseSpatialV1, {lumaStrength: effect.lumaStrength ?? 0, chromaStrength: effect.chromaStrength ?? 0, radius: Math.round(Math.max(1, Math.min(4, effect.radius ?? 2)))});
      }
      return;
    }
    if (isClipStabilizeEffect(effect)) {
      if (effect._matrix && !stabilizationNeutral(effect)) {
        const [a, b, x, c, e, y] = effect._matrix;
        step(transformStabilizeV1, {a, b, x, c, e, y});
      }
      return;
    }
    if (isClipDebandEffect(effect)) {
      step(filterDebandV1, {strength: effect.strength ?? 0, range: Math.round(Math.max(1, Math.min(64, effect.range ?? 16))), threshold: effect.threshold ?? 0.02, dither: effect.dither ?? 0.5});
      return;
    }
    if (isClipSecondaryColorEffect(effect)) {
      step(colorSecondaryV1, {
        hueCenter: effect.hueCenter ?? 0,
        hueWidth: effect.hueWidth ?? 180,
        hueSoftness: effect.hueSoftness ?? 15,
        rangeSoftness: effect.rangeSoftness ?? 0.1,
        saturationMin: effect.saturationMin ?? 0,
        saturationMax: effect.saturationMax ?? 1,
        lightnessMin: effect.lightnessMin ?? 0,
        lightnessMax: effect.lightnessMax ?? 1,
        hueShift: effect.hueShift ?? 0,
        saturation: effect.saturation ?? 1,
        lightness: effect.lightness ?? 0,
        table: secondaryCurveTransfer(effect).map(value => d.vec4f(...value))
      });
      return;
    }
    if (isClipExposureEffect(effect)) {
      step(colorExposureLinearV1, {exposure: effect.exposure ?? 0, rolloff: effect.rolloff ?? 0, whites: effect.whites ?? 0, blacks: effect.blacks ?? 0});
      return;
    }
    if (isClipHueSatCurvesEffect(effect)) {
      step(colorHueSatCurvesV1, {table: hueSatCurvesTransfer(effect).map(value => d.vec4f(...value))});
      return;
    }
    if (effect.type === "stylize" && typeof effect.mode === "string") {
      const index = (STYLIZE_MODES as readonly string[]).indexOf(effect.mode);
      if (index >= 0) {
        const [r, g, b] = colorChannels(typeof effect.color === "string" ? effect.color : "#ffffff");
        step(filtersVisualFxV1, {
          mode: index,
          amount: typeof effect.amount === "number" ? effect.amount : 0.5,
          scale: typeof effect.scale === "number" ? effect.scale : 8,
          angle: (typeof effect.angle === "number" ? effect.angle : 0) * Math.PI / 180,
          time: typeof effect.time === "number" ? effect.time : 0,
          seed: typeof effect.seed === "number" ? effect.seed : 0,
          softness: typeof effect.softness === "number" ? effect.softness : 0.1,
          colorA: d.vec4f(0, 0, 0, 1),
          colorB: d.vec4f(r, g, b, 1)
        });
      }
      return;
    }
    if (effect.type === "generator" && typeof effect.mode === "string") {
      const index = (GENERATOR_MODES as readonly string[]).indexOf(effect.mode);
      if (index >= 0) {
        const [ar, ag, ab] = colorChannels(typeof effect.colorA === "string" ? effect.colorA : "#101a33");
        const [br, bg, bb] = colorChannels(typeof effect.colorB === "string" ? effect.colorB : "#ffb45e");
        step(filtersVisualFxV1, {
          mode: index + STYLIZE_MODES.length,
          amount: typeof effect.amount === "number" ? effect.amount : 1,
          scale: typeof effect.scale === "number" ? effect.scale : 8,
          angle: (typeof effect.angle === "number" ? effect.angle : 0) * Math.PI / 180,
          time: typeof effect.time === "number" ? effect.time : 0,
          seed: typeof effect.seed === "number" ? effect.seed : 0,
          softness: 0.1,
          colorA: d.vec4f(ar, ag, ab, 1),
          colorB: d.vec4f(br, bg, bb, 1)
        });
      }
      return;
    }
    if (effect.type === "pixelate" && typeof effect.cellSize === "number") {
      step(filtersPixelateV1, { cellSize: effect.cellSize });
      return;
    }
    if (effect.type === "posterize" && typeof effect.levels === "number") {
      step(colorPosterizeV1, { levels: effect.levels });
      return;
    }
    if (effect.type === "directionalBlur" && typeof effect.radius === "number" && typeof effect.angle === "number") {
      const angle = (effect.angle * Math.PI) / 180;
      step(blurGaussianV1, {
        radius: effect.radius,
        sigma: Math.max(0.001, effect.radius / 3),
        direction: d.vec2f(Math.cos(angle), Math.sin(angle))
      });
      return;
    }
    if (effect.type === "lensDistortion" && typeof effect.amount === "number") {
      step(transformSpherizeV1, { amount: effect.amount });
      return;
    }
    if (isClipGlowEffect(effect)) {
      const [r, g, b] = colorChannels(effect.color ?? "#ffffff");
      stepRecipe(filtersGlowV1, {
        threshold: filtersGlowV1.paramDefaults.threshold,
        softness: filtersGlowV1.paramDefaults.softness,
        radius: effect.radius,
        intensity: effect.intensity,
        tint: d.vec3f(r, g, b)
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
      // Without a midpoint the vignette starts where `lib.image.filter.Vignette`
      // starts. A track vignette always carries one.
      step(vignetteV2, {
        intensity: effect.amount,
        radius: effect.radius ?? vignetteV2.paramDefaults.radius,
        softness: effect.softness,
        centerX: effect.centerX ?? 0.5,
        centerY: effect.centerY ?? 0.5,
        roundness: effect.roundness ?? 0
      });
      return;
    }
    if (isClipSharpenEffect(effect)) {
      const radius = Math.max(0, Math.min(256, effect.radius ?? 1));
      if (radius > 1) {
        stepRecipe(sharpenGaussianV1, {amount: effect.amount, threshold: effect.threshold ?? 0, radius});
        return;
      }
      // Preserve the historical box kernel at radius 1.
      step(sharpenUnsharpMaskV1, {
        amount: effect.amount * radius,
        threshold:
          effect.threshold ?? sharpenUnsharpMaskV1.paramDefaults.threshold
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
    if (isClipGrainEffect(effect)) {
      // `animate` is not a knob here: the scene model has already stamped the
      // frame's seed on the effect, so this only ever draws the pattern it is
      // handed. That is what keeps a render reproducible.
      step(filtersGrainV2, {
        amount: effect.amount,
        size: effect.size ?? filtersGrainV2.paramDefaults.size,
        colorAmount:
          effect.colorAmount ?? filtersGrainV2.paramDefaults.colorAmount,
        roughness: effect.roughness ?? filtersGrainV2.paramDefaults.roughness,
        softness: effect.softness ?? filtersGrainV2.paramDefaults.softness,
        seed: effect.seed ?? filtersGrainV2.paramDefaults.seed
      });
      return;
    }
    if (isClipCurvesEffect(effect)) {
      step(colorCurveTransferV1, {table: curveTransfer(effect).map(value => d.vec4f(...value))});
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
    sourceAlpha: "straight" | "premultiplied" = "straight",
    /** Record into the frame's encoder. See {@link EffectChain.process}. */
    frameEncoder?: GPUCommandEncoder
  ): GPUTexture {
    if (!frameEncoder) {
      this.ctx.uniformRing.beginSubmission();
    }
    const workingFormat = this.workingFormat === "rgba16float" && source.format === "rgba16float" ? "rgba16float" : "rgba8unorm";
    const pool = this.getPool(poolKey, width, height, workingFormat);
    const encoder =
      frameEncoder ??
      this.device.createCommandEncoder({
        label: `preview-mask-${poolKey}`
      });
    this.executor.encode({
      ctx: this.ctx,
      workingFormat,
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
      workingFormat,
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
    if (!frameEncoder) this.device.queue.submit([encoder.finish()]);
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
    sourceAlpha: "straight" | "premultiplied" = "straight",
    /** Record into the frame's encoder. See {@link EffectChain.process}. */
    frameEncoder?: GPUCommandEncoder
  ): GPUTexture {
    if (!frameEncoder) {
      this.ctx.uniformRing.beginSubmission();
    }
    const workingFormat = this.workingFormat === "rgba16float" && source.format === "rgba16float" ? "rgba16float" : "rgba8unorm";
    const pool = this.getPool(poolKey, width, height);
    const encoder =
      frameEncoder ??
      this.device.createCommandEncoder({
        label: `preview-matte-${poolKey}`
      });
    const weighted =
      mode === "luma"
        ? this.premultiplyForLuma(
            encoder,
            workingFormat === "rgba16float" ? this.getPool(`${poolKey}:luma`, width, height, workingFormat) : pool,
            source,
            poolKey,
            width,
            height,
            sourceAlpha
          )
        : this.label(source, `${poolKey}-src`, width, height, sourceAlpha);
    this.executor.encode({
      ctx: this.ctx,
      workingFormat,
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
    if (!frameEncoder) this.device.queue.submit([encoder.finish()]);
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
      workingFormat: pool.textures[1].format === "rgba16float" ? "rgba16float" : "rgba8unorm",
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
      format: texture.format,
      width,
      height,
      meta: { colorSpace: "encoded-sdr", alpha, bindingKind: "texture_2d" }
    });
  }

  private makeIntermediate(label: string, width: number, height: number, format: "rgba8unorm" | "rgba16float"): LabeledTexture {
    return createLabeledTexture(this.device, {
      label,
      width,
      height,
      format,
      usage: intermediateUsage(),
      meta: { colorSpace: "encoded-sdr", alpha: "premultiplied" }
    });
  }

  /** The effect's mask coverage in alpha (RGB = alpha, valid premultiplied), cached per effect. */
  private coverageTexture(poolKey: string, effect: ClipEffect, width: number, height: number): GPUTexture {
    const masks = effectMasksOf(effect);
    const id = `${poolKey}:${effect.id}`;
    const key = `${width}x${height}:${JSON.stringify(masks)}`;
    const cached = this.coverages.get(id);
    if (cached && cached.key === key) return cached.texture;
    cached?.texture.destroy();
    const coverage = effectMaskCoverage(masks, width, height) ?? new Float32Array(width * height).fill(1);
    const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
    const bytes = new Uint8Array(bytesPerRow * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = Math.round(Math.max(0, Math.min(1, coverage[y * width + x]!)) * 255);
        bytes.fill(v, y * bytesPerRow + x * 4, y * bytesPerRow + x * 4 + 4);
      }
    }
    const texture = this.device.createTexture({
      label: `preview-effects-${id}-mask`,
      size: [width, height],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    this.device.queue.writeTexture({ texture }, bytes, { bytesPerRow }, [width, height]);
    this.coverages.set(id, { key, texture });
    return texture;
  }

  private getPool(key: string, width: number, height: number, format: "rgba8unorm" | "rgba16float" = "rgba8unorm"): IntermediatePool {
    const existing = this.pools.get(key);
    if (existing && existing.width === width && existing.height === height && existing.textures[0].format === format) {
      return existing;
    }
    if (existing) {
      existing.textures[0].destroy();
      existing.textures[1].destroy();
      existing.saved?.destroy();
    }
    // `alpha` here is only the label a fresh, never-written texture carries.
    // Every pass re-labels its output with what that module declares it wrote,
    // so the Executor bridges against the pixels rather than the allocation.
    const make = (label: string): LabeledTexture =>
      createLabeledTexture(this.device, {
        label,
        width,
        height,
        format,
        usage: intermediateUsage(),
        meta: { colorSpace: "encoded-sdr", alpha: "premultiplied" }
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

  private getLutTexture(cube: string): CachedLut {
    const cached = this.lutTextures.get(cube);
    if (cached) return cached;
    const parsed = parseCubeLut(cube);
    const width = parsed.size * parsed.size;
    const height = parsed.size;
    const bytesPerRow = Math.ceil(width * 8 / 256) * 256;
    const halvesPerRow = bytesPerRow / Uint16Array.BYTES_PER_ELEMENT;
    const pixels = new Uint16Array(halvesPerRow * height);
    for (let b = 0; b < parsed.size; b++) {
      for (let g = 0; g < parsed.size; g++) {
        for (let r = 0; r < parsed.size; r++) {
          const source = ((b * parsed.size + g) * parsed.size + r) * 3;
          const target = g * halvesPerRow + (b * parsed.size + r) * 4;
          for (let channel = 0; channel < 3; channel++) {
            pixels[target + channel] = float16Bits(parsed.rgb[source + channel] ?? 0);
          }
          pixels[target + 3] = float16Bits(1);
        }
      }
    }
    const texture = this.device.createTexture({
      label: "timeline-cube-lut",
      size: [width, height],
      format: "rgba16float",
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING
    });
    this.device.queue.writeTexture(
      { texture }, new Uint8Array(pixels.buffer),
      { bytesPerRow, rowsPerImage: height },
      { width, height }
    );
    const labeled = new LabeledTexture(texture, {
      label: "timeline-cube-lut",
      format: "rgba16float",
      width,
      height,
      meta: { colorSpace: "data", alpha: "premultiplied", bindingKind: "texture_2d" }
    });
    const entry = { texture: labeled, parsed };
    this.lutTextures.set(cube, entry);
    return entry;
  }

  releasePool(key: string): void {
    const pool = this.pools.get(key);
    if (!pool) return;
    pool.textures[0].destroy();
    pool.textures[1].destroy();
    this.pools.delete(key);
  }

  retainOnly(keys: Iterable<string>): void {
    const keep = new Set<string>();
    for (const key of keys) {
      keep.add(key);
      keep.add(`${key}:luma`);
    }
    for (const key of [...this.pools.keys()]) {
      if (!keep.has(key)) this.releasePool(key);
    }
  }

  dispose(): void {
    for (const pool of this.pools.values()) {
      pool.textures[0].destroy();
      pool.textures[1].destroy();
      pool.saved?.destroy();
    }
    this.pools.clear();
    for (const coverage of this.coverages.values()) coverage.texture.destroy();
    this.coverages.clear();
    for (const lut of this.lutTextures.values()) lut.texture.destroy();
    this.lutTextures.clear();
    this.ctx.scratch.dispose();
    this.ctx.uniformRing.dispose();
  }
}

function accumulateColor(
  effects: readonly ClipEffect[],
  out: AggregatedColor
): void {
  for (const e of effects) {
    if (!isClipColorEffect(e)) continue;
    out.brightness += e.brightness ?? 0;
    out.contrast *= e.contrast ?? 1;
    out.saturation *= e.saturation ?? 1;
    out.hue += e.hue ?? 0;
    out.temperature += e.temperature ?? 0;
    out.tint += e.tint ?? 0;
    out.shadows += e.shadows ?? 0;
    out.highlights += e.highlights ?? 0;
  }
}

function aggregateColor(
  clipEffects: readonly ClipEffect[],
  trackEffects: readonly ClipEffect[]
): AggregatedColor {
  const out: AggregatedColor = { ...NEUTRAL_COLOR };
  accumulateColor(clipEffects, out);
  accumulateColor(trackEffects, out);
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

export function aggregateBlurRadius(
  clipEffects: readonly ClipEffect[],
  trackEffects: readonly ClipEffect[]
): number {
  const sum = (effects: readonly ClipEffect[]): number => {
    let radius = 0;
    for (const e of effects) {
      if (isClipBlurEffect(e)) radius += e.radius;
    }
    return radius;
  };
  return Math.min(256, sum(clipEffects) + sum(trackEffects));
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
    (isClipDenoiseEffect(effect) && !!(effect.lumaStrength || effect.chromaStrength || effect.temporalStrength)) ||
    (isClipStabilizeEffect(effect) && !stabilizationNeutral(effect)) ||
    (isClipDebandEffect(effect) && (effect.strength ?? 0) > 0) ||
    (isClipSecondaryColorEffect(effect) && !secondaryNeutral(effect)) ||
    (isClipHueSatCurvesEffect(effect) && !hueSatCurvesNeutral(effect)) ||
    (isClipExposureEffect(effect) && !!(effect.exposure || effect.rolloff || effect.whites || effect.blacks)) ||
    effect.type === "lut" ||
    effect.type === "stylize" ||
    effect.type === "generator" ||
    effect.type === "pixelate" ||
    effect.type === "posterize" ||
    effect.type === "directionalBlur" ||
    effect.type === "lensDistortion" ||
    isClipGlowEffect(effect) ||
    isClipDropShadowEffect(effect) ||
    isClipVignetteEffect(effect) ||
    isClipSharpenEffect(effect) ||
    isClipChromaKeyEffect(effect) ||
    isClipCurvesEffect(effect) ||
    isClipLevelsEffect(effect) ||
    isClipLiftGammaGainEffect(effect) ||
    isClipGrainEffect(effect)
  );
}

/** Enabled effect types the GPU chain cannot execute, including future types. */
export function unsupportedGpuEffectTypes(layers: readonly { effects?: ClipEffect[]; trackEffects?: TrackEffect[] }[]): string[] {
  const supported = new Set(["denoise", "stabilize", "deband", "secondaryColor", "hueSatCurves", "exposure", "color", "blur", "dropShadow", "glow", "vignette", "sharpen", "chromaKey", "curves", "levels", "liftGammaGain", "grain", "pixelate", "posterize", "directionalBlur", "lensDistortion", "stylize", "generator", "lut"]);
  const found = new Set<string>();
  for (const layer of layers) {
    for (const effect of [...layer.effects ?? [], ...trackEffectsAsClipEffects(layer.trackEffects)]) {
      if (effect.enabled && !supported.has(effect.type)) found.add(effect.type);
    }
  }
  return [...found].sort();
}
