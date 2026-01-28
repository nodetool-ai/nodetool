import {
  getComplementary,
  getAnalogous,
  getTriadic,
  getSplitComplementary,
  getTetradic,
  getSquare,
  getHarmonyInfo,
  generateHarmony,
  generateAllHarmonies,
  getMonochromatic,
  getShades,
  getTints,
  HarmonyType
} from "../colorHarmonies";

describe("colorHarmonies utilities", () => {
  describe("getComplementary", () => {
    it("returns complementary colors (180° apart)", () => {
      const colors = getComplementary("#ff0000");
      expect(colors).toHaveLength(2);
      expect(colors[0]).toBe("#ff0000");
      // Complement of red should be cyan-ish
    });
  });

  describe("getAnalogous", () => {
    it("returns analogous colors (-30° and +30°)", () => {
      const colors = getAnalogous("#ff0000");
      expect(colors).toHaveLength(3);
      expect(colors[1]).toBe("#ff0000"); // Original color in the middle
    });
  });

  describe("getTriadic", () => {
    it("returns triadic colors (120° apart)", () => {
      const colors = getTriadic("#ff0000");
      expect(colors).toHaveLength(3);
      expect(colors[0]).toBe("#ff0000");
    });
  });

  describe("getSplitComplementary", () => {
    it("returns split-complementary colors", () => {
      const colors = getSplitComplementary("#ff0000");
      expect(colors).toHaveLength(3);
      expect(colors[0]).toBe("#ff0000");
    });
  });

  describe("getTetradic", () => {
    it("returns tetradic colors", () => {
      const colors = getTetradic("#ff0000");
      expect(colors).toHaveLength(4);
      expect(colors[0]).toBe("#ff0000");
    });
  });

  describe("getSquare", () => {
    it("returns square colors (90° apart)", () => {
      const colors = getSquare("#ff0000");
      expect(colors).toHaveLength(4);
      expect(colors[0]).toBe("#ff0000");
    });
  });

  describe("getHarmonyInfo", () => {
    it("returns all harmony types with info", () => {
      const info = getHarmonyInfo();
      expect(info).toHaveLength(6);
      expect(info.map((h) => h.type)).toEqual([
        "complementary",
        "analogous",
        "triadic",
        "split-complementary",
        "tetradic",
        "square"
      ]);
    });
  });

  describe("generateHarmony", () => {
    it("generates harmony for complementary type", () => {
      const harmony = generateHarmony("#ff0000", "complementary");
      expect(harmony.type).toBe("complementary");
      expect(harmony.name).toBe("Complementary");
      expect(harmony.colors).toHaveLength(2);
    });

    it("generates harmony for all types", () => {
      const types: HarmonyType[] = [
        "complementary",
        "analogous",
        "triadic",
        "split-complementary",
        "tetradic",
        "square"
      ];

      types.forEach((type) => {
        const harmony = generateHarmony("#ff0000", type);
        expect(harmony.type).toBe(type);
        expect(harmony.colors.length).toBeGreaterThan(0);
      });
    });
  });

  describe("generateAllHarmonies", () => {
    it("generates all harmonies for a color", () => {
      const harmonies = generateAllHarmonies("#ff0000");
      expect(harmonies).toHaveLength(6);
      expect(harmonies[0].type).toBe("complementary");
      expect(harmonies[5].type).toBe("square");
    });
  });

  describe("getMonochromatic", () => {
    it("generates monochromatic palette", () => {
      const colors = getMonochromatic("#ff0000");
      expect(colors).toHaveLength(5);
      colors.forEach((color) => {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });

    it("generates custom number of colors", () => {
      const colors = getMonochromatic("#ff0000", 3);
      expect(colors).toHaveLength(3);
    });
  });

  describe("getShades", () => {
    it("generates shades (darker variations)", () => {
      const colors = getShades("#ff0000");
      expect(colors).toHaveLength(5);
      colors.forEach((color) => {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });
  });

  describe("getTints", () => {
    it("generates tints (lighter variations)", () => {
      const colors = getTints("#ff0000");
      expect(colors).toHaveLength(5);
      colors.forEach((color) => {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });
  });

  describe("Color consistency", () => {
    it("generates valid hex colors", () => {
      const hexRegex = /^#[0-9a-f]{6}$/i;

      // Test multiple base colors
      const baseColors = ["#ff0000", "#00ff00", "#0000ff", "#808080", "#123456"];

      baseColors.forEach((baseColor) => {
        const harmonies = generateAllHarmonies(baseColor);
        harmonies.forEach((harmony) => {
          harmony.colors.forEach((color) => {
            expect(color).toMatch(hexRegex);
          });
        });
      });
    });
  });
});
