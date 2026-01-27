/**
 * Canvas Manipulation Tools - LLM tools for modifying elements
 */

import { FrontendToolRegistry } from "../../frontendTools";
import { useLayoutCanvasStore } from "../../../../components/design/LayoutCanvasStore";
import { 
  LayoutElement,
  TextProps,
  DEFAULT_SHADOW
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

// =============================================================================
// Update Element
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_update_element",
  description: "Update an element's position, size, name, or basic properties. For styling, use ui_canvas_apply_style instead.",
  parameters: {
    type: "object",
    properties: {
      elementId: { type: "string", description: "ID of the element to update" },
      x: { type: "number", description: "New X position" },
      y: { type: "number", description: "New Y position" },
      width: { type: "number", description: "New width" },
      height: { type: "number", description: "New height" },
      rotation: { type: "number", description: "Rotation in degrees" },
      name: { type: "string", description: "New name" },
      visible: { type: "boolean", description: "Visibility state" },
      locked: { type: "boolean", description: "Lock state (prevents editing)" }
    },
    required: ["elementId"]
  },
  async execute({ elementId, x, y, width, height, rotation, name, visible, locked }) {
    const element = getStore().findElement(elementId);
    if (!element) {
      return { ok: false, error: `Element not found: ${elementId}` };
    }
    
    const updates: Partial<LayoutElement> = {};
    if (x !== undefined) updates.x = x;
    if (y !== undefined) updates.y = y;
    if (width !== undefined) updates.width = width;
    if (height !== undefined) updates.height = height;
    if (rotation !== undefined) updates.rotation = rotation;
    if (name !== undefined) updates.name = name;
    if (visible !== undefined) updates.visible = visible;
    if (locked !== undefined) updates.locked = locked;
    
    getStore().updateElement(elementId, updates);
    
    const updated = getStore().findElement(elementId)!;
    return {
      ok: true,
      message: `Element "${updated.name}" updated`,
      element: summarizeElement(updated)
    };
  }
});

// =============================================================================
// Move Element
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_move_element",
  description: "Move an element to a new position. Supports absolute positioning or relative offset.",
  parameters: {
    type: "object",
    properties: {
      elementId: { type: "string", description: "ID of the element to move" },
      x: { type: "number", description: "New X position (absolute)" },
      y: { type: "number", description: "New Y position (absolute)" },
      offsetX: { type: "number", description: "X offset from current position (relative)" },
      offsetY: { type: "number", description: "Y offset from current position (relative)" }
    },
    required: ["elementId"]
  },
  async execute({ elementId, x, y, offsetX, offsetY }) {
    const element = getStore().findElement(elementId);
    if (!element) {
      return { ok: false, error: `Element not found: ${elementId}` };
    }
    
    let newX = element.x;
    let newY = element.y;
    
    // Absolute positioning takes precedence
    if (x !== undefined) {
      newX = x;
    } else if (offsetX !== undefined) {
      newX = element.x + offsetX;
    }
    
    if (y !== undefined) {
      newY = y;
    } else if (offsetY !== undefined) {
      newY = element.y + offsetY;
    }
    
    getStore().updateElement(elementId, { x: newX, y: newY });
    
    return {
      ok: true,
      message: `Element "${element.name}" moved to (${newX}, ${newY})`,
      element: {
        id: element.id,
        name: element.name,
        oldPosition: { x: element.x, y: element.y },
        newPosition: { x: newX, y: newY }
      }
    };
  }
});

