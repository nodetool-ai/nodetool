import {
  parseModelVersion,
  formatModelVersion,
  FEATURED_REPLICATE_MODELS
} from "../useReplicateModels";

describe("useReplicateModels", () => {
  describe("parseModelVersion", () => {
    it("should parse owner/name format", () => {
      const result = parseModelVersion("stability-ai/sdxl");

      expect(result).toEqual({
        owner: "stability-ai",
        name: "sdxl",
        version: undefined
      });
    });

    it("should parse owner/name:version format", () => {
      const result = parseModelVersion("stability-ai/sdxl:abc123def456");

      expect(result).toEqual({
        owner: "stability-ai",
        name: "sdxl",
        version: "abc123def456"
      });
    });

    it("should handle long version IDs", () => {
      // Replicate version IDs are typically long hex strings
      const result = parseModelVersion("owner/name:abc123def456789");

      expect(result.owner).toBe("owner");
      expect(result.name).toBe("name");
      expect(result.version).toBe("abc123def456789");
    });

    it("should throw error for invalid format without slash", () => {
      expect(() => parseModelVersion("invalid-format")).toThrow(
        "Invalid model format"
      );
    });

    it("should throw error for format with too many slashes", () => {
      expect(() => parseModelVersion("owner/name/extra")).toThrow(
        "Invalid model format"
      );
    });

    it("should throw error for empty string", () => {
      expect(() => parseModelVersion("")).toThrow("Invalid model format");
    });
  });

  describe("formatModelVersion", () => {
    it("should format owner/name without version", () => {
      const result = formatModelVersion("stability-ai", "sdxl");

      expect(result).toBe("stability-ai/sdxl");
    });

    it("should format owner/name:version with version", () => {
      const result = formatModelVersion("stability-ai", "sdxl", "abc123");

      expect(result).toBe("stability-ai/sdxl:abc123");
    });

    it("should handle undefined version", () => {
      const result = formatModelVersion("owner", "name", undefined);

      expect(result).toBe("owner/name");
    });

    it("should handle empty version string", () => {
      const result = formatModelVersion("owner", "name", "");

      expect(result).toBe("owner/name");
    });
  });

  describe("FEATURED_REPLICATE_MODELS", () => {
    it("should contain expected models", () => {
      expect(FEATURED_REPLICATE_MODELS.length).toBeGreaterThan(0);

      // Check for some expected featured models
      const modelIds = FEATURED_REPLICATE_MODELS.map(
        (m) => `${m.owner}/${m.name}`
      );

      expect(modelIds).toContain("stability-ai/sdxl");
    });

    it("should have required fields for each model", () => {
      FEATURED_REPLICATE_MODELS.forEach((model) => {
        expect(model).toHaveProperty("owner");
        expect(model).toHaveProperty("name");
        expect(model).toHaveProperty("description");
        expect(typeof model.owner).toBe("string");
        expect(typeof model.name).toBe("string");
        expect(typeof model.description).toBe("string");
        expect(model.owner.length).toBeGreaterThan(0);
        expect(model.name.length).toBeGreaterThan(0);
      });
    });
  });

  describe("parseModelVersion and formatModelVersion roundtrip", () => {
    it("should roundtrip without version", () => {
      const original = "owner/model";
      const parsed = parseModelVersion(original);
      const formatted = formatModelVersion(parsed.owner, parsed.name, parsed.version);

      expect(formatted).toBe(original);
    });

    it("should roundtrip with version", () => {
      const original = "owner/model:version123";
      const parsed = parseModelVersion(original);
      const formatted = formatModelVersion(parsed.owner, parsed.name, parsed.version);

      expect(formatted).toBe(original);
    });

    it("should roundtrip featured models", () => {
      FEATURED_REPLICATE_MODELS.forEach((model) => {
        const formatted = formatModelVersion(model.owner, model.name);
        const parsed = parseModelVersion(formatted);

        expect(parsed.owner).toBe(model.owner);
        expect(parsed.name).toBe(model.name);
      });
    });
  });
});
