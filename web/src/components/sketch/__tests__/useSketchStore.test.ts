/**
 * Tests for Sketch Store
 */

import { act } from "@testing-library/react";
import { useSketchStore, SKETCH_ZOOM_MAX } from "../state/useSketchStore";
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

    it("setActiveTool does not change transient move flag", () => {
      act(() => {
        useSketchStore.getState().setTransientMoveModifierHeld(true);
      });
      expect(useSketchStore.getState().transientMoveModifierHeld).toBe(true);
      expect(useSketchStore.getState().activeTool).toBe("brush");
      act(() => {
        useSketchStore.getState().setActiveTool("pencil");
      });
      expect(useSketchStore.getState().activeTool).toBe("pencil");
      expect(useSketchStore.getState().transientMoveModifierHeld).toBe(true);
    });

    it("setTransientMoveModifierHeld toggles spring move without changing active tool", () => {
      act(() => {
        useSketchStore.getState().setActiveTool("eraser");
        useSketchStore.getState().setTransientMoveModifierHeld(true);
      });
      const s = useSketchStore.getState();
      expect(s.activeTool).toBe("eraser");
      expect(s.transientMoveModifierHeld).toBe(true);
    });

    it("setTransientMoveModifierHeld false after true leaves tool unchanged", () => {
      act(() => {
        useSketchStore.getState().setActiveTool("fill");
        useSketchStore.getState().setTransientMoveModifierHeld(true);
        useSketchStore.getState().setTransientMoveModifierHeld(false);
      });
      const s = useSketchStore.getState();
      expect(s.activeTool).toBe("fill");
      expect(s.transientMoveModifierHeld).toBe(false);
    });

    it("sets brush settings", () => {
      act(() => {
        useSketchStore.getState().setBrushSettings({ size: 50, color: "#ff0000" });
      });
      const brush = useSketchStore.getState().document.toolSettings.brush;
      expect(brush.size).toBe(50);
      expect(brush.color).toBe("#ff0000");
    });

    it("sets pencil settings", () => {
      act(() => {
        useSketchStore.getState().setPencilSettings({ size: 3, color: "#00ff00" });
      });
      const pencil = useSketchStore.getState().document.toolSettings.pencil;
      expect(pencil.size).toBe(3);
      expect(pencil.color).toBe("#00ff00");
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
      expect(useSketchStore.getState().zoom).toBe(SKETCH_ZOOM_MAX);
    });
  });

  describe("swapColors", () => {
    it("keeps brush and pencil colors aligned with the foreground swatch", () => {
      act(() => {
        useSketchStore.getState().setForegroundColor("#ff0000");
        useSketchStore.getState().setBackgroundColor("#00ff00");
        useSketchStore.getState().setBrushSettings({ color: "#ff0000" });
        useSketchStore.getState().setPencilSettings({ color: "#ff0000" });
        useSketchStore.getState().swapColors();
      });
      const s = useSketchStore.getState();
      expect(s.foregroundColor).toBe("#00ff00");
      expect(s.backgroundColor).toBe("#ff0000");
      expect(s.document.toolSettings.brush.color).toBe("#00ff00");
      expect(s.document.toolSettings.pencil.color).toBe("#00ff00");
    });

    it("leaves a custom brush color unchanged when it did not match the old foreground", () => {
      act(() => {
        useSketchStore.getState().setForegroundColor("#ff0000");
        useSketchStore.getState().setBackgroundColor("#00ff00");
        useSketchStore.getState().setBrushSettings({ color: "#336699" });
        useSketchStore.getState().swapColors();
      });
      expect(useSketchStore.getState().document.toolSettings.brush.color).toBe(
        "#336699"
      );
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

    it("unlocks duplicated locked layers", () => {
      const firstLayerId = useSketchStore.getState().document.layers[0].id;

      act(() => {
        const doc = useSketchStore.getState().document;
        useSketchStore.getState().setDocument({
          ...doc,
          layers: doc.layers.map((layer) =>
            layer.id === firstLayerId
              ? {
                  ...layer,
                  locked: true,
                  exposedAsInput: true,
                  exposedAsOutput: true,
                  imageReference: {
                    uri: "https://example.com/reference.png",
                    naturalWidth: 128,
                    naturalHeight: 128,
                    objectFit: "fill"
                  }
                }
              : layer
          )
        });
      });

      act(() => {
        useSketchStore.getState().duplicateLayer(firstLayerId);
      });

      const layers = useSketchStore.getState().document.layers;
      expect(layers).toHaveLength(2);
      expect(layers[1].name).toBe("Background Copy");
      expect(layers[1].locked).toBe(false);
      expect(layers[1].exposedAsInput).toBe(false);
      expect(layers[1].exposedAsOutput).toBe(false);
      expect(layers[1].imageReference).toBeUndefined();
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

    it("clears layer data (set to null)", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().updateLayerData(layerId, "data:image/png;base64,test");
      });
      expect(useSketchStore.getState().document.layers[0].data).toBe(
        "data:image/png;base64,test"
      );
      act(() => {
        useSketchStore.getState().updateLayerData(layerId, null);
      });
      expect(useSketchStore.getState().document.layers[0].data).toBeNull();
    });

    it("updates layer transform", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().setLayerTransform(layerId, { x: 12, y: -8 });
      });
      expect(useSketchStore.getState().document.layers[0].transform).toEqual({
        x: 12,
        y: -8
      });
    });

    it("translates a layer relative to its current transform", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().setLayerTransform(layerId, { x: 3, y: 4 });
        useSketchStore.getState().translateLayer(layerId, 5, -2);
      });
      expect(useSketchStore.getState().document.layers[0].transform).toEqual({
        x: 8,
        y: 2
      });
    });

    it("supports explicit committed transform actions", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().updateLayerData(layerId, "mock-layer-data");
        useSketchStore.getState().setLayerContentBounds(layerId, {
          x: -12,
          y: 8,
          width: 96,
          height: 48
        });
        useSketchStore.getState().commitLayerTransform(layerId, { x: 10, y: 6 });
        useSketchStore.getState().offsetLayerTransform(layerId, -4, 3);
      });
      const layer = useSketchStore.getState().document.layers[0];
      expect(layer.transform).toEqual({
        x: 6,
        y: 9
      });
      expect(layer.data).toBe("mock-layer-data");
      expect(layer.contentBounds).toEqual({
        x: -12,
        y: 8,
        width: 96,
        height: 48
      });
    });

    it("mergeLayerDown resets the surviving layer to document-space bounds", () => {
      const lowerId = useSketchStore.getState().document.layers[0].id;
      let upperId = "";

      act(() => {
        upperId = useSketchStore.getState().addLayer("Upper");
        useSketchStore.getState().setLayerTransform(lowerId, { x: 5, y: 6 });
        useSketchStore.getState().setLayerContentBounds(lowerId, {
          x: 2,
          y: 3,
          width: 40,
          height: 30
        });
        useSketchStore.getState().setLayerTransform(upperId, { x: -8, y: 4 });
        useSketchStore.getState().setLayerContentBounds(upperId, {
          x: -10,
          y: 12,
          width: 20,
          height: 16
        });
      });

      act(() => {
        useSketchStore.getState().mergeLayerDown(upperId);
      });

      const state = useSketchStore.getState();
      expect(state.document.layers).toHaveLength(1);
      expect(state.document.layers[0].id).toBe(lowerId);
      expect(state.document.layers[0].transform).toEqual({ x: 0, y: 0 });
      expect(state.document.layers[0].contentBounds).toEqual({
        x: 0,
        y: 0,
        width: state.document.canvas.width,
        height: state.document.canvas.height
      });
    });

    it("flattenVisible creates one identity layer covering the document", () => {
      let upperId = "";

      act(() => {
        upperId = useSketchStore.getState().addLayer("Upper");
        useSketchStore.getState().setLayerTransform(upperId, { x: 9, y: -7 });
        useSketchStore.getState().setLayerContentBounds(upperId, {
          x: -4,
          y: 11,
          width: 24,
          height: 18
        });
      });

      act(() => {
        useSketchStore.getState().flattenVisible();
      });

      const state = useSketchStore.getState();
      expect(state.document.layers).toHaveLength(1);
      expect(state.document.activeLayerId).toBe(state.document.layers[0].id);
      expect(state.document.maskLayerId).toBeNull();
      expect(state.document.layers[0].transform).toEqual({ x: 0, y: 0 });
      expect(state.document.layers[0].contentBounds).toEqual({
        x: 0,
        y: 0,
        width: state.document.canvas.width,
        height: state.document.canvas.height
      });
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
      expect(useSketchStore.getState().history[0].restoreMode).toBe("full");
    });

    it("stores transform-aware layer metadata in history snapshots", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().setLayerTransform(layerId, { x: 7, y: 9 });
        useSketchStore.getState().pushHistory("move");
      });
      expect(useSketchStore.getState().history[0].layerStructure[0]?.transform).toEqual({
        x: 7,
        y: 9
      });
    });

    it("supports structure-only history entries for transform-only edits", () => {
      act(() => {
        useSketchStore.getState().pushHistory("move", undefined, {
          restoreMode: "structure-only"
        });
      });
      expect(useSketchStore.getState().history[0].restoreMode).toBe("structure-only");
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

  describe("shape and fill settings", () => {
    it("sets shape settings", () => {
      act(() => {
        useSketchStore.getState().setShapeSettings({ strokeColor: "#ff0000", strokeWidth: 5 });
      });
      const shape = useSketchStore.getState().document.toolSettings.shape;
      expect(shape.strokeColor).toBe("#ff0000");
      expect(shape.strokeWidth).toBe(5);
    });

    it("sets fill settings", () => {
      act(() => {
        useSketchStore.getState().setFillSettings({ color: "#00ff00", tolerance: 50 });
      });
      const fill = useSketchStore.getState().document.toolSettings.fill;
      expect(fill.color).toBe("#00ff00");
      expect(fill.tolerance).toBe(50);
    });

    it("sets shape filled and fillColor", () => {
      act(() => {
        useSketchStore.getState().setShapeSettings({ filled: true, fillColor: "#0000ff" });
      });
      const shape = useSketchStore.getState().document.toolSettings.shape;
      expect(shape.filled).toBe(true);
      expect(shape.fillColor).toBe("#0000ff");
    });
  });

  describe("layer blend mode", () => {
    it("sets layer blend mode", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().setLayerBlendMode(layerId, "multiply");
      });
      expect(useSketchStore.getState().document.layers[0].blendMode).toBe("multiply");
    });

    it("sets different blend modes", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      const modes = [
        "normal", "multiply", "screen", "overlay", "darken", "lighten",
        "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion"
      ] as const;
      for (const mode of modes) {
        act(() => {
          useSketchStore.getState().setLayerBlendMode(layerId, mode);
        });
        expect(useSketchStore.getState().document.layers[0].blendMode).toBe(mode);
      }
    });

    it("default layer has normal blend mode", () => {
      expect(useSketchStore.getState().document.layers[0].blendMode).toBe("normal");
    });
  });

  describe("new tool types", () => {
    it("sets move tool", () => {
      act(() => {
        useSketchStore.getState().setActiveTool("move");
      });
      expect(useSketchStore.getState().activeTool).toBe("move");
    });

    it("sets fill tool", () => {
      act(() => {
        useSketchStore.getState().setActiveTool("fill");
      });
      expect(useSketchStore.getState().activeTool).toBe("fill");
    });

    it("sets pencil tool", () => {
      act(() => {
        useSketchStore.getState().setActiveTool("pencil");
      });
      expect(useSketchStore.getState().activeTool).toBe("pencil");
    });

    it("sets shape tools", () => {
      const shapeTools = ["line", "rectangle", "ellipse", "arrow"] as const;
      for (const tool of shapeTools) {
        act(() => {
          useSketchStore.getState().setActiveTool(tool);
        });
        expect(useSketchStore.getState().activeTool).toBe(tool);
      }
    });
  });
});
