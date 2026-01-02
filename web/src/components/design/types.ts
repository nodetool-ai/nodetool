/**
 * Types for the LayoutCanvas design editor
 */

// Text element properties
export interface TextProps {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: "normal" | "bold" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900";
  color: string;
  alignment: "left" | "center" | "right";
  lineHeight: number;
}

// Image element properties
export interface ImageProps {
  source: string; // URI to the image or ImageRef asset_id
  fit: "cover" | "contain" | "fill";
  opacity: number;
}

// Rectangle element properties
export interface RectProps {
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  opacity: number;
}

// Group element properties (container)
export interface GroupProps {
  name: string;
}

// Union type for all element properties
export type ElementProps = TextProps | ImageProps | RectProps | GroupProps;

// Element type enumeration
export type ElementType = "text" | "image" | "rectangle" | "group";

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

export const DEFAULT_GROUP_PROPS: GroupProps = {
  name: "Group"
};

// Default canvas data
export const DEFAULT_CANVAS_DATA: LayoutCanvasData = {
  width: 800,
  height: 600,
  backgroundColor: "#ffffff",
  elements: [],
  exposedInputs: []
};
