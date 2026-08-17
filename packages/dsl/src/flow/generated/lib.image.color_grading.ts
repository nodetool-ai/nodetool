// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// CDL — lib.image.color_grading.CDL
export type CDLInputs = {
  image?: ImageRef;
  slope_r?: number;
  slope_g?: number;
  slope_b?: number;
  offset_r?: number;
  offset_g?: number;
  offset_b?: number;
  power_r?: number;
  power_g?: number;
  power_b?: number;
  saturation?: number;
};

export interface CDLOutputs {
  output: ImageRef;
}

export function cdl(inputs: CDLInputs): Promise<CDLOutputs> {
  return callNode<CDLOutputs>("lib.image.color_grading.CDL", inputs);
}

// Color Balance — lib.image.color_grading.ColorBalance
export type ColorBalanceInputs = {
  image?: ImageRef;
  temperature?: number;
  tint?: number;
};

export interface ColorBalanceOutputs {
  output: ImageRef;
}

export function colorBalance(inputs: ColorBalanceInputs): Promise<ColorBalanceOutputs> {
  return callNode<ColorBalanceOutputs>("lib.image.color_grading.ColorBalance", inputs);
}

// Curves — lib.image.color_grading.Curves
export type CurvesInputs = {
  image?: ImageRef;
  black_point?: number;
  white_point?: number;
  shadows?: number;
  midtones?: number;
  highlights?: number;
  red_midtones?: number;
  green_midtones?: number;
  blue_midtones?: number;
};

export interface CurvesOutputs {
  output: ImageRef;
}

export function curves(inputs: CurvesInputs): Promise<CurvesOutputs> {
  return callNode<CurvesOutputs>("lib.image.color_grading.Curves", inputs);
}

// Exposure — lib.image.color_grading.Exposure
export type ExposureInputs = {
  image?: ImageRef;
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  whites?: number;
  blacks?: number;
};

export interface ExposureOutputs {
  output: ImageRef;
}

export function exposure(inputs: ExposureInputs): Promise<ExposureOutputs> {
  return callNode<ExposureOutputs>("lib.image.color_grading.Exposure", inputs);
}

// Film Look — lib.image.color_grading.FilmLook
export type FilmLookInputs = {
  image?: ImageRef;
  preset?: "teal_orange" | "blockbuster" | "noir" | "vintage" | "cold_blue" | "warm_sunset" | "matrix" | "bleach_bypass" | "cross_process" | "faded_film";
  intensity?: number;
};

export interface FilmLookOutputs {
  output: ImageRef;
}

export function filmLook(inputs: FilmLookInputs): Promise<FilmLookOutputs> {
  return callNode<FilmLookOutputs>("lib.image.color_grading.FilmLook", inputs);
}

// HSLAdjust — lib.image.color_grading.HSLAdjust
export type HSLAdjustInputs = {
  image?: ImageRef;
  color_range?: "all" | "reds" | "oranges" | "yellows" | "greens" | "cyans" | "blues" | "purples" | "magentas";
  hue_shift?: number;
  saturation?: number;
  luminance?: number;
};

export interface HSLAdjustOutputs {
  output: ImageRef;
}

export function hslAdjust(inputs: HSLAdjustInputs): Promise<HSLAdjustOutputs> {
  return callNode<HSLAdjustOutputs>("lib.image.color_grading.HSLAdjust", inputs);
}

// Lift Gamma Gain — lib.image.color_grading.LiftGammaGain
export type LiftGammaGainInputs = {
  image?: ImageRef;
  lift_r?: number;
  lift_g?: number;
  lift_b?: number;
  lift_master?: number;
  gamma_r?: number;
  gamma_g?: number;
  gamma_b?: number;
  gamma_master?: number;
  gain_r?: number;
  gain_g?: number;
  gain_b?: number;
  gain_master?: number;
};

export interface LiftGammaGainOutputs {
  output: ImageRef;
}

export function liftGammaGain(inputs: LiftGammaGainInputs): Promise<LiftGammaGainOutputs> {
  return callNode<LiftGammaGainOutputs>("lib.image.color_grading.LiftGammaGain", inputs);
}

// Saturation Vibrance — lib.image.color_grading.SaturationVibrance
export type SaturationVibranceInputs = {
  image?: ImageRef;
  saturation?: number;
  vibrance?: number;
};

export interface SaturationVibranceOutputs {
  output: ImageRef;
}

export function saturationVibrance(inputs: SaturationVibranceInputs): Promise<SaturationVibranceOutputs> {
  return callNode<SaturationVibranceOutputs>("lib.image.color_grading.SaturationVibrance", inputs);
}

// Split Toning — lib.image.color_grading.SplitToning
export type SplitToningInputs = {
  image?: ImageRef;
  shadow_hue?: number;
  shadow_saturation?: number;
  highlight_hue?: number;
  highlight_saturation?: number;
  balance?: number;
};

export interface SplitToningOutputs {
  output: ImageRef;
}

export function splitToning(inputs: SplitToningInputs): Promise<SplitToningOutputs> {
  return callNode<SplitToningOutputs>("lib.image.color_grading.SplitToning", inputs);
}

// Vignette — lib.image.color_grading.Vignette
export type VignetteInputs = {
  image?: ImageRef;
  amount?: number;
  midpoint?: number;
  feather?: number;
};

export interface VignetteOutputs {
  output: ImageRef;
}

export function vignette(inputs: VignetteInputs): Promise<VignetteOutputs> {
  return callNode<VignetteOutputs>("lib.image.color_grading.Vignette", inputs);
}
