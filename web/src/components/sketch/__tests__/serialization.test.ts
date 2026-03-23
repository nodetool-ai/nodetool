/**
 * Tests for Sketch serialization utilities
 */

import {
  serializeDocument,
  deserializeDocument
} from "../serialization";
import { createDefaultDocument, createDefaultLayer } from "../types";
import type { SketchDocument } from "../types";

describe("Sketch Serialization", () => {
  describe("serializeDocument", () => {
    it("serializes a document to a JSON string", () => {
      const doc = createDefaultDocument();
      const json = serializeDocument(doc);
      expect(typeof json).toBe("string");
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe(doc.version);
      expect(parsed.canvas.width).toBe(doc.canvas.width);
    });

    it("preserves all document fields", () => {
      const doc = createDefaultDocument(800, 600);
      doc.layers.push(createDefaultLayer("Layer 2"));
      const json = serializeDocument(doc);
      const parsed = JSON.parse(json) as SketchDocument;
      expect(parsed.layers).toHaveLength(2);
      expect(parsed.canvas.width).toBe(800);
      expect(parsed.canvas.height).toBe(600);
    });
  });

  describe("deserializeDocument", () => {
    it("deserializes a valid JSON string", () => {
      const doc = createDefaultDocument();
      const json = serializeDocument(doc);
      const result = deserializeDocument(json);
      expect(result).not.toBeNull();
      expect(result?.version).toBe(doc.version);
      expect(result?.layers).toHaveLength(1);
    });

    it("returns null for null input", () => {
      expect(deserializeDocument(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(deserializeDocument(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(deserializeDocument("")).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      expect(deserializeDocument("not valid json")).toBeNull();
    });

    it("returns null for JSON without required fields", () => {
      expect(deserializeDocument('{"foo": "bar"}')).toBeNull();
    });

    it("returns null for JSON without layers array", () => {
      expect(deserializeDocument('{"version": 1}')).toBeNull();
    });

    it("round-trips correctly", () => {
      const original = createDefaultDocument(1024, 768);
      original.layers.push(createDefaultLayer("Extra Layer", "mask"));
      original.maskLayerId = original.layers[1].id;

      const json = serializeDocument(original);
      const restored = deserializeDocument(json);

      expect(restored).not.toBeNull();
      expect(restored?.canvas.width).toBe(1024);
      expect(restored?.canvas.height).toBe(768);
      expect(restored?.layers).toHaveLength(2);
      expect(restored?.maskLayerId).toBe(original.maskLayerId);
      expect(restored?.layers[1].type).toBe("mask");
    });

    it("migrates documents missing gradient settings", () => {
      const doc = createDefaultDocument();
      const parsed = JSON.parse(serializeDocument(doc));
      delete parsed.toolSettings.gradient;

      const restored = deserializeDocument(JSON.stringify(parsed));

      expect(restored?.toolSettings.gradient).toEqual({
        startColor: "#ffffff",
        endColor: "#000000",
        type: "linear"
      });
    });

    it("migrates missing transform-aware layer fields", () => {
      const doc = createDefaultDocument(320, 240);
      const parsed = JSON.parse(serializeDocument(doc));
      delete parsed.layers[0].transform;
      delete parsed.layers[0].contentBounds;

      const restored = deserializeDocument(JSON.stringify(parsed));

      expect(restored?.layers[0].transform).toEqual({ x: 0, y: 0 });
      expect(restored?.layers[0].contentBounds).toEqual({
        x: 0,
        y: 0,
        width: 320,
        height: 240
      });
    });

    it("round-trips transform-aware layer fields", () => {
      const doc = createDefaultDocument(512, 512);
      doc.layers[0].transform = { x: 24, y: -12 };
      doc.layers[0].contentBounds = { x: 10, y: 20, width: 200, height: 180 };

      const restored = deserializeDocument(serializeDocument(doc));

      expect(restored?.layers[0].transform).toEqual({ x: 24, y: -12 });
      expect(restored?.layers[0].contentBounds).toEqual({
        x: 10,
        y: 20,
        width: 200,
        height: 180
      });
    });
  });
});
