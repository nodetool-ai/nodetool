import { formatBytes, groupModelsByType, sortModelTypes } from "../modelFormatting";
import type { UnifiedModel } from "../../stores/ApiTypes";

describe("modelFormatting", () => {
  describe("formatBytes", () => {
    it("formats zero bytes", () => {
      expect(formatBytes(0)).toBe("0 Bytes");
    });

    it("formats bytes", () => {
      expect(formatBytes(500)).toBe("500 Bytes");
    });

    it("formats kilobytes", () => {
      expect(formatBytes(1024)).toBe("1 KB");
      expect(formatBytes(1536)).toBe("1.5 KB");
    });

    it("formats megabytes", () => {
      expect(formatBytes(1048576)).toBe("1 MB");
      expect(formatBytes(5242880)).toBe("5 MB");
    });

    it("formats gigabytes", () => {
      expect(formatBytes(1073741824)).toBe("1 GB");
      expect(formatBytes(4831838208)).toBe("4.5 GB");
    });

    it("formats terabytes", () => {
      expect(formatBytes(1099511627776)).toBe("1 TB");
    });

    it("returns empty string for undefined", () => {
      expect(formatBytes(undefined)).toBe("");
    });

    it("returns empty string for NaN", () => {
      expect(formatBytes(NaN)).toBe("");
    });
  });

  describe("groupModelsByType", () => {
    it("groups models by their type field", () => {
      const models = [
        { id: "1", type: "llama_model" },
        { id: "2", type: "hf.text" },
        { id: "3", type: "llama_model" },
      ] as UnifiedModel[];

      const grouped = groupModelsByType(models);
      expect(Object.keys(grouped)).toHaveLength(2);
      expect(grouped["llama_model"]).toHaveLength(2);
      expect(grouped["hf.text"]).toHaveLength(1);
    });

    it("uses 'Other' for models without a type", () => {
      const models = [{ id: "1" }] as UnifiedModel[];
      const grouped = groupModelsByType(models);
      expect(grouped["Other"]).toHaveLength(1);
    });

    it("returns empty object for empty array", () => {
      expect(groupModelsByType([])).toEqual({});
    });
  });

  describe("sortModelTypes", () => {
    it("puts 'All' first", () => {
      const sorted = sortModelTypes(["hf.text", "All", "llama_model"]);
      expect(sorted[0]).toBe("All");
    });

    it("puts llama/mlx types after 'All'", () => {
      const sorted = sortModelTypes(["Other", "llama_model", "All", "mlx"]);
      expect(sorted[0]).toBe("All");
      expect(sorted.indexOf("llama_model")).toBeLessThan(sorted.indexOf("Other"));
      expect(sorted.indexOf("mlx")).toBeLessThan(sorted.indexOf("Other"));
    });

    it("puts 'Other' near the end", () => {
      const sorted = sortModelTypes(["hf.text", "Other", "All"]);
      expect(sorted.indexOf("Other")).toBeGreaterThan(sorted.indexOf("All"));
    });

    it("sorts remaining types alphabetically", () => {
      const sorted = sortModelTypes(["hf.text", "hf.audio", "hf.image"]);
      expect(sorted).toEqual(["hf.audio", "hf.image", "hf.text"]);
    });

    it("handles empty array", () => {
      expect(sortModelTypes([])).toEqual([]);
    });

    it("handles single element", () => {
      expect(sortModelTypes(["llama_model"])).toEqual(["llama_model"]);
    });
  });
});
