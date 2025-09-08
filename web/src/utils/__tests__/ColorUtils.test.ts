/**
 * @jest-environment node
 */
import {
  hexToRgba,
  darkenHexColor,
  lightenHexColor,
  adjustSaturation,
  adjustHue,
  adjustLightness,
  createLinearGradient,
  simulateOpacity
} from "../ColorUtils";

describe("ColorUtils", () => {
  describe("hexToRgba", () => {
    it("should convert hex color to rgba with alpha", () => {
      expect(hexToRgba("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
      expect(hexToRgba("#00ff00", 1)).toBe("rgba(0, 255, 0, 1)");
      expect(hexToRgba("#0000ff", 0)).toBe("rgba(0, 0, 255, 0)");
    });

    it("should handle 3-digit hex colors", () => {
      expect(hexToRgba("#f00", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
      expect(hexToRgba("#0f0", 1)).toBe("rgba(0, 255, 0, 1)");
    });

    it("should return transparent for empty or undefined hex", () => {
      expect(hexToRgba("", 0.5)).toBe("transparent");
      expect(hexToRgba(null as any, 0.5)).toBe("transparent");
      expect(hexToRgba(undefined as any, 0.5)).toBe("transparent");
    });

    it("should preserve CSS variables", () => {
      expect(hexToRgba("var(--palette-primary-main)", 0.5)).toBe(
        "rgb(var(--palette-primary-main) / 0.5)"
      );
      expect(hexToRgba("var(--color-bg)", 0.8)).toBe(
        "rgb(var(--color-bg) / 0.8)"
      );
    });

    it("should handle invalid color gracefully", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      expect(hexToRgba("invalid", 0.5)).toBe("invalid");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should handle rgb color strings", () => {
      expect(hexToRgba("rgb(255, 0, 0)", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
    });

    it("should handle named colors", () => {
      expect(hexToRgba("red", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
      expect(hexToRgba("blue", 0.7)).toBe("rgba(0, 0, 255, 0.7)");
    });
  });

  describe("darkenHexColor", () => {
    it("should darken hex colors by specified amount", () => {
      expect(darkenHexColor("#ff0000", 50)).toBe("#800000");
      expect(darkenHexColor("#ffffff", 10)).toBe("#e6e6e6");
    });

    it("should preserve CSS variables", () => {
      expect(darkenHexColor("var(--color-primary)", 50)).toBe(
        "var(--color-primary)"
      );
    });

    it("should handle edge cases", () => {
      expect(darkenHexColor("#000000", 50)).toBe("#000000"); // Can't darken black
      expect(darkenHexColor("#ffffff", 100)).toBe("#000000"); // Max darkening
    });
  });

  describe("lightenHexColor", () => {
    it("should lighten hex colors by specified amount", () => {
      expect(lightenHexColor("#000000", 100)).toBe("#ffffff");
      expect(lightenHexColor("#808080", 50)).toBe("#bfbfbf");
    });

    it("should preserve CSS variables", () => {
      expect(lightenHexColor("var(--color-primary)", 50)).toBe(
        "var(--color-primary)"
      );
    });

    it("should handle edge cases", () => {
      expect(lightenHexColor("#ffffff", 50)).toBe("#ffffff"); // Can't lighten white
    });
  });

  describe("adjustSaturation", () => {
    it("should adjust saturation of hex colors", () => {
      // Red with 50% more saturation stays red (already fully saturated)
      expect(adjustSaturation("#ff0000", 50)).toBe("#ff0000");
      
      // Gray becomes more colorful when saturation is increased
      const result = adjustSaturation("#808080", 100);
      expect(result).not.toBe("#808080");
    });

    it("should preserve CSS variables", () => {
      expect(adjustSaturation("var(--color-primary)", 50)).toBe(
        "var(--color-primary)"
      );
    });

    it("should handle desaturation", () => {
      // Negative values should desaturate
      const result = adjustSaturation("#ff0000", -50);
      expect(result).not.toBe("#ff0000");
    });
  });

  describe("adjustHue", () => {
    it("should rotate hue of hex colors", () => {
      // Red rotated 120 degrees becomes green
      expect(adjustHue("#ff0000", 120)).toBe("#00ff00");
      
      // Red rotated 240 degrees becomes blue
      expect(adjustHue("#ff0000", 240)).toBe("#0000ff");
    });

    it("should preserve CSS variables", () => {
      expect(adjustHue("var(--color-primary)", 120)).toBe(
        "var(--color-primary)"
      );
    });

    it("should handle full rotation", () => {
      // 360 degree rotation should return to original
      expect(adjustHue("#ff0000", 360)).toBe("#ff0000");
    });

    it("should handle negative rotation", () => {
      // -120 degrees from red should give blue
      expect(adjustHue("#ff0000", -120)).toBe("#0000ff");
    });
  });

  describe("adjustLightness", () => {
    it("should adjust lightness of hex colors", () => {
      // Increasing lightness of gray
      const lighter = adjustLightness("#808080", 50);
      expect(lighter).not.toBe("#808080");
      
      // Decreasing lightness
      const darker = adjustLightness("#808080", -50);
      expect(darker).not.toBe("#808080");
    });

    it("should preserve CSS variables", () => {
      expect(adjustLightness("var(--color-primary)", 50)).toBe(
        "var(--color-primary)"
      );
    });

    it("should handle edge cases", () => {
      // Max lightness should approach white
      const veryLight = adjustLightness("#808080", 100);
      expect(veryLight).not.toBe("#808080");
    });
  });

  describe("createLinearGradient", () => {
    it("should create linear gradient with darken mode", () => {
      const gradient = createLinearGradient("#ff0000", 50, "to bottom", "darken");
      expect(gradient).toContain("linear-gradient");
      expect(gradient).toContain("to bottom");
      expect(gradient).toContain("rgba(255, 0, 0, 1)");
      expect(gradient).toContain("rgba(128, 0, 0, 1)");
    });

    it("should create linear gradient with lighten mode", () => {
      const gradient = createLinearGradient("#000000", 100, "to right", "lighten");
      expect(gradient).toContain("linear-gradient");
      expect(gradient).toContain("to right");
      expect(gradient).toContain("rgba(0, 0, 0, 1)");
      expect(gradient).toContain("rgba(255, 255, 255, 1)");
    });

    it("should create linear gradient with saturate mode", () => {
      const gradient = createLinearGradient("#808080", 50, "to top", "saturate");
      expect(gradient).toContain("linear-gradient");
      expect(gradient).toContain("to top");
    });

    it("should handle invalid mode and use default", () => {
      const gradient = createLinearGradient("#ff0000", 50, "to bottom", "invalid" as any);
      expect(gradient).toContain("linear-gradient");
      expect(gradient).toContain("to bottom");
      // Should fall back to using original color
      expect(gradient).toContain("rgba(255, 0, 0, 1)");
    });

    it("should use default values", () => {
      const gradient = createLinearGradient("#ff0000", 50);
      expect(gradient).toContain("to bottom");
      expect(gradient).toContain("linear-gradient");
    });

    it("should handle all directions", () => {
      const directions = [
        "to top",
        "to bottom",
        "to left",
        "to right",
        "to top left",
        "to top right",
        "to bottom left",
        "to bottom right"
      ] as const;

      directions.forEach(direction => {
        const gradient = createLinearGradient("#ff0000", 50, direction);
        expect(gradient).toContain(direction);
      });
    });

    it("should handle CSS variables", () => {
      const gradient = createLinearGradient("var(--color-primary)", 50);
      expect(gradient).toContain("var(--color-primary)");
    });
  });

  describe("simulateOpacity", () => {
    it("should simulate opacity by blending with background", () => {
      // Red at 50% opacity on white background
      const result = simulateOpacity("#ff0000", 0.5, "#ffffff");
      expect(result).toBe("#ff8080");
    });

    it("should blend with default white background", () => {
      const result = simulateOpacity("#000000", 0.5);
      expect(result).toBe("#808080"); // Black at 50% on white = gray
    });

    it("should handle full opacity", () => {
      expect(simulateOpacity("#ff0000", 1, "#ffffff")).toBe("#ff0000");
    });

    it("should handle zero opacity", () => {
      expect(simulateOpacity("#ff0000", 0, "#ffffff")).toBe("#ffffff");
    });

    it("should preserve CSS variables in foreground", () => {
      expect(simulateOpacity("var(--color-fg)", 0.5, "#ffffff")).toBe(
        "var(--color-fg)"
      );
    });

    it("should preserve CSS variables in background", () => {
      expect(simulateOpacity("#ff0000", 0.5, "var(--color-bg)")).toBe(
        "#ff0000"
      );
    });

    it("should blend different colors correctly", () => {
      // Blue on red background at 50%
      const result = simulateOpacity("#0000ff", 0.5, "#ff0000");
      expect(result).toBe("#800080"); // Should be purple
    });

    it("should handle rgb format", () => {
      const result = simulateOpacity("rgb(255, 0, 0)", 0.5, "rgb(255, 255, 255)");
      expect(result).toBe("#ff8080");
    });

    it("should handle named colors", () => {
      const result = simulateOpacity("red", 0.5, "white");
      expect(result).toBe("#ff8080");
    });
  });
});
