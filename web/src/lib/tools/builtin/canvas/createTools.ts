/**
 * Canvas Creation Tools - LLM tools for creating elements
 */

import { FrontendToolRegistry } from "../../frontendTools";
import { useLayoutCanvasStore } from "../../../../components/design/LayoutCanvasStore";
import { 
  CreateElementResponse
} from "./types";
import { 
  DEFAULT_RECT_PROPS,
  DEFAULT_ELLIPSE_PROPS,
  DEFAULT_TEXT_PROPS,
  DEFAULT_IMAGE_PROPS,
  DEFAULT_LINE_PROPS,
  DEFAULT_CANVAS_DATA,
  TextProps,
  RectProps,
  EllipseProps,
  ImageProps,
  LineProps,
  LayoutElement,
  LayoutCanvasData
} from "../../../../components/design/types";

// Helper to get store state
const getStore = () => useLayoutCanvasStore.getState();

// Helper to summarize element for responses
const summarizeElement = (el: LayoutElement) => ({
  id: el.id,
  type: el.type,
  name: el.name,
  x: el.x,
  y: el.y,
  width: el.width,
  height: el.height,
  visible: el.visible,
  locked: el.locked
});

// Input validation helper
const validateDimensions = (width: number, height: number): string | null => {
  if (typeof width !== "number" || typeof height !== "number") {
    return "Width and height must be numbers";
  }
  if (width <= 0 || height <= 0) {
    return "Width and height must be positive numbers";
  }
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return "Width and height must be finite numbers";
  }
  return null;
};

const validateOpacity = (opacity: number | undefined): string | null => {
  if (opacity === undefined) return null;
  if (typeof opacity !== "number" || !Number.isFinite(opacity)) {
    return "Opacity must be a finite number";
  }
  if (opacity < 0 || opacity > 1) {
    return "Opacity must be between 0 and 1";
  }
  return null;
};

// =============================================================================
// Artboard / Canvas Setup
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_create_artboard",
  description: "Initialize or resize the canvas/artboard. Sets canvas dimensions and background color. Call this first to set up your design canvas.",
  parameters: {
    type: "object",
    properties: {
      width: { type: "number", description: "Canvas width in pixels (e.g., 1920 for desktop, 375 for mobile)" },
      height: { type: "number", description: "Canvas height in pixels (e.g., 1080 for desktop, 812 for mobile)" },
      backgroundColor: { type: "string", description: "Background color as hex (#FFFFFF) or rgba()" }
    },
    required: ["width", "height"]
  },
  async execute({ width, height, backgroundColor }) {
    const store = getStore();
    const newData: LayoutCanvasData = {
      ...DEFAULT_CANVAS_DATA,
      width,
      height,
      backgroundColor: backgroundColor || "#ffffff",
      elements: [],
      exposedInputs: []
    };
    store.setCanvasData(newData);
    return {
      ok: true,
      message: `Canvas created: ${width}x${height}px with background ${newData.backgroundColor}`,
      canvas: {
        width: newData.width,
        height: newData.height,
        backgroundColor: newData.backgroundColor
      }
    };
  }
});

// =============================================================================
// Rectangle
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_create_rectangle",
  description: "Create a rectangle element. Useful for backgrounds, containers, cards, buttons, and dividers.",
  parameters: {
    type: "object",
    properties: {
      x: { type: "number", description: "X position in pixels" },
      y: { type: "number", description: "Y position in pixels" },
      width: { type: "number", description: "Width in pixels" },
      height: { type: "number", description: "Height in pixels" },
      name: { type: "string", description: "Element name for identification" },
      fill: { type: "string", description: "Fill color (#RRGGBB)" },
      stroke: { type: "string", description: "Border color (#RRGGBB)" },
      strokeWidth: { type: "number", description: "Border width in pixels" },
      borderRadius: { type: "number", description: "Corner radius in pixels" },
      opacity: { type: "number", minimum: 0, maximum: 1, description: "Opacity (0-1)" }
    },
    required: ["x", "y", "width", "height"]
  },
  async execute({ x, y, width, height, name, fill, stroke, strokeWidth, borderRadius, opacity }): Promise<CreateElementResponse> {
    // Validate inputs
    const dimError = validateDimensions(width, height);
    if (dimError) return { ok: false, error: dimError } as any;
    const opacityError = validateOpacity(opacity);
    if (opacityError) return { ok: false, error: opacityError } as any;
    
    const store = getStore();
    const element = store.addElement("rectangle", x, y);
    
    const props: RectProps = {
      ...DEFAULT_RECT_PROPS,
      ...(fill && { fillColor: fill }),
      ...(stroke && { borderColor: stroke }),
      ...(strokeWidth !== undefined && { borderWidth: strokeWidth }),
      ...(borderRadius !== undefined && { borderRadius }),
      ...(opacity !== undefined && { opacity })
    };
    
    store.updateElement(element.id, {
      width,
      height,
      properties: props,
      ...(name && { name })
    });
    
    const updated = store.findElement(element.id)!;
    return {
      ok: true,
      message: `Rectangle "${updated.name}" created at (${x}, ${y}) with size ${width}x${height}`,
      element: summarizeElement(updated)
    };
  }
});

