/**
 * Naming and parsing for Google Fonts resolution — the pure half.
 *
 * A document can name a family the bundled catalog (`catalog.ts`) does not
 * ship. Rather than draw it in the fallback and report `font_not_portable`
 * forever, a host can resolve it from the `google/fonts` GitHub repository —
 * the same corpus `fonts.google.com` serves — and cache the files it needs,
 * so every host that resolves the same family draws the same glyphs (D8).
 *
 * That repository is used instead of the `fonts.googleapis.com/css2` API for
 * one reason: `css2` answers with a user-agent-dependent stylesheet and no
 * licence information, so a caller would still need a second source for the
 * OFL/Apache text C7 requires beside every bundled face. The repository lays
 * a family's files under a licence directory (`ofl/`, `apache/`, `ufl/`) and
 * ships the licence text beside them, at URLs raw.githubusercontent.com
 * serves without an API key or rate-limit token. Only `ofl` and `apache` are
 * resolved — both are the same "attribution, no royalty" terms the bundled
 * corpus already carries; `ufl` (the Ubuntu Font License) adds a renaming
 * clause the rest of the corpus does not have to honour, so a family that
 * lives only there is reported unavailable rather than silently held to a
 * different licence than its neighbours.
 *
 * This module only builds the URLs and parses the `METADATA.pb` text format
 * the repository ships per family — no network, no disk, so it stays in the
 * package root (AS2). Fetching, caching and registering the files is
 * `google-fonts-node.ts`, reached as `@nodetool-ai/timeline/fonts/google-node`
 * for the same reason `register-node.ts` is not in the root export.
 */

import type { TimelineClip, TimelineSequence } from "../types.js";
import { isBundledFamily } from "./catalog.js";

/** The one host every Google Fonts URL this module builds resolves to. */
export const GOOGLE_FONTS_HOST = "raw.githubusercontent.com";

/** Licence directories resolved. `ufl` is deliberately excluded — see above. */
export const GOOGLE_FONTS_LICENSE_DIRS = ["ofl", "apache"] as const;
export type GoogleFontsLicenseDir = (typeof GOOGLE_FONTS_LICENSE_DIRS)[number];

/** The SPDX-ish licence id recorded in a family's cache manifest. */
export function googleFontsLicenseName(
  dir: GoogleFontsLicenseDir
): "OFL-1.1" | "Apache-2.0" {
  return dir === "ofl" ? "OFL-1.1" : "Apache-2.0";
}

const GOOGLE_FONTS_REPO_ROOT = `https://${GOOGLE_FONTS_HOST}/google/fonts/main`;

/**
 * The repository's own family-folder naming: the family name, lowercased,
 * with everything but `a`-`z` and `0`-`9` dropped. "Space Grotesk" becomes
 * "spacegrotesk", matching the folder the corpus actually uses — this is the
 * convention the corpus's own tooling and every downstream mirror rely on,
 * not a guess this module invents.
 */
export function googleFontsSlug(family: string): string {
  return family.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function googleFontsMetadataUrl(
  dir: GoogleFontsLicenseDir,
  slug: string
): string {
  return `${GOOGLE_FONTS_REPO_ROOT}/${dir}/${slug}/METADATA.pb`;
}

export function googleFontsFaceUrl(
  dir: GoogleFontsLicenseDir,
  slug: string,
  filename: string
): string {
  return `${GOOGLE_FONTS_REPO_ROOT}/${dir}/${slug}/${encodeURIComponent(filename)}`;
}

const LICENSE_FILE_NAME: Record<GoogleFontsLicenseDir, string> = {
  ofl: "OFL.txt",
  apache: "LICENSE.txt"
};

export function googleFontsLicenseUrl(
  dir: GoogleFontsLicenseDir,
  slug: string
): string {
  return `${GOOGLE_FONTS_REPO_ROOT}/${dir}/${slug}/${LICENSE_FILE_NAME[dir]}`;
}

/** Refuse anything that is not exactly the one host this module trusts. */
export function assertGoogleFontsUrlAllowed(url: string): void {
  const host = new URL(url).host;
  if (host !== GOOGLE_FONTS_HOST) {
    throw new Error(
      `Google Fonts resolution only fetches ${GOOGLE_FONTS_HOST}, refusing ${host}`
    );
  }
}

/** One `fonts { … }` block of a family's `METADATA.pb`. */
export interface GoogleFontMetadataFace {
  style: "normal" | "italic";
  weight: number;
  /** File name under the family's licence directory. */
  filename: string;
}

export interface GoogleFontMetadata {
  /** The family name the metadata itself declares. */
  name: string;
  faces: GoogleFontMetadataFace[];
}

/**
 * `METADATA.pb` is protobuf text format, not JSON — but every field this
 * module reads is a scalar inside a flat or single-nesting-level message, so
 * a pair of regexes reads it without a protobuf parser. A field this parser
 * does not recognize is simply not extracted; the file also carries
 * `designer`, `category`, `subsets` and more that no caller here needs.
 */
export function parseGoogleFontsMetadata(text: string): GoogleFontMetadata {
  const name = /^name:\s*"([^"]*)"/m.exec(text)?.[1] ?? "";
  const faces: GoogleFontMetadataFace[] = [];
  // A scan with indexOf, not one regex over the whole file: a regex that
  // looks for the closing brace after each `fonts {` rescans the rest of the
  // text for every unclosed block, which is quadratic.
  const opener = /fonts\s*\{/g;
  let open: RegExpExecArray | null;
  while ((open = opener.exec(text)) !== null) {
    const start = open.index + open[0].length;
    const end = text.indexOf("}", start);
    if (end === -1) break;
    opener.lastIndex = end + 1;
    const body = text.slice(start, end);
    const filename = /filename:\s*"([^"]*)"/.exec(body)?.[1];
    const weightText = /weight:\s*(\d+)/.exec(body)?.[1];
    if (filename === undefined || weightText === undefined) continue;
    const style = /style:\s*"italic"/.test(body) ? "italic" : "normal";
    faces.push({ style, weight: Number(weightText), filename });
  }
  return { name, faces };
}

