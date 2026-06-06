/**
 * Explicit shader barrel. The registry is populated from `ALL_SHADERS` (not
 * `import.meta.glob`) so the catalog is Node-bundling-safe, grep-able, and
 * tree-shakeable. Every module added in later phases appends here.
 *
 * Recipe modules (`kind: "recipe"`) live in {@link ALL_RECIPES} so consumers
 * can filter the two kinds without instanceof checks; the union
 * {@link ALL_CATALOG} is the registry's preload set.
 */

import type { ShaderModule } from "../module.js";
import type { RecipeModule } from "../recipe.js";

import { passthroughV1 } from "./_canary/passthrough/v1/module.js";

import { colorGradeV1 } from "./color/grade/v1/module.js";
import { colorInvertV1 } from "./color/invert/v1/module.js";
import { colorBrightnessContrastV1 } from "./color/brightnessContrast/v1/module.js";
import { colorHsbV1 } from "./color/hsb/v1/module.js";
import { colorExposureV1 } from "./color/exposure/v1/module.js";
import { colorPosterizeV1 } from "./color/posterize/v1/module.js";
import { colorChannelSplitV1 } from "./color/channelSplit/v1/module.js";
import { colorChannelShuffleV1 } from "./color/channelShuffle/v1/module.js";
import { colorChannelMergeV1 } from "./color/channelMerge/v1/module.js";
import { colorGrayscaleV1 } from "./color/grayscale/v1/module.js";
import { colorSolarizeV1 } from "./color/solarize/v1/module.js";
import { colorColorBalanceV1 } from "./color/colorBalance/v1/module.js";
import { colorExposureToneV1 } from "./color/exposureTone/v1/module.js";
import { colorLiftGammaGainV1 } from "./color/liftGammaGain/v1/module.js";
import { colorCdlV1 } from "./color/cdl/v1/module.js";
import { colorCurvesV1 } from "./color/curves/v1/module.js";
import { colorHslAdjustV1 } from "./color/hslAdjust/v1/module.js";
import { colorSplitToningV1 } from "./color/splitToning/v1/module.js";
import { colorFilmLookV1 } from "./color/filmLook/v1/module.js";

import { blurGaussianV1 } from "./filters/blur/gaussian/v1/module.js";
import { sharpenUnsharpMaskV1 } from "./filters/sharpen/unsharpMask/v1/module.js";
import { vignetteV1 } from "./filters/vignette/v1/module.js";
import { filtersPixelateV1 } from "./filters/pixelate/v1/module.js";
import { filtersThresholdV1 } from "./filters/threshold/v1/module.js";
import { filtersConvolve3x3V1 } from "./filters/convolve3x3/v1/module.js";
import { filtersGlowV1 } from "./filters/glow/v1/module.js";
import { filtersBlurSeparableV1 } from "./filters/blur/separable/v1/module.js";

import { chromaKeyV1 } from "./keyer/chromaKey/v1/module.js";
import { keyerLumaKeyV1 } from "./keyer/lumaKey/v1/module.js";

import { maskApplyV1 } from "./mask/apply/v1/module.js";
import { maskFromImageV1 } from "./mask/fromImage/v1/module.js";
import { maskInvertV1 } from "./mask/invert/v1/module.js";

import { sourcesSolidV1 } from "./sources/solid/v1/module.js";
import { sourcesLinearGradientV1 } from "./sources/linearGradient/v1/module.js";
import { sourcesCheckerboardV1 } from "./sources/checkerboard/v1/module.js";
import { sourcesRadialGradientV1 } from "./sources/radialGradient/v1/module.js";
import { sourcesAngularGradientV1 } from "./sources/angularGradient/v1/module.js";
import { sourcesDiamondGradientV1 } from "./sources/diamondGradient/v1/module.js";

import { mixerAddV1 } from "./mixer/add/v1/module.js";
import { mixerColorOverlayV1 } from "./mixer/colorOverlay/v1/module.js";
import { mixerOutlineV1 } from "./mixer/outline/v1/module.js";
import { mixerShadowComposeV1 } from "./mixer/shadowCompose/v1/module.js";
import { mixerDropShadowV1 } from "./mixer/dropShadow/v1/module.js";

import { transformMirrorV1 } from "./transform/mirror/v1/module.js";
import { transformOffsetV1 } from "./transform/offset/v1/module.js";
import { transformCropV1 } from "./transform/crop/v1/module.js";
import { transformPadV1 } from "./transform/pad/v1/module.js";
import { transformTileV1 } from "./transform/tile/v1/module.js";
import { transformResizeV1 } from "./transform/resize/v1/module.js";
import { transformRotate90V1 } from "./transform/rotate90/v1/module.js";
import { transformAffineV1 } from "./transform/affine/v1/module.js";
import { transformCornerPinV1 } from "./transform/cornerPin/v1/module.js";
import { transformPolarRemapV1 } from "./transform/polarRemap/v1/module.js";
import { transformDisplaceV1 } from "./transform/displace/v1/module.js";
import { transformSpherizeV1 } from "./transform/spherize/v1/module.js";

import { alphaStraightToPremulV1 } from "./alpha/straightToPremul/v1/module.js";
import { alphaPremulToStraightV1 } from "./alpha/premulToStraight/v1/module.js";

export {
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
};

/**
 * Every shader-style module (fragment + compute) registered by default.
 * Recipes live in {@link ALL_RECIPES}.
 */
export const ALL_SHADERS: readonly ShaderModule[] = [
  passthroughV1,
  // color
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
  // filters
  blurGaussianV1,
  sharpenUnsharpMaskV1,
  vignetteV1,
  filtersPixelateV1,
  filtersThresholdV1,
  filtersConvolve3x3V1,
  // keyer
  chromaKeyV1,
  keyerLumaKeyV1,
  // mask
  maskApplyV1,
  maskFromImageV1,
  maskInvertV1,
  // sources
  sourcesSolidV1,
  sourcesLinearGradientV1,
  sourcesCheckerboardV1,
  sourcesRadialGradientV1,
  sourcesAngularGradientV1,
  sourcesDiamondGradientV1,
  // mixer
  mixerAddV1,
  mixerColorOverlayV1,
  mixerOutlineV1,
  mixerShadowComposeV1,
  // transform
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
  // alpha
  alphaStraightToPremulV1,
  alphaPremulToStraightV1
];

/** Every recipe module registered by default. */
export const ALL_RECIPES: readonly RecipeModule[] = [
  filtersGlowV1,
  filtersBlurSeparableV1,
  mixerDropShadowV1
];

/** Both kinds, in catalog order. The registry's preload set. */
export const ALL_CATALOG: readonly (ShaderModule | RecipeModule)[] = [
  ...ALL_SHADERS,
  ...ALL_RECIPES
];
