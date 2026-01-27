/**
 * Type definitions for LLM Canvas Design Tools
 * These types define the parameters and return values for canvas operations
 */

import { JsonSchema } from "../../frontendTools";
import { 
  LayoutCanvasData, 
  LayoutElement, 
  ElementType,
  ShadowEffect,
  Fill
} from "../../../../components/design/types";

// =============================================================================
// Common Parameter Types
// =============================================================================

/** Position on the canvas */
export interface Position {
  x: number;
  y: number;
}

/** Size dimensions */
export interface Size {
  width: number;
  height: number;
}

/** Rectangle bounds (position + size) */
export interface Bounds extends Position, Size {}

/** Style properties that can be applied to elements */
export interface StyleProperties {
  fill?: string;           // Solid fill color (#RRGGBB or rgba())
  fillGradient?: Fill;     // Gradient fill (overrides fill)
  stroke?: string;         // Stroke/border color
  strokeWidth?: number;    // Stroke width in pixels
  opacity?: number;        // 0-1 opacity
  shadow?: ShadowEffect;   // Drop shadow
  borderRadius?: number;   // Corner radius (rectangles)
}

/** Text-specific style properties */
export interface TextStyleProperties extends StyleProperties {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900";
  alignment?: "left" | "center" | "right";
  verticalAlignment?: "top" | "middle" | "bottom";
  lineHeight?: number;
  letterSpacing?: number;
  textDecoration?: "none" | "underline" | "strikethrough";
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
}

/** Alignment direction */
export type AlignmentDirection = "left" | "center" | "right" | "top" | "middle" | "bottom";

/** Distribution direction */
export type DistributeDirection = "horizontal" | "vertical";

// =============================================================================
// Tool Return Types
// =============================================================================

/** Standard success response */
export interface ToolSuccessResponse {
  ok: true;
  message: string;
}

/** Response with created element */
export interface CreateElementResponse extends ToolSuccessResponse {
  element: {
    id: string;
    type: ElementType;
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
  };
}

/** Response with multiple elements */
export interface MultiElementResponse extends ToolSuccessResponse {
  elements: Array<{
    id: string;
    type: ElementType;
    name: string;
  }>;
  count: number;
}

/** Response with canvas state */
export interface CanvasStateResponse extends ToolSuccessResponse {
  canvas: {
    width: number;
    height: number;
    backgroundColor: string;
    elementCount: number;
  };
  elements: Array<{
    id: string;
    type: ElementType;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
    locked: boolean;
  }>;
}

/** Response with single element details */
export interface ElementDetailResponse extends ToolSuccessResponse {
  element: LayoutElement;
}

/** Export response */
export interface ExportResponse extends ToolSuccessResponse {
  format: "json" | "sketch";
  data?: LayoutCanvasData;
  downloadInitiated?: boolean;
}

// =============================================================================
// JSON Schemas for Tool Parameters
// =============================================================================

export const positionSchema: JsonSchema = {
  type: "object",
  properties: {
    x: { type: "number", description: "X coordinate in pixels" },
    y: { type: "number", description: "Y coordinate in pixels" }
  },
  required: ["x", "y"]
};

export const sizeSchema: JsonSchema = {
  type: "object",
  properties: {
    width: { type: "number", description: "Width in pixels" },
    height: { type: "number", description: "Height in pixels" }
  },
  required: ["width", "height"]
};

export const boundsSchema: JsonSchema = {
  type: "object",
  properties: {
    x: { type: "number", description: "X coordinate in pixels" },
    y: { type: "number", description: "Y coordinate in pixels" },
    width: { type: "number", description: "Width in pixels" },
    height: { type: "number", description: "Height in pixels" }
  },
  required: ["x", "y", "width", "height"]
};

export const shadowSchema: JsonSchema = {
  type: "object",
  properties: {
    enabled: { type: "boolean", default: true },
    color: { type: "string", description: "Shadow color (#RRGGBBAA format)" },
    offsetX: { type: "number", description: "Horizontal offset in pixels" },
    offsetY: { type: "number", description: "Vertical offset in pixels" },
    blur: { type: "number", description: "Blur radius in pixels" }
  }
};

export const styleSchema: JsonSchema = {
  type: "object",
  properties: {
    fill: { type: "string", description: "Fill color (#RRGGBB or rgba())" },
    stroke: { type: "string", description: "Stroke/border color" },
    strokeWidth: { type: "number", description: "Stroke width in pixels" },
    opacity: { type: "number", minimum: 0, maximum: 1, description: "Opacity (0-1)" },
    borderRadius: { type: "number", description: "Corner radius for rectangles" },
    shadow: shadowSchema
  }
};

export const textStyleSchema: JsonSchema = {
  type: "object",
  properties: {
    ...styleSchema.properties,
    fontFamily: { type: "string", description: "Font family name" },
    fontSize: { type: "number", description: "Font size in pixels" },
    fontWeight: { 
      type: "string", 
      enum: ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"]
    },
    alignment: { type: "string", enum: ["left", "center", "right"] },
    verticalAlignment: { type: "string", enum: ["top", "middle", "bottom"] },
    lineHeight: { type: "number", description: "Line height multiplier" },
    letterSpacing: { type: "number", description: "Letter spacing in pixels" },
    textDecoration: { type: "string", enum: ["none", "underline", "strikethrough"] },
    textTransform: { type: "string", enum: ["none", "uppercase", "lowercase", "capitalize"] }
  }
};

export const alignmentSchema: JsonSchema = {
  type: "string",
  enum: ["left", "center", "right", "top", "middle", "bottom"],
  description: "Alignment direction"
};

export const distributeSchema: JsonSchema = {
  type: "string",
  enum: ["horizontal", "vertical"],
  description: "Distribution direction"
};

export const elementIdsSchema: JsonSchema = {
  type: "array",
  items: { type: "string" },
  description: "Array of element IDs to operate on"
};