/** One weight/style a document actually asks a family to draw. */
export interface FontFaceRequest {
  family: string;
  weight: number;
  style: "normal" | "italic";
}

/**
 * The file (and the weight range it covers, for a variable face shared by
 * several `fonts {}` entries) that best serves one request — same style
 * first, then nearest weight; any style if the family has none of the
 * request's. Null only when the metadata lists no faces at all.
 */
export function pickGoogleFontFile(
  metadata: GoogleFontMetadata,
  request: Pick<FontFaceRequest, "weight" | "style">
): { filename: string; style: "normal" | "italic"; weights: [number, number] } | null {
  if (metadata.faces.length === 0) return null;
  const sameStyle = metadata.faces.filter((f) => f.style === request.style);
  const pool = sameStyle.length > 0 ? sameStyle : metadata.faces;
  let best = pool[0]!;
  let bestDistance = Math.abs(best.weight - request.weight);
  for (const face of pool) {
    const distance = Math.abs(face.weight - request.weight);
    if (distance < bestDistance) {
      best = face;
      bestDistance = distance;
    }
  }
  const sameFile = metadata.faces.filter(
    (f) => f.filename === best.filename && f.style === best.style
  );
  const weights = sameFile.map((f) => f.weight);
  return {
    filename: best.filename,
    style: best.style,
    weights: [Math.min(...weights), Math.max(...weights)]
  };
}

/** Every distinct `(family, weight, style)` a text or caption layer draws. */
export function collectFontFaceRequests(
  sequence: Pick<TimelineSequence, "clips">
): FontFaceRequest[] {
  const seen = new Map<string, FontFaceRequest>();
  const add = (
    family: string | undefined,
    weight: number | undefined,
    style: string | undefined
  ): void => {
    if (family === undefined) return;
    const head = family.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
    if (!head) return;
    if (isBundledFamily(head)) return;
    const request: FontFaceRequest = {
      family: head,
      weight: weight ?? 400,
      style: style === "italic" ? "italic" : "normal"
    };
    seen.set(
      `${request.family.toLowerCase()}|${request.weight}|${request.style}`,
      request
    );
  };
  for (const clip of sequence.clips as TimelineClip[]) {
    add(
      clip.textStyle?.fontFamily,
      clip.textStyle?.fontWeight,
      clip.textStyle?.fontStyle
    );
    add(clip.caption?.style?.fontFamily, undefined, undefined);
  }
  return [...seen.values()];
}

/** One resolved, on-disk face — enough to build an `@font-face` rule. */
export interface GoogleFontFaceCssInput {
  style: "normal" | "italic";
  weights: readonly [number, number];
  /** File name only; the caller supplies the base URL it is served under. */
  file: string;
}

/**
 * `@font-face` rules for a resolved Google Fonts family, in the shape the
 * bundled corpus's own `bundledFontFaceCss` builds — same `font-display:
 * block` reasoning (a raster taken before the file arrives would cache the
 * fallback), same one-file-per-face structure.
 */
export function googleFontFaceCss(
  family: string,
  faces: readonly GoogleFontFaceCssInput[],
  baseUrl: string
): string {
  const blocks = faces.map((face) => {
    const [min, max] = face.weights;
    const weight = min === max ? `${min}` : `${min} ${max}`;
    return [
      "@font-face {",
      `  font-family: "${family}";`,
      `  font-style: ${face.style};`,
      `  font-weight: ${weight};`,
      "  font-display: block;",
      `  src: url("${baseUrl}/${encodeURIComponent(face.file)}") format("truetype");`,
      "}"
    ].join("\n");
  });
  return `${blocks.join("\n\n")}\n`;
}

/** The distinct families {@link collectFontFaceRequests} named. */
export function collectUnresolvedFontFamilies(
  sequence: Pick<TimelineSequence, "clips">
): string[] {
  return [...new Set(collectFontFaceRequests(sequence).map((r) => r.family))];
}
