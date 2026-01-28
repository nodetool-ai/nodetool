/**
 * Canvas Layout Tools - LLM tools for alignment and distribution
 */

import { FrontendToolRegistry } from "../../frontendTools";
import { useLayoutCanvasStore } from "../../../../components/design/LayoutCanvasStore";
import { 
  AlignmentDirection,
  DistributeDirection
} from "./types";

// Helper to get store state
const getStore = () => useLayoutCanvasStore.getState();

// Alignment direction handler
const alignElements = (
  ids: string[], 
  direction: AlignmentDirection, 
  toCanvas: boolean = false
): void => {
  const store = getStore();
  switch (direction) {
    case "left":
      store.alignLeft(ids, toCanvas);
      break;
    case "center":
      store.alignCenter(ids, toCanvas);
      break;
    case "right":
      store.alignRight(ids, toCanvas);
      break;
    case "top":
      store.alignTop(ids, toCanvas);
      break;
    case "middle":
      store.alignMiddle(ids, toCanvas);
      break;
    case "bottom":
      store.alignBottom(ids, toCanvas);
      break;
  }
};

// Distribute elements helper
const distributeElements = (
  ids: string[],
  direction: DistributeDirection
): void => {
  const store = getStore();
  if (direction === "horizontal") {
    store.distributeHorizontally(ids);
  } else {
    store.distributeVertically(ids);
  }
};

// =============================================================================
// Align Elements
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_align_elements",
  description: "Align multiple elements in a direction. Elements align to their collective bounds, or to canvas if alignToCanvas is true.",
  parameters: {
    type: "object",
    properties: {
      elementIds: {
        type: "array",
        items: { type: "string" },
        description: "IDs of elements to align"
      },
      direction: {
        type: "string",
        enum: ["left", "center", "right", "top", "middle", "bottom"],
        description: "Alignment direction"
      },
      alignToCanvas: {
        type: "boolean",
        description: "Align to canvas boundaries instead of selection bounds"
      }
    },
    required: ["elementIds", "direction"]
  },
  async execute({ elementIds, direction, alignToCanvas = false }) {
    if (!elementIds || elementIds.length === 0) {
      return { ok: false, error: "No element IDs provided" };
    }
    
    const store = getStore();
    const validIds = elementIds.filter((id: string) => store.findElement(id));
    
    if (validIds.length === 0) {
      return { ok: false, error: "No valid elements found with provided IDs" };
    }
    
    alignElements(validIds, direction as AlignmentDirection, alignToCanvas);
    
    return {
      ok: true,
      message: `Aligned ${validIds.length} element(s) to ${direction}${alignToCanvas ? ' (canvas)' : ''}`,
      alignedIds: validIds,
      direction
    };
  }
});

// =============================================================================
// Distribute Elements
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_distribute_elements",
  description: "Distribute elements evenly with equal spacing. Requires at least 3 elements.",
  parameters: {
    type: "object",
    properties: {
      elementIds: {
        type: "array",
        items: { type: "string" },
        description: "IDs of elements to distribute (minimum 3)"
      },
      direction: {
        type: "string",
        enum: ["horizontal", "vertical"],
        description: "Distribution direction"
      }
    },
    required: ["elementIds", "direction"]
  },
  async execute({ elementIds, direction }) {
    if (!elementIds || elementIds.length < 3) {
      return { ok: false, error: "Distribution requires at least 3 elements" };
    }
    
    const store = getStore();
    const validIds = elementIds.filter((id: string) => store.findElement(id));
    
    if (validIds.length < 3) {
      return { ok: false, error: "Distribution requires at least 3 valid elements" };
    }
    
    distributeElements(validIds, direction as DistributeDirection);
    
    return {
      ok: true,
      message: `Distributed ${validIds.length} elements ${direction}ly`,
      distributedIds: validIds,
      direction
    };
  }
});

