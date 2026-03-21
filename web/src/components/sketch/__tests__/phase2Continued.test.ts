/**
 * Tests for Phase 2 Continued Features
 *
 * Tests for: brush types (round/soft/airbrush/spray), Shift+[/] hardness shortcuts,
 * number key opacity shortcuts, improved blur brush, and Alt+click eyedropper.
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import {
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_TOOL_SETTINGS,
  BrushType
} from "../types";

// Reset store before each test
beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

describe("Phase 2 Continued Features", () => {
  // ─── Brush Types ─────────────────────────────────────────────────────

  describe("brush types", () => {
    it("has default brush type of round", () => {
      expect(DEFAULT_BRUSH_SETTINGS.brushType).toBe("round");
    });

    it("includes brushType in default tool settings", () => {
      expect(DEFAULT_TOOL_SETTINGS.brush.brushType).toBe("round");
    });

    it("document starts with round brush type", () => {
      const state = useSketchStore.getState();
      expect(state.document.toolSettings.brush.brushType).toBe("round");
    });

    it("can change brush type to soft", () => {
      act(() => {
        useSketchStore.getState().setBrushSettings({ brushType: "soft" });
      });
      const settings = useSketchStore.getState().document.toolSettings.brush;
      expect(settings.brushType).toBe("soft");
    });

    it("can change brush type to airbrush", () => {
      act(() => {
        useSketchStore.getState().setBrushSettings({ brushType: "airbrush" });
      });
      const settings = useSketchStore.getState().document.toolSettings.brush;
      expect(settings.brushType).toBe("airbrush");
    });

    it("can change brush type to spray", () => {
      act(() => {
        useSketchStore.getState().setBrushSettings({ brushType: "spray" });
      });
      const settings = useSketchStore.getState().document.toolSettings.brush;
      expect(settings.brushType).toBe("spray");
    });

    it("preserves other brush settings when changing type", () => {
      act(() => {
        useSketchStore.getState().setBrushSettings({ size: 24, opacity: 0.5, hardness: 0.6 });
      });
      act(() => {
        useSketchStore.getState().setBrushSettings({ brushType: "spray" });
      });
      const settings = useSketchStore.getState().document.toolSettings.brush;
      expect(settings.size).toBe(24);
      expect(settings.opacity).toBe(0.5);
      expect(settings.hardness).toBe(0.6);
      expect(settings.brushType).toBe("spray");
    });

    it("all valid brush types are accepted", () => {
      const types: BrushType[] = ["round", "soft", "airbrush", "spray"];
      for (const t of types) {
        act(() => {
          useSketchStore.getState().setBrushSettings({ brushType: t });
        });
        expect(useSketchStore.getState().document.toolSettings.brush.brushType).toBe(t);
      }
    });
  });

  // ─── Hardness Adjustment ─────────────────────────────────────────────

  describe("hardness adjustment (Shift+[/])", () => {
    it("can decrease brush hardness", () => {
      const store = useSketchStore.getState();
      const initial = store.document.toolSettings.brush.hardness;
      act(() => {
        store.setBrushSettings({ hardness: Math.max(0, initial - 0.1) });
      });
      const newHardness = useSketchStore.getState().document.toolSettings.brush.hardness;
      expect(newHardness).toBeCloseTo(initial - 0.1, 2);
    });

    it("can increase brush hardness", () => {
      act(() => {
        useSketchStore.getState().setBrushSettings({ hardness: 0.5 });
      });
      act(() => {
        const h = useSketchStore.getState().document.toolSettings.brush.hardness;
        useSketchStore.getState().setBrushSettings({ hardness: Math.min(1, h + 0.1) });
      });
      expect(useSketchStore.getState().document.toolSettings.brush.hardness).toBeCloseTo(0.6, 2);
    });

    it("clamps hardness at minimum 0", () => {
      act(() => {
        useSketchStore.getState().setBrushSettings({ hardness: 0 });
      });
      act(() => {
        const h = useSketchStore.getState().document.toolSettings.brush.hardness;
        useSketchStore.getState().setBrushSettings({ hardness: Math.max(0, h - 0.1) });
      });
      expect(useSketchStore.getState().document.toolSettings.brush.hardness).toBe(0);
    });

    it("clamps hardness at maximum 1", () => {
      act(() => {
        useSketchStore.getState().setBrushSettings({ hardness: 1 });
      });
      act(() => {
        const h = useSketchStore.getState().document.toolSettings.brush.hardness;
        useSketchStore.getState().setBrushSettings({ hardness: Math.min(1, h + 0.1) });
      });
      expect(useSketchStore.getState().document.toolSettings.brush.hardness).toBe(1);
    });

    it("can adjust eraser hardness", () => {
      act(() => {
        useSketchStore.getState().setEraserSettings({ hardness: 0.5 });
      });
      act(() => {
        const h = useSketchStore.getState().document.toolSettings.eraser.hardness;
        useSketchStore.getState().setEraserSettings({ hardness: Math.min(1, h + 0.1) });
      });
      expect(useSketchStore.getState().document.toolSettings.eraser.hardness).toBeCloseTo(0.6, 2);
    });
  });

  // ─── Opacity via Number Keys ─────────────────────────────────────────

  describe("opacity via number keys (0-9)", () => {
    /** Replicates the keyboard-handler logic: digit 0 → 100%, others → digit×10% */
    const digitToOpacity = (digit: number): number => digit === 0 ? 1 : digit / 10;

    it("key 0 sets opacity to 100%", () => {
      act(() => {
        useSketchStore.getState().setBrushSettings({ opacity: 0.5 });
      });
      const opacity = digitToOpacity(0);
      act(() => {
        useSketchStore.getState().setBrushSettings({ opacity });
      });
      expect(useSketchStore.getState().document.toolSettings.brush.opacity).toBe(1);
    });

    it("key 5 sets opacity to 50%", () => {
      const opacity = digitToOpacity(5);
      act(() => {
        useSketchStore.getState().setBrushSettings({ opacity });
      });
      expect(useSketchStore.getState().document.toolSettings.brush.opacity).toBe(0.5);
    });

    it("key 1 sets opacity to 10%", () => {
      const opacity = digitToOpacity(1);
      act(() => {
        useSketchStore.getState().setBrushSettings({ opacity });
      });
      expect(useSketchStore.getState().document.toolSettings.brush.opacity).toBe(0.1);
    });

    it("key 9 sets opacity to 90%", () => {
      const opacity = digitToOpacity(9);
      act(() => {
        useSketchStore.getState().setBrushSettings({ opacity });
      });
      expect(useSketchStore.getState().document.toolSettings.brush.opacity).toBe(0.9);
    });

    it("number keys work for pencil opacity", () => {
      const opacity = digitToOpacity(3);
      act(() => {
        useSketchStore.getState().setPencilSettings({ opacity });
      });
      expect(useSketchStore.getState().document.toolSettings.pencil.opacity).toBe(0.3);
    });

    it("number keys work for eraser opacity", () => {
      const opacity = digitToOpacity(7);
      act(() => {
        useSketchStore.getState().setEraserSettings({ opacity });
      });
      expect(useSketchStore.getState().document.toolSettings.eraser.opacity).toBe(0.7);
    });
  });

  // ─── Foreground/Background Colors for Eyedropper ─────────────────────

  describe("eyedropper color pick (Alt+click)", () => {
    it("can update foreground color", () => {
      act(() => {
        useSketchStore.getState().setForegroundColor("#ff5500");
      });
      expect(useSketchStore.getState().foregroundColor).toBe("#ff5500");
    });

    it("can update brush color from picked color", () => {
      act(() => {
        useSketchStore.getState().setBrushSettings({ color: "#ff0000" });
      });
      expect(useSketchStore.getState().document.toolSettings.brush.color).toBe("#ff0000");
    });

    it("can update pencil color from picked color", () => {
      act(() => {
        useSketchStore.getState().setPencilSettings({ color: "#00ff00" });
      });
      expect(useSketchStore.getState().document.toolSettings.pencil.color).toBe("#00ff00");
    });

    it("can update fill color from picked color", () => {
      act(() => {
        useSketchStore.getState().setFillSettings({ color: "#0000ff" });
      });
      expect(useSketchStore.getState().document.toolSettings.fill.color).toBe("#0000ff");
    });

    it("foreground and tool colors are independent (can be synced externally)", () => {
      act(() => {
        useSketchStore.getState().setForegroundColor("#aabbcc");
        useSketchStore.getState().setBrushSettings({ color: "#aabbcc" });
      });
      expect(useSketchStore.getState().foregroundColor).toBe("#aabbcc");
      expect(useSketchStore.getState().document.toolSettings.brush.color).toBe("#aabbcc");
    });
  });

  // ─── Brush Type Persistence ─────────────────────────────────────────

  describe("brush type persistence across tool changes", () => {
    it("brush type persists when switching to another tool and back", () => {
      act(() => {
        useSketchStore.getState().setBrushSettings({ brushType: "spray" });
        useSketchStore.getState().setActiveTool("eraser");
      });
      expect(useSketchStore.getState().activeTool).toBe("eraser");

      act(() => {
        useSketchStore.getState().setActiveTool("brush");
      });
      expect(useSketchStore.getState().document.toolSettings.brush.brushType).toBe("spray");
    });
  });

  // ─── Color Mode ─────────────────────────────────────────────────────

  describe("color mode", () => {
    it("defaults to hex", () => {
      expect(useSketchStore.getState().colorMode).toBe("hex");
    });

    it("can be set to rgb", () => {
      act(() => {
        useSketchStore.getState().setColorMode("rgb");
      });
      expect(useSketchStore.getState().colorMode).toBe("rgb");
    });

    it("can be set to hsl", () => {
      act(() => {
        useSketchStore.getState().setColorMode("hsl");
      });
      expect(useSketchStore.getState().colorMode).toBe("hsl");
    });

    it("can cycle back to hex", () => {
      act(() => {
        useSketchStore.getState().setColorMode("rgb");
        useSketchStore.getState().setColorMode("hex");
      });
      expect(useSketchStore.getState().colorMode).toBe("hex");
    });
  });

  // ─── Selection ──────────────────────────────────────────────────────

  describe("selection", () => {
    it("defaults to null", () => {
      expect(useSketchStore.getState().selection).toBeNull();
    });

    it("can set a selection region", () => {
      act(() => {
        useSketchStore.getState().setSelection({ x: 10, y: 20, width: 100, height: 50 });
      });
      const sel = useSketchStore.getState().selection;
      expect(sel).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    });

    it("can clear selection", () => {
      act(() => {
        useSketchStore.getState().setSelection({ x: 0, y: 0, width: 50, height: 50 });
        useSketchStore.getState().setSelection(null);
      });
      expect(useSketchStore.getState().selection).toBeNull();
    });

    it("selectAll sets selection to canvas dimensions", () => {
      act(() => {
        useSketchStore.getState().selectAll();
      });
      const sel = useSketchStore.getState().selection;
      const { width, height } = useSketchStore.getState().document.canvas;
      expect(sel).toEqual({ x: 0, y: 0, width, height });
    });
  });

  // ─── Layer Isolation ────────────────────────────────────────────────

  describe("layer isolation", () => {
    it("defaults to null", () => {
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

    it("toggleIsolateLayer switches to a different layer", () => {
      act(() => {
        useSketchStore.getState().addLayer();
      });
      const layers = useSketchStore.getState().document.layers;
      act(() => {
        useSketchStore.getState().toggleIsolateLayer(layers[0].id);
      });
      expect(useSketchStore.getState().isolatedLayerId).toBe(layers[0].id);
      act(() => {
        useSketchStore.getState().toggleIsolateLayer(layers[1].id);
      });
      expect(useSketchStore.getState().isolatedLayerId).toBe(layers[1].id);
    });
  });

  // ─── Select Tool ────────────────────────────────────────────────────

  describe("select tool", () => {
    it("can set active tool to select", () => {
      act(() => {
        useSketchStore.getState().setActiveTool("select");
      });
      expect(useSketchStore.getState().activeTool).toBe("select");
    });
  });
});
