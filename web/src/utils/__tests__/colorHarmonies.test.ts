import {
  getComplementary,
  getAnalogous,
  getTriadic,
  getSplitComplementary,
  getTetradic,
  getSquare,
  getHarmonyInfo,
  generateHarmony,
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

});
