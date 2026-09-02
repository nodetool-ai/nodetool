/**
 * The checked-in `fonts.css` matches the catalog it is generated from (T17).
 *
 * The stylesheet is the browser's half of the font pipeline — Node hosts
 * register the same files with `GlobalFonts.registerFromPath`. A face added to
 * the catalog and forgotten here renders as the fallback in the editor and as
 * the real face everywhere else, which is exactly the host divergence the
 * corpus exists to remove (D8, F15). Generating it is only useful if
 * regenerating it is enforced.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bundledFontFaceCss, BUNDLED_FONTS } from "@nodetool-ai/timeline";

const CSS_PATH = join(__dirname, "..", "fonts.css");

describe("timeline fonts.css", () => {
  const css = readFileSync(CSS_PATH, "utf8");

  it("is what the catalog generates today", () => {
    // The header is the generator's; everything after it is the catalog's.
    const body = css.slice(css.indexOf("@font-face"));
    expect(body).toBe(bundledFontFaceCss());
  });

  it("declares every bundled face", () => {
    expect(css.match(/@font-face/g)).toHaveLength(BUNDLED_FONTS.length);
    for (const face of BUNDLED_FONTS) {
      expect(css).toContain(face.file);
    }
  });

  it("points at the route the server streams the files from", () => {
    expect(css).toContain("/api/assets/packages/timeline/fonts/");
  });

  it("says where to regenerate it", () => {
    expect(css).toContain("generate-timeline-fonts-css.mjs");
  });
});
