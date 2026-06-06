/**
 * @jest-environment jsdom
 */
import {
  normalizeTypeName,
  colorForType,
  descriptionForType,
  labelForType,
} from "../data_types";

describe("normalizeTypeName", () => {
  it("converts 'model3d' to 'model_3d'", () => {
    expect(normalizeTypeName("model3d")).toBe("model_3d");
  });

  it("leaves other type names unchanged", () => {
    expect(normalizeTypeName("str")).toBe("str");
    expect(normalizeTypeName("int")).toBe("int");
    expect(normalizeTypeName("image")).toBe("image");
    expect(normalizeTypeName("float")).toBe("float");
    expect(normalizeTypeName("tensor")).toBe("tensor");
    expect(normalizeTypeName("model_3d")).toBe("model_3d");
  });
});

describe("colorForType", () => {
  it("returns a hex color for known types", () => {
    const color = colorForType("str");
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("strips nodetool. prefix before lookup", () => {
    const withPrefix = colorForType("nodetool.str");
    const withoutPrefix = colorForType("str");
    expect(withPrefix).toBe(withoutPrefix);
  });

  it("returns a deterministic fallback color for unknown types", () => {
    const color1 = colorForType("totally_unknown_type");
    const color2 = colorForType("totally_unknown_type");
    expect(color1).toBe(color2);
    expect(color1).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("handles model3d normalization", () => {
    const fromModel3d = colorForType("model3d");
    const fromModel_3d = colorForType("model_3d");
    expect(fromModel3d).toBe(fromModel_3d);
  });

  it("returns different colors for different known types", () => {
    const strColor = colorForType("str");
    const imageColor = colorForType("image");
    expect(strColor).not.toBe(imageColor);
  });
});

describe("descriptionForType", () => {
  it("returns a non-empty description for known types", () => {
    const desc = descriptionForType("str");
    expect(desc).toBeTruthy();
    expect(typeof desc).toBe("string");
    expect(desc.length).toBeGreaterThan(10);
  });

  it("strips nodetool. prefix", () => {
    expect(descriptionForType("nodetool.image")).toBe(
      descriptionForType("image")
    );
  });

  it("returns empty string for unknown types", () => {
    expect(descriptionForType("completely_unknown_xyz")).toBe("");
  });

  it("handles model3d normalization", () => {
    expect(descriptionForType("model3d")).toBe(
      descriptionForType("model_3d")
    );
  });
});

describe("labelForType", () => {
  it("returns 'String' for str", () => {
    expect(labelForType("str")).toBe("String");
  });

  it("returns 'Image' for image", () => {
    expect(labelForType("image")).toBe("Image");
  });

  it("returns 'Integer' for int", () => {
    expect(labelForType("int")).toBe("Integer");
  });

  it("returns 'Float' for float", () => {
    expect(labelForType("float")).toBe("Float");
  });

  it("returns 'Boolean' for bool", () => {
    expect(labelForType("bool")).toBe("Boolean");
  });

  it("strips nodetool. prefix", () => {
    expect(labelForType("nodetool.audio")).toBe(labelForType("audio"));
  });

  it("returns empty string for unknown types", () => {
    expect(labelForType("xyz_not_a_real_type")).toBe("");
  });

  it("handles model3d normalization", () => {
    expect(labelForType("model3d")).toBe("Model 3D");
  });
});
