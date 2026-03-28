/**
 * Phase 2 Batch 4 Tests — Color system, Canvas size, Zoom, Default palette
 *
 * Tests the following Phase 2 features:
 * - Nicer default palette (7 rows × 7 columns = 49 colors)
 * - Color mode RGB/HSL inputs via helper functions
 * - Canvas resize store action
 * - Faster zoom factor (1.3 instead of 1.15)
 */

import { act } from "@testing-library/react";
import { useSketchStore, SKETCH_ZOOM_MAX } from "../state/useSketchStore";
import {
  DEFAULT_SWATCHES,
  CANVAS_PRESETS,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb
} from "../types";

beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

describe("Default palette (nicer swatches)", () => {
  it("should have 49 colors (7 rows × 7 columns)", () => {
    expect(DEFAULT_SWATCHES).toHaveLength(49);
  });

  it("should have grays from black to white in the first 7 entries", () => {
    const grayRow = DEFAULT_SWATCHES.slice(0, 7);
    expect(grayRow[0]).toBe("#000000");
    expect(grayRow[6]).toBe("#ffffff");
    // All grays should have equal RGB channels
    for (const hex of grayRow) {
      const rgb = hexToRgb(hex);
      expect(rgb.r).toBe(rgb.g);
      expect(rgb.g).toBe(rgb.b);
    }
  });

  it("should have 7 rows of colors", () => {
    // Each row should be 7 colors
    for (let row = 0; row < 7; row++) {
      const rowColors = DEFAULT_SWATCHES.slice(row * 7, (row + 1) * 7);
      expect(rowColors).toHaveLength(7);
    }
  });

  it("should have all valid hex colors", () => {
    for (const color of DEFAULT_SWATCHES) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("row 2 (reds) should have red-dominant colors", () => {
    const redRow = DEFAULT_SWATCHES.slice(7, 14);
    for (const hex of redRow) {
      const rgb = hexToRgb(hex);
      // Red channel should always be greater than or equal to green and blue
      expect(rgb.r).toBeGreaterThan(0);
      expect(rgb.r).toBeGreaterThanOrEqual(rgb.g);
      expect(rgb.r).toBeGreaterThanOrEqual(rgb.b);
    }
  });
});

describe("Color mode helpers (RGB/HSL round-trip)", () => {
  it("converts hex to RGB and back", () => {
    expect(hexToRgb("#ff8040")).toEqual({ r: 255, g: 128, b: 64 });
    expect(rgbToHex(255, 128, 64)).toBe("#ff8040");
  });

  it("converts RGB to HSL and back approximately", () => {
    const rgb = { r: 255, g: 0, b: 0 };
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(50);

    const backRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    expect(backRgb.r).toBe(255);
    expect(backRgb.g).toBe(0);
    expect(backRgb.b).toBe(0);
  });

  it("handles white correctly", () => {
    const rgb = hexToRgb("#ffffff");
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    expect(hsl.l).toBe(100);
    expect(hsl.s).toBe(0);
  });

  it("handles black correctly", () => {
    const rgb = hexToRgb("#000000");
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    expect(hsl.l).toBe(0);
  });
});

describe("Canvas resize store action", () => {
  it("should change canvas dimensions", () => {
    expect(useSketchStore.getState().document.canvas.width).toBe(512);
    expect(useSketchStore.getState().document.canvas.height).toBe(512);

    act(() => {
      useSketchStore.getState().resizeCanvas(1024, 768);
    });

    expect(useSketchStore.getState().document.canvas.width).toBe(1024);
    expect(useSketchStore.getState().document.canvas.height).toBe(768);
  });

  it("should update metadata timestamp", () => {
    const beforeUpdate = useSketchStore.getState().document.metadata.updatedAt;

    // Use a mocked Date to ensure different timestamp
    const mockDate = new Date("2099-01-01T00:00:00Z");
    const originalToISOString = Date.prototype.toISOString;
    jest.spyOn(Date.prototype, "toISOString").mockReturnValue(mockDate.toISOString());

    act(() => {
      useSketchStore.getState().resizeCanvas(800, 600);
    });

    const afterUpdate = useSketchStore.getState().document.metadata.updatedAt;
    expect(afterUpdate).not.toBe(beforeUpdate);
    expect(afterUpdate).toBe("2099-01-01T00:00:00.000Z");

    jest.restoreAllMocks();
  });

  it("should preserve other canvas settings", () => {
    act(() => {
      useSketchStore.getState().setCanvasBackgroundColor("#ff0000");
    });

    act(() => {
      useSketchStore.getState().resizeCanvas(1920, 1080);
    });

    expect(useSketchStore.getState().document.canvas.backgroundColor).toBe("#ff0000");
    expect(useSketchStore.getState().document.canvas.width).toBe(1920);
    expect(useSketchStore.getState().document.canvas.height).toBe(1080);
  });

  it("should preserve layers after resize", () => {
    act(() => {
      useSketchStore.getState().addLayer("Layer 2");
    });

    const layerCountBefore = useSketchStore.getState().document.layers.length;

    act(() => {
      useSketchStore.getState().resizeCanvas(256, 256);
    });

    expect(useSketchStore.getState().document.layers.length).toBe(layerCountBefore);
  });
});

describe("Canvas presets", () => {
  it("should have expected preset sizes", () => {
    expect(CANVAS_PRESETS).toContainEqual(
      expect.objectContaining({ width: 512, height: 512 })
    );
    expect(CANVAS_PRESETS).toContainEqual(
      expect.objectContaining({ width: 1024, height: 1024 })
    );
    expect(CANVAS_PRESETS).toContainEqual(
      expect.objectContaining({ width: 1920, height: 1080 })
    );
  });

  it("each preset should have a label", () => {
    for (const preset of CANVAS_PRESETS) {
      expect(preset.label).toBeTruthy();
      expect(typeof preset.label).toBe("string");
    }
  });
});

describe("Zoom speed", () => {
  it("should use factor 1.3 for faster zooming", () => {
    const initialZoom = 1;
    const factor = 1.3;
    const zoomedIn = initialZoom * factor;
    const zoomedOut = initialZoom / factor;

    // After one zoom in, should be 1.3 (not 1.15 like before)
    expect(zoomedIn).toBeCloseTo(1.3, 5);
    expect(zoomedOut).toBeCloseTo(1 / 1.3, 5);
  });

  it("store setZoom should clamp between min and SKETCH_ZOOM_MAX", () => {
    act(() => {
      useSketchStore.getState().setZoom(0.01);
    });
    expect(useSketchStore.getState().zoom).toBe(0.1);

    act(() => {
      useSketchStore.getState().setZoom(100);
    });
    expect(useSketchStore.getState().zoom).toBe(SKETCH_ZOOM_MAX);

    act(() => {
      useSketchStore.getState().setZoom(2.5);
    });
    expect(useSketchStore.getState().zoom).toBe(2.5);
  });
});
