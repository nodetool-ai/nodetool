/**
 * Tests for Sketch Editor types and defaults
 */

import {
  SKETCH_FORMAT_VERSION,
  createDefaultDocument,
  createDefaultLayer,
  generateLayerId,
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_ERASER_SETTINGS,
  DEFAULT_TOOL_SETTINGS,
  MAX_HISTORY_SIZE
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

    it("has valid eraser defaults", () => {
      expect(DEFAULT_ERASER_SETTINGS.size).toBeGreaterThan(0);
      expect(DEFAULT_ERASER_SETTINGS.opacity).toBeGreaterThan(0);
      expect(DEFAULT_ERASER_SETTINGS.opacity).toBeLessThanOrEqual(1);
    });

    it("has valid history size limit", () => {
      expect(MAX_HISTORY_SIZE).toBeGreaterThan(0);
    });
  });
});
