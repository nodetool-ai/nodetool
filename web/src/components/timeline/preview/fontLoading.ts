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
 *
 * A family the bundled catalog does not carry goes through
 * {@link ensureGoogleFontsLoaded} instead: the server resolves it from Google
 * Fonts and caches the files (`@nodetool-ai/timeline/fonts/google-fetch`), and
 * this module injects the `@font-face` CSS the server's resolve endpoint
 * answers and waits on `document.fonts.load` the same way it does for a
 * bundled face. A family the server cannot resolve is remembered as
 * unavailable for the rest of the session — every draw site falls back to the
 * bundled default rather than retrying the network on every frame.
 */

import {
  BUNDLED_FONTS,
  collectFontFaceRequests,
  isBundledFamily
} from "@nodetool-ai/timeline";
import type { FontFaceRequest, TimelineClip } from "@nodetool-ai/timeline";

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

const GOOGLE_FONT_CSS_BASE = "/api/assets/packages/timeline/fonts/google";

/** Per-family load state, so two clips naming the same family share one fetch. */
const googleFontState = new Map<string, Promise<boolean>>();
/** Families whose load attempt has finished, either way — the sync half of the map above. */
const settledGoogleFamilies = new Set<string>();
/**
 * `weight|style` pairs already covered by a fetch, per family. A second clip
 * naming a weight the first fetch did not request (the Halo-wordmark case:
 * body text at 400, a display title at 800, same family, drawn before either
 * settles) must not be dropped just because the family already has a
 * promise — this is what decides "new" from "already asked for".
 */
const requestedWeightsByFamily = new Map<string, Set<string>>();

function weightKey(request: Pick<FontFaceRequest, "weight" | "style">): string {
  return `${request.weight}|${request.style}`;
}

/**
 * Whether a face for `family` can be drawn with right now. True for a
 * bundled family (nothing to wait on) and for a Google family whose load
 * attempt has settled, win or lose — a raster taken now is the picture this
 * family draws until the document names a different one.
 */
export function googleFontFamilyReady(family: string | undefined): boolean {
  if (family === undefined || family.trim() === "" || isBundledFamily(family)) {
    return true;
  }
  return settledGoogleFamilies.has(family.trim().split(",")[0]?.trim() ?? family);
}

/**
 * `?weights=400,800,900i` — the exact weight/style pairs a family's own
 * clips use, so the server resolves and caches those files rather than a
 * fixed guess. A display weight (600–900, common for kinetic type) that the
 * fixed guess used to miss now gets its own face instead of silently
 * rendering as the nearest weight that *was* fetched.
 */
function weightsQuery(requests: Pick<FontFaceRequest, "weight" | "style">[]): string {
  return requests
    .map((r) => `${r.weight}${r.style === "italic" ? "i" : ""}`)
    .join(",");
}

/**
 * Fetch a resolved family's `@font-face` CSS from the server and inject it,
 * once per family per document, at exactly the weight/style pairs its own
 * clips use. Returns whether the server could resolve it — `false` means
 * offline or not on Google Fonts, and the caller keeps drawing in the
 * bundled fallback rather than retrying every frame.
 */
async function loadOneGoogleFont(
  family: string,
  requests: Pick<FontFaceRequest, "weight" | "style">[]
): Promise<boolean> {
  const query = weightsQuery(requests);
  const url = `${GOOGLE_FONT_CSS_BASE}/${encodeURIComponent(family)}/css${
    query ? `?weights=${encodeURIComponent(query)}` : ""
  }`;
  let css: string;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    css = await res.text();
  } catch {
    return false;
  }
  if (typeof document !== "undefined") {
    const style = document.createElement("style");
    style.setAttribute("data-google-font", family);
    style.textContent = css;
    document.head.appendChild(style);
  }
  const fonts = fontFaceSet();
  if (fonts === null) return true;
  // Load every requested weight+style explicitly: a browser's variable-font
  // weight matching against the `@font-face` range this CSS declares is
  // reliable (unlike the Node/Skia canvas path — see
  // `textFontVariationSettings` in `@nodetool-ai/timeline/render` — a browser
  // has no snapping bug), so one `document.fonts.load` per requested pair is
  // enough to fetch every face the injected rules named.
  const specs =
    requests.length > 0
      ? requests.map((r) => `${r.style} ${r.weight} 16px "${family}"`)
      : [`normal 400 16px "${family}"`];
  await Promise.all(specs.map((spec) => fonts.load(spec).catch(() => undefined)));
  return true;
}

/**
 * Start (or join) one family's load. A request naming a weight/style pair
 * nothing has fetched yet for this family tops up the existing load with an
 * additional fetch for just the new pairs — `@font-face` rules from two
 * separate `<style>` tags for the same family simply accumulate, so this
 * never re-fetches or clobbers what is already there.
 */
function getOrStartGoogleFontLoad(
  family: string,
  requests: Pick<FontFaceRequest, "weight" | "style">[]
): Promise<boolean> {
  const covered = requestedWeightsByFamily.get(family) ?? new Set<string>();
  requestedWeightsByFamily.set(family, covered);
  const fresh = requests.filter((r) => !covered.has(weightKey(r)));
  for (const r of fresh) covered.add(weightKey(r));

  const existing = googleFontState.get(family);
  if (existing === undefined) {
    const state = loadOneGoogleFont(family, requests).finally(() => {
      settledGoogleFamilies.add(family);
    });
    googleFontState.set(family, state);
    return state;
  }
  if (fresh.length === 0) return existing;
  const topUp = loadOneGoogleFont(family, fresh);
  const combined = Promise.all([existing, topUp]).then(([a, b]) => a || b);
  googleFontState.set(family, combined);
  return combined;
}

/**
 * Kick off one family's load without waiting on it — the fire-and-forget
 * counterpart `TextRasterizer` uses per clip, mirroring
 * `ensureBundledFontsLoaded`'s use in the same spot. Requests only the one
 * weight/style this clip actually draws with.
 */
export function ensureGoogleFontLoaded(
  family: string | undefined,
  weight?: number,
  style?: string
): void {
  if (family === undefined || isBundledFamily(family)) return;
  const head = family.trim().split(",")[0]?.trim();
  if (!head) return;
  void getOrStartGoogleFontLoad(head, [
    { weight: weight ?? 400, style: style === "italic" ? "italic" : "normal" }
  ]);
}

/**
 * Ensure every family these clips name — that the bundled catalog does not
 * carry — is resolved and loaded at the exact weights those clips use,
 * waiting on none of it more than once. Never rejects: a family the server
 * cannot resolve is cached as unavailable and every future call for it
 * returns immediately.
 */
export function ensureGoogleFontsLoaded(
  clips: readonly TimelineClip[]
): Promise<void> {
  const requests = collectFontFaceRequests({ clips: clips as TimelineClip[] });
  const byFamily = new Map<string, Pick<FontFaceRequest, "weight" | "style">[]>();
  for (const request of requests) {
    const list = byFamily.get(request.family) ?? [];
    list.push({ weight: request.weight, style: request.style });
    byFamily.set(request.family, list);
  }
  return Promise.all(
    [...byFamily.entries()].map(([family, faceRequests]) =>
      getOrStartGoogleFontLoad(family, faceRequests)
    )
  ).then(() => undefined);
}

/** Test seam: forget every resolved family so the next call re-fetches. */
export function resetGoogleFontsForTest(): void {
  googleFontState.clear();
  settledGoogleFamilies.clear();
  requestedWeightsByFamily.clear();
}
