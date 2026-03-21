/**
 * Tests for Expose Layer Input/Output feature.
 *
 * Validates:
 * - Layer type includes exposedAsInput/exposedAsOutput optional fields
 * - Store toggleLayerExposedInput/toggleLayerExposedOutput actions
 * - Default layers don't have exposed flags
 * - Toggling on/off works correctly
 * - Serialization round-trip preserves exposed flags
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import { Layer, createDefaultLayer, createDefaultDocument } from "../types";
import { serializeDocument, deserializeDocument } from "../serialization";

// Reset store before each test
beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

describe("Expose Layer Input/Output", () => {
  // ─── Type defaults ─────────────────────────────────────────────────

  describe("layer type defaults", () => {
    it("createDefaultLayer does not set exposedAsInput", () => {
      const layer = createDefaultLayer("Test");
      expect(layer.exposedAsInput).toBeUndefined();
    });

    it("createDefaultLayer does not set exposedAsOutput", () => {
      const layer = createDefaultLayer("Test");
      expect(layer.exposedAsOutput).toBeUndefined();
    });

    it("new layers in document don't have exposed flags", () => {
      const layers = useSketchStore.getState().document.layers;
      for (const layer of layers) {
        expect(layer.exposedAsInput).toBeUndefined();
        expect(layer.exposedAsOutput).toBeUndefined();
      }
    });
  });

  // ─── Store toggle actions ──────────────────────────────────────────

  describe("toggleLayerExposedInput", () => {
    it("toggles exposedAsInput on", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().toggleLayerExposedInput(layerId);
      });
      const layer = useSketchStore.getState().document.layers.find(
        (l) => l.id === layerId
      );
      expect(layer?.exposedAsInput).toBe(true);
    });

    it("toggles exposedAsInput off", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().toggleLayerExposedInput(layerId);
        useSketchStore.getState().toggleLayerExposedInput(layerId);
      });
      const layer = useSketchStore.getState().document.layers.find(
        (l) => l.id === layerId
      );
      expect(layer?.exposedAsInput).toBe(false);
    });

    it("only affects the targeted layer", () => {
      act(() => {
        useSketchStore.getState().addLayer("Second Layer");
      });
      const layers = useSketchStore.getState().document.layers;
      const targetId = layers[0].id;
      const otherId = layers[1].id;

      act(() => {
        useSketchStore.getState().toggleLayerExposedInput(targetId);
      });

      const updatedLayers = useSketchStore.getState().document.layers;
      expect(updatedLayers.find((l) => l.id === targetId)?.exposedAsInput).toBe(true);
      expect(updatedLayers.find((l) => l.id === otherId)?.exposedAsInput).toBeUndefined();
    });
  });

  describe("toggleLayerExposedOutput", () => {
    it("toggles exposedAsOutput on", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().toggleLayerExposedOutput(layerId);
      });
      const layer = useSketchStore.getState().document.layers.find(
        (l) => l.id === layerId
      );
      expect(layer?.exposedAsOutput).toBe(true);
    });

    it("toggles exposedAsOutput off", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().toggleLayerExposedOutput(layerId);
        useSketchStore.getState().toggleLayerExposedOutput(layerId);
      });
      const layer = useSketchStore.getState().document.layers.find(
        (l) => l.id === layerId
      );
      expect(layer?.exposedAsOutput).toBe(false);
    });
  });

  // ─── Both toggles work independently ──────────────────────────────

  describe("independent input/output toggling", () => {
    it("can expose a layer as both input and output", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().toggleLayerExposedInput(layerId);
        useSketchStore.getState().toggleLayerExposedOutput(layerId);
      });
      const layer = useSketchStore.getState().document.layers.find(
        (l) => l.id === layerId
      );
      expect(layer?.exposedAsInput).toBe(true);
      expect(layer?.exposedAsOutput).toBe(true);
    });

    it("toggling input doesn't affect output flag", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().toggleLayerExposedOutput(layerId);
        useSketchStore.getState().toggleLayerExposedInput(layerId);
      });
      const layer = useSketchStore.getState().document.layers.find(
        (l) => l.id === layerId
      );
      expect(layer?.exposedAsInput).toBe(true);
      expect(layer?.exposedAsOutput).toBe(true);

      // Toggle input off — output should remain
      act(() => {
        useSketchStore.getState().toggleLayerExposedInput(layerId);
      });
      const updated = useSketchStore.getState().document.layers.find(
        (l) => l.id === layerId
      );
      expect(updated?.exposedAsInput).toBe(false);
      expect(updated?.exposedAsOutput).toBe(true);
    });
  });

  // ─── Serialization round-trip ──────────────────────────────────────

  describe("serialization", () => {
    it("preserves exposedAsInput through serialization", () => {
      const doc = createDefaultDocument();
      doc.layers[0].exposedAsInput = true;

      const serialized = serializeDocument(doc);
      const deserialized = deserializeDocument(serialized);

      expect(deserialized).not.toBeNull();
      expect(deserialized!.layers[0].exposedAsInput).toBe(true);
    });

    it("preserves exposedAsOutput through serialization", () => {
      const doc = createDefaultDocument();
      doc.layers[0].exposedAsOutput = true;

      const serialized = serializeDocument(doc);
      const deserialized = deserializeDocument(serialized);

      expect(deserialized).not.toBeNull();
      expect(deserialized!.layers[0].exposedAsOutput).toBe(true);
    });

    it("handles missing exposed flags gracefully (backward compat)", () => {
      const doc = createDefaultDocument();
      // Simulate old document without exposed flags
      const serialized = serializeDocument(doc);
      const deserialized = deserializeDocument(serialized);

      expect(deserialized).not.toBeNull();
      // Should still be undefined (not set)
      expect(deserialized!.layers[0].exposedAsInput).toBeUndefined();
      expect(deserialized!.layers[0].exposedAsOutput).toBeUndefined();
    });
  });
});
