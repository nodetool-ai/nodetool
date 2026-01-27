/**
 * Tests for LLM Canvas Design Tools
 * 
 * These tests verify the FrontendToolRegistry integration with the canvas tools.
 * The tests use the store directly for verification, similar to LayoutCanvasStore.test.ts
 */

import { FrontendToolRegistry } from "../../../frontendTools";
import { useLayoutCanvasStore } from "../../../../../components/design/LayoutCanvasStore";
import { DEFAULT_CANVAS_DATA } from "../../../../../components/design/types";

// Import tools to register them
import "../index";

// Mock context
const mockContext = {
  abortSignal: new AbortController().signal,
  getState: () => ({} as any)
};

// Helper to call tools
async function callTool(name: string, args: any) {
  return FrontendToolRegistry.call(name, args, `test-${Date.now()}`, mockContext);
}

// Helper to reset store
function resetStore() {
  useLayoutCanvasStore.setState({
    canvasData: { ...DEFAULT_CANVAS_DATA },
    selectedIds: [],
    clipboard: [],
    history: [{ ...DEFAULT_CANVAS_DATA }],
    historyIndex: 0
  });
}

describe("Canvas Tools Registration", () => {
  it("should have registered canvas tools", () => {
    expect(FrontendToolRegistry.has("ui_canvas_create_artboard")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_create_rectangle")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_create_text")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_create_ellipse")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_create_image")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_create_line")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_create_group")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_update_element")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_move_element")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_resize_element")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_apply_style")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_delete_elements")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_duplicate_elements")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_set_text")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_set_image")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_select")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_align_elements")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_distribute_elements")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_tidy_elements")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_set_spacing")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_bring_to_front")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_send_to_back")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_bring_forward")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_send_backward")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_get_state")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_get_element")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_list_elements")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_get_selection")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_find_at_position")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_get_bounds")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_get_dimensions")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_export_json")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_export_sketch")).toBe(true);
    expect(FrontendToolRegistry.has("ui_canvas_get_export_data")).toBe(true);
  });

  it("should generate manifest for canvas tools", () => {
    const manifest = FrontendToolRegistry.getManifest();
    
    // Check some tools are in manifest
    const toolNames = manifest.map(t => t.name);
    expect(toolNames).toContain("ui_canvas_create_artboard");
    expect(toolNames).toContain("ui_canvas_create_rectangle");
    expect(toolNames).toContain("ui_canvas_get_state");
  });
});

describe("Canvas Creation Tools", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("ui_canvas_create_artboard", () => {
    it("should create artboard with specified dimensions", async () => {
      const result = await callTool("ui_canvas_create_artboard", {
        width: 1920,
        height: 1080,
        backgroundColor: "#f0f0f0"
      });

      expect(result.ok).toBe(true);
      expect(result.canvas.width).toBe(1920);
      expect(result.canvas.height).toBe(1080);
      expect(result.canvas.backgroundColor).toBe("#f0f0f0");

      // Verify in store
      const state = useLayoutCanvasStore.getState();
      expect(state.canvasData.width).toBe(1920);
      expect(state.canvasData.height).toBe(1080);
    });

    it("should use default background when not specified", async () => {
      const result = await callTool("ui_canvas_create_artboard", {
        width: 800,
        height: 600
      });

      expect(result.ok).toBe(true);
      expect(result.canvas.backgroundColor).toBe("#ffffff");
    });
  });

  describe("ui_canvas_create_rectangle", () => {
    it("should create rectangle with specified properties", async () => {
      const result = await callTool("ui_canvas_create_rectangle", {
        x: 100,
        y: 100,
        width: 200,
        height: 150,
        name: "Test Rect",
        fill: "#ff0000",
        borderRadius: 8
      });

      expect(result.ok).toBe(true);
      expect(result.element.type).toBe("rectangle");
      expect(result.element.x).toBe(100);
      expect(result.element.y).toBe(100);
      expect(result.element.width).toBe(200);
      expect(result.element.height).toBe(150);
      expect(result.element.name).toBe("Test Rect");

      // Verify in store
      const state = useLayoutCanvasStore.getState();
      expect(state.canvasData.elements).toHaveLength(1);
    });
  });

  describe("ui_canvas_create_ellipse", () => {
    it("should create ellipse element", async () => {
      const result = await callTool("ui_canvas_create_ellipse", {
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        fill: "#0000ff"
      });

      expect(result.ok).toBe(true);
      expect(result.element.type).toBe("ellipse");
    });

    it("should recognize circle when width equals height", async () => {
      const result = await callTool("ui_canvas_create_ellipse", {
        x: 50,
        y: 50,
        width: 100,
        height: 100
      });

      expect(result.ok).toBe(true);
      expect(result.message).toContain("Circle");
    });
  });

  describe("ui_canvas_create_text", () => {
    it("should create text element with content", async () => {
      const result = await callTool("ui_canvas_create_text", {
        x: 20,
        y: 20,
        content: "Hello World",
        fontSize: 24,
        fontWeight: "bold",
        color: "#333333"
      });

      expect(result.ok).toBe(true);
      expect(result.element.type).toBe("text");
      expect(result.message).toContain("Hello World");
    });
  });

  describe("ui_canvas_create_image", () => {
    it("should create image element", async () => {
      const result = await callTool("ui_canvas_create_image", {
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        source: "https://example.com/image.jpg",
        fit: "cover"
      });

      expect(result.ok).toBe(true);
      expect(result.element.type).toBe("image");
    });
  });

  describe("ui_canvas_create_line", () => {
    it("should create line element", async () => {
      const result = await callTool("ui_canvas_create_line", {
        x: 10,
        y: 10,
        width: 200,
        strokeColor: "#000000",
        strokeWidth: 2,
        endArrow: true
      });

      expect(result.ok).toBe(true);
      expect(result.element.type).toBe("line");
    });
  });
});

