/**
 * Registering resolved Google Fonts faces with `@napi-rs/canvas`, and the
 * per-sequence "resolve everything this document needs" entry point.
 *
 * Not re-exported from the package root, or from `./fonts`: it imports
 * `@napi-rs/canvas`, and the root export has no runtime dependencies (AS2).
 * A Node host that draws reaches it as `@nodetool-ai/timeline/fonts/google-node`
 * — the render paths (`RenderTimeline`, `nodetool timeline render`, the
 * agent's frame preview). A host that only needs to *resolve* a family for a
 * browser to load, with no canvas — the API server's fonts route — imports
 * `./google-fonts-fetch.js` directly instead, which is this module's fetch
 * and disk-cache half with no `@napi-rs/canvas` dependency.
 */

import { GlobalFonts } from "@napi-rs/canvas";

import { resolveGoogleFontFamily, type GoogleFontResolution } from "./google-fonts-fetch.js";
import { collectFontFaceRequests, type FontFaceRequest } from "./google-fonts.js";
import type { TimelineSequence } from "../types.js";

export {
  googleFontsCacheDir,
  resolveGoogleFontFamily,
  type GoogleFontFace,
  type GoogleFontResolution
} from "./google-fonts-fetch.js";

const registeredFiles = new Set<string>();

/** Register a resolved family's faces with `@napi-rs/canvas`, once each. */
export function registerGoogleFontFaces(resolution: GoogleFontResolution): void {
  for (const face of resolution.faces) {
    if (registeredFiles.has(face.file)) continue;
    GlobalFonts.registerFromPath(face.file);
    registeredFiles.add(face.file);
  }
}

export interface EnsureGoogleFontsReport {
  /** Families resolved and registered, ready to draw. */
  resolved: string[];
  /** Families a text or caption layer names that could not be resolved. */
  unavailable: string[];
}

/**
 * Resolve and register every family a sequence uses that the bundled catalog
 * does not carry. Never throws: a family that fails (offline, not on Google
 * Fonts, a network error) is reported in `unavailable` instead, so the render
 * proceeds and draws the documented fallback face for it.
 */
export async function ensureGoogleFonts(
  sequence: Pick<TimelineSequence, "clips">
): Promise<EnsureGoogleFontsReport> {
  const requests = collectFontFaceRequests(sequence);
  const byFamily = new Map<string, Pick<FontFaceRequest, "weight" | "style">[]>();
  for (const request of requests) {
    const list = byFamily.get(request.family) ?? [];
    list.push({ weight: request.weight, style: request.style });
    byFamily.set(request.family, list);
  }

  const resolved: string[] = [];
  const unavailable: string[] = [];
  for (const [family, faceRequests] of byFamily) {
    try {
      const resolution = await resolveGoogleFontFamily(family, faceRequests);
      if (resolution === null) {
        unavailable.push(family);
        continue;
      }
      registerGoogleFontFaces(resolution);
      resolved.push(family);
    } catch {
      unavailable.push(family);
    }
  }
  return { resolved, unavailable };
}