// =============================================================================
// Ellipse
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_create_ellipse",
  description: "Create an ellipse/circle element. Set equal width and height for a perfect circle.",
  parameters: {
    type: "object",
    properties: {
      x: { type: "number", description: "X position in pixels" },
      y: { type: "number", description: "Y position in pixels" },
      width: { type: "number", description: "Width in pixels (equal to height for circle)" },
      height: { type: "number", description: "Height in pixels (equal to width for circle)" },
      name: { type: "string", description: "Element name for identification" },
      fill: { type: "string", description: "Fill color (#RRGGBB)" },
      stroke: { type: "string", description: "Border color (#RRGGBB)" },
      strokeWidth: { type: "number", description: "Border width in pixels" },
      opacity: { type: "number", minimum: 0, maximum: 1, description: "Opacity (0-1)" }
    },
    required: ["x", "y", "width", "height"]
  },
  async execute({ x, y, width, height, name, fill, stroke, strokeWidth, opacity }): Promise<CreateElementResponse> {
    const store = getStore();
    const element = store.addElement("ellipse", x, y);
    
    const props: EllipseProps = {
      ...DEFAULT_ELLIPSE_PROPS,
      ...(fill && { fillColor: fill }),
      ...(stroke && { borderColor: stroke }),
      ...(strokeWidth !== undefined && { borderWidth: strokeWidth }),
      ...(opacity !== undefined && { opacity })
    };
    
    store.updateElement(element.id, {
      width,
      height,
      properties: props,
      ...(name && { name })
    });
    
    const updated = store.findElement(element.id)!;
    const shape = width === height ? "circle" : "ellipse";
    return {
      ok: true,
      message: `${shape.charAt(0).toUpperCase() + shape.slice(1)} "${updated.name}" created at (${x}, ${y})`,
      element: summarizeElement(updated)
    };
  }
});

// =============================================================================
// Text
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_create_text",
  description: "Create a text element. Supports font customization, alignment, and text decoration.",
  parameters: {
    type: "object",
    properties: {
      x: { type: "number", description: "X position in pixels" },
      y: { type: "number", description: "Y position in pixels" },
      content: { type: "string", description: "Text content to display" },
      width: { type: "number", description: "Width in pixels (for text wrapping)" },
      height: { type: "number", description: "Height in pixels" },
      name: { type: "string", description: "Element name for identification" },
      color: { type: "string", description: "Text color (#RRGGBB)" },
      fontFamily: { type: "string", description: "Font family (e.g., 'Inter', 'Roboto', 'Arial')" },
      fontSize: { type: "number", description: "Font size in pixels" },
      fontWeight: { 
        type: "string", 
        enum: ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"],
        description: "Font weight"
      },
      alignment: { type: "string", enum: ["left", "center", "right"], description: "Horizontal alignment" },
      verticalAlignment: { type: "string", enum: ["top", "middle", "bottom"], description: "Vertical alignment" },
      lineHeight: { type: "number", description: "Line height multiplier (e.g., 1.5)" },
      letterSpacing: { type: "number", description: "Letter spacing in pixels" }
    },
    required: ["x", "y", "content"]
  },
  async execute({ 
    x, y, content, width, height, name, color, fontFamily, fontSize, fontWeight, 
    alignment, verticalAlignment, lineHeight, letterSpacing 
  }): Promise<CreateElementResponse> {
    const store = getStore();
    const element = store.addElement("text", x, y);
    
    const props: TextProps = {
      ...DEFAULT_TEXT_PROPS,
      content,
      ...(color && { color }),
      ...(fontFamily && { fontFamily }),
      ...(fontSize !== undefined && { fontSize }),
      ...(fontWeight && { fontWeight }),
      ...(alignment && { alignment }),
      ...(verticalAlignment && { verticalAlignment }),
      ...(lineHeight !== undefined && { lineHeight }),
      ...(letterSpacing !== undefined && { letterSpacing })
    };
    
    store.updateElement(element.id, {
      ...(width && { width }),
      ...(height && { height }),
      properties: props,
      ...(name && { name })
    });
    
    const updated = store.findElement(element.id)!;
    return {
      ok: true,
      message: `Text "${content.substring(0, 30)}${content.length > 30 ? '...' : ''}" created at (${x}, ${y})`,
      element: summarizeElement(updated)
    };
  }
});

