/**
 * The bundled typefaces, streamed to the browser —
 * `GET /api/assets/packages/timeline/fonts/<file>`.
 *
 * Node hosts register these files with `@napi-rs/canvas`; a browser has no
 * such call and loads them through the `@font-face` rules in
 * `web/src/components/timeline/fonts.css`, which point here. Same files, so
 * the editor preview and a server render draw the same glyphs (D8, F15).
 *
 * A path under `/api/assets/packages/` rather than a route of its own because
 * that prefix is already public (`lib/public-routes.ts`) — a stylesheet's font
 * request carries no auth header — and because these are constant files a
 * package ships, which is exactly what that prefix means. It is a static
 * route, so Fastify's router prefers it to the `:packageName/*` wildcard next
 * door, which resolves against the node packages' own asset roots and knows
 * nothing about this directory.
 *
 * Only the catalog's own file names are served. The wildcard route's
 * traversal guards are careful, and an allowlist of sixteen known names needs
 * no guards at all.
 *
 * This file also serves a family the bundled catalog does not carry, resolved
 * from Google Fonts at request time and cached on disk
 * (`@nodetool-ai/timeline/fonts/google-fetch`):
 * `GET .../fonts/google/:family/css` answers the `@font-face` stylesheet (or
 * 404 when the family cannot be resolved — offline, or not on Google Fonts),
 * and `GET .../fonts/google/:slug/:file` streams one cached face. The route
 * calls no canvas library: resolution is the same network+cache code the
 * server render and the agent's frame preview register faces from, minus the
 * registration step, so this process never needs `@napi-rs/canvas` just to
 * answer a stylesheet request.
 */

import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import {
  BUNDLED_FONT_FILES,
  googleFontFaceCss,
  googleFontsSlug
} from "@nodetool-ai/timeline";
import {
  googleFontsCacheDir,
  resolveGoogleFontFamily
} from "@nodetool-ai/timeline/fonts/google-fetch";
import type { HttpApiOptions } from "../http-api.js";
import { bridge } from "../lib/bridge.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

/**
 * The default a caller that names no weights gets — regular, bold and their
 * italics. `web/src/components/timeline/preview/fontLoading.ts` names the
 * document's actual weights through `?weights=`, so this only covers a
 * caller that resolves a family before it knows what will be drawn in it
 * (or an older client). A fixed guess set misses a real weight a document
 * uses (a display face at 800 or 900, common for kinetic type) and falls
 * back to whichever nearby weight *did* get fetched — `pickGoogleFontFile`'s
 * nearest-match, silently wrong rather than the exact face.
 */
const STANDARD_WEB_REQUESTS: { weight: number; style: "normal" | "italic" }[] =
  [
    { weight: 400, style: "normal" },
    { weight: 700, style: "normal" },
    { weight: 400, style: "italic" },
    { weight: 700, style: "italic" }
  ];

/**
 * Parse `?weights=400,800,900i` — a comma-separated list of weights, each
 * optionally suffixed `i` for italic — into face requests. Returns null on
 * anything unparseable or empty, so the caller falls back to the standard
 * set rather than resolving zero faces for a typo'd query string.
 */
export function parseWeightsParam(
  raw: string | undefined
): { weight: number; style: "normal" | "italic" }[] | null {
  if (raw === undefined || raw.trim() === "") return null;
  const requests: { weight: number; style: "normal" | "italic" }[] = [];
  for (const token of raw.split(",")) {
    const trimmed = token.trim();
    if (trimmed === "") continue;
    const match = /^(\d{1,3})(i)?$/.exec(trimmed);
    if (!match) return null;
    const weight = Number(match[1]);
    if (!Number.isInteger(weight) || weight < 1 || weight > 1000) return null;
    requests.push({ weight, style: match[2] ? "italic" : "normal" });
  }
  return requests.length > 0 ? requests : null;
}

interface GoogleFontManifestFace {
  style: "normal" | "italic";
  weights: [number, number];
  file: string;
}
interface GoogleFontManifest {
  family: string;
  faces: GoogleFontManifestFace[];
}

