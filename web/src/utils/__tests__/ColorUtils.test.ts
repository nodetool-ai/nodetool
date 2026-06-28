/**
 * @jest-environment node
 */
import {
  hexToRgba,
  darkenHexColor,
  adjustSaturation,
  createLinearGradient,
  NodeTypeCategory,
  getNodeCategoryColor,
  createMinimapNodeColorFn
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
      expect(darkenHexColor("#ff0000", 50)).toBe("#e00000");
      // darken(0.1) subtracts ~1.8 from Lab L (100 → 98.2): a slight dim.
      expect(darkenHexColor("#ffffff", 10)).toBe("#fafafa");
    });

    it("should preserve CSS variables", () => {
      expect(darkenHexColor("var(--color-primary)", 50)).toBe(
        "var(--color-primary)"
      );
    });

    it("should handle edge cases", () => {
      expect(darkenHexColor("#000000", 50)).toBe("#000000"); // Can't darken black
      expect(darkenHexColor("#ffffff", 100)).toBe("#cccccc"); // Max darkening
    });
  });

  describe("adjustSaturation", () => {
    it("should adjust saturation of hex colors", () => {
      // Red with 50% more saturation stays red (already fully saturated)
      expect(adjustSaturation("#ff0000", 50)).toBe("#ff0000");

      // A partially saturated color becomes more colorful when saturation is
      // increased (HSL saturation multiplier on a non-gray hue).
      const result = adjustSaturation("#bf4040", 100);
      expect(result).not.toBe("#bf4040");

      // Gray has zero HSL saturation, so scaling it leaves it gray.
      expect(adjustSaturation("#808080", 100)).toBe("#808080");
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

  describe("createLinearGradient", () => {
    it("should create linear gradient with darken mode", () => {
      const gradient = createLinearGradient("#ff0000", 50, "to bottom", "darken");
      expect(gradient).toContain("linear-gradient");
      expect(gradient).toContain("to bottom");
      expect(gradient).toContain("rgba(255, 0, 0, 1)");
      expect(gradient).toContain("rgba(224, 0, 0, 1)");
    });

    it("should create linear gradient with lighten mode", () => {
      const gradient = createLinearGradient("#000000", 100, "to right", "lighten");
      expect(gradient).toContain("linear-gradient");
      expect(gradient).toContain("to right");
      expect(gradient).toContain("rgba(0, 0, 0, 1)");
      expect(gradient).toContain("rgba(44, 44, 44, 1)");
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

  describe("getNodeCategoryColor", () => {
    it("should return correct colors for light mode", () => {
      expect(getNodeCategoryColor(NodeTypeCategory.Input, false)).toBe(
        "#3b82f6"
      ); // Blue
      expect(getNodeCategoryColor(NodeTypeCategory.Constant, false)).toBe(
        "#8b5cf6"
      ); // Purple
      expect(getNodeCategoryColor(NodeTypeCategory.Processing, false)).toBe(
        "#64748b"
      ); // Slate
      expect(getNodeCategoryColor(NodeTypeCategory.Group, false)).toBe(
        "#6366f1"
      ); // Indigo
      expect(getNodeCategoryColor(NodeTypeCategory.Comment, false)).toBe(
        "#22c55e"
      ); // Green
      expect(getNodeCategoryColor(NodeTypeCategory.Output, false)).toBe(
        "#f59e0b"
      ); // Amber
    });

    it("should return correct colors for dark mode", () => {
      expect(getNodeCategoryColor(NodeTypeCategory.Input, true)).toBe(
        "#60a5fa"
      ); // Lighter blue
      expect(getNodeCategoryColor(NodeTypeCategory.Constant, true)).toBe(
        "#a78bfa"
      ); // Lighter purple
      expect(getNodeCategoryColor(NodeTypeCategory.Processing, true)).toBe(
        "#94a3b8"
      ); // Lighter slate
      expect(getNodeCategoryColor(NodeTypeCategory.Group, true)).toBe(
        "#818cf8"
      ); // Lighter indigo
      expect(getNodeCategoryColor(NodeTypeCategory.Comment, true)).toBe(
        "#4ade80"
      ); // Lighter green
      expect(getNodeCategoryColor(NodeTypeCategory.Output, true)).toBe(
        "#fbbf24"
      ); // Lighter amber
    });
  });

  describe("createMinimapNodeColorFn", () => {
    it("should use primary color for selected nodes in default mode", () => {
      const primaryColor = "#ff0000";
      const fn = createMinimapNodeColorFn(false, false, primaryColor);

      expect(fn({ type: "nodetool.input.StringInput", selected: true })).toBe(
        primaryColor
      );
      expect(
        fn({ type: "nodetool.constant.String", selected: true })
      ).toBe(primaryColor);
    });

    it("should use primary color for selected nodes in type mode", () => {
      const primaryColor = "#ff0000";
      const fn = createMinimapNodeColorFn(false, true, primaryColor);

      expect(fn({ type: "nodetool.input.StringInput", selected: true })).toBe(
        primaryColor
      );
    });

    it("should color nodes by type in type mode", () => {
      const fn = createMinimapNodeColorFn(false, true, "#ff0000");

      // Input nodes should be blue in light mode
      expect(
        fn({ type: "nodetool.input.StringInput", selected: false })
      ).toBe("#3b82f6");

      // Constant nodes should be purple
      expect(
        fn({ type: "nodetool.constant.String", selected: false })
      ).toBe("#8b5cf6");

      // Processing nodes should be slate
      expect(
        fn({ type: "nodetool.image.Resize", selected: false })
      ).toBe("#64748b");
    });

    it("should use default colors in default mode", () => {
      const fn = createMinimapNodeColorFn(false, false, "#ff0000");

      // Only special nodes get colors in default mode
      expect(
        fn({ type: "nodetool.workflows.base_node.Group", selected: false })
      ).toBe("#818cf8");

      expect(
        fn({ type: "nodetool.workflows.base_node.Comment", selected: false })
      ).toBe("#22c55e");

      // Other nodes get default slate color
      expect(
        fn({ type: "nodetool.input.StringInput", selected: false })
      ).toBe("#64748b");
    });

    it("should use dark mode colors when isDarkMode is true", () => {
      const fn = createMinimapNodeColorFn(true, true, "#ff0000");

      expect(
        fn({ type: "nodetool.input.StringInput", selected: false })
      ).toBe("#60a5fa"); // Lighter blue in dark mode

      expect(
        fn({ type: "nodetool.constant.String", selected: false })
      ).toBe("#a78bfa"); // Lighter purple in dark mode
    });

    it("should handle undefined node types", () => {
      const fn = createMinimapNodeColorFn(false, true, "#ff0000");
      expect(fn({ type: undefined, selected: false })).toBe("#64748b"); // Processing color
    });
  });
});
