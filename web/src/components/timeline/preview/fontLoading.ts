/**
 * Loading the bundled typefaces before anything draws with them.
 *
 * `@font-face` is lazy: a rule in `fonts.css` declares where a face lives, and
 * the browser fetches it the first time something asks for it. A canvas does
 * not wait — `ctx.fillText` with an unloaded family draws the fallback
 * immediately, and `TextRasterizer` then caches that bitmap under a key that
 * says nothing about which face drew it. The wrong glyphs stay on screen for
 * as long as the entry lives, which for a held title is the rest of the
 * session.
 *
 * So the rasterizer asks {@link bundledFontsReady} before it caches, and the
 * editor kicks off {@link ensureBundledFontsLoaded} when it mounts. The files
 * come from the server the Node hosts register from
 * (`/api/assets/packages/timeline/fonts/`), so a title drawn here is the title
 * the server renders (D8).
 */

import { BUNDLED_FONTS } from "@nodetool-ai/timeline";

/**
 * `document.fonts.load` takes a `font` shorthand and loads whatever faces
 * could serve it. One request per catalog entry, at the entry's own slant and
 * lightest weight — a variable face is one file whatever weight is asked for,
 * and a family's slants are separate files.
 */
const FACE_SPECS: readonly string[] = BUNDLED_FONTS.map(
  (face) => `${face.style} ${face.weights[0]} 16px "${face.family}"`
);

let pending: Promise<void> | null = null;
let loaded = false;

/** The document's font set, or null on a runtime that has none (jsdom, SSR). */
function fontFaceSet(): FontFaceSet | null {
  const fonts = typeof document === "undefined" ? undefined : document.fonts;
  return fonts && typeof fonts.load === "function" ? fonts : null;
}

/**
 * Whether every bundled face can be drawn with right now.
 *
 * True before anything has been loaded on a runtime with no font-loading API:
 * nothing can be in flight there, so a raster taken now is the same raster it
 * would be later, and refusing to cache it would cost every host that is not a
 * browser for no benefit.
 */
export function bundledFontsReady(): boolean {
  return loaded || fontFaceSet() === null;
}

/**
 * Load every bundled face, once per document. Resolves when the browser can
 * draw with all of them — or immediately on a runtime with no font-loading API
 * (jsdom, an old browser), where waiting would never resolve and the fallback
 * is the only face there was going to be.
 *
 * A face that fails to load does not reject: one missing file must not stop
 * the other nine from being used, and the picture it produces is the fallback
 * either way.
 */
export function ensureBundledFontsLoaded(): Promise<void> {
  if (pending) return pending;
  const fonts = fontFaceSet();
  if (fonts === null) {
    loaded = true;
    pending = Promise.resolve();
    return pending;
  }
  pending = Promise.all(
    FACE_SPECS.map((spec) => fonts.load(spec).catch(() => undefined))
  ).then(() => {
    loaded = true;
  });
  return pending;
}

/** Test seam: forget the load so the next call starts a fresh one. */
export function resetBundledFontsForTest(): void {
  pending = null;
  loaded = false;
}
