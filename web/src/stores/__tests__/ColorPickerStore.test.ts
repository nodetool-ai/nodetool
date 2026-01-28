import {
  useColorPickerStore,
  gradientToCss,
  parseGradientCss,
  PRESET_PALETTES,
  GradientValue
} from "../ColorPickerStore";

// Reset store before each test
beforeEach(() => {
  const { getState } = useColorPickerStore;
  getState().clearRecentColors();
  getState().clearSwatches();
  // Reset palettes
  useColorPickerStore.setState({ palettes: [], gradients: [] });
});

describe("ColorPickerStore", () => {
  describe("recentColors", () => {
    it("adds a recent color", () => {
      const { addRecentColor } = useColorPickerStore.getState();
      addRecentColor("#ff0000");

      const { recentColors } = useColorPickerStore.getState();
      expect(recentColors).toContain("#ff0000");
    });

    it("normalizes colors to lowercase", () => {
      const { addRecentColor } = useColorPickerStore.getState();
      addRecentColor("#FF0000");

      const { recentColors } = useColorPickerStore.getState();
      expect(recentColors).toContain("#ff0000");
    });

    it("removes duplicates when adding", () => {
      const { addRecentColor } = useColorPickerStore.getState();
      addRecentColor("#ff0000");
      addRecentColor("#00ff00");
      addRecentColor("#ff0000"); // duplicate

      const { recentColors } = useColorPickerStore.getState();
      expect(recentColors.filter((c) => c === "#ff0000")).toHaveLength(1);
      expect(recentColors[0]).toBe("#ff0000"); // Most recent first
    });

    it("limits to 20 recent colors", () => {
      const { addRecentColor } = useColorPickerStore.getState();

      for (let i = 0; i < 25; i++) {
        addRecentColor(`#${i.toString(16).padStart(6, "0")}`);
      }

      const { recentColors } = useColorPickerStore.getState();
      expect(recentColors.length).toBe(20);
    });

    it("clears recent colors", () => {
      const { addRecentColor, clearRecentColors } =
        useColorPickerStore.getState();
      addRecentColor("#ff0000");
      clearRecentColors();

      const { recentColors } = useColorPickerStore.getState();
      expect(recentColors).toHaveLength(0);
    });
  });

  describe("swatches", () => {
    it("adds a swatch", () => {
      const { addSwatch } = useColorPickerStore.getState();
      addSwatch("#ff0000", "Red");

      const { swatches } = useColorPickerStore.getState();
      expect(swatches).toHaveLength(1);
      expect(swatches[0].color).toBe("#ff0000");
      expect(swatches[0].name).toBe("Red");
    });

    it("removes a swatch", () => {
      const { addSwatch, removeSwatch } = useColorPickerStore.getState();
      addSwatch("#ff0000");

      let { swatches } = useColorPickerStore.getState();
      const swatchId = swatches[0].id;
      removeSwatch(swatchId);

      swatches = useColorPickerStore.getState().swatches;
      expect(swatches).toHaveLength(0);
    });

    it("updates a swatch", () => {
      const { addSwatch, updateSwatch } = useColorPickerStore.getState();
      addSwatch("#ff0000");

      let { swatches } = useColorPickerStore.getState();
      const swatchId = swatches[0].id;
      updateSwatch(swatchId, { name: "Updated" });

      swatches = useColorPickerStore.getState().swatches;
      expect(swatches[0].name).toBe("Updated");
    });

    it("clears all swatches", () => {
      const { addSwatch, clearSwatches } = useColorPickerStore.getState();
      addSwatch("#ff0000");
      addSwatch("#00ff00");
      clearSwatches();

      const { swatches } = useColorPickerStore.getState();
      expect(swatches).toHaveLength(0);
    });
  });

  describe("palettes", () => {
    it("adds a palette", () => {
      const { addPalette } = useColorPickerStore.getState();
      addPalette("Test Palette", ["#ff0000", "#00ff00", "#0000ff"]);

      const { palettes } = useColorPickerStore.getState();
      expect(palettes).toHaveLength(1);
      expect(palettes[0].name).toBe("Test Palette");
      expect(palettes[0].colors).toHaveLength(3);
    });

    it("removes a palette", () => {
      const { addPalette, removePalette } = useColorPickerStore.getState();
      addPalette("Test", ["#ff0000"]);

      let { palettes } = useColorPickerStore.getState();
      const paletteId = palettes[0].id;
      removePalette(paletteId);

      palettes = useColorPickerStore.getState().palettes;
      expect(palettes).toHaveLength(0);
    });

    it("updates a palette", () => {
      const { addPalette, updatePalette } = useColorPickerStore.getState();
      addPalette("Test", ["#ff0000"]);

      let { palettes } = useColorPickerStore.getState();
      const paletteId = palettes[0].id;
      updatePalette(paletteId, { name: "Updated Palette" });

      palettes = useColorPickerStore.getState().palettes;
      expect(palettes[0].name).toBe("Updated Palette");
    });
  });

  describe("gradients", () => {
    it("adds a gradient", () => {
      const { addGradient } = useColorPickerStore.getState();
      const gradient: GradientValue = {
        type: "linear",
        angle: 90,
        stops: [
          { color: "#ff0000", position: 0 },
          { color: "#0000ff", position: 100 }
        ]
      };
      addGradient(gradient);

      const { gradients } = useColorPickerStore.getState();
      expect(gradients).toHaveLength(1);
      expect(gradients[0].type).toBe("linear");
    });

    it("removes a gradient", () => {
      const { addGradient, removeGradient } = useColorPickerStore.getState();
      addGradient({
        type: "linear",
        angle: 90,
        stops: [
          { color: "#ff0000", position: 0 },
          { color: "#0000ff", position: 100 }
        ]
      });
      removeGradient(0);

      const { gradients } = useColorPickerStore.getState();
      expect(gradients).toHaveLength(0);
    });
  });

  describe("preferredColorMode", () => {
    it("sets preferred color mode", () => {
      const { setPreferredColorMode } = useColorPickerStore.getState();
      setPreferredColorMode("rgb");

      const { preferredColorMode } = useColorPickerStore.getState();
      expect(preferredColorMode).toBe("rgb");
    });
  });
});

