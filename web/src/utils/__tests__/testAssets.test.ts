/**
 * @jest-environment node
 */
import { applyTestAssets } from "../testAssets";

describe("applyTestAssets", () => {
  describe("fills empty properties with test data", () => {
    it("fills empty string property", () => {
      const result = applyTestAssets(
        { prompt: "" },
        [{ name: "prompt", type: { type: "str" } }]
      );
      expect(result.prompt).toBe("test input");
    });

    it("fills undefined property", () => {
      const result = applyTestAssets(
        {},
        [{ name: "text", type: { type: "str" } }]
      );
      expect(result.text).toBe("test input");
    });

    it("fills null property", () => {
      const result = applyTestAssets(
        { value: null },
        [{ name: "value", type: { type: "int" } }]
      );
      expect(result.value).toBe(1);
    });

    it("fills zero numeric property", () => {
      const result = applyTestAssets(
        { count: 0 },
        [{ name: "count", type: { type: "int" } }]
      );
      expect(result.count).toBe(1);
    });

    it("fills false boolean property", () => {
      const result = applyTestAssets(
        { flag: false },
        [{ name: "flag", type: { type: "bool" } }]
      );
      expect(result.flag).toBe(true);
    });
  });

  describe("preserves non-empty properties", () => {
    it("preserves non-empty string", () => {
      const result = applyTestAssets(
        { prompt: "user input" },
        [{ name: "prompt", type: { type: "str" } }]
      );
      expect(result.prompt).toBe("user input");
    });

    it("preserves non-zero number", () => {
      const result = applyTestAssets(
        { count: 42 },
        [{ name: "count", type: { type: "int" } }]
      );
      expect(result.count).toBe(42);
    });

    it("preserves true boolean", () => {
      const result = applyTestAssets(
        { flag: true },
        [{ name: "flag", type: { type: "bool" } }]
      );
      expect(result.flag).toBe(true);
    });
  });

  describe("type-specific test values", () => {
    it("generates image asset ref", () => {
      const result = applyTestAssets(
        {},
        [{ name: "img", type: { type: "image" } }]
      );
      expect(result.img).toEqual({
        type: "image",
        data: expect.any(String)
      });
      expect((result.img as { data: string }).data.length).toBeGreaterThan(0);
    });

    it("generates audio asset ref", () => {
      const result = applyTestAssets(
        {},
        [{ name: "snd", type: { type: "audio" } }]
      );
      expect(result.snd).toEqual({
        type: "audio",
        data: expect.any(String)
      });
    });

    it("generates float value", () => {
      const result = applyTestAssets(
        {},
        [{ name: "rate", type: { type: "float" } }]
      );
      expect(result.rate).toBe(1.0);
    });

    it("generates color value", () => {
      const result = applyTestAssets(
        {},
        [{ name: "bg", type: { type: "color" } }]
      );
      expect(result.bg).toBe("#ff0000");
    });

    it("generates dataframe value", () => {
      const result = applyTestAssets(
        {},
        [{ name: "df", type: { type: "dataframe" } }]
      );
      const df = result.df as { type: string; columns: unknown[]; data: unknown[] };
      expect(df.type).toBe("dataframe");
      expect(df.columns).toHaveLength(2);
      expect(df.data).toHaveLength(2);
    });

    it("generates dict value", () => {
      const result = applyTestAssets(
        {},
        [{ name: "config", type: { type: "dict" } }]
      );
      expect(result.config).toEqual({ key: "value" });
    });

    it("generates list value", () => {
      const result = applyTestAssets(
        {},
        [{ name: "items", type: { type: "list[str]" } }]
      );
      expect(result.items).toEqual(["hello", "world"]);
    });
  });

  describe("unknown types", () => {
    it("does not fill properties with unknown types", () => {
      const result = applyTestAssets(
        {},
        [{ name: "custom", type: { type: "unknown_type" } }]
      );
      expect(result.custom).toBeUndefined();
    });
  });

  describe("type as string", () => {
    it("handles type as plain string instead of object", () => {
      const result = applyTestAssets(
        {},
        [{ name: "text", type: "str" }]
      );
      expect(result.text).toBe("test input");
    });
  });

  describe("does not mutate input", () => {
    it("returns a new object", () => {
      const original = { prompt: "" };
      const result = applyTestAssets(
        original,
        [{ name: "prompt", type: { type: "str" } }]
      );
      expect(result).not.toBe(original);
      expect(original.prompt).toBe("");
    });
  });

  describe("empty asset refs", () => {
    it("fills asset ref with no data and no uri", () => {
      const result = applyTestAssets(
        { img: { type: "image", data: "", uri: "" } },
        [{ name: "img", type: { type: "image" } }]
      );
      expect((result.img as { data: string }).data.length).toBeGreaterThan(0);
    });

    it("preserves asset ref with existing data", () => {
      const existingRef = { type: "image", data: "abc123" };
      const result = applyTestAssets(
        { img: existingRef },
        [{ name: "img", type: { type: "image" } }]
      );
      expect(result.img).toEqual(existingRef);
    });

    it("preserves asset ref with existing uri", () => {
      const existingRef = { type: "image", data: "", uri: "http://example.com/img.png" };
      const result = applyTestAssets(
        { img: existingRef },
        [{ name: "img", type: { type: "image" } }]
      );
      expect(result.img).toEqual(existingRef);
    });
  });
});
