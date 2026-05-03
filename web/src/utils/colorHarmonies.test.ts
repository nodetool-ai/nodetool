import {
  getComplementary,
  getAnalogous,
  getTriadic,
  getSplitComplementary,
  getTetradic,
  getSquare,
  getHarmonyInfo,
  generateHarmony,
} from "./colorHarmonies";

describe("colorHarmonies", () => {
  describe("getComplementary", () => {
    it("returns 2 colors", () => {
      const colors = getComplementary("#ff0000");
      expect(colors).toHaveLength(2);
    });

    it("includes the original color", () => {
      const colors = getComplementary("#ff0000");
      expect(colors[0]).toBe("#ff0000");
    });

    it("complement of red is cyan-ish", () => {
      const colors = getComplementary("#ff0000");
      expect(colors[1]).toBe("#00ffff");
    });
  });

  describe("getAnalogous", () => {
    it("returns 3 colors", () => {
      const colors = getAnalogous("#ff0000");
      expect(colors).toHaveLength(3);
    });

    it("includes the original as the middle color", () => {
      const colors = getAnalogous("#ff0000");
      expect(colors[1]).toBe("#ff0000");
    });
  });

  describe("getTriadic", () => {
    it("returns 3 colors", () => {
      const colors = getTriadic("#ff0000");
      expect(colors).toHaveLength(3);
    });

    it("includes the original as the first color", () => {
      const colors = getTriadic("#ff0000");
      expect(colors[0]).toBe("#ff0000");
    });
  });

  describe("getSplitComplementary", () => {
    it("returns 3 colors", () => {
      const colors = getSplitComplementary("#ff0000");
      expect(colors).toHaveLength(3);
    });

    it("includes the original as the first color", () => {
      const colors = getSplitComplementary("#ff0000");
      expect(colors[0]).toBe("#ff0000");
    });
  });

  describe("getTetradic", () => {
    it("returns 4 colors", () => {
      const colors = getTetradic("#ff0000");
      expect(colors).toHaveLength(4);
    });

    it("includes the original as the first color", () => {
      const colors = getTetradic("#ff0000");
      expect(colors[0]).toBe("#ff0000");
    });
  });

  describe("getSquare", () => {
    it("returns 4 colors", () => {
      const colors = getSquare("#ff0000");
      expect(colors).toHaveLength(4);
    });

    it("includes the original as the first color", () => {
      const colors = getSquare("#ff0000");
      expect(colors[0]).toBe("#ff0000");
    });

    it("produces distinct colors", () => {
      const colors = getSquare("#ff0000");
      const unique = new Set(colors);
      expect(unique.size).toBe(4);
    });
  });

  describe("getHarmonyInfo", () => {
    it("returns all 6 harmony types", () => {
      const info = getHarmonyInfo();
      expect(info).toHaveLength(6);
      const types = info.map((i) => i.type);
      expect(types).toContain("complementary");
      expect(types).toContain("analogous");
      expect(types).toContain("triadic");
      expect(types).toContain("split-complementary");
      expect(types).toContain("tetradic");
      expect(types).toContain("square");
    });

    it("each entry has name and description", () => {
      const info = getHarmonyInfo();
      for (const entry of info) {
        expect(entry.name).toBeTruthy();
        expect(entry.description).toBeTruthy();
      }
    });
  });

  describe("generateHarmony", () => {
    it("returns a ColorHarmony object", () => {
      const harmony = generateHarmony("#ff0000", "triadic");
      expect(harmony.type).toBe("triadic");
      expect(harmony.name).toBe("Triadic");
      expect(harmony.description).toBeTruthy();
      expect(harmony.colors).toHaveLength(3);
    });

    it("works for all harmony types", () => {
      const types = [
        "complementary",
        "analogous",
        "triadic",
        "split-complementary",
        "tetradic",
        "square"
      ] as const;
      for (const type of types) {
        const harmony = generateHarmony("#3366cc", type);
        expect(harmony.type).toBe(type);
        expect(harmony.colors.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

});
