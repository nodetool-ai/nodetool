// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// CDL — lib.image.color_grading.CDL
export interface CDLInputs {
  image?: Connectable<ImageRef>;
  slope_r?: Connectable<number>;
  slope_g?: Connectable<number>;
  slope_b?: Connectable<number>;
  offset_r?: Connectable<number>;
  offset_g?: Connectable<number>;
  offset_b?: Connectable<number>;
  power_r?: Connectable<number>;
  power_g?: Connectable<number>;
  power_b?: Connectable<number>;
  saturation?: Connectable<number>;
}

export interface CDLOutputs {
  output: ImageRef;
}

export function cdl(inputs: CDLInputs): DslNode<CDLOutputs, "output"> {
  return createNode(
    "lib.image.color_grading.CDL",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Color Balance — lib.image.color_grading.ColorBalance
export interface ColorBalanceInputs {
  image?: Connectable<ImageRef>;
  temperature?: Connectable<number>;
  tint?: Connectable<number>;
}

export interface ColorBalanceOutputs {
  output: ImageRef;
}

export function colorBalance(
  inputs: ColorBalanceInputs
): DslNode<ColorBalanceOutputs, "output"> {
  return createNode(
    "lib.image.color_grading.ColorBalance",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Curves — lib.image.color_grading.Curves
export interface CurvesInputs {
  image?: Connectable<ImageRef>;
  black_point?: Connectable<number>;
  white_point?: Connectable<number>;
  shadows?: Connectable<number>;
  midtones?: Connectable<number>;
  highlights?: Connectable<number>;
  red_midtones?: Connectable<number>;
  green_midtones?: Connectable<number>;
  blue_midtones?: Connectable<number>;
}

export interface CurvesOutputs {
  output: ImageRef;
}

export function curves(inputs: CurvesInputs): DslNode<CurvesOutputs, "output"> {
  return createNode(
    "lib.image.color_grading.Curves",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Exposure — lib.image.color_grading.Exposure
export interface ExposureInputs {
  image?: Connectable<ImageRef>;
  exposure?: Connectable<number>;
  contrast?: Connectable<number>;
  highlights?: Connectable<number>;
  shadows?: Connectable<number>;
  whites?: Connectable<number>;
  blacks?: Connectable<number>;
}

export interface ExposureOutputs {
  output: ImageRef;
}

export function exposure(
  inputs: ExposureInputs
): DslNode<ExposureOutputs, "output"> {
  return createNode(
    "lib.image.color_grading.Exposure",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Film Look — lib.image.color_grading.FilmLook
export interface FilmLookInputs {
  image?: Connectable<ImageRef>;
  preset?: Connectable<unknown>;
  intensity?: Connectable<number>;
}

export interface FilmLookOutputs {
  output: ImageRef;
}

export function filmLook(
  inputs: FilmLookInputs
): DslNode<FilmLookOutputs, "output"> {
  return createNode(
    "lib.image.color_grading.FilmLook",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// HSLAdjust — lib.image.color_grading.HSLAdjust
export interface HSLAdjustInputs {
  image?: Connectable<ImageRef>;
  color_range?: Connectable<unknown>;
  hue_shift?: Connectable<number>;
  saturation?: Connectable<number>;
  luminance?: Connectable<number>;
}

export interface HSLAdjustOutputs {
  output: ImageRef;
}

export function hslAdjust(
  inputs: HSLAdjustInputs
): DslNode<HSLAdjustOutputs, "output"> {
  return createNode(
    "lib.image.color_grading.HSLAdjust",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Lift Gamma Gain — lib.image.color_grading.LiftGammaGain
export interface LiftGammaGainInputs {
  image?: Connectable<ImageRef>;
  lift_r?: Connectable<number>;
  lift_g?: Connectable<number>;
  lift_b?: Connectable<number>;
  lift_master?: Connectable<number>;
  gamma_r?: Connectable<number>;
  gamma_g?: Connectable<number>;
  gamma_b?: Connectable<number>;
  gamma_master?: Connectable<number>;
  gain_r?: Connectable<number>;
  gain_g?: Connectable<number>;
  gain_b?: Connectable<number>;
  gain_master?: Connectable<number>;
}

export interface LiftGammaGainOutputs {
  output: ImageRef;
}

export function liftGammaGain(
  inputs: LiftGammaGainInputs
): DslNode<LiftGammaGainOutputs, "output"> {
  return createNode(
    "lib.image.color_grading.LiftGammaGain",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Saturation Vibrance — lib.image.color_grading.SaturationVibrance
export interface SaturationVibranceInputs {
  image?: Connectable<ImageRef>;
  saturation?: Connectable<number>;
  vibrance?: Connectable<number>;
}

export interface SaturationVibranceOutputs {
  output: ImageRef;
}

export function saturationVibrance(
  inputs: SaturationVibranceInputs
): DslNode<SaturationVibranceOutputs, "output"> {
  return createNode(
    "lib.image.color_grading.SaturationVibrance",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Split Toning — lib.image.color_grading.SplitToning
export interface SplitToningInputs {
  image?: Connectable<ImageRef>;
  shadow_hue?: Connectable<number>;
  shadow_saturation?: Connectable<number>;
  highlight_hue?: Connectable<number>;
  highlight_saturation?: Connectable<number>;
  balance?: Connectable<number>;
}

export interface SplitToningOutputs {
  output: ImageRef;
}

export function splitToning(
  inputs: SplitToningInputs
): DslNode<SplitToningOutputs, "output"> {
  return createNode(
    "lib.image.color_grading.SplitToning",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Vignette — lib.image.color_grading.Vignette
export interface VignetteInputs {
  image?: Connectable<ImageRef>;
  amount?: Connectable<number>;
  midpoint?: Connectable<number>;
  roundness?: Connectable<number>;
  feather?: Connectable<number>;
}

export interface VignetteOutputs {
  output: ImageRef;
}

export function vignette(
  inputs: VignetteInputs
): DslNode<VignetteOutputs, "output"> {
  return createNode(
    "lib.image.color_grading.Vignette",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
