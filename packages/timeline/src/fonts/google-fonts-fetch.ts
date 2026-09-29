/**
 * Fetching and disk-caching Google Fonts faces — the network half of
 * {@link "./google-fonts.js"}, with no canvas dependency.
 *
 * Not re-exported from the package root, or from `./fonts`: it imports
 * `@nodetool-ai/runtime` (`safeFetch`) and `@nodetool-ai/config`
 * (`getNodetoolCacheDir`), and the root export has no runtime dependencies
 * (AS2). Reach it as `@nodetool-ai/timeline/fonts/google-fetch`.
 *
 * Split from `google-fonts-node.ts` on purpose: that module also imports
 * `@napi-rs/canvas` to register a resolved face, and the API server resolves
 * families for the browser (`packages/websocket/src/routes/timeline-fonts.ts`)
 * without ever drawing with one — it has no canvas dependency and should not
 * gain one just to reach `safeFetch`.
 *
 * Every network request goes through `safeFetch`
 * (`packages/runtime/src/providers/safe-url.ts`) *and* through
 * {@link assertGoogleFontsUrlAllowed} first — the URL is always one this
 * module built from a document- or browser-authored family name, so it is
 * caller data (AGENTS.md § Security), and the allowlist is a second, narrower
 * gate than `safeFetch`'s general public-host policy: only
 * raw.githubusercontent.com, never whatever a redirect or a future call site
 * might point at. See the "Google Fonts family resolution (timeline)" row in
 * `docs/url-egress-inventory.md`.
 *
 * A family that cannot be resolved — offline, not on Google Fonts, a network
 * error — returns `null` rather than throwing, so the caller reports
 * `font_unavailable` instead of failing the whole render.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { getNodetoolCacheDir } from "@nodetool-ai/config";
import { safeFetch } from "@nodetool-ai/runtime";

import {
  assertGoogleFontsUrlAllowed,
  googleFontsFaceUrl,
  googleFontsLicenseName,
  googleFontsLicenseUrl,
  googleFontsMetadataUrl,
  googleFontsSlug,
  GOOGLE_FONTS_LICENSE_DIRS,
  parseGoogleFontsMetadata,
  pickGoogleFontFile,
  type FontFaceRequest,
  type GoogleFontsLicenseDir
} from "./google-fonts.js";

/** One resolved, cached, on-disk face of a Google Fonts family. */
export interface GoogleFontFace {
  style: "normal" | "italic";
  weights: [number, number];
  /** Absolute path to the cached font file. */
  file: string;
}

export interface GoogleFontResolution {
  family: string;
  license: "OFL-1.1" | "Apache-2.0";
  faces: GoogleFontFace[];
}

interface GoogleFontManifest {
  family: string;
  license: "OFL-1.1" | "Apache-2.0";
  licenseDir: GoogleFontsLicenseDir;
  faces: { style: "normal" | "italic"; weights: [number, number]; file: string }[];
}

/** Where resolved families are cached, one directory per family slug. */
export function googleFontsCacheDir(): string {
  return join(getNodetoolCacheDir(), "timeline-google-fonts");
}

function familyDir(slug: string): string {
  return join(googleFontsCacheDir(), slug);
}

function manifestPath(slug: string): string {
  return join(familyDir(slug), "manifest.json");
}

