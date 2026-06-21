/**
 * @jest-environment jsdom
 */

import {
  colorForType,
  labelForType,
  descriptionForType,
  normalizeTypeName
} from "../data_types";

describe("normalizeTypeName", () => {
  it("converts model3d to model_3d", () => {
    expect(normalizeTypeName("model3d")).toBe("model_3d");
  });

  it("passes through other type names unchanged", () => {
    expect(normalizeTypeName("str")).toBe("str");
    expect(normalizeTypeName("int")).toBe("int");
    expect(normalizeTypeName("image")).toBe("image");
    expect(normalizeTypeName("float")).toBe("float");
    expect(normalizeTypeName("bool")).toBe("bool");
  });

  it("passes through model_3d unchanged (already normalized)", () => {
    expect(normalizeTypeName("model_3d")).toBe("model_3d");
  });

  it("passes through empty string", () => {
    expect(normalizeTypeName("")).toBe("");
  });
});

describe("colorForType", () => {
  it("returns a known color for built-in types", () => {
    const color = colorForType("str");
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("returns the same color for a type regardless of nodetool. prefix", () => {
    const withPrefix = colorForType("nodetool.str");
    const without = colorForType("str");
    expect(withPrefix).toBe(without);
  });

  it("returns a deterministic hash color for unknown types", () => {
    const color1 = colorForType("completely.unknown.type");
    const color2 = colorForType("completely.unknown.type");
    expect(color1).toBe(color2);
    expect(color1).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("normalizes model3d to model_3d before lookup", () => {
    const fromModel3d = colorForType("model3d");
    const fromModel_3d = colorForType("model_3d");
    expect(fromModel3d).toBe(fromModel_3d);
  });

  it("different unknown types produce different colors", () => {
    const a = colorForType("unknown_type_a");
    const b = colorForType("unknown_type_b");
    expect(a).not.toBe(b);
  });
});

describe("labelForType", () => {
  it("returns a human-readable label for known types", () => {
    expect(labelForType("str")).toBe("String");
    expect(labelForType("int")).toBe("Integer");
    expect(labelForType("float")).toBe("Float");
    expect(labelForType("bool")).toBe("Boolean");
    expect(labelForType("image")).toBe("Image");
  });

  it("strips nodetool. prefix before lookup", () => {
    expect(labelForType("nodetool.str")).toBe("String");
  });

  it("normalizes model3d", () => {
    expect(labelForType("model3d")).toBe("Model 3D");
  });

  it("returns empty string for unknown types", () => {
    expect(labelForType("completely.unknown.type")).toBe("");
  });
});

describe("descriptionForType", () => {
  it("returns a description for known types", () => {
    const desc = descriptionForType("str");
    expect(desc.length).toBeGreaterThan(0);
  });

  it("strips nodetool. prefix before lookup", () => {
    const withPrefix = descriptionForType("nodetool.image");
    const without = descriptionForType("image");
    expect(withPrefix).toBe(without);
  });

  it("returns empty string for unknown types", () => {
    expect(descriptionForType("completely.unknown.type")).toBe("");
  });

  it("normalizes model3d", () => {
    const desc = descriptionForType("model3d");
    expect(desc.length).toBeGreaterThan(0);
  });
});
