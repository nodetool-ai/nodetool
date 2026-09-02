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
 */

import { createReadStream } from "node:fs";
import { statSync } from "node:fs";
import { join } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { BUNDLED_FONT_FILES } from "@nodetool-ai/timeline";
import type { HttpApiOptions } from "../http-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

/** A year, immutable: a face's bytes never change under a given file name. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

const CONTENT_TYPES: Record<string, string> = {
  ttf: "font/ttf",
  otf: "font/otf",
  txt: "text/plain; charset=utf-8"
};

const timelineFontRoutes: FastifyPluginAsync<RouteOptions> = async (
  app,
  opts
) => {
  const { apiOptions } = opts;
  const served = new Set<string>(BUNDLED_FONT_FILES);

  app.get<{ Params: { file: string } }>(
    "/api/assets/packages/timeline/fonts/:file",
    async (req, reply) => {
      const dir = apiOptions.bundledFontsDir;
      const file = req.params.file;
      if (dir === undefined || !served.has(file)) {
        await reply.status(404).send({ error: "Not found" });
        return;
      }
      const path = join(dir, file);
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
        .header("content-type", CONTENT_TYPES[extension] ?? "application/octet-stream")
        .header("content-length", String(size))
        .header("cache-control", CACHE_CONTROL)
        .send(createReadStream(path));
    }
  );
};

export default timelineFontRoutes;