// =============================================================================
// Resize Element
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_resize_element",
  description: "Resize an element. Can resize absolutely or by scale factor.",
  parameters: {
    type: "object",
    properties: {
      elementId: { type: "string", description: "ID of the element to resize" },
      width: { type: "number", description: "New width in pixels" },
      height: { type: "number", description: "New height in pixels" },
      scaleX: { type: "number", description: "Scale factor for width (e.g., 2.0 = double)" },
      scaleY: { type: "number", description: "Scale factor for height (e.g., 0.5 = half)" },
      maintainAspectRatio: { type: "boolean", description: "Maintain aspect ratio when scaling" }
    },
    required: ["elementId"]
  },
  async execute({ elementId, width, height, scaleX, scaleY, maintainAspectRatio }) {
    const element = getStore().findElement(elementId);
    if (!element) {
      return { ok: false, error: `Element not found: ${elementId}` };
    }
    
    let newWidth = element.width;
    let newHeight = element.height;
    
    // Absolute dimensions take precedence over scale
    if (width !== undefined) {
      newWidth = width;
      if (maintainAspectRatio && height === undefined) {
        newHeight = element.height * (width / element.width);
      }
    } else if (scaleX !== undefined) {
      newWidth = element.width * scaleX;
      if (maintainAspectRatio && scaleY === undefined) {
        newHeight = element.height * scaleX;
      }
    }
    
    if (height !== undefined) {
      newHeight = height;
      if (maintainAspectRatio && width === undefined) {
        newWidth = element.width * (height / element.height);
      }
    } else if (scaleY !== undefined && !maintainAspectRatio) {
      newHeight = element.height * scaleY;
    }
    
    getStore().updateElement(elementId, { width: newWidth, height: newHeight });
    
    return {
      ok: true,
      message: `Element "${element.name}" resized to ${Math.round(newWidth)}x${Math.round(newHeight)}`,
      element: {
        id: element.id,
        name: element.name,
        oldSize: { width: element.width, height: element.height },
        newSize: { width: newWidth, height: newHeight }
      }
    };
  }
});