async function fetchText(url: string): Promise<string | null> {
  assertGoogleFontsUrlAllowed(url);
  const res = await safeFetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Google Fonts fetch failed (${res.status}): ${url}`);
  }
  return res.text();
}

async function fetchBytes(url: string): Promise<Buffer> {
  assertGoogleFontsUrlAllowed(url);
  const res = await safeFetch(url);
  if (!res.ok) {
    throw new Error(`Google Fonts fetch failed (${res.status}): ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function readManifest(slug: string): Promise<GoogleFontManifest | null> {
  try {
    const raw = await readFile(manifestPath(slug), "utf8");
    const manifest = JSON.parse(raw) as GoogleFontManifest;
    if (manifest.faces.every((face) => existsSync(face.file))) return manifest;
    return null;
  } catch {
    return null;
  }
}

/**
 * The family's metadata, from whichever licence directory carries it.
 * `null` when the family is on neither `ofl` nor `apache` — including when it
 * only exists under `ufl` (see the module-level note in `google-fonts.ts`).
 */
async function fetchMetadata(
  slug: string
): Promise<{ dir: GoogleFontsLicenseDir; text: string } | null> {
  for (const dir of GOOGLE_FONTS_LICENSE_DIRS) {
    const text = await fetchText(googleFontsMetadataUrl(dir, slug));
    if (text !== null) return { dir, text };
  }
  return null;
}

/**
 * Slugs known, this process, not to be on Google Fonts. `resolveGoogleFontFamily`
 * checks disk for a positive cache, but a family that resolved to nothing has
 * nothing to write to disk — so a repeated request for "Arial" or "Georgia"
 * (real system fonts a document can still name, per `fontFamilyRefusal`'s own
 * comment) would otherwise hit raw.githubusercontent.com once per call rather
 * than once per process.
 */
const knownUnavailable = new Set<string>();

/**
 * Resolve one family's faces for the given requests (a weight+style pair
 * each), downloading only the files those requests need. Cached faces already
 * on disk are reused without a network call. Returns null when the family
 * cannot be resolved — reported by the caller as `font_unavailable`, never
 * thrown, so one bad family does not stop the rest of a document.
 */
export async function resolveGoogleFontFamily(
  family: string,
  requests: Pick<FontFaceRequest, "weight" | "style">[]
): Promise<GoogleFontResolution | null> {
  const slug = googleFontsSlug(family);
  if (slug === "" || knownUnavailable.has(slug)) return null;
  const wanted = requests.length > 0 ? requests : [{ weight: 400, style: "normal" as const }];

  const cached = await readManifest(slug);
  if (cached !== null) {
    const haveFile = new Set(cached.faces.map((f) => f.file));
    return {
      family: cached.family,
      license: cached.license,
      faces: cached.faces.filter((f) => haveFile.has(f.file))
    };
  }

  const metadata = await fetchMetadata(slug);
  if (metadata === null) {
    knownUnavailable.add(slug);
    return null;
  }
  const parsed = parseGoogleFontsMetadata(metadata.text);
  if (parsed.faces.length === 0) {
    knownUnavailable.add(slug);
    return null;
  }

  const dir = familyDir(slug);
  await mkdir(dir, { recursive: true });

  const license = googleFontsLicenseName(metadata.dir);
  const licenseText = await fetchText(googleFontsLicenseUrl(metadata.dir, slug));
  if (licenseText !== null) {
    await writeFile(join(dir, "LICENSE.txt"), licenseText, "utf8");
  }

  const picked = new Map<string, { style: "normal" | "italic"; weights: [number, number] }>();
  for (const request of wanted) {
    const file = pickGoogleFontFile(parsed, request);
    if (file === null) continue;
    picked.set(file.filename, { style: file.style, weights: file.weights });
  }
  if (picked.size === 0) return null;

  const faces: GoogleFontManifest["faces"] = [];
  for (const [filename, info] of picked) {
    const bytes = await fetchBytes(googleFontsFaceUrl(metadata.dir, slug, filename));
    const localPath = join(dir, filename);
    await writeFile(localPath, bytes);
    faces.push({ style: info.style, weights: info.weights, file: localPath });
  }

  const manifest: GoogleFontManifest = {
    family: parsed.name || family,
    license,
    licenseDir: metadata.dir,
    faces
  };
  await writeFile(manifestPath(slug), JSON.stringify(manifest, null, 2), "utf8");
  return { family: manifest.family, license: manifest.license, faces: manifest.faces };
}