describe("gradientToCss", () => {
  it("converts linear gradient to CSS", () => {
    const gradient: GradientValue = {
      type: "linear",
      angle: 90,
      stops: [
        { color: "#ff0000", position: 0 },
        { color: "#0000ff", position: 100 }
      ]
    };

    const css = gradientToCss(gradient);
    expect(css).toBe("linear-gradient(90deg, #ff0000 0%, #0000ff 100%)");
  });

  it("converts radial gradient to CSS", () => {
    const gradient: GradientValue = {
      type: "radial",
      stops: [
        { color: "#ff0000", position: 0 },
        { color: "#0000ff", position: 100 }
      ]
    };

    const css = gradientToCss(gradient);
    expect(css).toBe("radial-gradient(circle, #ff0000 0%, #0000ff 100%)");
  });

  it("sorts stops by position", () => {
    const gradient: GradientValue = {
      type: "linear",
      angle: 90,
      stops: [
        { color: "#0000ff", position: 100 },
        { color: "#ff0000", position: 0 }
      ]
    };

    const css = gradientToCss(gradient);
    expect(css).toBe("linear-gradient(90deg, #ff0000 0%, #0000ff 100%)");
  });
});

describe("parseGradientCss", () => {
  it("parses linear gradient CSS", () => {
    const css = "linear-gradient(90deg, #ff0000 0%, #0000ff 100%)";
    const gradient = parseGradientCss(css);

    expect(gradient).not.toBeNull();
    expect(gradient!.type).toBe("linear");
    expect(gradient!.angle).toBe(90);
    expect(gradient!.stops).toHaveLength(2);
  });

  it("parses radial gradient CSS", () => {
    const css = "radial-gradient(circle, #ff0000 0%, #0000ff 100%)";
    const gradient = parseGradientCss(css);

    expect(gradient).not.toBeNull();
    expect(gradient!.type).toBe("radial");
  });

  it("returns null for invalid CSS", () => {
    const result = parseGradientCss("not a gradient");
    expect(result).toBeNull();
  });
});

describe("PRESET_PALETTES", () => {
  it("has valid preset palettes", () => {
    expect(PRESET_PALETTES.length).toBeGreaterThan(0);

    PRESET_PALETTES.forEach((palette) => {
      expect(palette.id).toBeTruthy();
      expect(palette.name).toBeTruthy();
      expect(palette.colors.length).toBeGreaterThan(0);

      palette.colors.forEach((color) => {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });
  });
});
