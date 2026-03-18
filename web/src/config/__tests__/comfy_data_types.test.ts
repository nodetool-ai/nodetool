import { COMFY_DATA_TYPES, comfyIconMap } from "../comfy_data_types";

describe("COMFY_DATA_TYPES", () => {
  it("should be a non-empty array", () => {
    expect(Array.isArray(COMFY_DATA_TYPES)).toBe(true);
    expect(COMFY_DATA_TYPES.length).toBeGreaterThan(0);
  });

  it("all entries should have required DataType fields", () => {
    COMFY_DATA_TYPES.forEach((dt) => {
      expect(typeof dt.value).toBe("string");
      expect(dt.value.length).toBeGreaterThan(0);
      expect(typeof dt.label).toBe("string");
      expect(dt.label.length).toBeGreaterThan(0);
      expect(typeof dt.description).toBe("string");
      expect(dt.description.length).toBeGreaterThan(0);
      expect(typeof dt.color).toBe("string");
      expect(dt.color.length).toBeGreaterThan(0);
      expect(typeof dt.textColor).toBe("string");
    });
  });

  it("all values should start with 'comfy.'", () => {
    COMFY_DATA_TYPES.forEach((dt) => {
      expect(dt.value).toMatch(/^comfy\./);
    });
  });

  it("should have unique values", () => {
    const values = COMFY_DATA_TYPES.map((dt) => dt.value);
    const uniqueValues = new Set(values);
    expect(values.length).toBe(uniqueValues.size);
  });

  it("should include common comfy types", () => {
    const values = COMFY_DATA_TYPES.map((dt) => dt.value);
    expect(values).toContain("comfy.unet");
    expect(values).toContain("comfy.vae");
    expect(values).toContain("comfy.clip");
    expect(values).toContain("comfy.latent");
    expect(values).toContain("comfy.conditioning");
  });
});

describe("comfyIconMap", () => {
  it("should be a non-empty object", () => {
    expect(Object.keys(comfyIconMap).length).toBeGreaterThan(0);
  });

  it("should have an entry for each COMFY_DATA_TYPE value", () => {
    COMFY_DATA_TYPES.forEach((dt) => {
      expect(dt.value in comfyIconMap).toBe(true);
    });
  });

  it("all values should be functions (React components)", () => {
    Object.values(comfyIconMap).forEach((component) => {
      expect(typeof component).toBe("function");
    });
  });
});
