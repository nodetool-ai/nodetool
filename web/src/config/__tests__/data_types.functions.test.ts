import {
  normalizeTypeName,
  colorForType,
  descriptionForType,
  labelForType,
  datatypeByName,
  DATA_TYPES
} from "../data_types";

describe("data_types utility functions", () => {
  describe("normalizeTypeName", () => {
    it("maps model3d to model_3d", () => {
      expect(normalizeTypeName("model3d")).toBe("model_3d");
    });

    it("passes through other type names unchanged", () => {
      expect(normalizeTypeName("str")).toBe("str");
      expect(normalizeTypeName("int")).toBe("int");
      expect(normalizeTypeName("float")).toBe("float");
      expect(normalizeTypeName("image")).toBe("image");
    });

    it("passes through empty string", () => {
      expect(normalizeTypeName("")).toBe("");
    });
  });

  describe("colorForType", () => {
    it("returns a color for known types", () => {
      const color = colorForType("str");
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it("strips nodetool. prefix before lookup", () => {
      const direct = colorForType("str");
      const prefixed = colorForType("nodetool.str");
      expect(direct).toBe(prefixed);
    });

    it("returns a deterministic color for unknown types", () => {
      const color1 = colorForType("completely_unknown_type_xyz");
      const color2 = colorForType("completely_unknown_type_xyz");
      expect(color1).toBe(color2);
      expect(color1).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it("generates different colors for different unknown types", () => {
      const a = colorForType("unknown_type_a");
      const b = colorForType("unknown_type_b");
      expect(a).not.toBe(b);
    });
  });

  describe("descriptionForType", () => {
    it("returns description for known types", () => {
      const desc = descriptionForType("str");
      expect(desc.length).toBeGreaterThan(0);
    });

    it("strips nodetool. prefix", () => {
      const direct = descriptionForType("image");
      const prefixed = descriptionForType("nodetool.image");
      expect(direct).toBe(prefixed);
    });

    it("returns empty string for unknown types", () => {
      expect(descriptionForType("nonexistent_zzz")).toBe("");
    });
  });

  describe("labelForType", () => {
    it("returns human-readable label for known types", () => {
      expect(labelForType("str")).toBe("String");
    });

    it("returns label for int type", () => {
      expect(labelForType("int")).toBe("Integer");
    });

    it("strips nodetool. prefix", () => {
      const direct = labelForType("float");
      const prefixed = labelForType("nodetool.float");
      expect(direct).toBe(prefixed);
    });

    it("returns empty string for unknown types", () => {
      expect(labelForType("nonexistent_zzz")).toBe("");
    });
  });

  describe("datatypeByName extended", () => {
    it("returns correct type for image", () => {
      const dt = datatypeByName("image");
      expect(dt?.value).toBe("image");
      expect(dt?.label).toBe("Image");
    });

    it("strips nodetool. prefix", () => {
      const dt = datatypeByName("nodetool.str");
      expect(dt?.value).toBe("str");
    });

    it("handles model3d normalization", () => {
      const dt = datatypeByName("model3d");
      expect(dt?.value).toBe("model_3d");
    });

    it("returns notype for completely unknown types", () => {
      const dt = datatypeByName("completely_unknown_type");
      expect(dt?.value).toBe("notype");
    });
  });

  describe("DATA_TYPES integrity", () => {
    it("has namespace/name/slug populated for all types", () => {
      for (const dt of DATA_TYPES) {
        expect(dt.slug).toBeDefined();
        expect(typeof dt.slug).toBe("string");
      }
    });

    it("has valid hex color for every type", () => {
      for (const dt of DATA_TYPES) {
        expect(dt.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    it("has a textColor for every type", () => {
      for (const dt of DATA_TYPES) {
        expect(dt.textColor).toBeDefined();
        expect(typeof dt.textColor).toBe("string");
      }
    });

    it("is sorted alphabetically by value", () => {
      const values = DATA_TYPES.map((d) => d.value);
      const sorted = [...values].sort((a, b) => a.localeCompare(b));
      expect(values).toEqual(sorted);
    });
  });
});
