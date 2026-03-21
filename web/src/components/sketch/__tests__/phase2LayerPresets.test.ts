/**
 * Tests for Phase 2 Layer Presets & Related Features
 *
 * Tests for: layer color presets (transparent/black/white/gray),
 * addLayer with default transparent behavior, and eraser composite operation.
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import { createDefaultLayer, createDefaultDocument } from "../types";

// Reset store before each test
beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

describe("Phase 2 Layer Presets", () => {
  // ─── New layers are transparent by default ────────────────────────────

  describe("transparent layer creation", () => {
    it("creates a new layer with null data (transparent)", () => {
      const layer = createDefaultLayer("Test Layer");
      expect(layer.data).toBeNull();
      expect(layer.visible).toBe(true);
      expect(layer.opacity).toBe(1);
      expect(layer.blendMode).toBe("normal");
    });

    it("addLayer creates a transparent layer and returns its id", () => {
      let newLayerId: string;
      act(() => {
        newLayerId = useSketchStore.getState().addLayer();
      });
      const state = useSketchStore.getState();
      expect(state.document.layers).toHaveLength(2);
      const newLayer = state.document.layers.find(
        (l) => l.id === newLayerId!
      );
      expect(newLayer).toBeDefined();
      expect(newLayer!.data).toBeNull();
      expect(newLayer!.name).toBe("Layer 2");
    });

    it("addLayer makes the new layer active", () => {
      let newLayerId: string;
      act(() => {
        newLayerId = useSketchStore.getState().addLayer();
      });
      expect(useSketchStore.getState().document.activeLayerId).toBe(
        newLayerId!
      );
    });

    it("addLayer accepts a custom name", () => {
      act(() => {
        useSketchStore.getState().addLayer("Custom Layer");
      });
      const state = useSketchStore.getState();
      const newLayer = state.document.layers[state.document.layers.length - 1];
      expect(newLayer.name).toBe("Custom Layer");
    });

    it("addLayer can create a mask layer", () => {
      act(() => {
        useSketchStore.getState().addLayer("Mask", "mask");
      });
      const state = useSketchStore.getState();
      const newLayer = state.document.layers[state.document.layers.length - 1];
      expect(newLayer.type).toBe("mask");
    });
  });

  // ─── Default document has correct structure ────────────────────────────

  describe("default document", () => {
    it("creates document with one background layer", () => {
      const doc = createDefaultDocument();
      expect(doc.layers).toHaveLength(1);
      expect(doc.layers[0].name).toBe("Background");
      expect(doc.layers[0].type).toBe("raster");
      expect(doc.layers[0].data).toBeNull();
    });

    it("default canvas background is black", () => {
      const doc = createDefaultDocument();
      expect(doc.canvas.backgroundColor).toBe("#000000");
    });

    it("default canvas size is 512x512", () => {
      const doc = createDefaultDocument();
      expect(doc.canvas.width).toBe(512);
      expect(doc.canvas.height).toBe(512);
    });
  });

  // ─── Multiple layer creation ──────────────────────────────────────────

  describe("multiple layer creation", () => {
    it("can add multiple transparent layers", () => {
      act(() => {
        const store = useSketchStore.getState();
        store.addLayer("Layer 1");
        store.addLayer("Layer 2");
        store.addLayer("Layer 3");
      });
      const state = useSketchStore.getState();
      // 1 initial background + 3 new layers
      expect(state.document.layers).toHaveLength(4);
      // All new layers should be transparent (data: null)
      for (let i = 1; i < state.document.layers.length; i++) {
        expect(state.document.layers[i].data).toBeNull();
      }
    });

    it("layers get sequential default names", () => {
      act(() => {
        const store = useSketchStore.getState();
        store.addLayer();
        store.addLayer();
      });
      const state = useSketchStore.getState();
      expect(state.document.layers[1].name).toBe("Layer 2");
      expect(state.document.layers[2].name).toBe("Layer 3");
    });
  });

  // ─── Eraser composite operation ────────────────────────────────────────

  describe("eraser settings", () => {
    it("default eraser settings are correct", () => {
      const state = useSketchStore.getState();
      const eraser = state.document.toolSettings.eraser;
      expect(eraser.size).toBe(20);
      expect(eraser.opacity).toBe(1);
      expect(eraser.hardness).toBe(0.8);
    });

    it("eraser settings can be updated", () => {
      act(() => {
        useSketchStore.getState().setEraserSettings({
          size: 30,
          opacity: 0.5
        });
      });
      const state = useSketchStore.getState();
      expect(state.document.toolSettings.eraser.size).toBe(30);
      expect(state.document.toolSettings.eraser.opacity).toBe(0.5);
      // Hardness should remain unchanged
      expect(state.document.toolSettings.eraser.hardness).toBe(0.8);
    });
  });

  // ─── Layer updateLayerData ─────────────────────────────────────────────

  describe("layer data updates", () => {
    it("updateLayerData sets layer data", () => {
      const state = useSketchStore.getState();
      const layerId = state.document.layers[0].id;
      act(() => {
        useSketchStore.getState().updateLayerData(layerId, "data:image/png;base64,test");
      });
      const updatedLayer = useSketchStore
        .getState()
        .document.layers.find((l) => l.id === layerId);
      expect(updatedLayer!.data).toBe("data:image/png;base64,test");
    });

    it("updateLayerData can set data to null (transparent)", () => {
      const state = useSketchStore.getState();
      const layerId = state.document.layers[0].id;
      act(() => {
        useSketchStore
          .getState()
          .updateLayerData(layerId, "data:image/png;base64,test");
        useSketchStore.getState().updateLayerData(layerId, null);
      });
      const updatedLayer = useSketchStore
        .getState()
        .document.layers.find((l) => l.id === layerId);
      expect(updatedLayer!.data).toBeNull();
    });
  });
});