describe("Canvas Manipulation Tools", () => {
  let rectangleId: string;

  beforeEach(async () => {
    resetStore();
    const result = await callTool("ui_canvas_create_rectangle", {
      x: 100, y: 100, width: 100, height: 100
    });
    rectangleId = result.element.id;
  });

  describe("ui_canvas_update_element", () => {
    it("should update element properties", async () => {
      const result = await callTool("ui_canvas_update_element", {
        elementId: rectangleId,
        x: 200,
        y: 200,
        name: "Updated Rect"
      });

      expect(result.ok).toBe(true);
      expect(result.element.x).toBe(200);
      expect(result.element.y).toBe(200);
    });

    it("should return error for non-existent element", async () => {
      const result = await callTool("ui_canvas_update_element", {
        elementId: "non-existent-id",
        x: 100
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("ui_canvas_move_element", () => {
    it("should move element to absolute position", async () => {
      const result = await callTool("ui_canvas_move_element", {
        elementId: rectangleId,
        x: 300,
        y: 300
      });

      expect(result.ok).toBe(true);
      expect(result.element.newPosition.x).toBe(300);
      expect(result.element.newPosition.y).toBe(300);
    });

    it("should move element by relative offset", async () => {
      const result = await callTool("ui_canvas_move_element", {
        elementId: rectangleId,
        offsetX: 50,
        offsetY: 25
      });

      expect(result.ok).toBe(true);
      expect(result.element.newPosition.x).toBe(150); // 100 + 50
      expect(result.element.newPosition.y).toBe(125); // 100 + 25
    });
  });

  describe("ui_canvas_resize_element", () => {
    it("should resize element to absolute dimensions", async () => {
      const result = await callTool("ui_canvas_resize_element", {
        elementId: rectangleId,
        width: 200,
        height: 150
      });

      expect(result.ok).toBe(true);
      expect(result.element.newSize.width).toBe(200);
      expect(result.element.newSize.height).toBe(150);
    });

    it("should resize element by scale factor", async () => {
      const result = await callTool("ui_canvas_resize_element", {
        elementId: rectangleId,
        scaleX: 2,
        scaleY: 2
      });

      expect(result.ok).toBe(true);
      expect(result.element.newSize.width).toBe(200); // 100 * 2
      expect(result.element.newSize.height).toBe(200); // 100 * 2
    });
  });

  describe("ui_canvas_apply_style", () => {
    it("should apply fill color", async () => {
      const result = await callTool("ui_canvas_apply_style", {
        elementId: rectangleId,
        fill: "#00ff00"
      });

      expect(result.ok).toBe(true);
      expect(result.appliedStyles).toContain("fill");

      // Verify in store
      const element = useLayoutCanvasStore.getState().findElement(rectangleId);
      expect((element?.properties as any).fillColor).toBe("#00ff00");
    });

    it("should apply shadow", async () => {
      const result = await callTool("ui_canvas_apply_style", {
        elementId: rectangleId,
        shadowEnabled: true,
        shadowColor: "#00000050",
        shadowOffsetY: 4,
        shadowBlur: 8
      });

      expect(result.ok).toBe(true);

      // Verify shadow in store
      const element = useLayoutCanvasStore.getState().findElement(rectangleId);
      const shadow = (element?.properties as any).shadow;
      expect(shadow.enabled).toBe(true);
      expect(shadow.color).toBe("#00000050");
    });
  });

  describe("ui_canvas_delete_elements", () => {
    it("should delete specified elements", async () => {
      const result = await callTool("ui_canvas_delete_elements", {
        elementIds: [rectangleId]
      });

      expect(result.ok).toBe(true);
      expect(result.deletedIds).toContain(rectangleId);

      // Verify deleted
      const state = useLayoutCanvasStore.getState();
      expect(state.canvasData.elements).toHaveLength(0);
    });
  });

  describe("ui_canvas_duplicate_elements", () => {
    it("should duplicate elements", async () => {
      const result = await callTool("ui_canvas_duplicate_elements", {
        elementIds: [rectangleId]
      });

      expect(result.ok).toBe(true);
      expect(result.newElements).toHaveLength(1);
      expect(result.newIds[0]).not.toBe(rectangleId);

      // Verify duplicated
      const state = useLayoutCanvasStore.getState();
      expect(state.canvasData.elements).toHaveLength(2);
    });
  });
});

describe("Canvas Layout Tools", () => {
  let elementIds: string[] = [];

  beforeEach(async () => {
    resetStore();
    elementIds = [];
    for (let i = 0; i < 4; i++) {
      const result = await callTool("ui_canvas_create_rectangle", {
        x: 50 + i * 60,
        y: 50 + i * 40,
        width: 50,
        height: 50
      });
      elementIds.push(result.element.id);
    }
  });

  describe("ui_canvas_align_elements", () => {
    it("should align elements left", async () => {
      const result = await callTool("ui_canvas_align_elements", {
        elementIds,
        direction: "left"
      });

      expect(result.ok).toBe(true);
      expect(result.direction).toBe("left");

      // Verify all elements have same x position
      const state = useLayoutCanvasStore.getState();
      const elements = state.canvasData.elements;
      const xs = elements.map(el => el.x);
      expect(new Set(xs).size).toBe(1); // All same x
    });

    it("should align elements to canvas when specified", async () => {
      // Create a single element
      const result = await callTool("ui_canvas_create_rectangle", {
        x: 100, y: 100, width: 50, height: 50
      });

      const alignResult = await callTool("ui_canvas_align_elements", {
        elementIds: [result.element.id],
        direction: "left",
        alignToCanvas: true
      });

      expect(alignResult.ok).toBe(true);

      // Verify aligned to canvas edge
      const element = useLayoutCanvasStore.getState().findElement(result.element.id);
      expect(element?.x).toBe(0);
    });
  });

  describe("ui_canvas_distribute_elements", () => {
    it("should distribute elements horizontally", async () => {
      // First align them vertically so distribution is clear
      await callTool("ui_canvas_align_elements", {
        elementIds,
        direction: "top"
      });

      const result = await callTool("ui_canvas_distribute_elements", {
        elementIds,
        direction: "horizontal"
      });

      expect(result.ok).toBe(true);
    });

    it("should require at least 3 elements", async () => {
      const result = await callTool("ui_canvas_distribute_elements", {
        elementIds: elementIds.slice(0, 2),
        direction: "horizontal"
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("3 elements");
    });
  });

  describe("ui_canvas_tidy_elements", () => {
    it("should arrange elements into grid", async () => {
      const result = await callTool("ui_canvas_tidy_elements", {
        elementIds,
        spacing: 20
      });

      expect(result.ok).toBe(true);
      expect(result.spacing).toBe(20);
    });
  });

  describe("ui_canvas_set_spacing", () => {
    it("should set horizontal spacing", async () => {
      // First align vertically
      await callTool("ui_canvas_align_elements", {
        elementIds,
        direction: "top"
      });

      const result = await callTool("ui_canvas_set_spacing", {
        elementIds,
        direction: "horizontal",
        spacing: 30
      });

      expect(result.ok).toBe(true);
      expect(result.spacing).toBe(30);
    });
  });

  describe("ui_canvas_bring_to_front", () => {
    it("should bring elements to front", async () => {
      const result = await callTool("ui_canvas_bring_to_front", {
        elementIds: [elementIds[0]]
      });

      expect(result.ok).toBe(true);
    });
  });
});

describe("Canvas Query Tools", () => {
  beforeEach(async () => {
    resetStore();

    // Create some test elements
    await callTool("ui_canvas_create_rectangle", { x: 0, y: 0, width: 100, height: 100, name: "Rect 1" });
    await callTool("ui_canvas_create_text", { x: 50, y: 50, content: "Hello", name: "Text 1" });
    await callTool("ui_canvas_create_ellipse", { x: 100, y: 100, width: 50, height: 50, name: "Circle 1" });
  });

  describe("ui_canvas_get_state", () => {
    it("should return canvas state", async () => {
      const result = await callTool("ui_canvas_get_state", {});

      expect(result.ok).toBe(true);
      expect(result.elements).toHaveLength(3);
      expect(result.canvas.elementCount).toBe(3);
    });
  });

  describe("ui_canvas_get_element", () => {
    it("should return element details", async () => {
      const state = useLayoutCanvasStore.getState();
      const elementId = state.canvasData.elements[0].id;

      const result = await callTool("ui_canvas_get_element", { elementId });

      expect(result.ok).toBe(true);
      expect(result.element.id).toBe(elementId);
    });

    it("should return error for non-existent element", async () => {
      const result = await callTool("ui_canvas_get_element", { elementId: "fake-id" });

      expect(result.ok).toBe(false);
    });
  });

  describe("ui_canvas_list_elements", () => {
    it("should list all elements", async () => {
      const result = await callTool("ui_canvas_list_elements", {});

      expect(result.ok).toBe(true);
      expect(result.count).toBe(3);
    });

    it("should filter by type", async () => {
      const result = await callTool("ui_canvas_list_elements", { type: "text" });

      expect(result.ok).toBe(true);
      expect(result.count).toBe(1);
    });

    it("should filter by name", async () => {
      const result = await callTool("ui_canvas_list_elements", { nameContains: "Rect" });

      expect(result.ok).toBe(true);
      expect(result.count).toBe(1);
    });
  });

  describe("ui_canvas_find_at_position", () => {
    it("should find elements at position", async () => {
      const result = await callTool("ui_canvas_find_at_position", { x: 50, y: 50 });

      expect(result.ok).toBe(true);
      expect(result.count).toBeGreaterThan(0);
    });
  });

  describe("ui_canvas_get_bounds", () => {
    it("should calculate bounds of all elements", async () => {
      const result = await callTool("ui_canvas_get_bounds", {});

      expect(result.ok).toBe(true);
      expect(result.bounds).toHaveProperty("x");
      expect(result.bounds).toHaveProperty("y");
      expect(result.bounds).toHaveProperty("width");
      expect(result.bounds).toHaveProperty("height");
    });
  });

  describe("ui_canvas_get_dimensions", () => {
    it("should return canvas dimensions", async () => {
      const result = await callTool("ui_canvas_get_dimensions", {});

      expect(result.ok).toBe(true);
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
    });
  });
});

describe("Canvas Export Tools", () => {
  beforeEach(async () => {
    resetStore();
    await callTool("ui_canvas_create_rectangle", { x: 0, y: 0, width: 100, height: 100 });
  });

  describe("ui_canvas_export_json", () => {
    it("should export canvas as JSON", async () => {
      const result = await callTool("ui_canvas_export_json", {});

      expect(result.ok).toBe(true);
      expect(result.format).toBe("json");
      expect(result.data).toBeDefined();
      expect(result.data.elements).toHaveLength(1);
    });
  });

  describe("ui_canvas_get_export_data", () => {
    it("should return minimal export", async () => {
      const result = await callTool("ui_canvas_get_export_data", { format: "minimal" });

      expect(result.ok).toBe(true);
      expect(result.elements).toBeDefined();
    });

    it("should return full export", async () => {
      const result = await callTool("ui_canvas_get_export_data", { format: "json" });

      expect(result.ok).toBe(true);
      expect(result.data).toBeDefined();
    });
  });
});
