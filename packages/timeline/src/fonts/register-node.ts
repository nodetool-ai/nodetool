/**
 * Registering the bundled corpus with `@napi-rs/canvas`, for the two Node
 * hosts that draw text: the server rasterizer
 * (`packages/video-nodes/src/nodes/timeline/rasterizers.ts`) and the agent's
 * frame preview (`packages/agents/src/timeline-preview/rasterize.ts`).
 *
 * Both draw through the same library, so registering the same files makes
 * their glyphs identical rather than merely similar — which is what
 * `packages/agents/tests/timeline-bundled-fonts.test.ts` asserts.
 *
 * Not re-exported from the package root, and not from `./fonts`: the import
 * below is a runtime dependency and the root export has none (AS2). Reach it
 * as `@nodetool-ai/timeline/fonts/node`.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GlobalFonts } from "@napi-rs/canvas";

import { BUNDLED_FONTS } from "./catalog.js";

/** What one process-wide registration pass did. */
export interface BundledFontRegistration {
  /** The directory the faces were read from, or null when none was found. */
  dir: string | null;
  /** File names handed to `GlobalFonts.registerFromPath`. */
  registered: string[];
  /** Catalog files the directory did not hold. */
  missing: string[];
}

/**
 * Where the faces sit, which differs by deployment and is checked rather than
 * assumed:
 *
 * - a checkout or an npm install resolves `packages/timeline/fonts/`, two
 *   levels above this module whether it runs from `src/` or `dist/`;
 * - the packaged backend is one flat `server.mjs`, so `import.meta.url` is the
 *   bundle root and `bundle-backend.mjs` stages the directory beside it.
 *
 * Null when neither exists, which a caller reports rather than throwing: text
 * still draws, in whatever the host has (F15's old behaviour), and the
 * artifact check is what makes that impossible to ship (C6).
 */
export function bundledFontsDir(): string | null {
  for (const relative of ["../../fonts/", "fonts/"]) {
    const candidate = fileURLToPath(new URL(relative, import.meta.url));
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

let done: BundledFontRegistration | null = null;

/**
 * Register every bundled face, once per process. Repeat calls return the first
 * pass's result: a rasterizer is constructed per render and per preview, and
 * re-reading three megabytes of font files per frame would be the cost of
 * calling this from the right place.
 */
export function registerBundledFonts(): BundledFontRegistration {
  if (done !== null) return done;
  const dir = bundledFontsDir();
  const registered: string[] = [];
  const missing: string[] = [];
  for (const face of BUNDLED_FONTS) {
    if (dir === null) {
      missing.push(face.file);
      continue;
    }
    const path = `${dir}${face.file}`;
    if (!existsSync(path)) {
      missing.push(face.file);
      continue;
    }
    // The family name comes from the file's own `name` table, so a face is
    // never registered under a name the catalog invented.
    GlobalFonts.registerFromPath(path);
    registered.push(face.file);
  }
  done = { dir, registered, missing };
  return done;
}
