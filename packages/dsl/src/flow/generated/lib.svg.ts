// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Rectangle — lib.svg.Rect
export type RectInputs = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: unknown;
  stroke?: unknown;
  stroke_width?: number;
};

export interface RectOutputs {
  output: unknown;
}

export function rect(inputs: RectInputs): Promise<RectOutputs> {
  return callNode<RectOutputs>("lib.svg.Rect", inputs);
}

// Circle — lib.svg.Circle
export type CircleInputs = {
  cx?: number;
  cy?: number;
  radius?: number;
  fill?: unknown;
  stroke?: unknown;
  stroke_width?: number;
};

export interface CircleOutputs {
  output: unknown;
}

export function circle(inputs: CircleInputs): Promise<CircleOutputs> {
  return callNode<CircleOutputs>("lib.svg.Circle", inputs);
}

// Ellipse — lib.svg.Ellipse
export type EllipseInputs = {
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  fill?: unknown;
  stroke?: unknown;
  stroke_width?: number;
};

export interface EllipseOutputs {
  output: unknown;
}

export function ellipse(inputs: EllipseInputs): Promise<EllipseOutputs> {
  return callNode<EllipseOutputs>("lib.svg.Ellipse", inputs);
}

// Line — lib.svg.Line
export type LineInputs = {
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  stroke?: unknown;
  stroke_width?: number;
};

export interface LineOutputs {
  output: unknown;
}

export function line(inputs: LineInputs): Promise<LineOutputs> {
  return callNode<LineOutputs>("lib.svg.Line", inputs);
}

// Polygon — lib.svg.Polygon
export type PolygonInputs = {
  points?: string;
  fill?: unknown;
  stroke?: unknown;
  stroke_width?: number;
};

export interface PolygonOutputs {
  output: unknown;
}

export function polygon(inputs: PolygonInputs): Promise<PolygonOutputs> {
  return callNode<PolygonOutputs>("lib.svg.Polygon", inputs);
}

// Path — lib.svg.Path
export type PathInputs = {
  path_data?: string;
  fill?: unknown;
  stroke?: unknown;
  stroke_width?: number;
};

export interface PathOutputs {
  output: unknown;
}

export function path(inputs: PathInputs): Promise<PathOutputs> {
  return callNode<PathOutputs>("lib.svg.Path", inputs);
}

// Text — lib.svg.Text
export type TextInputs = {
  text?: string;
  x?: number;
  y?: number;
  font_family?: string;
  font_size?: number;
  fill?: unknown;
  text_anchor?: "start" | "middle" | "end";
};

export interface TextOutputs {
  output: unknown;
}

export function text(inputs: TextInputs): Promise<TextOutputs> {
  return callNode<TextOutputs>("lib.svg.Text", inputs);
}

// Gaussian Blur — lib.svg.GaussianBlur
export type GaussianBlurInputs = {
  std_deviation?: number;
};

export interface GaussianBlurOutputs {
  output: unknown;
}

export function gaussianBlur(inputs: GaussianBlurInputs): Promise<GaussianBlurOutputs> {
  return callNode<GaussianBlurOutputs>("lib.svg.GaussianBlur", inputs);
}

// Drop Shadow — lib.svg.DropShadow
export type DropShadowInputs = {
  std_deviation?: number;
  dx?: number;
  dy?: number;
  color?: unknown;
};

export interface DropShadowOutputs {
  output: unknown;
}

export function dropShadow(inputs: DropShadowInputs): Promise<DropShadowOutputs> {
  return callNode<DropShadowOutputs>("lib.svg.DropShadow", inputs);
}

// SVG Document — lib.svg.Document
export type DocumentInputs = {
  elements?: unknown[];
  width?: number;
  height?: number;
  viewBox?: string;
};

export interface DocumentOutputs {
  output: unknown;
}

export function document(inputs: DocumentInputs): Promise<DocumentOutputs> {
  return callNode<DocumentOutputs>("lib.svg.Document", inputs);
}

// SVG to Image — lib.svg.SVGToImage
export type SVGToImageInputs = {
  elements?: unknown[];
  width?: number;
  height?: number;
  viewBox?: string;
  scale?: number;
};

export interface SVGToImageOutputs {
  output: ImageRef;
}

export function svgToImage(inputs: SVGToImageInputs): Promise<SVGToImageOutputs> {
  return callNode<SVGToImageOutputs>("lib.svg.SVGToImage", inputs);
}

// Gradient — lib.svg.Gradient
export type GradientInputs = {
  gradient_type?: "linearGradient" | "radialGradient";
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  color1?: unknown;
  color2?: unknown;
};

export interface GradientOutputs {
  output: unknown;
}

export function gradient(inputs: GradientInputs): Promise<GradientOutputs> {
  return callNode<GradientOutputs>("lib.svg.Gradient", inputs);
}

// Transform — lib.svg.Transform
export type TransformInputs = {
  content?: unknown;
  translate_x?: number;
  translate_y?: number;
  rotate?: number;
  scale_x?: number;
  scale_y?: number;
};

export interface TransformOutputs {
  output: unknown;
}

export function transform(inputs: TransformInputs): Promise<TransformOutputs> {
  return callNode<TransformOutputs>("lib.svg.Transform", inputs);
}

// Clip Path — lib.svg.ClipPath
export type ClipPathInputs = {
  clip_content?: unknown;
  content?: unknown;
};

export interface ClipPathOutputs {
  output: unknown;
}

export function clipPath(inputs: ClipPathInputs): Promise<ClipPathOutputs> {
  return callNode<ClipPathOutputs>("lib.svg.ClipPath", inputs);
}
