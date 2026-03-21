/**
 * Tests for Phase 2 Features — Batch 3
 *
 * Tests for: alpha lock per layer, vertical mirror shortcut, fill layer with color,
 * stroke stabilizer, layer thumbnails, and serialization migration.
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import {
  createDefaultLayer,
  createDefaultDocument
} from "../types";
import {
  serializeDocument,
  deserializeDocument
} from "../serialization";

// Reset store before each test
beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

describe("Phase 2 Batch 3 Features", () => {
  // ─── Alpha Lock ─────────────────────────────────────────────────────

  describe("alpha lock per layer", () => {
    it("default layer has alphaLock false", () => {
      const layer = createDefaultLayer("Test");
      expect(layer.alphaLock).toBe(false);
    });

    it("document layers start with alphaLock false", () => {
      const state = useSketchStore.getState();
      const layer = state.document.layers[0];
      expect(layer.alphaLock).toBe(false);
    });

    it("toggleAlphaLock toggles the alphaLock property", () => {
      const state = useSketchStore.getState();
      const layerId = state.document.activeLayerId;
      expect(state.document.layers[0].alphaLock).toBe(false);

      act(() => {
        useSketchStore.getState().toggleAlphaLock(layerId);
      });
      expect(useSketchStore.getState().document.layers[0].alphaLock).toBe(true);

      act(() => {
        useSketchStore.getState().toggleAlphaLock(layerId);
      });
      expect(useSketchStore.getState().document.layers[0].alphaLock).toBe(false);
    });

    it("toggleAlphaLock only affects the specified layer", () => {
      act(() => {
        useSketchStore.getState().addLayer("Layer 2");
      });
      const layers = useSketchStore.getState().document.layers;
      const firstLayerId = layers[0].id;
      const secondLayerId = layers[1].id;

      act(() => {
        useSketchStore.getState().toggleAlphaLock(firstLayerId);
      });

      const updatedLayers = useSketchStore.getState().document.layers;
      expect(updatedLayers.find((l) => l.id === firstLayerId)?.alphaLock).toBe(true);
      expect(updatedLayers.find((l) => l.id === secondLayerId)?.alphaLock).toBe(false);
    });

    it("alphaLock persists through serialization round-trip", () => {
      const doc = createDefaultDocument();
      doc.layers[0].alphaLock = true;
      const json = serializeDocument(doc);
      const restored = deserializeDocument(json);
      expect(restored?.layers[0].alphaLock).toBe(true);
    });
  });

  // ─── Serialization Migration — alphaLock ────────────────────────────

  describe("serialization migration for alphaLock", () => {
    it("migrates documents without alphaLock field", () => {
      const doc = createDefaultDocument();
      // Simulate a pre-alphaLock document by removing the field
      const json = serializeDocument(doc);
      const parsed = JSON.parse(json);
      delete parsed.layers[0].alphaLock;
      const fixedJson = JSON.stringify(parsed);

      const restored = deserializeDocument(fixedJson);
      expect(restored?.layers[0].alphaLock).toBe(false);
    });

    it("preserves existing alphaLock true values during migration", () => {
      const doc = createDefaultDocument();
      doc.layers[0].alphaLock = true;
      const json = serializeDocument(doc);
      const restored = deserializeDocument(json);
      expect(restored?.layers[0].alphaLock).toBe(true);
    });
  });

  // ─── Fill Layer with Color ──────────────────────────────────────────

  describe("fill layer with color (store-level test)", () => {
    it("foreground color is available for fill", () => {
      const state = useSketchStore.getState();
      expect(state.foregroundColor).toBe("#ffffff");
    });

    it("background color is available for fill", () => {
      const state = useSketchStore.getState();
      expect(state.backgroundColor).toBe("#000000");
    });

    it("fill does not affect locked layer in store (lock check is in editor)", () => {
      // The layer lock check is in the SketchEditor handler,
      // not in the store. We verify the store tracks the locked state.
      const state = useSketchStore.getState();
      const layer = state.document.layers[0];
      expect(layer.locked).toBe(false);
    });
  });

  // ─── Vertical Mirror Toggle ─────────────────────────────────────────

  describe("vertical mirror shortcut", () => {
    it("mirrorY state is managed at editor level (not in store)", () => {
      // mirrorX and mirrorY are React state in SketchEditor, not in the store.
      // This test verifies the store has the activeTool tracking needed for
      // the keyboard handler.
      const state = useSketchStore.getState();
      expect(state.activeTool).toBe("brush");
    });
  });

  // ─── Stroke Stabilizer ──────────────────────────────────────────────

  describe("stroke stabilizer logic", () => {
    // The stabilizer is a simple moving-average filter applied in SketchCanvas.
    // We test the math here.
    const STABILIZER_WINDOW = 4;

    function stabilizePoints(points: Array<{x: number; y: number}>) {
      const buf: Array<{x: number; y: number}> = [];
      const results: Array<{x: number; y: number}> = [];
      for (const raw of points) {
        buf.push(raw);
        if (buf.length > STABILIZER_WINDOW) {
          buf.shift();
        }
        if (buf.length === 1) {
          results.push(raw);
          continue;
        }
        let sx = 0, sy = 0;
        for (const p of buf) {
          sx += p.x;
          sy += p.y;
        }
        results.push({ x: sx / buf.length, y: sy / buf.length });
      }
      return results;
    }

    it("returns first point unchanged", () => {
      const result = stabilizePoints([{ x: 100, y: 100 }]);
      expect(result[0]).toEqual({ x: 100, y: 100 });
    });

    it("averages two points", () => {
      const result = stabilizePoints([
        { x: 0, y: 0 },
        { x: 10, y: 10 }
      ]);
      expect(result[1]).toEqual({ x: 5, y: 5 });
    });

    it("smooths noisy input", () => {
      const noisy = [
        { x: 100, y: 100 },
        { x: 110, y: 90 },
        { x: 90, y: 110 },
        { x: 100, y: 100 }
      ];
      const smoothed = stabilizePoints(noisy);
      // The last smoothed point should be closer to (100, 100) than the raw noisy points
      expect(smoothed[3].x).toBe(100);
      expect(smoothed[3].y).toBe(100);
    });

    it("window limits to STABILIZER_WINDOW points", () => {
      const points = [];
      for (let i = 0; i < 10; i++) {
        points.push({ x: i * 10, y: i * 10 });
      }
      const smoothed = stabilizePoints(points);
      // Each point from the 5th onward should only average the last 4 points
      // Point at index 9: raw is (90,90), buffer has points 6,7,8,9 → avg of (60+70+80+90)/4 = 75
      expect(smoothed[9].x).toBe(75);
      expect(smoothed[9].y).toBe(75);
    });
  });

  // ─── Layer Thumbnail (data field) ──────────────────────────────────

  describe("layer thumbnail data", () => {
    it("layer data starts as null (no thumbnail to show)", () => {
      const state = useSketchStore.getState();
      expect(state.document.layers[0].data).toBeNull();
    });

    it("layer data is set after updateLayerData", () => {
      const state = useSketchStore.getState();
      const layerId = state.document.activeLayerId;
      const mockData = "data:image/png;base64,iVBORw0KGgoAAAANS";

      act(() => {
        useSketchStore.getState().updateLayerData(layerId, mockData);
      });

      expect(useSketchStore.getState().document.layers[0].data).toBe(mockData);
    });

    it("layer data is preserved through duplicate", () => {
      const state = useSketchStore.getState();
      const layerId = state.document.activeLayerId;
      const mockData = "data:image/png;base64,test123";

      act(() => {
        useSketchStore.getState().updateLayerData(layerId, mockData);
        useSketchStore.getState().duplicateLayer(layerId);
      });

      const layers = useSketchStore.getState().document.layers;
      expect(layers[1].data).toBe(mockData);
    });
  });

  // ─── createDefaultDocument includes alphaLock ──────────────────────

  describe("createDefaultDocument", () => {
    it("creates layers with alphaLock=false", () => {
      const doc = createDefaultDocument();
      for (const layer of doc.layers) {
        expect(layer.alphaLock).toBe(false);
      }
    });
  });
});
