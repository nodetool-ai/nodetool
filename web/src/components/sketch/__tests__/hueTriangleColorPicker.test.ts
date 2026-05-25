import {
  rgbToHsv,
  hsvToRgb,
  parseColorToRgba,
  rgbaToCss
} from "../types";

/**
 * Unit tests for the math helpers used by HueTriangleColorPicker.
 * The component itself relies on canvas APIs (not available in jsdom),
 * so we test the color-conversion round-trips that underpin the picker.
 */

// ─── Barycentric helpers (inlined from component for testability) ─────
function baryToSV(u: number, v: number, _w: number): { s: number; val: number } {
  const val = Math.max(0, Math.min(1, u + v));
  const s = val > 0 ? Math.max(0, Math.min(1, u / val)) : 0;
  return { s, val };
}

function svToBary(s: number, val: number): { u: number; v: number; w: number } {
  const u = s * val;
  const v = (1 - s) * val;
  const w = 1 - val;
  return { u, v, w };
}

describe("HueTriangleColorPicker helpers", () => {
  describe("baryToSV ↔ svToBary round-trip", () => {
    const cases: Array<{ s: number; val: number }> = [
      { s: 0, val: 0 },       // black
      { s: 0, val: 1 },       // white
      { s: 1, val: 1 },       // pure hue
      { s: 0.5, val: 0.75 },  // mid-range
      { s: 1, val: 0.5 },     // fully saturated half-bright
    ];

    it.each(cases)("svToBary → baryToSV round-trips for s=$s v=$val", ({ s, val }) => {
      const { u, v, w } = svToBary(s, val);
      const { s: s2, val: val2 } = baryToSV(u, v, w);
      expect(s2).toBeCloseTo(s, 5);
      expect(val2).toBeCloseTo(val, 5);
    });
  });

  describe("HSV triangle vertices produce expected colors", () => {
    it("vertex v0 (hue) gives fully saturated colour", () => {
      // barycentric (1, 0, 0) = hue vertex → S=1, V=1
      const { s, val } = baryToSV(1, 0, 0);
      expect(s).toBeCloseTo(1, 5);
      expect(val).toBeCloseTo(1, 5);
    });

    it("vertex v1 (white) gives white", () => {
      // barycentric (0, 1, 0) = white vertex → S=0, V=1
      const { s, val } = baryToSV(0, 1, 0);
      expect(s).toBeCloseTo(0, 5);
      expect(val).toBeCloseTo(1, 5);
    });

    it("vertex v2 (black) gives black", () => {
      // barycentric (0, 0, 1) = black vertex → S=0, V=0
      const { s, val } = baryToSV(0, 0, 1);
      expect(s).toBeCloseTo(0, 5);
      expect(val).toBeCloseTo(0, 5);
    });
  });

  describe("HSV ↔ RGB round-trip through the picker flow", () => {
    it("converts hue=0 (red) S=1 V=1 correctly", () => {
      const { r, g, b } = hsvToRgb(0, 1, 1);
      expect(r).toBe(255);
      expect(g).toBe(0);
      expect(b).toBe(0);
    });

    it("converts hue=120 (green) S=1 V=1 correctly", () => {
      const { r, g, b } = hsvToRgb(120, 1, 1);
      expect(r).toBe(0);
      expect(g).toBe(255);
      expect(b).toBe(0);
    });

    it("round-trips through rgbToHsv ↔ hsvToRgb", () => {
      const origR = 100, origG = 150, origB = 200;
      const { h, s, v } = rgbToHsv(origR, origG, origB);
      const { r, g, b } = hsvToRgb(h, s, v);
      expect(r).toBeCloseTo(origR, 0);
      expect(g).toBeCloseTo(origG, 0);
      expect(b).toBeCloseTo(origB, 0);
    });

    it("full pipeline: parse → HSV → bary → SV → HSV → RGB → CSS", () => {
      const input = "#3388cc";
      const { r, g, b, a } = parseColorToRgba(input);
      const { h, s, v } = rgbToHsv(r, g, b);
      const bary = svToBary(s, v);
      const { s: s2, val: v2 } = baryToSV(bary.u, bary.v, bary.w);
      const { r: rr, g: gg, b: bb } = hsvToRgb(h, s2, v2);
      const out = rgbaToCss({ r: rr, g: gg, b: bb, a });
      // Parse again and compare
      const parsed = parseColorToRgba(out);
      expect(Math.abs(parsed.r - r)).toBeLessThanOrEqual(1);
      expect(Math.abs(parsed.g - g)).toBeLessThanOrEqual(1);
      expect(Math.abs(parsed.b - b)).toBeLessThanOrEqual(1);
    });
  });
});
