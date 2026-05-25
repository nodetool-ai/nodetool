/**
 * @jest-environment node
 */
import {
  getComplementary,
  getAnalogous,
  getTriadic,
  getSplitComplementary,
  getTetradic,
  getSquare,
  getHarmonyInfo,
  generateHarmony
} from "../colorHarmonies";

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

describe("colorHarmonies", () => {
  describe("getComplementary", () => {
    it("returns 2 colors", () => {
      expect(getComplementary("#ff0000")).toHaveLength(2);
    });

    it("includes the original color", () => {
      expect(getComplementary("#ff0000")[0]).toBe("#ff0000");
    });

    it("returns valid hex strings", () => {
      for (const c of getComplementary("#ff0000")) {
        expect(c).toMatch(HEX_REGEX);
      }
    });

    it("returns cyan as the complement of pure red", () => {
      const [, complement] = getComplementary("#ff0000");
      expect(complement).toBe("#00ffff");
    });
  });

  describe("getAnalogous", () => {
    it("returns 3 colors", () => {
      expect(getAnalogous("#ff0000")).toHaveLength(3);
    });

    it("includes the original color in the middle", () => {
      expect(getAnalogous("#ff0000")[1]).toBe("#ff0000");
    });

    it("returns valid hex strings", () => {
      for (const c of getAnalogous("#ff0000")) {
        expect(c).toMatch(HEX_REGEX);
      }
    });

    it("returns hue-shifted colors at -30 and +30 degrees for pure red", () => {
      const [minus30, , plus30] = getAnalogous("#ff0000");
      expect(minus30).toMatch(HEX_REGEX);
      expect(plus30).toMatch(HEX_REGEX);
      expect(minus30).not.toBe(plus30);
    });
  });

  describe("getTriadic", () => {
    it("returns 3 colors", () => {
      expect(getTriadic("#ff0000")).toHaveLength(3);
    });

    it("includes the original color first", () => {
      expect(getTriadic("#ff0000")[0]).toBe("#ff0000");
    });

    it("returns valid hex strings", () => {
      for (const c of getTriadic("#ff0000")) {
        expect(c).toMatch(HEX_REGEX);
      }
    });

    it("returns green and blue variants for pure red", () => {
      const [, color120, color240] = getTriadic("#ff0000");
      expect(color120).toBe("#00ff00");
      expect(color240).toBe("#0000ff");
    });
  });

  describe("getSplitComplementary", () => {
    it("returns 3 colors", () => {
      expect(getSplitComplementary("#ff0000")).toHaveLength(3);
    });

    it("includes the original color first", () => {
      expect(getSplitComplementary("#ff0000")[0]).toBe("#ff0000");
    });

    it("returns valid hex strings", () => {
      for (const c of getSplitComplementary("#ff0000")) {
        expect(c).toMatch(HEX_REGEX);
      }
    });
  });

  describe("getTetradic", () => {
    it("returns 4 colors", () => {
      expect(getTetradic("#ff0000")).toHaveLength(4);
    });

    it("includes the original color first", () => {
      expect(getTetradic("#ff0000")[0]).toBe("#ff0000");
    });

    it("returns valid hex strings", () => {
      for (const c of getTetradic("#ff0000")) {
        expect(c).toMatch(HEX_REGEX);
      }
    });

    it("includes the complement (180 degrees) for pure red", () => {
      const colors = getTetradic("#ff0000");
      expect(colors[2]).toBe("#00ffff");
    });
  });

  describe("getSquare", () => {
    it("returns 4 colors", () => {
      expect(getSquare("#ff0000")).toHaveLength(4);
    });

    it("includes the original color first", () => {
      expect(getSquare("#ff0000")[0]).toBe("#ff0000");
    });

    it("returns valid hex strings", () => {
      for (const c of getSquare("#ff0000")) {
        expect(c).toMatch(HEX_REGEX);
      }
    });

    it("includes the complement (180 degrees) for pure red", () => {
      const colors = getSquare("#ff0000");
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
    it("dispatches to getComplementary", () => {
      const harmony = generateHarmony("#ff0000", "complementary");
      expect(harmony.type).toBe("complementary");
      expect(harmony.colors).toEqual(getComplementary("#ff0000"));
    });

    it("dispatches to getAnalogous", () => {
      const harmony = generateHarmony("#ff0000", "analogous");
      expect(harmony.type).toBe("analogous");
      expect(harmony.colors).toEqual(getAnalogous("#ff0000"));
    });

    it("dispatches to getTriadic", () => {
      const harmony = generateHarmony("#ff0000", "triadic");
      expect(harmony.type).toBe("triadic");
      expect(harmony.colors).toEqual(getTriadic("#ff0000"));
    });

    it("dispatches to getSplitComplementary", () => {
      const harmony = generateHarmony("#ff0000", "split-complementary");
      expect(harmony.type).toBe("split-complementary");
      expect(harmony.colors).toEqual(getSplitComplementary("#ff0000"));
    });

    it("dispatches to getTetradic", () => {
      const harmony = generateHarmony("#ff0000", "tetradic");
      expect(harmony.type).toBe("tetradic");
      expect(harmony.colors).toEqual(getTetradic("#ff0000"));
    });

    it("dispatches to getSquare", () => {
      const harmony = generateHarmony("#ff0000", "square");
      expect(harmony.type).toBe("square");
      expect(harmony.colors).toEqual(getSquare("#ff0000"));
    });

    it("includes name and description from harmonyInfo", () => {
      const harmony = generateHarmony("#ff0000", "triadic");
      expect(harmony.name).toBe("Triadic");
      expect(harmony.description.length).toBeGreaterThan(0);
    });
  });

  describe("achromatic color (#808080)", () => {
    it("getComplementary returns valid hex values", () => {
      const colors = getComplementary("#808080");
      expect(colors).toHaveLength(2);
      for (const c of colors) {
        expect(c).toMatch(HEX_REGEX);
      }
    });

    it("getAnalogous returns valid hex values", () => {
      const colors = getAnalogous("#808080");
      expect(colors).toHaveLength(3);
      for (const c of colors) {
        expect(c).toMatch(HEX_REGEX);
      }
    });

    it("getTriadic returns valid hex values", () => {
      const colors = getTriadic("#808080");
      expect(colors).toHaveLength(3);
      for (const c of colors) {
        expect(c).toMatch(HEX_REGEX);
      }
    });

    it("getSplitComplementary returns valid hex values", () => {
      const colors = getSplitComplementary("#808080");
      expect(colors).toHaveLength(3);
      for (const c of colors) {
        expect(c).toMatch(HEX_REGEX);
      }
    });

    it("getTetradic returns valid hex values", () => {
      const colors = getTetradic("#808080");
      expect(colors).toHaveLength(4);
      for (const c of colors) {
        expect(c).toMatch(HEX_REGEX);
      }
    });

    it("getSquare returns valid hex values", () => {
      const colors = getSquare("#808080");
      expect(colors).toHaveLength(4);
      for (const c of colors) {
        expect(c).toMatch(HEX_REGEX);
      }
    });
  });
});
