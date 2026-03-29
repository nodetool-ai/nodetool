import {
  hexToRgba,
  darkenHexColor,
  lightenHexColor,
  adjustSaturation,
  adjustHue,
  adjustLightness,
  createLinearGradient,
  simulateOpacity
} from "./ColorUtils";

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

  describe("lightenHexColor", () => {
    it("lightens a color", () => {
      const result = lightenHexColor("#000000", 10);
      expect(result).not.toBe("#000000");
    });

    it("returns CSS variable unchanged", () => {
      expect(lightenHexColor("var(--color)", 10)).toBe("var(--color)");
    });
  });

  describe("adjustSaturation", () => {
    it("adjusts saturation", () => {
      const result = adjustSaturation("#ff0000", 10);
      expect(result).toBeTruthy();
    });

    it("returns CSS variable unchanged", () => {
      expect(adjustSaturation("var(--color)", 10)).toBe("var(--color)");
    });
  });

  describe("adjustHue", () => {
    it("adjusts hue", () => {
      const result = adjustHue("#ff0000", 90);
      expect(result).toBeTruthy();
    });

    it("returns CSS variable unchanged", () => {
      expect(adjustHue("var(--color)", 90)).toBe("var(--color)");
    });
  });

  describe("adjustLightness", () => {
    it("adjusts lightness", () => {
      const result = adjustLightness("#ff0000", 10);
      expect(result).toBeTruthy();
    });

    it("returns CSS variable unchanged", () => {
      expect(adjustLightness("var(--color)", 10)).toBe("var(--color)");
    });
  });

  describe("createLinearGradient", () => {
    it("creates linear gradient", () => {
      const result = createLinearGradient("#ff0000", 10, "to bottom", "darken");
      expect(result).toContain("linear-gradient");
      expect(result).toContain("to bottom");
    });

    it("uses custom direction", () => {
      const result = createLinearGradient("#ff0000", 10, "to right", "lighten");
      expect(result).toContain("to right");
    });

    it("uses custom mode", () => {
      const result = createLinearGradient("#ff0000", 10, "to bottom", "saturate");
      expect(result).toContain("linear-gradient");
    });
  });

  describe("simulateOpacity", () => {
    it("blends colors with opacity", () => {
      const result = simulateOpacity("#ff0000", 0.5, "#ffffff");
      expect(result).toBeTruthy();
    });

    it("returns foreground for CSS variables", () => {
      expect(simulateOpacity("var(--fg)", 0.5)).toBe("var(--fg)");
      expect(simulateOpacity("#ff0000", 0.5, "var(--bg)")).toBe("#ff0000");
    });
  });
});
