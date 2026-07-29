import {
  FONT_WEIGHT,
  FONT_SIZE_SANS,
  FONT_SIZE_MONO,
  TYPOGRAPHY,
  MOTION,
  reducedMotion,
  Z_INDEX,
  BORDER_RADIUS,
  CONTROL
} from "../tokens";

describe("design token constants", () => {
  describe("FONT_WEIGHT", () => {
    it("defines the three sanctioned weights", () => {
      expect(FONT_WEIGHT.normal).toBe(400);
      expect(FONT_WEIGHT.medium).toBe(500);
      expect(FONT_WEIGHT.semibold).toBe(600);
    });

    it("contains exactly three entries", () => {
      expect(Object.keys(FONT_WEIGHT)).toHaveLength(3);
    });
  });

  describe("FONT_SIZE_SANS", () => {
    it("maps each role to a CSS variable", () => {
      expect(FONT_SIZE_SANS.title).toBe("var(--fontSizeBig)");
      expect(FONT_SIZE_SANS.body).toBe("var(--fontSizeNormal)");
      expect(FONT_SIZE_SANS.label).toBe("var(--fontSizeSmall)");
      expect(FONT_SIZE_SANS.caption).toBe("var(--fontSizeSmaller)");
    });

    it("contains exactly four sizes", () => {
      expect(Object.keys(FONT_SIZE_SANS)).toHaveLength(4);
    });
  });

  describe("FONT_SIZE_MONO", () => {
    it("maps each role to a CSS variable", () => {
      expect(FONT_SIZE_MONO.code).toBe("var(--fontSizeSmall)");
      expect(FONT_SIZE_MONO.strong).toBe("var(--fontSizeSmall)");
      expect(FONT_SIZE_MONO.label).toBe("var(--fontSizeSmall)");
      expect(FONT_SIZE_MONO.caption).toBe("var(--fontSizeSmaller)");
    });

    it("contains exactly four sizes", () => {
      expect(Object.keys(FONT_SIZE_MONO)).toHaveLength(4);
    });
  });

  describe("TYPOGRAPHY", () => {
    it("has sans and mono families", () => {
      expect(TYPOGRAPHY).toHaveProperty("sans");
      expect(TYPOGRAPHY).toHaveProperty("mono");
    });

    it("sans has exactly four roles", () => {
      expect(Object.keys(TYPOGRAPHY.sans)).toEqual([
        "title",
        "body",
        "label",
        "caption"
      ]);
    });

    it("mono has exactly four roles", () => {
      expect(Object.keys(TYPOGRAPHY.mono)).toEqual([
        "code",
        "strong",
        "label",
        "caption"
      ]);
    });

    it("every style has fontSize, fontWeight, fontFamily, lineHeight", () => {
      const required = ["fontSize", "fontWeight", "fontFamily", "lineHeight"];
      for (const family of Object.values(TYPOGRAPHY)) {
        for (const style of Object.values(family)) {
          for (const key of required) {
            expect(style).toHaveProperty(key);
          }
        }
      }
    });

    it("sans uses fontFamily1, mono uses fontFamily2", () => {
      for (const style of Object.values(TYPOGRAPHY.sans)) {
        expect(style.fontFamily).toBe("var(--fontFamily1)");
      }
      for (const style of Object.values(TYPOGRAPHY.mono)) {
        expect(style.fontFamily).toBe("var(--fontFamily2)");
      }
    });

    it("all weights are from the sanctioned set", () => {
      const allowed = new Set(Object.values(FONT_WEIGHT));
      for (const family of Object.values(TYPOGRAPHY)) {
        for (const style of Object.values(family)) {
          expect(allowed).toContain(style.fontWeight);
        }
      }
    });
  });

  describe("MOTION", () => {
    it("defines fast/normal/slow durations", () => {
      expect(MOTION.fast).toBe("120ms ease");
      expect(MOTION.normal).toBe("200ms ease");
      expect(MOTION.slow).toBe("350ms ease");
    });

    it("defines property shorthands", () => {
      expect(MOTION.border).toContain("border-color");
      expect(MOTION.opacity).toContain("opacity");
      expect(MOTION.transform).toContain("transform");
      expect(MOTION.shadow).toContain("box-shadow");
      expect(MOTION.background).toContain("background-color");
      expect(MOTION.all).toContain("all");
    });

    it("defines keyframe loop tiers", () => {
      expect(MOTION.spin).toBe("1s linear");
      expect(MOTION.pulse).toBe("2s ease-in-out");
    });

    it("defines none for reduced motion overrides", () => {
      expect(MOTION.none).toBe("none");
    });
  });

  describe("reducedMotion", () => {
    it("wraps overrides in a prefers-reduced-motion media query", () => {
      const result = reducedMotion({ transition: "none" });
      expect(result).toEqual({
        "@media (prefers-reduced-motion: reduce)": { transition: "none" }
      });
    });

    it("passes through multiple overrides", () => {
      const overrides = { animation: "none", opacity: 0.6 };
      const result = reducedMotion(overrides);
      expect(
        result["@media (prefers-reduced-motion: reduce)"]
      ).toEqual(overrides);
    });

    it("handles empty overrides", () => {
      const result = reducedMotion({});
      expect(result).toEqual({
        "@media (prefers-reduced-motion: reduce)": {}
      });
    });
  });

  describe("Z_INDEX", () => {
    it("defines the stacking scale", () => {
      expect(Z_INDEX.base).toBe(0);
      expect(Z_INDEX.raised).toBe(1);
      expect(Z_INDEX.dropdown).toBe(10);
      expect(Z_INDEX.sticky).toBe(20);
      expect(Z_INDEX.overlay).toBe(100);
      expect(Z_INDEX.modal).toBe(200);
      expect(Z_INDEX.tooltip).toBe(300);
      expect(Z_INDEX.toast).toBe(400);
    });

    it("values are strictly ascending", () => {
      const values = Object.values(Z_INDEX);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThan(values[i - 1]);
      }
    });
  });

  describe("CONTROL", () => {
    it("defines the five control heights", () => {
      expect(CONTROL.height.xs).toBe(24);
      expect(CONTROL.height.sm).toBe(28);
      expect(CONTROL.height.md).toBe(32);
      expect(CONTROL.height.lg).toBe(36);
      expect(CONTROL.height.xl).toBe(44);
    });

    it("all heights sit on the 4px grid", () => {
      for (const height of Object.values(CONTROL.height)) {
        expect(height % 4).toBe(0);
      }
    });

    it("heights are strictly ascending", () => {
      const values = Object.values(CONTROL.height);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThan(values[i - 1]);
      }
    });

    it("paddings sit on the 4px grid", () => {
      expect(CONTROL.paddingX.compact).toBe(8);
      expect(CONTROL.paddingX.normal).toBe(12);
    });

    it("radius is the md rounded token", () => {
      expect(CONTROL.radius).toBe(BORDER_RADIUS.md);
    });
  });

  describe("BORDER_RADIUS", () => {
    it("maps each size to a CSS variable", () => {
      expect(BORDER_RADIUS.xs).toBe("var(--rounded-xs)");
      expect(BORDER_RADIUS.sm).toBe("var(--rounded-sm)");
      expect(BORDER_RADIUS.md).toBe("var(--rounded-md)");
      expect(BORDER_RADIUS.lg).toBe("var(--rounded-lg)");
      expect(BORDER_RADIUS.xl).toBe("var(--rounded-xl)");
      expect(BORDER_RADIUS.xxl).toBe("var(--rounded-xxl)");
      expect(BORDER_RADIUS.circle).toBe("var(--rounded-circle)");
      expect(BORDER_RADIUS.pill).toBe("var(--rounded-pill)");
    });

    it("contains exactly eight entries", () => {
      expect(Object.keys(BORDER_RADIUS)).toHaveLength(8);
    });
  });
});
