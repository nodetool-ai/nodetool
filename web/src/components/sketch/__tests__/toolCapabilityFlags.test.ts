/**
 * packageD-refactorSupport.test.ts
 *
 * Tests for Package D — Refactor support:
 * - Tool capability flags (showsBrushCursor, showsActiveStrokePreview)
 * - Generic hover dispatch via onHoverMove
 * - Blur tool continuous stroke behavior
 * - Duplicate layer naming with numeric suffix
 */

import { getToolHandler } from "../tools";
import { TransformTool } from "../tools/TransformTool";
import { SelectTool } from "../tools/SelectTool";
import { useSketchStore } from "../state/useSketchStore";
import { act } from "@testing-library/react";

// ─── Tool capability flags ─────────────────────────────────────────────────

describe("Tool capability flags", () => {
  describe("showsBrushCursor", () => {
    it.each(["brush", "pencil", "eraser", "blur", "clone_stamp"] as const)(
      "%s declares showsBrushCursor = true",
      (tool) => {
        const handler = getToolHandler(tool);
        expect(handler.showsBrushCursor).toBe(true);
      }
    );

    it.each([
      "eyedropper",
      "move",
      "transform",
      "fill",
      "gradient",
      "crop",
      "select",
      "adjust",
      "segment"
    ] as const)(
      "%s does not declare showsBrushCursor",
      (tool) => {
        const handler = getToolHandler(tool);
        expect(handler.showsBrushCursor).toBeFalsy();
      }
    );
  });

  describe("showsActiveStrokePreview", () => {
    it.each(["brush", "pencil", "eraser"] as const)(
      "%s declares showsActiveStrokePreview = true",
      (tool) => {
        const handler = getToolHandler(tool);
        expect(handler.showsActiveStrokePreview).toBe(true);
      }
    );

    it.each([
      "blur",
      "clone_stamp",
      "eyedropper",
      "move",
      "transform",
      "fill",
      "gradient",
      "crop",
      "select",
      "adjust",
      "segment"
    ] as const)(
      "%s does not declare showsActiveStrokePreview",
      (tool) => {
        const handler = getToolHandler(tool);
        expect(handler.showsActiveStrokePreview).toBeFalsy();
      }
    );
  });
});

// ─── Generic hover dispatch ─────────────────────────────────────────────────

describe("Generic hover dispatch via onHoverMove", () => {
  it("TransformTool implements onHoverMove", () => {
    const handler = getToolHandler("transform");
    expect(handler).toBeInstanceOf(TransformTool);
    expect(typeof handler.onHoverMove).toBe("function");
  });

  it("SelectTool implements onHoverMove", () => {
    const handler = getToolHandler("select");
    expect(handler).toBeInstanceOf(SelectTool);
    expect(typeof handler.onHoverMove).toBe("function");
  });

  it("tools without hover behavior do not implement onHoverMove", () => {
    const noHoverTools = [
      "brush",
      "pencil",
      "eraser",
      "blur",
      "clone_stamp",
      "fill",
      "gradient",
      "eyedropper",
      "move",
      "adjust"
    ] as const;
    for (const tool of noHoverTools) {
      const handler = getToolHandler(tool);
      expect(handler.onHoverMove).toBeUndefined();
    }
  });
});

// ─── Blur tool: no source snapshot (enables continuous strokes) ─────────────

describe("Blur tool continuous stroke behavior", () => {
  it("blur tool does not create a source snapshot canvas", () => {
    // The BlurTool should read from the layer canvas directly (not a snapshot)
    // so that blur accumulates during continuous strokes.
    // Access the private blurSourceCanvas via casting to verify it stays null
    // after initialization.
    const handler = getToolHandler("blur");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blurHandler = handler as any;
    // Before any interaction, blurSourceCanvas should be null
    expect(blurHandler.blurSourceCanvas).toBeNull();
  });
});

// ─── Duplicate layer naming ─────────────────────────────────────────────────

describe("Duplicate layer naming with numeric suffix", () => {
  beforeEach(() => {
    // Reset store to default state
    useSketchStore.getState().resetDocument();
  });

  it("first duplicate gets 'copy 1' suffix", () => {
    const layerId = useSketchStore.getState().document.layers[0].id;
    act(() => {
      useSketchStore.getState().duplicateLayer(layerId);
    });
    const layers = useSketchStore.getState().document.layers;
    expect(layers[1].name).toBe("Background copy 1");
  });

  it("second duplicate increments to 'copy 2'", () => {
    const layerId = useSketchStore.getState().document.layers[0].id;
    act(() => {
      useSketchStore.getState().duplicateLayer(layerId);
    });
    act(() => {
      useSketchStore.getState().duplicateLayer(layerId);
    });
    const layers = useSketchStore.getState().document.layers;
    // Second duplicate is inserted right after the original (index 1),
    // pushing the first copy to index 2
    const names = layers.map((l) => l.name);
    expect(names).toContain("Background copy 1");
    expect(names).toContain("Background copy 2");
  });

  it("duplicating a copy strips existing suffix before generating new name", () => {
    const layerId = useSketchStore.getState().document.layers[0].id;
    act(() => {
      useSketchStore.getState().duplicateLayer(layerId);
    });
    // Now duplicate the copy itself
    const copyLayerId = useSketchStore.getState().document.layers[1].id;
    act(() => {
      useSketchStore.getState().duplicateLayer(copyLayerId);
    });
    const layers = useSketchStore.getState().document.layers;
    // The duplicate of "Background copy 1" should use the base "Background" name
    // and find the next available number
    expect(layers[2].name).toBe("Background copy 2");
  });

  it("handles custom layer names correctly", () => {
    // Rename the first layer
    act(() => {
      const doc = useSketchStore.getState().document;
      const updated = {
        ...doc,
        layers: doc.layers.map((l) => ({ ...l, name: "My Layer" }))
      };
      useSketchStore.getState().setDocument(updated);
    });
    const layerId = useSketchStore.getState().document.layers[0].id;
    act(() => {
      useSketchStore.getState().duplicateLayer(layerId);
    });
    const layers = useSketchStore.getState().document.layers;
    expect(layers[1].name).toBe("My Layer copy 1");
  });
});
