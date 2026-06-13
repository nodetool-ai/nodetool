import {
  getHarmonyInfo,
  generateHarmony,
} from "./colorHarmonies";

describe("colorHarmonies", () => {
  describe("complementary via generateHarmony", () => {
    it("returns 2 colors with original first and cyan complement", () => {
      const colors = generateHarmony("#ff0000", "complementary").colors;
      expect(colors).toHaveLength(2);
      expect(colors[0]).toBe("#ff0000");
      expect(colors[1]).toBe("#00ffff");
    });
  });

  describe("analogous via generateHarmony", () => {
    it("returns 3 colors with original in the middle", () => {
      const colors = generateHarmony("#ff0000", "analogous").colors;
      expect(colors).toHaveLength(3);
      expect(colors[1]).toBe("#ff0000");
    });
  });

  describe("triadic via generateHarmony", () => {
    it("returns 3 colors with original first", () => {
      const colors = generateHarmony("#ff0000", "triadic").colors;
      expect(colors).toHaveLength(3);
      expect(colors[0]).toBe("#ff0000");
    });
  });

  describe("split-complementary via generateHarmony", () => {
    it("returns 3 colors with original first", () => {
      const colors = generateHarmony("#ff0000", "split-complementary").colors;
      expect(colors).toHaveLength(3);
      expect(colors[0]).toBe("#ff0000");
    });
  });

  describe("tetradic via generateHarmony", () => {
    it("returns 4 colors with original first", () => {
      const colors = generateHarmony("#ff0000", "tetradic").colors;
      expect(colors).toHaveLength(4);
      expect(colors[0]).toBe("#ff0000");
    });
  });

  describe("square via generateHarmony", () => {
    it("returns 4 distinct colors with original first", () => {
      const colors = generateHarmony("#ff0000", "square").colors;
      expect(colors).toHaveLength(4);
      expect(colors[0]).toBe("#ff0000");
      expect(new Set(colors).size).toBe(4);
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
