import { solarizedColors, monokaiColors } from "../comfy_colors";

describe("solarizedColors", () => {
  it("should have all expected keys", () => {
    const expectedKeys = [
      "base03",
      "base02",
      "base01",
      "base00",
      "base0",
      "base1",
      "base2",
      "base3",
      "yellow",
      "orange",
      "magenta",
      "violet",
      "blue",
      "cyan",
      "green"
    ];
    expectedKeys.forEach((key) => {
      expect(solarizedColors).toHaveProperty(key);
    });
  });

  it("all values should be valid hex color strings", () => {
    Object.values(solarizedColors).forEach((color) => {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});

describe("monokaiColors", () => {
  it("should have all expected keys", () => {
    const expectedKeys = [
      "background",
      "comments",
      "white",
      "yellow",
      "green",
      "orange",
      "purple",
      "pink",
      "blue"
    ];
    expectedKeys.forEach((key) => {
      expect(monokaiColors).toHaveProperty(key);
    });
  });

  it("all values should be valid hex color strings", () => {
    Object.values(monokaiColors).forEach((color) => {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});
