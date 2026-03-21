/**
 * Tests for Sketch Editor types and defaults
 */

import {
  SKETCH_FORMAT_VERSION,
  createDefaultDocument,
  createDefaultLayer,
  generateLayerId,
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_PENCIL_SETTINGS,
  DEFAULT_ERASER_SETTINGS,
  DEFAULT_SHAPE_SETTINGS,
  DEFAULT_FILL_SETTINGS,
  DEFAULT_TOOL_SETTINGS,
  DEFAULT_SWATCHES,
  MAX_HISTORY_SIZE,
  isShapeTool,
  isPaintingTool,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb
} from "../types";

describe("Sketch Types", () => {
  describe("createDefaultDocument", () => {
    it("creates a document with correct version", () => {
      const doc = createDefaultDocument();
      expect(doc.version).toBe(SKETCH_FORMAT_VERSION);
    });

    it("creates a document with default dimensions", () => {
      const doc = createDefaultDocument();
      expect(doc.canvas.width).toBe(512);
      expect(doc.canvas.height).toBe(512);
    });

    it("creates a document with custom dimensions", () => {
      const doc = createDefaultDocument(1024, 768);
      expect(doc.canvas.width).toBe(1024);
      expect(doc.canvas.height).toBe(768);
    });

    it("creates a document with one background layer", () => {
      const doc = createDefaultDocument();
      expect(doc.layers).toHaveLength(1);
      expect(doc.layers[0].name).toBe("Background");
      expect(doc.layers[0].type).toBe("raster");
      expect(doc.layers[0].visible).toBe(true);
    });

    it("sets the active layer to the background layer", () => {
      const doc = createDefaultDocument();
      expect(doc.activeLayerId).toBe(doc.layers[0].id);
    });

    it("has no mask layer by default", () => {
      const doc = createDefaultDocument();
      expect(doc.maskLayerId).toBeNull();
    });

    it("includes default tool settings", () => {
      const doc = createDefaultDocument();
      expect(doc.toolSettings).toEqual(DEFAULT_TOOL_SETTINGS);
    });

    it("includes metadata with timestamps", () => {
      const doc = createDefaultDocument();
      expect(doc.metadata.createdAt).toBeTruthy();
      expect(doc.metadata.updatedAt).toBeTruthy();
    });
  });

  describe("createDefaultLayer", () => {
    it("creates a raster layer by default", () => {
      const layer = createDefaultLayer("Test Layer");
      expect(layer.name).toBe("Test Layer");
      expect(layer.type).toBe("raster");
      expect(layer.visible).toBe(true);
      expect(layer.opacity).toBe(1);
      expect(layer.locked).toBe(false);
      expect(layer.data).toBeNull();
    });

    it("creates layers with default blendMode of 'normal'", () => {
      const layer = createDefaultLayer("Test");
      expect(layer.blendMode).toBe("normal");
    });

    it("creates a mask layer when specified", () => {
      const layer = createDefaultLayer("Mask", "mask");
      expect(layer.type).toBe("mask");
    });

    it("generates a unique id", () => {
      const layer1 = createDefaultLayer("A");
      const layer2 = createDefaultLayer("B");
      expect(layer1.id).not.toBe(layer2.id);
    });
  });

  describe("generateLayerId", () => {
    it("generates unique ids", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateLayerId());
      }
      expect(ids.size).toBe(100);
    });

    it("generates ids with expected prefix", () => {
      const id = generateLayerId();
      expect(id).toMatch(/^layer_\d+_[a-z0-9]+$/);
    });
  });

  describe("defaults", () => {
    it("has valid brush defaults", () => {
      expect(DEFAULT_BRUSH_SETTINGS.size).toBeGreaterThan(0);
      expect(DEFAULT_BRUSH_SETTINGS.opacity).toBeGreaterThan(0);
      expect(DEFAULT_BRUSH_SETTINGS.opacity).toBeLessThanOrEqual(1);
      expect(DEFAULT_BRUSH_SETTINGS.hardness).toBeGreaterThan(0);
      expect(DEFAULT_BRUSH_SETTINGS.hardness).toBeLessThanOrEqual(1);
      expect(DEFAULT_BRUSH_SETTINGS.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it("has valid pencil defaults", () => {
      expect(DEFAULT_PENCIL_SETTINGS.size).toBeGreaterThan(0);
      expect(DEFAULT_PENCIL_SETTINGS.size).toBeLessThanOrEqual(10);
      expect(DEFAULT_PENCIL_SETTINGS.opacity).toBeGreaterThan(0);
      expect(DEFAULT_PENCIL_SETTINGS.opacity).toBeLessThanOrEqual(1);
      expect(DEFAULT_PENCIL_SETTINGS.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it("has valid eraser defaults", () => {
      expect(DEFAULT_ERASER_SETTINGS.size).toBeGreaterThan(0);
      expect(DEFAULT_ERASER_SETTINGS.opacity).toBeGreaterThan(0);
      expect(DEFAULT_ERASER_SETTINGS.opacity).toBeLessThanOrEqual(1);
    });

    it("has valid shape defaults", () => {
      expect(DEFAULT_SHAPE_SETTINGS.strokeWidth).toBeGreaterThan(0);
      expect(DEFAULT_SHAPE_SETTINGS.strokeColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(DEFAULT_SHAPE_SETTINGS.fillColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(typeof DEFAULT_SHAPE_SETTINGS.filled).toBe("boolean");
    });

    it("has valid fill defaults", () => {
      expect(DEFAULT_FILL_SETTINGS.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(DEFAULT_FILL_SETTINGS.tolerance).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_FILL_SETTINGS.tolerance).toBeLessThanOrEqual(255);
    });

    it("has all tool settings in DEFAULT_TOOL_SETTINGS", () => {
      expect(DEFAULT_TOOL_SETTINGS.brush).toBeDefined();
      expect(DEFAULT_TOOL_SETTINGS.pencil).toBeDefined();
      expect(DEFAULT_TOOL_SETTINGS.eraser).toBeDefined();
      expect(DEFAULT_TOOL_SETTINGS.shape).toBeDefined();
      expect(DEFAULT_TOOL_SETTINGS.fill).toBeDefined();
    });

    it("has valid history size limit", () => {
      expect(MAX_HISTORY_SIZE).toBeGreaterThan(0);
    });

    it("has non-empty default swatches", () => {
      expect(DEFAULT_SWATCHES.length).toBeGreaterThan(0);
      for (const swatch of DEFAULT_SWATCHES) {
        expect(swatch).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });

  describe("isShapeTool", () => {
    it("returns true for shape tools", () => {
      expect(isShapeTool("line")).toBe(true);
      expect(isShapeTool("rectangle")).toBe(true);
      expect(isShapeTool("ellipse")).toBe(true);
      expect(isShapeTool("arrow")).toBe(true);
    });

    it("returns false for non-shape tools", () => {
      expect(isShapeTool("brush")).toBe(false);
      expect(isShapeTool("pencil")).toBe(false);
      expect(isShapeTool("eraser")).toBe(false);
      expect(isShapeTool("eyedropper")).toBe(false);
      expect(isShapeTool("fill")).toBe(false);
      expect(isShapeTool("move")).toBe(false);
    });
  });

  describe("isPaintingTool", () => {
    it("returns true for painting tools", () => {
      expect(isPaintingTool("brush")).toBe(true);
      expect(isPaintingTool("pencil")).toBe(true);
      expect(isPaintingTool("eraser")).toBe(true);
    });

    it("returns false for non-painting tools", () => {
      expect(isPaintingTool("move")).toBe(false);
      expect(isPaintingTool("select")).toBe(false);
      expect(isPaintingTool("eyedropper")).toBe(false);
    });
  });

  describe("hexToRgb", () => {
    it("converts white", () => {
      expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
    });

    it("converts black", () => {
      expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    });

    it("converts red", () => {
      expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
    });

    it("works without hash prefix", () => {
      expect(hexToRgb("00ff00")).toEqual({ r: 0, g: 255, b: 0 });
    });
  });

  describe("rgbToHex", () => {
    it("converts white", () => {
      expect(rgbToHex(255, 255, 255)).toBe("#ffffff");
    });

    it("converts black", () => {
      expect(rgbToHex(0, 0, 0)).toBe("#000000");
    });

    it("clamps out-of-range values", () => {
      expect(rgbToHex(300, -10, 128)).toBe("#ff0080");
    });
  });

  describe("rgbToHsl", () => {
    it("converts white", () => {
      expect(rgbToHsl(255, 255, 255)).toEqual({ h: 0, s: 0, l: 100 });
    });

    it("converts black", () => {
      expect(rgbToHsl(0, 0, 0)).toEqual({ h: 0, s: 0, l: 0 });
    });

    it("converts pure red", () => {
      expect(rgbToHsl(255, 0, 0)).toEqual({ h: 0, s: 100, l: 50 });
    });
  });

  describe("hslToRgb", () => {
    it("converts white", () => {
      expect(hslToRgb(0, 0, 100)).toEqual({ r: 255, g: 255, b: 255 });
    });

    it("converts black", () => {
      expect(hslToRgb(0, 0, 0)).toEqual({ r: 0, g: 0, b: 0 });
    });

    it("converts pure red", () => {
      expect(hslToRgb(0, 100, 50)).toEqual({ r: 255, g: 0, b: 0 });
    });

    it("round-trips with rgbToHsl", () => {
      const { h, s, l } = rgbToHsl(128, 64, 200);
      const { r, g, b } = hslToRgb(h, s, l);
      // Allow ±1 rounding tolerance
      expect(Math.abs(r - 128)).toBeLessThanOrEqual(1);
      expect(Math.abs(g - 64)).toBeLessThanOrEqual(1);
      expect(Math.abs(b - 200)).toBeLessThanOrEqual(1);
    });
  });
});
