import ThemeNodetool from "../ThemeNodetool";
import { nodetoolThemeFor } from "../AppThemeRoot";

const schemePalette = (
  theme: typeof ThemeNodetool,
  scheme: "dark" | "light"
) => theme.colorSchemes[scheme]?.palette;

/** WCAG relative luminance of a #RRGGBB color. */
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("theme contrast", () => {
  it("keeps the shipped theme for standard contrast", () => {
    expect(nodetoolThemeFor("default", "standard")).toBe(ThemeNodetool);
    expect(nodetoolThemeFor("default")).toBe(ThemeNodetool);
  });

  it("reuses one theme per text size and contrast", () => {
    expect(nodetoolThemeFor("large", "soft")).toBe(
      nodetoolThemeFor("large", "soft")
    );
    expect(nodetoolThemeFor("large", "soft").fontSizeNormal).toBe("17px");
  });

  // Issue #6757: the dark canvas sat near black and the light one near white.
  it("lifts the dark canvas and dims the light one", () => {
    const soft = nodetoolThemeFor("default", "soft");
    const standardDark = schemePalette(ThemeNodetool, "dark");
    const softDark = schemePalette(soft, "dark");
    const standardLight = schemePalette(ThemeNodetool, "light");
    const softLight = schemePalette(soft, "light");

    expect(softDark?.c_editor_bg_color).toBe("#1C1E22");
    expect(luminance(softDark!.background.default)).toBeGreaterThan(
      luminance(standardDark!.background.default)
    );
    expect(luminance(softLight!.background.default)).toBeLessThan(
      luminance(standardLight!.background.default)
    );
    // Accents stay the same so selection and status colors still read.
    expect(softDark?.primary.main).toBe(standardDark?.primary.main);
  });

  it("keeps cards distinct from the canvas and text readable on cards", () => {
    const soft = nodetoolThemeFor("default", "soft");
    for (const scheme of ["dark", "light"] as const) {
      const palette = schemePalette(soft, scheme)!;
      expect(palette.c_node_bg).not.toBe(palette.c_editor_bg_color);
      // WCAG AAA for body text and AA for secondary text on a node card.
      expect(
        contrastRatio(palette.text.primary, palette.c_node_bg!)
      ).toBeGreaterThanOrEqual(7);
      expect(
        contrastRatio(palette.text.secondary, palette.c_node_bg!)
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
