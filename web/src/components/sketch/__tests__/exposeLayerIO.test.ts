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
import { createDefaultLayer, createDefaultDocument } from "../types";
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
    it("createDefaultLayer sets exposedAsInput to true", () => {
      const layer = createDefaultLayer("Test");
      expect(layer.exposedAsInput).toBe(true);
    });

    it("createDefaultLayer sets exposedAsOutput to true", () => {
      const layer = createDefaultLayer("Test");
      expect(layer.exposedAsOutput).toBe(true);
    });

    it("new layers in document have exposed flags set to true", () => {
      const layers = useSketchStore.getState().document.layers;
      for (const layer of layers) {
        expect(layer.exposedAsInput).toBe(true);
        expect(layer.exposedAsOutput).toBe(true);
      }
    });
  });

  // ─── Store toggle actions ──────────────────────────────────────────

  describe("toggleLayerExposedInput", () => {
    it("toggles exposedAsInput off (first toggle from default true)", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().toggleLayerExposedInput(layerId);
      });
      const layer = useSketchStore.getState().document.layers.find(
        (l) => l.id === layerId
      );
      expect(layer?.exposedAsInput).toBe(false);
    });

    it("toggles exposedAsInput back on (second toggle)", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().toggleLayerExposedInput(layerId);
        useSketchStore.getState().toggleLayerExposedInput(layerId);
      });
      const layer = useSketchStore.getState().document.layers.find(
        (l) => l.id === layerId
      );
      expect(layer?.exposedAsInput).toBe(true);
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
      expect(updatedLayers.find((l) => l.id === targetId)?.exposedAsInput).toBe(false);
      expect(updatedLayers.find((l) => l.id === otherId)?.exposedAsInput).toBe(true);
    });
  });

  describe("toggleLayerExposedOutput", () => {
    it("toggles exposedAsOutput off (first toggle from default true)", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().toggleLayerExposedOutput(layerId);
      });
      const layer = useSketchStore.getState().document.layers.find(
        (l) => l.id === layerId
      );
      expect(layer?.exposedAsOutput).toBe(false);
    });

    it("toggles exposedAsOutput back on (second toggle)", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().toggleLayerExposedOutput(layerId);
        useSketchStore.getState().toggleLayerExposedOutput(layerId);
      });
      const layer = useSketchStore.getState().document.layers.find(
        (l) => l.id === layerId
      );
      expect(layer?.exposedAsOutput).toBe(true);
    });
  });

  // ─── Both toggles work independently ──────────────────────────────

  describe("independent input/output toggling", () => {
    it("can turn off both input and output exposure", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().toggleLayerExposedInput(layerId);
        useSketchStore.getState().toggleLayerExposedOutput(layerId);
      });
      const layer = useSketchStore.getState().document.layers.find(
        (l) => l.id === layerId
      );
      expect(layer?.exposedAsInput).toBe(false);
      expect(layer?.exposedAsOutput).toBe(false);
    });

    it("toggling input doesn't affect output flag", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      // Both start as true; toggle output off, then toggle input off
      act(() => {
        useSketchStore.getState().toggleLayerExposedOutput(layerId);
        useSketchStore.getState().toggleLayerExposedInput(layerId);
      });
      const layer = useSketchStore.getState().document.layers.find(
        (l) => l.id === layerId
      );
      expect(layer?.exposedAsInput).toBe(false);
      expect(layer?.exposedAsOutput).toBe(false);

      // Toggle input back on — output should remain off
      act(() => {
        useSketchStore.getState().toggleLayerExposedInput(layerId);
      });
      const updated = useSketchStore.getState().document.layers.find(
        (l) => l.id === layerId
      );
      expect(updated?.exposedAsInput).toBe(true);
      expect(updated?.exposedAsOutput).toBe(false);
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

    it("handles exposed flags through serialization (default true)", () => {
      const doc = createDefaultDocument();
      const serialized = serializeDocument(doc);
      const deserialized = deserializeDocument(serialized);

      expect(deserialized).not.toBeNull();
      expect(deserialized!.layers[0].exposedAsInput).toBe(true);
      expect(deserialized!.layers[0].exposedAsOutput).toBe(true);
    });
  });
});
