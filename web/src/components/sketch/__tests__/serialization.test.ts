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
  });
});