// =============================================================================
// Apply Style
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_apply_style",
  description: "Apply styling properties to an element. Supports fill, stroke, opacity, shadow, and text-specific styles.",
  parameters: {
    type: "object",
    properties: {
      elementId: { type: "string", description: "ID of the element to style" },
      // Common styles
      fill: { type: "string", description: "Fill color (#RRGGBB or rgba())" },
      stroke: { type: "string", description: "Stroke/border color (#RRGGBB)" },
      strokeWidth: { type: "number", description: "Stroke width in pixels" },
      opacity: { type: "number", minimum: 0, maximum: 1, description: "Opacity (0-1)" },
      borderRadius: { type: "number", description: "Corner radius (rectangles only)" },
      // Shadow
      shadowEnabled: { type: "boolean", description: "Enable drop shadow" },
      shadowColor: { type: "string", description: "Shadow color (#RRGGBBAA)" },
      shadowOffsetX: { type: "number", description: "Shadow X offset" },
      shadowOffsetY: { type: "number", description: "Shadow Y offset" },
      shadowBlur: { type: "number", description: "Shadow blur radius" },
      // Text styles
      color: { type: "string", description: "Text color (#RRGGBB)" },
      fontFamily: { type: "string", description: "Font family name" },
      fontSize: { type: "number", description: "Font size in pixels" },
      fontWeight: { 
        type: "string", 
        enum: ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"]
      },
      alignment: { type: "string", enum: ["left", "center", "right"] },
      verticalAlignment: { type: "string", enum: ["top", "middle", "bottom"] }
    },
    required: ["elementId"]
  },
  async execute(args) {
    const { elementId, ...styleProps } = args;
    
    const element = getStore().findElement(elementId);
    if (!element) {
      return { ok: false, error: `Element not found: ${elementId}` };
    }
    
    const currentProps = element.properties as Record<string, any>;
    const newProps = { ...currentProps };
    
    // Build shadow if any shadow properties provided
    if (styleProps.shadowEnabled !== undefined || 
        styleProps.shadowColor || 
        styleProps.shadowOffsetX !== undefined ||
        styleProps.shadowOffsetY !== undefined ||
        styleProps.shadowBlur !== undefined) {
      
      const currentShadow = currentProps.shadow || DEFAULT_SHADOW;
      newProps.shadow = {
        enabled: styleProps.shadowEnabled ?? currentShadow.enabled ?? true,
        color: styleProps.shadowColor || currentShadow.color,
        offsetX: styleProps.shadowOffsetX ?? currentShadow.offsetX,
        offsetY: styleProps.shadowOffsetY ?? currentShadow.offsetY,
        blur: styleProps.shadowBlur ?? currentShadow.blur
      };
    }
    
    // Apply common styles based on element type
    if (element.type === "rectangle" || element.type === "ellipse") {
      if (styleProps.fill) newProps.fillColor = styleProps.fill;
      if (styleProps.stroke) newProps.borderColor = styleProps.stroke;
      if (styleProps.strokeWidth !== undefined) newProps.borderWidth = styleProps.strokeWidth;
      if (styleProps.opacity !== undefined) newProps.opacity = styleProps.opacity;
      if (styleProps.borderRadius !== undefined && element.type === "rectangle") {
        newProps.borderRadius = styleProps.borderRadius;
      }
    }
    
    // Apply text styles
    if (element.type === "text") {
      if (styleProps.color) newProps.color = styleProps.color;
      if (styleProps.fontFamily) newProps.fontFamily = styleProps.fontFamily;
      if (styleProps.fontSize !== undefined) newProps.fontSize = styleProps.fontSize;
      if (styleProps.fontWeight) newProps.fontWeight = styleProps.fontWeight;
      if (styleProps.alignment) newProps.alignment = styleProps.alignment;
      if (styleProps.verticalAlignment) newProps.verticalAlignment = styleProps.verticalAlignment;
      if (styleProps.opacity !== undefined) newProps.opacity = styleProps.opacity;
    }
    
    // Apply line styles
    if (element.type === "line") {
      if (styleProps.stroke) newProps.strokeColor = styleProps.stroke;
      if (styleProps.strokeWidth !== undefined) newProps.strokeWidth = styleProps.strokeWidth;
      if (styleProps.opacity !== undefined) newProps.opacity = styleProps.opacity;
    }
    
    // Apply image styles
    if (element.type === "image") {
      if (styleProps.opacity !== undefined) newProps.opacity = styleProps.opacity;
    }
    
    getStore().updateElement(elementId, { properties: newProps as typeof element.properties });
    
    const appliedStyles = Object.keys(styleProps).filter(k => (styleProps as any)[k] !== undefined);
    return {
      ok: true,
      message: `Applied ${appliedStyles.length} style(s) to "${element.name}"`,
      element: summarizeElement(getStore().findElement(elementId)!),
      appliedStyles
    };
  }
});

// =============================================================================
// Delete Elements
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_delete_elements",
  description: "Delete one or more elements from the canvas.",
  parameters: {
    type: "object",
    properties: {
      elementIds: {
        type: "array",
        items: { type: "string" },
        description: "IDs of elements to delete"
      }
    },
    required: ["elementIds"]
  },
  async execute({ elementIds }) {
    if (!elementIds || elementIds.length === 0) {
      return { ok: false, error: "No element IDs provided" };
    }
    
    const store = getStore();
    const validIds = elementIds.filter((id: string) => store.findElement(id));
    
    if (validIds.length === 0) {
      return { ok: false, error: "No valid elements found with provided IDs" };
    }
    
    const deletedNames = validIds.map((id: string) => store.findElement(id)?.name);
    store.deleteElements(validIds);
    
    return {
      ok: true,
      message: `Deleted ${validIds.length} element(s)`,
      deletedIds: validIds,
      deletedNames
    };
  }
});

