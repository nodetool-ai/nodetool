/**
 * @jest-environment node
 */
import { getHarmonyInfo, generateHarmony } from "../colorHarmonies";

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

describe("colorHarmonies", () => {
  describe("complementary via generateHarmony", () => {
    it("returns 2 colors", () => {
      expect(generateHarmony("#ff0000", "complementary").colors).toHaveLength(2);
    });

    it("includes the original color", () => {
      expect(generateHarmony("#ff0000", "complementary").colors[0]).toBe("#ff0000");
    });

    it("returns valid hex strings", () => {
      for (const c of generateHarmony("#ff0000", "complementary").colors) {
        expect(c).toMatch(HEX_REGEX);
      }
    });

    it("returns cyan as the complement of pure red", () => {
      const [, complement] = generateHarmony("#ff0000", "complementary").colors;
      expect(complement).toBe("#00ffff");
    });
  });

  describe("analogous via generateHarmony", () => {
    it("returns 3 colors", () => {
      expect(generateHarmony("#ff0000", "analogous").colors).toHaveLength(3);
    });

    it("includes the original color in the middle", () => {
      expect(generateHarmony("#ff0000", "analogous").colors[1]).toBe("#ff0000");
    });

    it("returns valid hex strings", () => {
      for (const c of generateHarmony("#ff0000", "analogous").colors) {
        expect(c).toMatch(HEX_REGEX);
      }
    });

    it("returns hue-shifted colors at -30 and +30 degrees for pure red", () => {
      const [minus30, , plus30] = generateHarmony("#ff0000", "analogous").colors;
      expect(minus30).toMatch(HEX_REGEX);
      expect(plus30).toMatch(HEX_REGEX);
      expect(minus30).not.toBe(plus30);
    });
  });

  describe("triadic via generateHarmony", () => {
    it("returns 3 colors", () => {
      expect(generateHarmony("#ff0000", "triadic").colors).toHaveLength(3);
    });

    it("includes the original color first", () => {
      expect(generateHarmony("#ff0000", "triadic").colors[0]).toBe("#ff0000");
    });

    it("returns green and blue variants for pure red", () => {
      const [, color120, color240] = generateHarmony("#ff0000", "triadic").colors;
      expect(color120).toBe("#00ff00");
      expect(color240).toBe("#0000ff");
    });
  });

  describe("split-complementary via generateHarmony", () => {
    it("returns 3 valid hex colors starting with original", () => {
      const colors = generateHarmony("#ff0000", "split-complementary").colors;
      expect(colors).toHaveLength(3);
      expect(colors[0]).toBe("#ff0000");
      for (const c of colors) {
        expect(c).toMatch(HEX_REGEX);
      }
    });
  });

  describe("tetradic via generateHarmony", () => {
    it("returns 4 colors with complement at 180 degrees", () => {
      const colors = generateHarmony("#ff0000", "tetradic").colors;
      expect(colors).toHaveLength(4);
      expect(colors[0]).toBe("#ff0000");
      expect(colors[2]).toBe("#00ffff");
    });
  });

  describe("square via generateHarmony", () => {
    it("returns 4 colors with complement at 180 degrees", () => {
      const colors = generateHarmony("#ff0000", "square").colors;
      expect(colors).toHaveLength(4);
      expect(colors[0]).toBe("#ff0000");
      expect(colors[2]).toBe("#00ffff");
    });
  });

  describe("getHarmonyInfo", () => {
    it("returns 6 harmony types", () => {
      expect(getHarmonyInfo()).toHaveLength(6);
    });

    it("includes all expected types", () => {
      const types = getHarmonyInfo().map((h) => h.type);
      expect(types).toContain("complementary");
      expect(types).toContain("analogous");
      expect(types).toContain("triadic");
      expect(types).toContain("split-complementary");
      expect(types).toContain("tetradic");
      expect(types).toContain("square");
    });

    it("each entry has type, name, and description", () => {
      for (const info of getHarmonyInfo()) {
        expect(typeof info.type).toBe("string");
        expect(typeof info.name).toBe("string");
        expect(typeof info.description).toBe("string");
        expect(info.name.length).toBeGreaterThan(0);
        expect(info.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe("generateHarmony", () => {
    it("returns correct type for each harmony", () => {
      expect(generateHarmony("#ff0000", "complementary").type).toBe("complementary");
      expect(generateHarmony("#ff0000", "analogous").type).toBe("analogous");
      expect(generateHarmony("#ff0000", "triadic").type).toBe("triadic");
      expect(generateHarmony("#ff0000", "split-complementary").type).toBe("split-complementary");
      expect(generateHarmony("#ff0000", "tetradic").type).toBe("tetradic");
      expect(generateHarmony("#ff0000", "square").type).toBe("square");
    });

    it("includes name and description from harmonyInfo", () => {
      const harmony = generateHarmony("#ff0000", "triadic");
      expect(harmony.name).toBe("Triadic");
      expect(harmony.description.length).toBeGreaterThan(0);
    });
  });

  describe("achromatic color (#808080)", () => {
    const cases: Array<{ type: Parameters<typeof generateHarmony>[1]; minColors: number }> = [
      { type: "complementary", minColors: 2 },
      { type: "analogous", minColors: 3 },
      { type: "triadic", minColors: 3 },
      { type: "split-complementary", minColors: 3 },
      { type: "tetradic", minColors: 4 },
      { type: "square", minColors: 4 }
    ];

    for (const { type, minColors } of cases) {
      it(`${type} returns ${minColors} valid hex values`, () => {
        const colors = generateHarmony("#808080", type).colors;
        expect(colors).toHaveLength(minColors);
        for (const c of colors) {
          expect(c).toMatch(HEX_REGEX);
        }
      });
    }
  });
});
