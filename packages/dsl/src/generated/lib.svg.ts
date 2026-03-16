// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef } from "../types.js";

// Rectangle — lib.svg.Rect
export interface RectInputs {
  x?: Connectable<number>;
  y?: Connectable<number>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  fill?: Connectable<unknown>;
  stroke?: Connectable<unknown>;
  stroke_width?: Connectable<number>;
}

export function rect(inputs: RectInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.svg.Rect", inputs as Record<string, unknown>);
}

// Circle — lib.svg.Circle
export interface CircleInputs {
  cx?: Connectable<number>;
  cy?: Connectable<number>;
  radius?: Connectable<number>;
  fill?: Connectable<unknown>;
  stroke?: Connectable<unknown>;
  stroke_width?: Connectable<number>;
}

export function circle(inputs: CircleInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.svg.Circle", inputs as Record<string, unknown>);
}

// Ellipse — lib.svg.Ellipse
export interface EllipseInputs {
  cx?: Connectable<number>;
  cy?: Connectable<number>;
  rx?: Connectable<number>;
  ry?: Connectable<number>;
  fill?: Connectable<unknown>;
  stroke?: Connectable<unknown>;
  stroke_width?: Connectable<number>;
}

export function ellipse(inputs: EllipseInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.svg.Ellipse", inputs as Record<string, unknown>);
}

// Line — lib.svg.Line
export interface LineInputs {
  x1?: Connectable<number>;
  y1?: Connectable<number>;
  x2?: Connectable<number>;
  y2?: Connectable<number>;
  stroke?: Connectable<unknown>;
  stroke_width?: Connectable<number>;
}

export function line(inputs: LineInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.svg.Line", inputs as Record<string, unknown>);
}

// Polygon — lib.svg.Polygon
export interface PolygonInputs {
  points?: Connectable<string>;
  fill?: Connectable<unknown>;
  stroke?: Connectable<unknown>;
  stroke_width?: Connectable<number>;
}

export function polygon(inputs: PolygonInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.svg.Polygon", inputs as Record<string, unknown>);
}

// Path — lib.svg.Path
export interface PathInputs {
  path_data?: Connectable<string>;
  fill?: Connectable<unknown>;
  stroke?: Connectable<unknown>;
  stroke_width?: Connectable<number>;
}

export function path(inputs: PathInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.svg.Path", inputs as Record<string, unknown>);
}

// Text — lib.svg.Text
export interface TextInputs {
  text?: Connectable<string>;
  x?: Connectable<number>;
  y?: Connectable<number>;
  font_family?: Connectable<string>;
  font_size?: Connectable<number>;
  fill?: Connectable<unknown>;
  text_anchor?: Connectable<unknown>;
}

export function text(inputs: TextInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.svg.Text", inputs as Record<string, unknown>);
}

// Gaussian Blur — lib.svg.GaussianBlur
export interface GaussianBlurInputs {
  std_deviation?: Connectable<number>;
}

export function gaussianBlur(inputs: GaussianBlurInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.svg.GaussianBlur", inputs as Record<string, unknown>);
}

// Drop Shadow — lib.svg.DropShadow
export interface DropShadowInputs {
  std_deviation?: Connectable<number>;
  dx?: Connectable<number>;
  dy?: Connectable<number>;
  color?: Connectable<unknown>;
}

export function dropShadow(inputs: DropShadowInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.svg.DropShadow", inputs as Record<string, unknown>);
}

// SVG Document — lib.svg.Document
export interface DocumentInputs {
  content?: Connectable<string | unknown | unknown[]>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  viewBox?: Connectable<string>;
}

export function document(inputs: DocumentInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.svg.Document", inputs as Record<string, unknown>);
}

// SVG to Image — lib.svg.SVGToImage
export interface SVGToImageInputs {
  content?: Connectable<string | unknown | unknown[]>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  viewBox?: Connectable<string>;
  scale?: Connectable<number>;
}

export function svgToImage(inputs: SVGToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.svg.SVGToImage", inputs as Record<string, unknown>);
}

// Gradient — lib.svg.Gradient
export interface GradientInputs {
  gradient_type?: Connectable<unknown>;
  x1?: Connectable<number>;
  y1?: Connectable<number>;
  x2?: Connectable<number>;
  y2?: Connectable<number>;
  color1?: Connectable<unknown>;
  color2?: Connectable<unknown>;
}

export function gradient(inputs: GradientInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.svg.Gradient", inputs as Record<string, unknown>);
}

// Transform — lib.svg.Transform
export interface TransformInputs {
  content?: Connectable<unknown>;
  translate_x?: Connectable<number>;
  translate_y?: Connectable<number>;
  rotate?: Connectable<number>;
  scale_x?: Connectable<number>;
  scale_y?: Connectable<number>;
}

export function transform(inputs: TransformInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.svg.Transform", inputs as Record<string, unknown>);
}

// Clip Path — lib.svg.ClipPath
export interface ClipPathInputs {
  clip_content?: Connectable<unknown>;
  content?: Connectable<unknown>;
}

export function clipPath(inputs: ClipPathInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.svg.ClipPath", inputs as Record<string, unknown>);
}