/** A year, immutable: a face's bytes never change under a given file name. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

const CONTENT_TYPES: Record<string, string> = {
  ttf: "font/ttf",
  otf: "font/otf",
  txt: "text/plain; charset=utf-8"
};

const SERVED_BUNDLED_FONTS = new Set<string>(BUNDLED_FONT_FILES);

export async function handleBundledTimelineFont(
  file: string,
  options: HttpApiOptions
): Promise<Response> {
  if (!options.bundledFontsDir || !SERVED_BUNDLED_FONTS.has(file)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const path = join(options.bundledFontsDir, file);
  try {
    const data = await readFile(path);
    const extension = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
        "content-length": String(data.length),
        "cache-control": CACHE_CONTROL
      }
    });
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}

const timelineFontRoutes: FastifyPluginAsync<RouteOptions> = async (
  app,
  opts
) => {
  const { apiOptions } = opts;
  app.get<{ Params: { file: string } }>(
    "/api/assets/packages/timeline/fonts/:file",
    async (req, reply) => {
      await bridge(req, reply, () =>
        handleBundledTimelineFont(req.params.file, apiOptions)
      );
    }
  );

  app.get<{ Params: { family: string }; Querystring: { weights?: string } }>(
    "/api/assets/packages/timeline/fonts/google/:family/css",
    async (req, reply) => {
      const family = decodeURIComponent(req.params.family).trim();
      if (family === "") {
        await reply.status(404).send({ error: "Not found" });
        return;
      }
      const requested =
        parseWeightsParam(req.query.weights) ?? STANDARD_WEB_REQUESTS;
      let resolution;
      try {
        resolution = await resolveGoogleFontFamily(family, requested);
      } catch {
        // Network error, refused host, or a malformed cache entry — the
        // browser gets the same "not available" answer it gets when the
        // family is simply not on Google Fonts, and falls back to the
        // bundled default rather than surfacing a 500 for a font name.
        resolution = null;
      }
      if (resolution === null) {
        await reply.status(404).send({ error: "Not found", available: false });
        return;
      }
      const slug = googleFontsSlug(family);
      const css = googleFontFaceCss(
        resolution.family,
        resolution.faces.map((face) => ({
          style: face.style,
          weights: face.weights,
          file: face.file.slice(face.file.lastIndexOf("/") + 1)
        })),
        `/api/assets/packages/timeline/fonts/google/${encodeURIComponent(slug)}`
      );
      await reply
        .header("content-type", "text/css; charset=utf-8")
        .header("cache-control", CACHE_CONTROL)
        .send(css);
    }
  );

  app.get<{ Params: { slug: string; file: string } }>(
    "/api/assets/packages/timeline/fonts/google/:slug/:file",
    async (req, reply) => {
      const { slug, file } = req.params;
      if (!/^[a-z0-9]+$/.test(slug)) {
        await reply.status(404).send({ error: "Not found" });
        return;
      }
      const familyDirectory = resolve(googleFontsCacheDir(), slug);
      const path = resolve(familyDirectory, file);
      if (!path.startsWith(familyDirectory + sep) || file.includes("\\")) {
        await reply.status(404).send({ error: "Not found" });
        return;
      }
      const manifestFile = join(familyDirectory, "manifest.json");
      let manifest: GoogleFontManifest;
      try {
        manifest = JSON.parse(
          await readFile(manifestFile, "utf8")
        ) as GoogleFontManifest;
      } catch {
        await reply.status(404).send({ error: "Not found" });
        return;
      }
      // Only a file this family's own resolved manifest names — the manifest
      // is written by `resolveGoogleFontFamily`, never by a request, so this
      // is an allowlist check, not a traversal guard doing double duty.
      const known = manifest.faces.some(
        (face) => face.file.slice(face.file.lastIndexOf("/") + 1) === file
      );
      if (!known) {
        await reply.status(404).send({ error: "Not found" });
        return;
      }
      let size: number;
      try {
        const stat = statSync(path);
        if (!stat.isFile()) throw new Error("not a file");
        size = stat.size;
      } catch {
        await reply.status(404).send({ error: "Not found" });
        return;
      }
      const extension = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
      await reply
        .header(
          "content-type",
          CONTENT_TYPES[extension] ?? "application/octet-stream"
        )
        .header("content-length", String(size))
        .header("cache-control", CACHE_CONTROL)
        .send(createReadStream(path));
    }
  );
};

export default timelineFontRoutes;