// =============================================================================
// Duplicate Elements
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_duplicate_elements",
  description: "Duplicate one or more elements. Creates copies offset from originals.",
  parameters: {
    type: "object",
    properties: {
      elementIds: {
        type: "array",
        items: { type: "string" },
        description: "IDs of elements to duplicate"
      },
      offsetX: { type: "number", description: "X offset for duplicates (default: 20)" },
      offsetY: { type: "number", description: "Y offset for duplicates (default: 20)" }
    },
    required: ["elementIds"]
  },
  async execute({ elementIds, offsetX = 20, offsetY = 20 }) {
    if (!elementIds || elementIds.length === 0) {
      return { ok: false, error: "No element IDs provided" };
    }
    
    const store = getStore();
    const validIds = elementIds.filter((id: string) => store.findElement(id));
    
    if (validIds.length === 0) {
      return { ok: false, error: "No valid elements found with provided IDs" };
    }
    
    const duplicated = store.duplicateElements(validIds);
    
    // Apply custom offset if different from default
    if (offsetX !== 20 || offsetY !== 20) {
      for (const el of duplicated) {
        const original = store.findElement(validIds[duplicated.indexOf(el)])!;
        store.updateElement(el.id, {
          x: original.x + offsetX,
          y: original.y + offsetY
        });
      }
    }
    
    return {
      ok: true,
      message: `Duplicated ${duplicated.length} element(s)`,
      newElements: duplicated.map(el => summarizeElement(el)),
      originalIds: validIds,
      newIds: duplicated.map(el => el.id)
    };
  }
});

// =============================================================================
// Update Text Content
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_set_text",
  description: "Update the text content of a text element.",
  parameters: {
    type: "object",
    properties: {
      elementId: { type: "string", description: "ID of the text element" },
      content: { type: "string", description: "New text content" }
    },
    required: ["elementId", "content"]
  },
  async execute({ elementId, content }) {
    const element = getStore().findElement(elementId);
    if (!element) {
      return { ok: false, error: `Element not found: ${elementId}` };
    }
    
    if (element.type !== "text") {
      return { ok: false, error: `Element "${element.name}" is not a text element (type: ${element.type})` };
    }
    
    const currentProps = element.properties as TextProps;
    getStore().updateElement(elementId, {
      properties: { ...currentProps, content }
    });
    
    return {
      ok: true,
      message: `Text updated: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`,
      element: summarizeElement(getStore().findElement(elementId)!)
    };
  }
});

// =============================================================================
// Set Image Source
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_set_image",
  description: "Update the image source of an image element.",
  parameters: {
    type: "object",
    properties: {
      elementId: { type: "string", description: "ID of the image element" },
      source: { type: "string", description: "New image URL or asset ID" },
      fit: { type: "string", enum: ["cover", "contain", "fill"], description: "How image fits in bounds" }
    },
    required: ["elementId", "source"]
  },
  async execute({ elementId, source, fit }) {
    const element = getStore().findElement(elementId);
    if (!element) {
      return { ok: false, error: `Element not found: ${elementId}` };
    }
    
    if (element.type !== "image") {
      return { ok: false, error: `Element "${element.name}" is not an image element (type: ${element.type})` };
    }
    
    const currentProps = element.properties as any;
    const newProps = { ...currentProps, source };
    if (fit) newProps.fit = fit;
    
    getStore().updateElement(elementId, { properties: newProps });
    
    return {
      ok: true,
      message: `Image source updated`,
      element: summarizeElement(getStore().findElement(elementId)!)
    };
  }
});

// =============================================================================
// Select Elements
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_select",
  description: "Select elements on the canvas. Used for subsequent operations.",
  parameters: {
    type: "object",
    properties: {
      elementIds: {
        type: "array",
        items: { type: "string" },
        description: "IDs of elements to select (empty array clears selection)"
      }
    },
    required: ["elementIds"]
  },
  async execute({ elementIds }) {
    getStore().setSelection(elementIds || []);
    
    if (!elementIds || elementIds.length === 0) {
      return {
        ok: true,
        message: "Selection cleared"
      };
    }
    
    return {
      ok: true,
      message: `Selected ${elementIds.length} element(s)`,
      selectedIds: elementIds
    };
  }
});
