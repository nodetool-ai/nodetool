// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
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

export interface RectOutputs {
  output: unknown;
}

export function rect(inputs: RectInputs): DslNode<RectOutputs, "output"> {
  return createNode("lib.svg.Rect", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
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

export interface CircleOutputs {
  output: unknown;
}

export function circle(inputs: CircleInputs): DslNode<CircleOutputs, "output"> {
  return createNode("lib.svg.Circle", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
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

export interface EllipseOutputs {
  output: unknown;
}

export function ellipse(
  inputs: EllipseInputs
): DslNode<EllipseOutputs, "output"> {
  return createNode("lib.svg.Ellipse", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
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

export interface LineOutputs {
  output: unknown;
}

export function line(inputs: LineInputs): DslNode<LineOutputs, "output"> {
  return createNode("lib.svg.Line", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Polygon — lib.svg.Polygon
export interface PolygonInputs {
  points?: Connectable<string>;
  fill?: Connectable<unknown>;
  stroke?: Connectable<unknown>;
  stroke_width?: Connectable<number>;
}

export interface PolygonOutputs {
  output: unknown;
}

export function polygon(
  inputs: PolygonInputs
): DslNode<PolygonOutputs, "output"> {
  return createNode("lib.svg.Polygon", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Path — lib.svg.Path
export interface PathInputs {
  path_data?: Connectable<string>;
  fill?: Connectable<unknown>;
  stroke?: Connectable<unknown>;
  stroke_width?: Connectable<number>;
}

export interface PathOutputs {
  output: unknown;
}

export function path(inputs: PathInputs): DslNode<PathOutputs, "output"> {
  return createNode("lib.svg.Path", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
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

export interface TextOutputs {
  output: unknown;
}

export function text(inputs: TextInputs): DslNode<TextOutputs, "output"> {
  return createNode("lib.svg.Text", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Gaussian Blur — lib.svg.GaussianBlur
export interface GaussianBlurInputs {
  std_deviation?: Connectable<number>;
}

export interface GaussianBlurOutputs {
  output: unknown;
}

export function gaussianBlur(
  inputs: GaussianBlurInputs
): DslNode<GaussianBlurOutputs, "output"> {
  return createNode("lib.svg.GaussianBlur", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Drop Shadow — lib.svg.DropShadow
export interface DropShadowInputs {
  std_deviation?: Connectable<number>;
  dx?: Connectable<number>;
  dy?: Connectable<number>;
  color?: Connectable<unknown>;
}

export interface DropShadowOutputs {
  output: unknown;
}

export function dropShadow(
  inputs: DropShadowInputs
): DslNode<DropShadowOutputs, "output"> {
  return createNode("lib.svg.DropShadow", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// SVG Document — lib.svg.Document
export interface DocumentInputs {
  content?: Connectable<string | unknown | unknown[]>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  viewBox?: Connectable<string>;
}

export interface DocumentOutputs {
  output: unknown;
}

export function document(
  inputs: DocumentInputs
): DslNode<DocumentOutputs, "output"> {
  return createNode("lib.svg.Document", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// SVG to Image — lib.svg.SVGToImage
export interface SVGToImageInputs {
  content?: Connectable<string | unknown | unknown[]>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  viewBox?: Connectable<string>;
  scale?: Connectable<number>;
}

export interface SVGToImageOutputs {
  output: ImageRef;
}

export function svgToImage(
  inputs: SVGToImageInputs
): DslNode<SVGToImageOutputs, "output"> {
  return createNode("lib.svg.SVGToImage", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
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

export interface GradientOutputs {
  output: unknown;
}

export function gradient(
  inputs: GradientInputs
): DslNode<GradientOutputs, "output"> {
  return createNode("lib.svg.Gradient", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
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

export interface TransformOutputs {
  output: unknown;
}

export function transform(
  inputs: TransformInputs
): DslNode<TransformOutputs, "output"> {
  return createNode("lib.svg.Transform", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Clip Path — lib.svg.ClipPath
export interface ClipPathInputs {
  clip_content?: Connectable<unknown>;
  content?: Connectable<unknown>;
}

export interface ClipPathOutputs {
  output: unknown;
}

export function clipPath(
  inputs: ClipPathInputs
): DslNode<ClipPathOutputs, "output"> {
  return createNode("lib.svg.ClipPath", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}
