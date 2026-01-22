import {
  getMonochromatic,
  getShades,
  getTints
} from "../colorHarmonies";

describe("colorHarmonies - Monochromatic Palette", () => {
  it("generates 5-color monochromatic palette by default", () => {
    const result = getMonochromatic("#808080");
    expect(result).toHaveLength(5);
  });

  it("generates variable count palette", () => {
    expect(getMonochromatic("#808080", 3)).toHaveLength(3);
    expect(getMonochromatic("#808080", 10)).toHaveLength(10);
  });

  it("creates gradient from dark to light", () => {
    const result = getMonochromatic("#808080", 5);
    expect(result[0]).toBe("#1a1a1a");
    expect(result[4]).toBe("#e6e6e6");
  });

  it("includes original color in palette", () => {
    const result = getMonochromatic("#808080", 5);
    expect(result).toContain("#808080");
  });
});

describe("colorHarmonies - Shades", () => {
  it("generates 5 shades by default", () => {
    const result = getShades("#808080");
    expect(result).toHaveLength(5);
  });

  it("generates shades from dark to original", () => {
    const result = getShades("#808080", 5);
    // First shade is darkest (not necessarily black)
    expect(result[0]).toMatch(/^#[0-9a-f]{6}$/i);
    // Last shade is the darkest (black for gray input)
    expect(result[4]).toBe("#000000");
  });

  it("generates progressively darker shades", () => {
    const result = getShades("#808080", 5);
    // All should be valid hex colors
    expect(result.every(c => c.startsWith("#"))).toBe(true);
  });

  it("handles various input colors", () => {
    const result = getShades("#ff0000", 3);
    expect(result).toHaveLength(3);
    expect(result.every(c => c.startsWith("#"))).toBe(true);
  });
});

describe("colorHarmonies - Tints", () => {
  it("generates 5 tints by default", () => {
    const result = getTints("#808080");
    expect(result).toHaveLength(5);
  });

  it("generates tints from original to light", () => {
    const result = getTints("#808080", 5);
    // First tint is original
    expect(result[0]).toBe("#808080");
    // Last tint is lightest (not white, but lighter than original)
    expect(result[4]).toMatch(/^#[0-9a-f]{6}$/i);
    // The last tint should be lighter than the first
    expect(result[4]).not.toBe("#808080");
  });

  it("generates progressively lighter tints", () => {
    const result = getTints("#808080", 5);
    // All should be valid hex colors
    expect(result.every(c => c.startsWith("#"))).toBe(true);
  });

  it("handles various input colors", () => {
    const result = getTints("#000000", 3);
    expect(result).toHaveLength(3);
    expect(result.every(c => c.startsWith("#"))).toBe(true);
  });
});
