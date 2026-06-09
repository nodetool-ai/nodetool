/**
 * @nodetool-ai/gpu/pool — TypeGPU-backed shader pool (Phase 1+).
 *
 * The shared GPU operation catalog with a tiny runtime: `ShaderModule`
 * (WGSL + typed bind group layout + typed uniform schema + sampler config +
 * I/O contract), `LabeledTexture`, the `GPUContext` adapter, the registry,
 * and the small `Executor`. From Phase 3 the catalog also exports
 * `RecipeModule` + `RecipeRunner` for multi-pass operations. All TypeGPU-backed.
 *
 * Kept out of the package's pure root so that Node consumers of the blend
 * catalog don't pull in TypeGPU. This entry is device-agnostic — the same
 * module code runs against browser, Electron, and Node.js Dawn devices. The
 * `navigator.gpu` adapter (`createBrowserGPUContext`) lives behind `./webgpu`.
 */

export * from "./types.js";
export * from "./module.js";
export * from "./texture.js";
export * from "./registry.js";
export * from "./executor.js";
export * from "./recipe.js";
export * from "./fullscreenQuad.js";
export {
  consumePremulDebugWarnings,
  isPremulDebugEnabled,
  setPremulDebugEnabled,
  resetPremulDebugCache
} from "./debug/premulValidator.js";
export type {
  DebugViolation,
  DebugReadback,
  DebugSink,
  EncodeValidationArgs
} from "./debug/premulValidator.js";
export {
  ceilToBucket,
  makeScratchPool,
  makeUniformRing,
  createGPUContextFromDevice
} from "./context.js";
export type {
  GPUContext,
  GPUCapabilities,
  PipelineCache,
  CachedPipeline,
  ScratchPool,
  ScratchSpec,
  UniformRing
} from "./context.js";
export {
  ALL_SHADERS,
  ALL_RECIPES,
  ALL_CATALOG,
  passthroughV1,
  colorGradeV1,
  colorInvertV1,
  colorBrightnessContrastV1,
  colorHsbV1,
  colorExposureV1,
  colorPosterizeV1,
  colorChannelSplitV1,
  colorChannelShuffleV1,
  colorChannelMergeV1,
  colorGrayscaleV1,
  colorSolarizeV1,
  colorColorBalanceV1,
  colorExposureToneV1,
  colorLiftGammaGainV1,
  colorCdlV1,
  colorCurvesV1,
  colorHslAdjustV1,
  colorSplitToningV1,
  colorFilmLookV1,
  blurGaussianV1,
  sharpenUnsharpMaskV1,
  vignetteV1,
  filtersPixelateV1,
  filtersThresholdV1,
  filtersConvolve3x3V1,
  filtersGlowV1,
  filtersBlurSeparableV1,
  chromaKeyV1,
  keyerLumaKeyV1,
  maskApplyV1,
  maskFromImageV1,
  maskInvertV1,
  sourcesSolidV1,
  sourcesLinearGradientV1,
  sourcesCheckerboardV1,
  sourcesRadialGradientV1,
  sourcesAngularGradientV1,
  sourcesDiamondGradientV1,
  mixerAddV1,
  mixerColorOverlayV1,
  mixerOutlineV1,
  mixerShadowComposeV1,
  mixerDropShadowV1,
  transformMirrorV1,
  transformOffsetV1,
  transformCropV1,
  transformPadV1,
  transformTileV1,
  transformResizeV1,
  transformRotate90V1,
  transformAffineV1,
  transformCornerPinV1,
  transformPolarRemapV1,
  transformDisplaceV1,
  transformSpherizeV1,
  alphaStraightToPremulV1,
  alphaPremulToStraightV1
} from "./shaders/index.js";

import { ShaderRegistry } from "./registry.js";
import { ALL_CATALOG } from "./shaders/index.js";

/** A {@link ShaderRegistry} preloaded with every catalog module (shaders + recipes). */
export function createDefaultRegistry(): ShaderRegistry {
  const registry = new ShaderRegistry();
  registry.registerAll(ALL_CATALOG);
  return registry;
}