// =============================================================================
// Tidy Elements
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_tidy_elements",
  description: "Arrange elements into a neat grid with even spacing. Automatically calculates optimal rows and columns.",
  parameters: {
    type: "object",
    properties: {
      elementIds: {
        type: "array",
        items: { type: "string" },
        description: "IDs of elements to arrange"
      },
      spacing: {
        type: "number",
        description: "Spacing between elements in pixels (default: 10)"
      }
    },
    required: ["elementIds"]
  },
  async execute({ elementIds, spacing = 10 }) {
    if (!elementIds || elementIds.length < 2) {
      return { ok: false, error: "Tidy requires at least 2 elements" };
    }
    
    const store = getStore();
    const validIds = elementIds.filter((id: string) => store.findElement(id));
    
    if (validIds.length < 2) {
      return { ok: false, error: "Tidy requires at least 2 valid elements" };
    }
    
    getStore().tidyElements(validIds, spacing);
    
    return {
      ok: true,
      message: `Arranged ${validIds.length} elements into grid with ${spacing}px spacing`,
      tidiedIds: validIds,
      spacing
    };
  }
});

// =============================================================================
// Set Spacing
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_set_spacing",
  description: "Set exact spacing between elements. Elements are repositioned to maintain the specified gap.",
  parameters: {
    type: "object",
    properties: {
      elementIds: {
        type: "array",
        items: { type: "string" },
        description: "IDs of elements to space"
      },
      direction: {
        type: "string",
        enum: ["horizontal", "vertical"],
        description: "Spacing direction"
      },
      spacing: {
        type: "number",
        description: "Spacing between elements in pixels"
      }
    },
    required: ["elementIds", "direction", "spacing"]
  },
  async execute({ elementIds, direction, spacing }) {
    if (!elementIds || elementIds.length < 2) {
      return { ok: false, error: "Spacing requires at least 2 elements" };
    }
    
    const store = getStore();
    const validIds = elementIds.filter((id: string) => store.findElement(id));
    
    if (validIds.length < 2) {
      return { ok: false, error: "Spacing requires at least 2 valid elements" };
    }
    
    if (direction === "horizontal") {
      getStore().setHorizontalSpacing(validIds, spacing);
    } else {
      getStore().setVerticalSpacing(validIds, spacing);
    }
    
    return {
      ok: true,
      message: `Set ${direction} spacing of ${spacing}px between ${validIds.length} elements`,
      spacedIds: validIds,
      direction,
      spacing
    };
  }
});

// =============================================================================
// Layer Ordering
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_bring_to_front",
  description: "Bring elements to the front (highest z-index).",
  parameters: {
    type: "object",
    properties: {
      elementIds: {
        type: "array",
        items: { type: "string" },
        description: "IDs of elements to bring to front"
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
    
    getStore().bringToFront(validIds);
    
    return {
      ok: true,
      message: `Brought ${validIds.length} element(s) to front`,
      elementIds: validIds
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_canvas_send_to_back",
  description: "Send elements to the back (lowest z-index).",
  parameters: {
    type: "object",
    properties: {
      elementIds: {
        type: "array",
        items: { type: "string" },
        description: "IDs of elements to send to back"
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
    
    getStore().sendToBack(validIds);
    
    return {
      ok: true,
      message: `Sent ${validIds.length} element(s) to back`,
      elementIds: validIds
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_canvas_bring_forward",
  description: "Bring elements forward by one level in the z-order.",
  parameters: {
    type: "object",
    properties: {
      elementIds: {
        type: "array",
        items: { type: "string" },
        description: "IDs of elements to bring forward"
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
    
    getStore().bringForward(validIds);
    
    return {
      ok: true,
      message: `Brought ${validIds.length} element(s) forward`,
      elementIds: validIds
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_canvas_send_backward",
  description: "Send elements backward by one level in the z-order.",
  parameters: {
    type: "object",
    properties: {
      elementIds: {
        type: "array",
        items: { type: "string" },
        description: "IDs of elements to send backward"
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
    
    getStore().sendBackward(validIds);
    
    return {
      ok: true,
      message: `Sent ${validIds.length} element(s) backward`,
      elementIds: validIds
    };
  }
});
