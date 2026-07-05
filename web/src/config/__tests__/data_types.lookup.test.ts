import {
  normalizeTypeName,
  colorForType,
  descriptionForType,
  labelForType,
  datatypeByName
} from "../data_types";

describe("normalizeTypeName", () => {
  it('maps "model3d" to "model_3d"', () => {
    expect(normalizeTypeName("model3d")).toBe("model_3d");
  });

  it("passes through other type names unchanged", () => {
    expect(normalizeTypeName("str")).toBe("str");
    expect(normalizeTypeName("int")).toBe("int");
    expect(normalizeTypeName("image")).toBe("image");
    expect(normalizeTypeName("model_3d")).toBe("model_3d");
  });
});

describe("colorForType", () => {
  it("returns a hex color string for known types", () => {
    const color = colorForType("str");
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("returns a hex color for image type", () => {
    const color = colorForType("image");
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("strips nodetool. prefix before lookup", () => {
    const withPrefix = colorForType("nodetool.str");
    const without = colorForType("str");
    expect(withPrefix).toBe(without);
  });

  it("normalizes model3d to model_3d", () => {
    const m3d = colorForType("model3d");
    const m3dUnderscore = colorForType("model_3d");
    expect(m3d).toBe(m3dUnderscore);
  });

  it("returns a generated color for unknown types", () => {
    const color = colorForType("completely_unknown_type_xyz");
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe("descriptionForType", () => {
  it("returns a non-empty description for known types", () => {
    expect(descriptionForType("str").length).toBeGreaterThan(0);
    expect(descriptionForType("image").length).toBeGreaterThan(0);
    expect(descriptionForType("audio").length).toBeGreaterThan(0);
  });

  it("strips nodetool. prefix", () => {
    expect(descriptionForType("nodetool.str")).toBe(descriptionForType("str"));
  });

  it("returns empty string for unknown types", () => {
    expect(descriptionForType("completely_unknown_type_xyz")).toBe("");
  });
});

describe("labelForType", () => {
  it("returns human-readable labels for known types", () => {
    expect(labelForType("str")).toBe("String");
    expect(labelForType("int")).toBe("Integer");
    expect(labelForType("image")).toBe("Image");
    expect(labelForType("bool")).toBe("Boolean");
  });

  it("strips nodetool. prefix", () => {
    expect(labelForType("nodetool.float")).toBe(labelForType("float"));
  });

  it("handles model3d normalization", () => {
    expect(labelForType("model3d")).toBe("Model 3D");
  });

  it("returns empty string for unknown types", () => {
    expect(labelForType("completely_unknown_type_xyz")).toBe("");
  });
});

describe("tjs.* family lookups", () => {
  it("tjs.text_generation resolves via the tjs.cached entry", () => {
    const result = datatypeByName("tjs.text_generation");
    expect(result).not.toBeNull();
    expect(result!.value).toBe("tjs.cached");
  });

  it("tjs.cached resolves directly", () => {
    const result = datatypeByName("tjs.cached");
    expect(result).not.toBeNull();
    expect(result!.value).toBe("tjs.cached");
  });
});
