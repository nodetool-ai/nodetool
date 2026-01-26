/**
 * Types for the LayoutCanvas design editor
 */

// =============================================================================
// Shadow & Gradient Types (Sketch-compatible)
// =============================================================================

/**
 * Drop shadow effect - compatible with Sketch shadow format
 */
export interface ShadowEffect {
  enabled: boolean;
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
}

/**
 * Gradient stop for linear/radial gradients
 */
export interface GradientStop {
  position: number; // 0-1
  color: string;
}

/**
 * Linear gradient fill - compatible with Sketch gradient format
 */
export interface LinearGradient {
  type: "linear";
  angle: number; // degrees, 0 = left-to-right
  stops: GradientStop[];
}

/**
 * Radial gradient fill - compatible with Sketch gradient format
 */
export interface RadialGradient {
  type: "radial";
  centerX: number; // 0-1
  centerY: number; // 0-1
  radius: number; // 0-1
  stops: GradientStop[];
}

/**
 * Fill type - solid color or gradient
 */
export type Fill = 
  | { type: "solid"; color: string }
  | LinearGradient 
  | RadialGradient;

// =============================================================================
// Element Properties
// =============================================================================

// Text element properties
export interface TextProps {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: "normal" | "bold" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900";
  color: string;
  alignment: "left" | "center" | "right";
  lineHeight: number;
  shadow?: ShadowEffect;
}

// Image element properties
export interface ImageProps {
  source: string; // URI to the image or ImageRef asset_id
  fit: "cover" | "contain" | "fill";
  opacity: number;
  shadow?: ShadowEffect;
}

// Rectangle element properties (with enhanced styling)
export interface RectProps {
  fillColor: string;
  fill?: Fill; // Enhanced fill (overrides fillColor if present)
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  opacity: number;
  shadow?: ShadowEffect;
}

// Ellipse element properties (new)
export interface EllipseProps {
  fillColor: string;
  fill?: Fill; // Enhanced fill (overrides fillColor if present)
  borderColor: string;
  borderWidth: number;
  opacity: number;
  shadow?: ShadowEffect;
}

// Line element properties (new)
export interface LineProps {
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  startArrow: boolean;
  endArrow: boolean;
}

// Group element properties (container)
export interface GroupProps {
  name: string;
}

// Union type for all element properties
export type ElementProps = TextProps | ImageProps | RectProps | EllipseProps | LineProps | GroupProps;

// Element type enumeration
export type ElementType = "text" | "image" | "rectangle" | "ellipse" | "line" | "group";

// Layout element definition
export interface LayoutElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  name: string;
  properties: ElementProps;
  children?: LayoutElement[]; // for groups
}

// Exposed input definition (for dynamic node inputs)
export interface ExposedInput {
  elementId: string;
  property: string; // 'content' for text, 'source' for image
  inputName: string;
  inputType: "string" | "image";
}

// Main canvas data structure
export interface LayoutCanvasData {
  type: "layout_canvas";  // Required for backend type system
  width: number;
  height: number;
  backgroundColor: string;
  backgroundImage?: string;
  elements: LayoutElement[];
  exposedInputs: ExposedInput[];
}

// Selection state for the editor
export interface SelectionState {
  selectedIds: string[];
  transforming: boolean;
}

// Anchor point for positioning
export type AnchorPoint = 
  | "top-left" 
  | "top-center" 
  | "top-right" 
  | "center-left" 
  | "center" 
  | "center-right" 
  | "bottom-left" 
  | "bottom-center" 
  | "bottom-right";

// Grid settings
export interface GridSettings {
  enabled: boolean;
  size: number;
  snap: boolean;
}

// Default values for new elements
export const DEFAULT_TEXT_PROPS: TextProps = {
  content: "Text",
  fontFamily: "Inter",
  fontSize: 16,
  fontWeight: "normal",
  color: "#000000",
  alignment: "left",
  lineHeight: 1.2
};

export const DEFAULT_IMAGE_PROPS: ImageProps = {
  source: "",
  fit: "contain",
  opacity: 1
};

export const DEFAULT_RECT_PROPS: RectProps = {
  fillColor: "#cccccc",
  borderColor: "#000000",
  borderWidth: 0,
  borderRadius: 0,
  opacity: 1
};

export const DEFAULT_ELLIPSE_PROPS: EllipseProps = {
  fillColor: "#cccccc",
  borderColor: "#000000",
  borderWidth: 0,
  opacity: 1
};

export const DEFAULT_LINE_PROPS: LineProps = {
  strokeColor: "#000000",
  strokeWidth: 2,
  opacity: 1,
  startArrow: false,
  endArrow: false
};

export const DEFAULT_GROUP_PROPS: GroupProps = {
  name: "Group"
};

export const DEFAULT_SHADOW: ShadowEffect = {
  enabled: false,
  color: "#00000040",
  offsetX: 0,
  offsetY: 4,
  blur: 8
};

// Default canvas data
export const DEFAULT_CANVAS_DATA: LayoutCanvasData = {
  type: "layout_canvas",
  width: 800,
  height: 600,
  backgroundColor: "#ffffff",
  elements: [],
  exposedInputs: []
};
