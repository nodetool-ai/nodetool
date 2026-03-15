/**
 * Tests for Sketch Store
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import { createDefaultDocument } from "../types";

// Reset store before each test
beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

describe("useSketchStore", () => {
  describe("initial state", () => {
    it("has a default document", () => {
      const state = useSketchStore.getState();
      expect(state.document).toBeDefined();
      expect(state.document.layers).toHaveLength(1);
    });

    it("starts with brush tool", () => {
      expect(useSketchStore.getState().activeTool).toBe("brush");
    });

    it("starts with zoom 1", () => {
      expect(useSketchStore.getState().zoom).toBe(1);
    });

    it("starts with empty history", () => {
      const state = useSketchStore.getState();
      expect(state.history).toHaveLength(0);
      expect(state.historyIndex).toBe(-1);
    });
  });

  describe("tool actions", () => {
    it("sets active tool", () => {
      act(() => {
        useSketchStore.getState().setActiveTool("eraser");
      });
      expect(useSketchStore.getState().activeTool).toBe("eraser");
    });

    it("sets brush settings", () => {
      act(() => {
        useSketchStore.getState().setBrushSettings({ size: 50, color: "#ff0000" });
      });
      const brush = useSketchStore.getState().document.toolSettings.brush;
      expect(brush.size).toBe(50);
      expect(brush.color).toBe("#ff0000");
    });

    it("sets eraser settings", () => {
      act(() => {
        useSketchStore.getState().setEraserSettings({ size: 30 });
      });
      expect(useSketchStore.getState().document.toolSettings.eraser.size).toBe(30);
    });

    it("clamps zoom values", () => {
      act(() => {
        useSketchStore.getState().setZoom(0.01);
      });
      expect(useSketchStore.getState().zoom).toBe(0.1);

      act(() => {
        useSketchStore.getState().setZoom(100);
      });
      expect(useSketchStore.getState().zoom).toBe(10);
    });
  });

  describe("layer actions", () => {
    it("adds a layer", () => {
      let layerId: string;
      act(() => {
        layerId = useSketchStore.getState().addLayer("New Layer");
      });
      const layers = useSketchStore.getState().document.layers;
      expect(layers).toHaveLength(2);
      expect(layers[1].name).toBe("New Layer");
      expect(useSketchStore.getState().document.activeLayerId).toBe(layerId!);
    });

    it("removes a layer", () => {
      let layerId: string;
      act(() => {
        layerId = useSketchStore.getState().addLayer("To Remove");
      });
      act(() => {
        useSketchStore.getState().removeLayer(layerId);
      });
      expect(useSketchStore.getState().document.layers).toHaveLength(1);
    });

    it("does not remove the last layer", () => {
      const firstLayerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().removeLayer(firstLayerId);
      });
      expect(useSketchStore.getState().document.layers).toHaveLength(1);
    });

    it("duplicates a layer", () => {
      const firstLayerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().duplicateLayer(firstLayerId);
      });
      const layers = useSketchStore.getState().document.layers;
      expect(layers).toHaveLength(2);
      expect(layers[1].name).toBe("Background Copy");
    });

    it("reorders layers", () => {
      act(() => {
        useSketchStore.getState().addLayer("Layer A");
        useSketchStore.getState().addLayer("Layer B");
      });
      const beforeReorder = useSketchStore.getState().document.layers.map((l) => l.name);
      expect(beforeReorder).toEqual(["Background", "Layer A", "Layer B"]);

      act(() => {
        useSketchStore.getState().reorderLayers(0, 2);
      });
      const afterReorder = useSketchStore.getState().document.layers.map((l) => l.name);
      expect(afterReorder).toEqual(["Layer A", "Layer B", "Background"]);
    });

    it("toggles layer visibility", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      expect(useSketchStore.getState().document.layers[0].visible).toBe(true);

      act(() => {
        useSketchStore.getState().toggleLayerVisibility(layerId);
      });
      expect(useSketchStore.getState().document.layers[0].visible).toBe(false);

      act(() => {
        useSketchStore.getState().toggleLayerVisibility(layerId);
      });
      expect(useSketchStore.getState().document.layers[0].visible).toBe(true);
    });

    it("sets layer opacity with clamping", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;

      act(() => {
        useSketchStore.getState().setLayerOpacity(layerId, 0.5);
      });
      expect(useSketchStore.getState().document.layers[0].opacity).toBe(0.5);

      act(() => {
        useSketchStore.getState().setLayerOpacity(layerId, -1);
      });
      expect(useSketchStore.getState().document.layers[0].opacity).toBe(0);

      act(() => {
        useSketchStore.getState().setLayerOpacity(layerId, 2);
      });
      expect(useSketchStore.getState().document.layers[0].opacity).toBe(1);
    });

    it("renames a layer", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().renameLayer(layerId, "Renamed");
      });
      expect(useSketchStore.getState().document.layers[0].name).toBe("Renamed");
    });

    it("sets mask layer", () => {
      act(() => {
        useSketchStore.getState().addLayer("Mask Layer");
      });
      const maskId = useSketchStore.getState().document.layers[1].id;

      act(() => {
        useSketchStore.getState().setMaskLayer(maskId);
      });
      expect(useSketchStore.getState().document.maskLayerId).toBe(maskId);
      expect(useSketchStore.getState().document.layers[1].type).toBe("mask");

      // Unset mask
      act(() => {
        useSketchStore.getState().setMaskLayer(null);
      });
      expect(useSketchStore.getState().document.maskLayerId).toBeNull();
    });

    it("updates layer data", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().updateLayerData(layerId, "data:image/png;base64,test");
      });
      expect(useSketchStore.getState().document.layers[0].data).toBe(
        "data:image/png;base64,test"
      );
    });
  });

  describe("document actions", () => {
    it("sets a new document", () => {
      const newDoc = createDefaultDocument(800, 600);
      act(() => {
        useSketchStore.getState().setDocument(newDoc);
      });
      expect(useSketchStore.getState().document.canvas.width).toBe(800);
      expect(useSketchStore.getState().history).toHaveLength(0);
    });

    it("resets document", () => {
      act(() => {
        useSketchStore.getState().addLayer("Extra");
        useSketchStore.getState().setActiveTool("eraser");
        useSketchStore.getState().setZoom(3);
      });
      act(() => {
        useSketchStore.getState().resetDocument(256, 256);
      });
      const state = useSketchStore.getState();
      expect(state.document.canvas.width).toBe(256);
      expect(state.document.layers).toHaveLength(1);
      expect(state.activeTool).toBe("brush");
      expect(state.zoom).toBe(1);
    });
  });

  describe("history actions", () => {
    it("pushes history entries", () => {
      act(() => {
        useSketchStore.getState().pushHistory("draw");
      });
      expect(useSketchStore.getState().history).toHaveLength(1);
      expect(useSketchStore.getState().historyIndex).toBe(0);
    });

    it("canUndo returns false when no history", () => {
      expect(useSketchStore.getState().canUndo()).toBe(false);
    });

    it("canUndo returns true after pushing history", () => {
      act(() => {
        useSketchStore.getState().pushHistory("action1");
        useSketchStore.getState().pushHistory("action2");
      });
      expect(useSketchStore.getState().canUndo()).toBe(true);
    });

    it("canRedo returns false at the end of history", () => {
      act(() => {
        useSketchStore.getState().pushHistory("action1");
      });
      expect(useSketchStore.getState().canRedo()).toBe(false);
    });

    it("undo decrements history index", () => {
      act(() => {
        useSketchStore.getState().pushHistory("action1");
        useSketchStore.getState().pushHistory("action2");
      });
      expect(useSketchStore.getState().historyIndex).toBe(1);

      act(() => {
        useSketchStore.getState().undo();
      });
      expect(useSketchStore.getState().historyIndex).toBe(0);
    });

    it("redo increments history index", () => {
      act(() => {
        useSketchStore.getState().pushHistory("action1");
        useSketchStore.getState().pushHistory("action2");
      });
      act(() => {
        useSketchStore.getState().undo();
      });
      expect(useSketchStore.getState().canRedo()).toBe(true);

      act(() => {
        useSketchStore.getState().redo();
      });
      expect(useSketchStore.getState().historyIndex).toBe(1);
    });

    it("truncates future history when pushing after undo", () => {
      act(() => {
        useSketchStore.getState().pushHistory("action1");
        useSketchStore.getState().pushHistory("action2");
        useSketchStore.getState().pushHistory("action3");
      });
      act(() => {
        useSketchStore.getState().undo();
        useSketchStore.getState().undo();
      });
      act(() => {
        useSketchStore.getState().pushHistory("action4");
      });

      expect(useSketchStore.getState().history).toHaveLength(2);
      expect(useSketchStore.getState().history[1].action).toBe("action4");
    });
  });
});
