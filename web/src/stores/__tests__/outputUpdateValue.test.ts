/**
 * @jest-environment node
 */
import { normalizeOutputUpdateValue } from "../outputUpdateValue";
import type { OutputUpdate } from "../ApiTypes";

function makeUpdate(overrides: Partial<OutputUpdate>): OutputUpdate {
  return {
    type: "output_update",
    node_id: "node-1",
    node_name: "TestNode",
    output_name: "output",
    value: null,
    output_type: "string",
    metadata: {},
    ...overrides
  };
}

describe("normalizeOutputUpdateValue", () => {
  describe("non-rich output types", () => {
    it("returns the value as-is for string output_type", () => {
      const update = makeUpdate({ output_type: "string", value: "hello" });
      expect(normalizeOutputUpdateValue(update)).toBe("hello");
    });

    it("returns the value as-is for number output_type", () => {
      const update = makeUpdate({ output_type: "number", value: 42 });
      expect(normalizeOutputUpdateValue(update)).toBe(42);
    });

    it("returns the value as-is for unknown output_type", () => {
      const update = makeUpdate({
        output_type: "custom",
        value: { foo: "bar" }
      });
      expect(normalizeOutputUpdateValue(update)).toEqual({ foo: "bar" });
    });
  });

  describe("rich output types with typed value", () => {
    const richTypes = [
      "image",
      "audio",
      "video",
      "html",
      "document",
      "model_3d"
    ];

    it.each(richTypes)(
      "returns value as-is when it already has a type field (%s)",
      (outputType) => {
        const value = { type: "image", uri: "https://example.com/img.png" };
        const update = makeUpdate({ output_type: outputType, value });
        expect(normalizeOutputUpdateValue(update)).toBe(value);
      }
    );
  });

  describe("rich output types with plain object value (no type field)", () => {
    it("adds type from output_type to plain object", () => {
      const update = makeUpdate({
        output_type: "image",
        value: { uri: "https://example.com/img.png", width: 100 }
      });
      expect(normalizeOutputUpdateValue(update)).toEqual({
        type: "image",
        uri: "https://example.com/img.png",
        width: 100
      });
    });

    it("adds type for audio output", () => {
      const update = makeUpdate({
        output_type: "audio",
        value: { uri: "https://example.com/audio.mp3" }
      });
      expect(normalizeOutputUpdateValue(update)).toEqual({
        type: "audio",
        uri: "https://example.com/audio.mp3"
      });
    });
  });

  describe("rich output types with non-object value", () => {
    it("wraps a string value in { type, data }", () => {
      const update = makeUpdate({
        output_type: "html",
        value: "<div>Hello</div>"
      });
      expect(normalizeOutputUpdateValue(update)).toEqual({
        type: "html",
        data: "<div>Hello</div>"
      });
    });

    it("wraps null value in { type, data }", () => {
      const update = makeUpdate({
        output_type: "image",
        value: null
      });
      expect(normalizeOutputUpdateValue(update)).toEqual({
        type: "image",
        data: null
      });
    });

    it("wraps an array value in { type, data }", () => {
      const update = makeUpdate({
        output_type: "video",
        value: [1, 2, 3]
      });
      expect(normalizeOutputUpdateValue(update)).toEqual({
        type: "video",
        data: [1, 2, 3]
      });
    });
  });
});
