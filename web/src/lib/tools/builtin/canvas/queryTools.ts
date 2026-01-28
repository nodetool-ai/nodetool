/**
 * Canvas Query Tools - LLM tools for inspecting canvas state
 */

import { FrontendToolRegistry } from "../../frontendTools";
import { useLayoutCanvasStore } from "../../../../components/design/LayoutCanvasStore";
import { CanvasStateResponse, ElementDetailResponse } from "./types";
import { LayoutElement } from "../../../../components/design/types";

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

// Get canvas summary
const getCanvasSummary = () => {
  const data = getStore().canvasData;
  return {
    width: data.width,
    height: data.height,
    backgroundColor: data.backgroundColor,
    elementCount: data.elements.length
  };
};

// =============================================================================
// Get Canvas State
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_get_state",
  description: "Get the full canvas state including dimensions, background, and all elements. Use this to understand the current design.",
  parameters: {
    type: "object",
    properties: {
      includeProperties: {
        type: "boolean",
        description: "Include full element properties (default: false, for smaller response)"
      }
    }
  },
  async execute({ includeProperties = false }): Promise<CanvasStateResponse> {
    const data = getStore().canvasData;
    const summary = getCanvasSummary();
    
    const elements = data.elements.map(el => 
      includeProperties ? el : summarizeElement(el)
    );
    
    return {
      ok: true,
      message: `Canvas has ${data.elements.length} element(s)`,
      canvas: summary,
      elements: elements as any
    };
  }
});

// =============================================================================
// Get Element
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_get_element",
  description: "Get detailed information about a specific element by ID.",
  parameters: {
    type: "object",
    properties: {
      elementId: { type: "string", description: "ID of the element to retrieve" }
    },
    required: ["elementId"]
  },
  async execute({ elementId }): Promise<ElementDetailResponse | { ok: false; error: string }> {
    const element = getStore().findElement(elementId);
    
    if (!element) {
      return { ok: false, error: `Element not found: ${elementId}` };
    }
    
    return {
      ok: true,
      message: `Element "${element.name}" (${element.type})`,
      element
    };
  }
});

// =============================================================================
// List Elements
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_list_elements",
  description: "List all elements on the canvas with optional filtering by type or name.",
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["text", "rectangle", "ellipse", "image", "line", "group"],
        description: "Filter by element type"
      },
      nameContains: {
        type: "string",
        description: "Filter by elements whose name contains this string"
      },
      visibleOnly: {
        type: "boolean",
        description: "Only return visible elements"
      }
    }
  },
  async execute({ type, nameContains, visibleOnly }) {
    let elements = getStore().canvasData.elements;
    
    // Apply filters
    if (type) {
      elements = elements.filter(el => el.type === type);
    }
    if (nameContains) {
      const search = nameContains.toLowerCase();
      elements = elements.filter(el => el.name.toLowerCase().includes(search));
    }
    if (visibleOnly) {
      elements = elements.filter(el => el.visible);
    }
    
    return {
      ok: true,
      message: `Found ${elements.length} element(s)`,
      elements: elements.map(summarizeElement),
      count: elements.length,
      filters: { type, nameContains, visibleOnly }
    };
  }
});

// =============================================================================
// Get Selection
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_get_selection",
  description: "Get the currently selected elements.",
  parameters: {
    type: "object",
    properties: {}
  },
  async execute() {
    const selectedIds = getStore().selectedIds;
    const elements = selectedIds
      .map(id => getStore().findElement(id))
      .filter(Boolean);
    
    if (elements.length === 0) {
      return {
        ok: true,
        message: "No elements selected",
        selectedIds: [],
        elements: []
      };
    }
    
    return {
      ok: true,
      message: `${elements.length} element(s) selected`,
      selectedIds,
      elements: elements.map(el => summarizeElement(el!))
    };
  }
});

// =============================================================================
// Find Elements By Position
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_find_at_position",
  description: "Find elements at or near a specific position on the canvas.",
  parameters: {
    type: "object",
    properties: {
      x: { type: "number", description: "X coordinate" },
      y: { type: "number", description: "Y coordinate" },
      tolerance: { type: "number", description: "Distance tolerance in pixels (default: 0)" }
    },
    required: ["x", "y"]
  },
  async execute({ x, y, tolerance = 0 }) {
    const elements = getStore().canvasData.elements;
    
    const hits = elements.filter(el => {
      const inX = x >= (el.x - tolerance) && x <= (el.x + el.width + tolerance);
      const inY = y >= (el.y - tolerance) && y <= (el.y + el.height + tolerance);
      return inX && inY;
    });
    
    // Sort by z-index (topmost first)
    hits.sort((a, b) => b.zIndex - a.zIndex);
    
    return {
      ok: true,
      message: `Found ${hits.length} element(s) at (${x}, ${y})`,
      elements: hits.map(summarizeElement),
      count: hits.length,
      position: { x, y }
    };
  }
});

// =============================================================================
// Get Bounds
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_get_bounds",
  description: "Calculate the bounding box of specified elements or all elements.",
  parameters: {
    type: "object",
    properties: {
      elementIds: {
        type: "array",
        items: { type: "string" },
        description: "IDs of elements (omit for all elements)"
      }
    }
  },
  async execute({ elementIds }) {
    let elements = getStore().canvasData.elements;
    
    if (elementIds && elementIds.length > 0) {
      elements = elements.filter(el => elementIds.includes(el.id));
    }
    
    if (elements.length === 0) {
      return { ok: false, error: "No elements to calculate bounds" };
    }
    
    const minX = Math.min(...elements.map(el => el.x));
    const minY = Math.min(...elements.map(el => el.y));
    const maxX = Math.max(...elements.map(el => el.x + el.width));
    const maxY = Math.max(...elements.map(el => el.y + el.height));
    
    return {
      ok: true,
      message: `Bounds of ${elements.length} element(s)`,
      bounds: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        right: maxX,
        bottom: maxY
      },
      elementCount: elements.length
    };
  }
});

// =============================================================================
// Get Canvas Dimensions
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_get_dimensions",
  description: "Get the canvas dimensions and background color.",
  parameters: {
    type: "object",
    properties: {}
  },
  async execute() {
    const data = getStore().canvasData;
    
    return {
      ok: true,
      message: `Canvas: ${data.width}x${data.height}`,
      width: data.width,
      height: data.height,
      backgroundColor: data.backgroundColor,
      backgroundImage: data.backgroundImage || null
    };
  }
});