// =============================================================================
// Image
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_create_image",
  description: "Create an image element. Supports URLs and asset IDs. Use for photos, icons, or placeholders.",
  parameters: {
    type: "object",
    properties: {
      x: { type: "number", description: "X position in pixels" },
      y: { type: "number", description: "Y position in pixels" },
      width: { type: "number", description: "Width in pixels" },
      height: { type: "number", description: "Height in pixels" },
      source: { type: "string", description: "Image URL or asset ID" },
      name: { type: "string", description: "Element name for identification" },
      fit: { type: "string", enum: ["cover", "contain", "fill"], description: "How image fits in bounds" },
      opacity: { type: "number", minimum: 0, maximum: 1, description: "Opacity (0-1)" }
    },
    required: ["x", "y", "width", "height"]
  },
  async execute({ x, y, width, height, source, name, fit, opacity }): Promise<CreateElementResponse> {
    const store = getStore();
    const element = store.addElement("image", x, y);
    
    const props: ImageProps = {
      ...DEFAULT_IMAGE_PROPS,
      ...(source && { source }),
      ...(fit && { fit }),
      ...(opacity !== undefined && { opacity })
    };
    
    store.updateElement(element.id, {
      width,
      height,
      properties: props,
      ...(name && { name })
    });
    
    const updated = store.findElement(element.id)!;
    return {
      ok: true,
      message: `Image "${updated.name}" created at (${x}, ${y}) with size ${width}x${height}`,
      element: summarizeElement(updated)
    };
  }
});

// =============================================================================
// Line
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_create_line",
  description: "Create a line element. Can have arrows at start or end. Useful for connectors and dividers.",
  parameters: {
    type: "object",
    properties: {
      x: { type: "number", description: "X position (start point)" },
      y: { type: "number", description: "Y position (start point)" },
      width: { type: "number", description: "Width (horizontal extent)" },
      height: { type: "number", description: "Height (vertical extent, 0 for horizontal line)" },
      name: { type: "string", description: "Element name for identification" },
      strokeColor: { type: "string", description: "Line color (#RRGGBB)" },
      strokeWidth: { type: "number", description: "Line width in pixels" },
      startArrow: { type: "boolean", description: "Show arrow at start" },
      endArrow: { type: "boolean", description: "Show arrow at end" },
      opacity: { type: "number", minimum: 0, maximum: 1, description: "Opacity (0-1)" }
    },
    required: ["x", "y", "width"]
  },
  async execute({ x, y, width, height = 0, name, strokeColor, strokeWidth, startArrow, endArrow, opacity }): Promise<CreateElementResponse> {
    const store = getStore();
    const element = store.addElement("line", x, y);
    
    const props: LineProps = {
      ...DEFAULT_LINE_PROPS,
      ...(strokeColor && { strokeColor }),
      ...(strokeWidth !== undefined && { strokeWidth }),
      ...(startArrow !== undefined && { startArrow }),
      ...(endArrow !== undefined && { endArrow }),
      ...(opacity !== undefined && { opacity })
    };
    
    store.updateElement(element.id, {
      width,
      height: Math.max(height, 2), // Minimum height for visibility
      properties: props,
      ...(name && { name })
    });
    
    const updated = store.findElement(element.id)!;
    return {
      ok: true,
      message: `Line "${updated.name}" created from (${x}, ${y}) with length ${width}`,
      element: summarizeElement(updated)
    };
  }
});

// =============================================================================
// Group
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_create_group",
  description: "Create a group from existing elements. Groups organize related elements together.",
  parameters: {
    type: "object",
    properties: {
      elementIds: {
        type: "array",
        items: { type: "string" },
        description: "IDs of elements to group together"
      },
      name: { type: "string", description: "Group name" }
    },
    required: ["elementIds"]
  },
  async execute({ elementIds, name }) {
    if (!elementIds || elementIds.length === 0) {
      return { ok: false, error: "No element IDs provided" };
    }
    
    const store = getStore();
    const validElements: LayoutElement[] = [];
    for (const id of elementIds as string[]) {
      const el = store.findElement(id);
      if (el) validElements.push(el);
    }
    
    if (validElements.length === 0) {
      return { ok: false, error: "No valid elements found with provided IDs" };
    }
    
    // Calculate bounds of all elements
    const minX = Math.min(...validElements.map(el => el.x));
    const minY = Math.min(...validElements.map(el => el.y));
    const maxX = Math.max(...validElements.map(el => el.x + el.width));
    const maxY = Math.max(...validElements.map(el => el.y + el.height));
    
    // Create group element
    const group = store.addElement("group", minX, minY);
    store.updateElement(group.id, {
      width: maxX - minX,
      height: maxY - minY,
      children: validElements,
      ...(name && { name })
    });
    
    const updated = store.findElement(group.id)!;
    return {
      ok: true,
      message: `Group "${updated.name}" created with ${validElements.length} elements`,
      element: summarizeElement(updated),
      groupedElements: validElements.map(el => el.id)
    };
  }
});
