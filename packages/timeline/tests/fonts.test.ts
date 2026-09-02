/**
 * The bundled font corpus (T17, D8, F15).
 *
 * Two halves. `resolveFontFamily` is the one rule every host resolves a
 * document's `fontFamily` through, so its answers are pinned here rather than
 * per host. And the catalog is a table of file names that nothing in
 * TypeScript checks against the disk, so a face renamed without its catalog
 * entry — or shipped without its licence (C7) — is caught here rather than in
 * a render nobody compares.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  BUNDLED_FONTS,
  BUNDLED_FONT_FAMILIES,
  BUNDLED_FONT_FILES,
  DEFAULT_FONT_FAMILY,
  bundledFacesFor,
  bundledFontFaceCss,
  isBundledFamily,
  resolveFontFamily
} from "../src/fonts/index.js";
import { textFontSpec } from "../src/render/textLayout.js";

const FONTS_DIR = fileURLToPath(new URL("../fonts/", import.meta.url));

describe("bundled font catalog", () => {
  it("ships six families the plan names", () => {
    expect(BUNDLED_FONT_FAMILIES).toEqual([
      "Inter",
      "Space Grotesk",
      "Bebas Neue",
      "Playfair Display",
      "Lora",
      "JetBrains Mono"
    ]);
  });

  it("has every declared face and licence on disk", () => {
    expect(BUNDLED_FONT_FILES.length).toBeGreaterThan(0);
    const absent = BUNDLED_FONT_FILES.filter(
      (file) => !existsSync(`${FONTS_DIR}${file}`)
    );
    expect(absent).toEqual([]);
  });

  it("ships a real OFL licence beside every face", () => {
    for (const face of BUNDLED_FONTS) {
      const text = readFileSync(`${FONTS_DIR}${face.license}`, "utf8");
      expect(text).toContain("SIL OPEN FONT LICENSE");
    }
  });

  it("declares a weight range each file could actually cover", () => {
    for (const face of BUNDLED_FONTS) {
      const [min, max] = face.weights;
      expect(min).toBeGreaterThanOrEqual(1);
      expect(max).toBeGreaterThanOrEqual(min);
      expect(max).toBeLessThanOrEqual(1000);
    }
  });

  it("gives a family at most one file per slant", () => {
    const seen = new Set<string>();
    for (const face of BUNDLED_FONTS) {
      const key = `${face.family}|${face.style}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("finds a family's faces case-insensitively and nothing else", () => {
    expect(bundledFacesFor("bebas neue").map((f) => f.file)).toEqual([
      "BebasNeue-Regular.ttf"
    ]);
    expect(bundledFacesFor("Helvetica Neue")).toEqual([]);
  });
});

describe("resolveFontFamily", () => {
  it("defaults to the bundled default, portably", () => {
    expect(resolveFontFamily(undefined)).toEqual({
      family: `${DEFAULT_FONT_FAMILY}, sans-serif`,
      portable: true
    });
    expect(resolveFontFamily("   ").portable).toBe(true);
  });

  it("resolves a bundled family to itself", () => {
    expect(resolveFontFamily("Inter")).toEqual({
      family: "Inter, sans-serif",
      portable: true
    });
  });

  it("quotes a multi-word family so the shorthand still parses", () => {
    expect(resolveFontFamily("Bebas Neue").family).toBe(
      '"Bebas Neue", sans-serif'
    );
  });

  it("keeps a family's own generic before the last resort", () => {
    expect(resolveFontFamily("Lora").family).toBe("Lora, serif, sans-serif");
    expect(resolveFontFamily("JetBrains Mono").family).toBe(
      '"JetBrains Mono", monospace, sans-serif'
    );
  });

  // This is the one answer the validator's `font_not_portable` reads.
  it("reports a system family as non-portable and still draws it first", () => {
    expect(resolveFontFamily("Helvetica Neue")).toEqual({
      family: '"Helvetica Neue", Inter, sans-serif',
      portable: false
    });
    expect(isBundledFamily("Helvetica Neue")).toBe(false);
  });

  // Saved documents carry the pre-T17 default as a whole stack.
  it("reads the head of an authored stack", () => {
    expect(resolveFontFamily("Inter, Arial, sans-serif").portable).toBe(true);
    expect(resolveFontFamily("Futura, Arial, sans-serif").portable).toBe(false);
  });

  // An unbalanced quote makes a canvas ignore the whole `font` assignment and
  // keep the font it last had — a wrong picture, not an unstyled one.
  it("drops quote and semicolon characters from a family name", () => {
    const { family } = resolveFontFamily('Comic"; Sans');
    expect(family).toBe('"Comic Sans", Inter, sans-serif');
    expect(family).not.toContain(";");
  });

  it("falls back to the default when nothing survives sanitizing", () => {
    expect(resolveFontFamily('";').portable).toBe(true);
  });
});

describe("textFontSpec", () => {
  it("builds its family list through resolveFontFamily", () => {
    expect(textFontSpec({ fontSizePx: 48, fontFamily: "Bebas Neue" })).toBe(
      '400 48px "Bebas Neue", sans-serif'
    );
    expect(textFontSpec({ fontSizePx: 32 })).toBe("400 32px Inter, sans-serif");
  });

  it("keeps weight and slant in front of the resolved list", () => {
    expect(
      textFontSpec({
        fontSizePx: 24,
        fontWeight: 700,
        fontStyle: "italic",
        fontFamily: "Lora"
      })
    ).toBe("italic 700 24px Lora, serif, sans-serif");
  });
});

describe("bundledFontFaceCss", () => {
  it("emits one rule per face, pointing at the served files", () => {
    const css = bundledFontFaceCss();
    expect(css.match(/@font-face/g)).toHaveLength(BUNDLED_FONTS.length);
    for (const face of BUNDLED_FONTS) {
      expect(css).toContain(
        `url("/api/assets/packages/timeline/fonts/${face.file}")`
      );
    }
  });

  it("declares a variable face's range and a static face's single weight", () => {
    const css = bundledFontFaceCss();
    expect(css).toContain("font-weight: 100 900;");
    expect(css).toContain("font-weight: 400;");
  });

  // The trailing-slash trim was rewritten off `/\/+$/`, which CodeQL reads as
  // polynomial backtracking. Both forms strip the same characters, so these
  // are what catch a rewrite that strips too few or too many.
  it("strips trailing slashes from the base it is handed", () => {
    for (const base of ["/fonts", "/fonts/", "/fonts///"]) {
      expect(bundledFontFaceCss(base)).toContain(
        `url("/fonts/${BUNDLED_FONTS[0].file}")`
      );
    }
  });

  it("keeps a slash that is not at the end", () => {
    expect(bundledFontFaceCss("/a//b")).toContain(
      `url("/a//b/${BUNDLED_FONTS[0].file}")`
    );
  });

  it("takes a base that is nothing but slashes", () => {
    expect(bundledFontFaceCss("///")).toContain(
      `url("/${BUNDLED_FONTS[0].file}")`
    );
  });

  it("takes a base url without doubling the separator", () => {
    expect(bundledFontFaceCss("/fonts/")).toContain(
      'url("/fonts/Inter-Variable.ttf")'
    );
  });
});
