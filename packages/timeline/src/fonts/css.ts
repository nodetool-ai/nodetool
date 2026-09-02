/**
 * The `@font-face` rules the browser needs for the bundled corpus.
 *
 * Node hosts register the files with `GlobalFonts.registerFromPath`; a browser
 * has no such call, so the same catalog is rendered as CSS and served from the
 * same files. Generated rather than hand-written for one reason: a face added
 * to the catalog and forgotten in the stylesheet renders as the fallback in
 * the editor and as the real face everywhere else, which is the divergence
 * this whole pipeline exists to remove.
 *
 * Pure string building — no DOM, no fetch — so the generator script, the web
 * bundle and the test that checks the checked-in file all call one function.
 */

import { BUNDLED_FONTS } from "./catalog.js";

/** Where the web loads the bundled faces from (`routes/timeline-fonts.ts`). */
export const BUNDLED_FONTS_URL_BASE = "/api/assets/packages/timeline/fonts";

/**
 * The stylesheet for every bundled face, served under `baseUrl`.
 *
 * `font-display: block` rather than `swap`: a swapped fallback is drawn, and
 * a drawn frame is what a raster caches. Blocking hides the text for the
 * first moments instead of caching the wrong glyphs.
 */
export function bundledFontFaceCss(
  baseUrl: string = BUNDLED_FONTS_URL_BASE
): string {
  // Trailing slashes are trimmed by walking back from the end rather than with
  // `/\/+$/`: that pattern shares its first character across the quantifier and
  // the anchor, so a base URL of many slashes walks the engine back through
  // what it already read at every start position. CodeQL reads that shape as
  // polynomial backtracking, and there is nothing a regex buys here.
  let end = baseUrl.length;
  while (end > 0 && baseUrl[end - 1] === "/") {
    end--;
  }
  const base = baseUrl.slice(0, end);
  const blocks = BUNDLED_FONTS.map((face) => {
    const [min, max] = face.weights;
    const weight = min === max ? `${min}` : `${min} ${max}`;
    return [
      "@font-face {",
      `  font-family: "${face.family}";`,
      `  font-style: ${face.style};`,
      `  font-weight: ${weight};`,
      "  font-display: block;",
      `  src: url("${base}/${face.file}") format("truetype");`,
      "}"
    ].join("\n");
  });
  return `${blocks.join("\n\n")}\n`;
}
