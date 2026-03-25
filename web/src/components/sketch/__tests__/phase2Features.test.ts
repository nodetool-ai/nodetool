/**
 * Tests for Phase 2 Sketch Features
 *
 * Tests for: merge down, flatten visible, foreground/background colors,
 * swap/reset colors, panels toggle, canvas presets.
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import { CANVAS_PRESETS } from "../types";

// Reset store before each test
beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

describe("Phase 2 Features", () => {
  describe("foreground / background colors", () => {
    it("starts with white foreground and black background", () => {
      const state = useSketchStore.getState();
      expect(state.foregroundColor).toBe("#ffffff");
      expect(state.backgroundColor).toBe("#000000");
    });

    it("sets foreground color", () => {
      act(() => {
        useSketchStore.getState().setForegroundColor("#ff0000");
      });
      expect(useSketchStore.getState().foregroundColor).toBe("#ff0000");
    });

    it("sets background color", () => {
      act(() => {
        useSketchStore.getState().setBackgroundColor("#00ff00");
      });
      expect(useSketchStore.getState().backgroundColor).toBe("#00ff00");
    });

    it("swaps foreground and background colors", () => {
      act(() => {
        useSketchStore.getState().setForegroundColor("#ff0000");
        useSketchStore.getState().setBackgroundColor("#0000ff");
      });
      act(() => {
        useSketchStore.getState().swapColors();
      });
      expect(useSketchStore.getState().foregroundColor).toBe("#0000ff");
      expect(useSketchStore.getState().backgroundColor).toBe("#ff0000");
    });

    it("resets colors to black foreground and white background", () => {
      act(() => {
        useSketchStore.getState().setForegroundColor("#ff0000");
        useSketchStore.getState().setBackgroundColor("#00ff00");
      });
      act(() => {
        useSketchStore.getState().resetColors();
      });
      expect(useSketchStore.getState().foregroundColor).toBe("#000000");
      expect(useSketchStore.getState().backgroundColor).toBe("#ffffff");
    });
  });

  describe("panels toggle", () => {
    it("starts with panels visible", () => {
      expect(useSketchStore.getState().panelsHidden).toBe(false);
    });

    it("toggles panels hidden", () => {
      act(() => {
        useSketchStore.getState().togglePanelsHidden();
      });
      expect(useSketchStore.getState().panelsHidden).toBe(true);

      act(() => {
        useSketchStore.getState().togglePanelsHidden();
      });
      expect(useSketchStore.getState().panelsHidden).toBe(false);
    });
  });

  describe("merge layer down", () => {
    it("removes the upper layer when merging down", () => {
      act(() => {
        useSketchStore.getState().addLayer("Layer A");
        useSketchStore.getState().addLayer("Layer B");
      });
      const layers = useSketchStore.getState().document.layers;
      expect(layers).toHaveLength(3);

      const topLayerId = layers[2].id;
      act(() => {
        useSketchStore.getState().mergeLayerDown(topLayerId);
      });
      expect(useSketchStore.getState().document.layers).toHaveLength(2);
      expect(
        useSketchStore.getState().document.layers.find((l) => l.id === topLayerId)
      ).toBeUndefined();
    });

    it("does not merge the first layer", () => {
      const firstLayerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().mergeLayerDown(firstLayerId);
      });
      expect(useSketchStore.getState().document.layers).toHaveLength(1);
    });

    it("does not merge into a locked layer", () => {
      act(() => {
        useSketchStore.getState().addLayer("Upper");
      });
      const state = useSketchStore.getState();
      // Lock the bottom layer
      const bottomId = state.document.layers[0].id;
      act(() => {
        useSketchStore.setState((s) => ({
          document: {
            ...s.document,
            layers: s.document.layers.map((l) =>
              l.id === bottomId ? { ...l, locked: true } : l
            )
          }
        }));
      });

      const upperId = useSketchStore.getState().document.layers[1].id;
      act(() => {
        useSketchStore.getState().mergeLayerDown(upperId);
      });
      expect(useSketchStore.getState().document.layers).toHaveLength(2);
    });

    it("updates active layer when merging the active layer", () => {
      act(() => {
        useSketchStore.getState().addLayer("Upper");
      });
      const state = useSketchStore.getState();
      const upperId = state.document.layers[1].id;
      const lowerId = state.document.layers[0].id;
      expect(state.document.activeLayerId).toBe(upperId);

      act(() => {
        useSketchStore.getState().mergeLayerDown(upperId);
      });
      expect(useSketchStore.getState().document.activeLayerId).toBe(lowerId);
    });
  });

  describe("flatten visible", () => {
    it("replaces all layers with a single 'Flattened' layer", () => {
      act(() => {
        useSketchStore.getState().addLayer("Layer A");
        useSketchStore.getState().addLayer("Layer B");
      });
      expect(useSketchStore.getState().document.layers).toHaveLength(3);

      act(() => {
        useSketchStore.getState().flattenVisible();
      });
      const layers = useSketchStore.getState().document.layers;
      expect(layers).toHaveLength(1);
      expect(layers[0].name).toBe("Flattened");
    });

    it("clears mask layer id after flatten", () => {
      act(() => {
        const id = useSketchStore.getState().addLayer("Mask");
        useSketchStore.getState().setMaskLayer(id);
      });
      expect(useSketchStore.getState().document.maskLayerId).not.toBeNull();

      act(() => {
        useSketchStore.getState().flattenVisible();
      });
      expect(useSketchStore.getState().document.maskLayerId).toBeNull();
    });
  });

  describe("canvas presets", () => {
    it("has the expected preset sizes", () => {
      expect(CANVAS_PRESETS).toHaveLength(5);
      expect(CANVAS_PRESETS[0]).toEqual({
        label: "512 × 512",
        width: 512,
        height: 512
      });
      expect(CANVAS_PRESETS[3]).toEqual({
        label: "1024 × 1024",
        width: 1024,
        height: 1024
      });
      expect(CANVAS_PRESETS[4]).toEqual({
        label: "1920 × 1080",
        width: 1920,
        height: 1080
      });
    });
  });
});
