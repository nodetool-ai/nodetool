import { hexToRgba, darkenHexColor } from "./ColorUtils";

describe("ColorUtils", () => {
  describe("hexToRgba", () => {
    it("converts hex to rgba", () => {
      expect(hexToRgba("#ff0000", 0.5)).toMatch(/rgba\(255, 0, 0, 0\.5\)/);
    });

    it("returns transparent for empty hex", () => {
      expect(hexToRgba("", 1)).toBe("transparent");
      expect(hexToRgba(null as any, 1)).toBe("transparent");
    });

    it("handles CSS variables", () => {
      const result = hexToRgba("var(--primary)", 0.5);
      expect(result).toContain("rgb(var(--primary)");
    });

    it("handles invalid hex gracefully", () => {
      expect(hexToRgba("invalid", 1)).toBe("invalid");
    });

    it("handles short hex", () => {
      expect(hexToRgba("#f00", 1)).toMatch(/rgba\(255, 0, 0, 1\)/);
    });
  });

  describe("darkenHexColor", () => {
    it("darkens a color", () => {
      const result = darkenHexColor("#ffffff", 10);
      expect(result).not.toBe("#ffffff");
    });

    it("returns CSS variable unchanged", () => {
      expect(darkenHexColor("var(--color)", 10)).toBe("var(--color)");
    });
  });
});
