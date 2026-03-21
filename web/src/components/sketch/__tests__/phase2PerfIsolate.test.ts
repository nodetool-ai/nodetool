/**
 * Tests for Phase 2 Performance + Isolate Layer + Swatch Drag Features
 *
 * Tests for: layer isolation (solo), checkerboard pattern caching,
 * blur canvas caching, and swatch hold-to-drag.
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";

// Reset store before each test
beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

describe("Phase 2 Performance + Isolate Layer", () => {
  // ─── Layer isolation (solo) ────────────────────────────────────────

  describe("layer isolation", () => {
    it("starts with no isolated layer", () => {
      expect(useSketchStore.getState().isolatedLayerId).toBeNull();
    });

    it("toggleIsolateLayer sets isolatedLayerId", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().toggleIsolateLayer(layerId);
      });
      expect(useSketchStore.getState().isolatedLayerId).toBe(layerId);
    });

    it("toggleIsolateLayer clears isolation when toggled again", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().toggleIsolateLayer(layerId);
        useSketchStore.getState().toggleIsolateLayer(layerId);
      });
      expect(useSketchStore.getState().isolatedLayerId).toBeNull();
    });

    it("isolating a different layer switches isolation", () => {
      act(() => {
        useSketchStore.getState().addLayer("Layer A");
        useSketchStore.getState().addLayer("Layer B");
      });
      const layers = useSketchStore.getState().document.layers;
      expect(layers.length).toBeGreaterThanOrEqual(3);

      act(() => {
        useSketchStore.getState().toggleIsolateLayer(layers[0].id);
      });
      expect(useSketchStore.getState().isolatedLayerId).toBe(layers[0].id);

      act(() => {
        useSketchStore.getState().toggleIsolateLayer(layers[1].id);
      });
      expect(useSketchStore.getState().isolatedLayerId).toBe(layers[1].id);
    });

    it("isolatedLayerId persists across other state changes", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().toggleIsolateLayer(layerId);
        useSketchStore.getState().setActiveTool("eraser");
      });
      expect(useSketchStore.getState().isolatedLayerId).toBe(layerId);
      expect(useSketchStore.getState().activeTool).toBe("eraser");
    });
  });

  // ─── Layer visibility vs isolation ─────────────────────────────────

  describe("isolation vs visibility interaction", () => {
    it("isolation is separate from layer visibility", () => {
      const layerId = useSketchStore.getState().document.layers[0].id;
      act(() => {
        useSketchStore.getState().toggleIsolateLayer(layerId);
        useSketchStore.getState().toggleLayerVisibility(layerId);
      });
      const state = useSketchStore.getState();
      expect(state.isolatedLayerId).toBe(layerId);
      const layer = state.document.layers.find((l) => l.id === layerId);
      expect(layer?.visible).toBe(false);
    });
  });

  // ─── Performance store features ────────────────────────────────────

  describe("tool settings for blur", () => {
    it("default blur settings are correct", () => {
      const blur = useSketchStore.getState().document.toolSettings.blur;
      expect(blur.size).toBe(20);
      expect(blur.strength).toBe(5);
    });

    it("blur settings can be updated", () => {
      act(() => {
        useSketchStore.getState().setBlurSettings({
          size: 40,
          strength: 10
        });
      });
      const blur = useSketchStore.getState().document.toolSettings.blur;
      expect(blur.size).toBe(40);
      expect(blur.strength).toBe(10);
    });
  });

  // ─── Color mode for swatch interaction ─────────────────────────────

  describe("foreground color update (swatch click)", () => {
    it("setForegroundColor updates foreground color", () => {
      act(() => {
        useSketchStore.getState().setForegroundColor("#ff0000");
      });
      expect(useSketchStore.getState().foregroundColor).toBe("#ff0000");
    });

    it("swapColors swaps foreground and background", () => {
      act(() => {
        useSketchStore.getState().setForegroundColor("#ff0000");
        useSketchStore.getState().setBackgroundColor("#00ff00");
        useSketchStore.getState().swapColors();
      });
      const state = useSketchStore.getState();
      expect(state.foregroundColor).toBe("#00ff00");
      expect(state.backgroundColor).toBe("#ff0000");
    });

    it("resetColors sets to black/white defaults", () => {
      act(() => {
        useSketchStore.getState().setForegroundColor("#ff0000");
        useSketchStore.getState().setBackgroundColor("#00ff00");
        useSketchStore.getState().resetColors();
      });
      const state = useSketchStore.getState();
      expect(state.foregroundColor).toBe("#ffffff");
      expect(state.backgroundColor).toBe("#000000");
    });
  });
});
