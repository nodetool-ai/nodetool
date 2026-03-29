import {
  SPACING,
  GAP,
  PADDING,
  MARGIN,
  getSpacingPx,
  resolveSpacing
} from "../spacing";

describe("spacing utilities", () => {
  describe("SPACING constants", () => {
    it("defines correct spacing values", () => {
      expect(SPACING.xxs).toBe(0.5);
      expect(SPACING.xs).toBe(1);
      expect(SPACING.sm).toBe(1.5);
      expect(SPACING.md).toBe(2);
      expect(SPACING.ml).toBe(2.5);
      expect(SPACING.lg).toBe(3);
      expect(SPACING.xl).toBe(4);
      expect(SPACING.xxl).toBe(5);
      expect(SPACING.huge).toBe(6);
    });
  });

  describe("GAP constants", () => {
    it("defines correct gap values", () => {
      expect(GAP.none).toBe(0);
      expect(GAP.tight).toBe(1);
      expect(GAP.compact).toBe(1.5);
      expect(GAP.normal).toBe(2);
      expect(GAP.comfortable).toBe(2.5);
      expect(GAP.spacious).toBe(3);
    });
  });

  describe("PADDING constants", () => {
    it("defines correct padding values", () => {
      expect(PADDING.none).toBe(0);
      expect(PADDING.compact).toBe(1.5);
      expect(PADDING.normal).toBe(2);
      expect(PADDING.comfortable).toBe(3);
      expect(PADDING.spacious).toBe(4);
    });
  });

  describe("MARGIN constants", () => {
    it("defines correct margin values", () => {
      expect(MARGIN.none).toBe(0);
      expect(MARGIN.tight).toBe(1);
      expect(MARGIN.compact).toBe(1.5);
      expect(MARGIN.normal).toBe(2);
      expect(MARGIN.comfortable).toBe(3);
      expect(MARGIN.spacious).toBe(4);
    });
  });

  describe("getSpacingPx", () => {
    it("converts spacing units to pixels", () => {
      expect(getSpacingPx(0)).toBe("0px");
      expect(getSpacingPx(1)).toBe("4px");
      expect(getSpacingPx(2)).toBe("8px");
      expect(getSpacingPx(2.5)).toBe("10px");
      expect(getSpacingPx(4)).toBe("16px");
    });
  });

  describe("resolveSpacing", () => {
    it("resolves numeric values", () => {
      expect(resolveSpacing(2)).toBe(2);
      expect(resolveSpacing(3.5)).toBe(3.5);
    });

    it("resolves string keys", () => {
      expect(resolveSpacing("xs")).toBe(1);
      expect(resolveSpacing("md")).toBe(2);
      expect(resolveSpacing("lg")).toBe(3);
      expect(resolveSpacing("xl")).toBe(4);
    });
  });
});
