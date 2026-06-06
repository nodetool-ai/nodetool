import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import { handleAssetsRoot } from "../http-api.js";
import { loadPythonPackageMetadata } from "@nodetool-ai/node-sdk";
import { ApiErrorCode, apiError } from "../error-codes.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

/**
 * Assets REST plugin — only binary + multipart endpoints remain here.
 * JSON CRUD + list + search + by-filename + children + recursive moved to
 * the tRPC `assets` router.
 *
 * Still served via REST:
 *   - POST   /api/assets                            — multipart file upload
 *   - POST   /api/assets/download                   — 501 stub (ZIP download)
 *   - GET    /api/assets/packages                   — empty list stub
 *   - GET    /api/assets/packages/:package          — empty list stub
 *   - GET    /api/assets/packages/:package/:asset   — binary asset file stream
 */
const assetsRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  // Stub: no package listing in standalone mode.
  app.get("/api/assets/packages", async (_req, reply) => {
    reply.send({ assets: [], next: null });
  });

  // Stub: ZIP download not available in standalone mode.
  app.post("/api/assets/download", async (_req, reply) => {
    reply
      .status(501)
      .send(
        apiError(
          ApiErrorCode.SERVICE_UNAVAILABLE,
          "ZIP download not available in standalone mode"
        )
      );
  });

  // Per-package asset listing (stub) and binary file streaming.
  app.get("/api/assets/packages/:packageName", async (_req, reply) => {
    reply.send({ assets: [], next: null });
  });

  app.get(
    "/api/assets/packages/:packageName/*",
    async (req, reply) => {
      const params = req.params as { packageName: string; "*": string };
      await bridge(req, reply, async (_request) => {
        let pkgName: string;
        let aName: string;
        try {
          pkgName = decodeURIComponent(params.packageName);
          aName = decodeURIComponent(params["*"] ?? "");
        } catch {
          return new Response(
            JSON.stringify(
              apiError(ApiErrorCode.INVALID_INPUT, "Invalid URL encoding")
            ),
            {
              status: 400,
              headers: { "content-type": "application/json" }
            }
          );
        }
        // `aName` may be a nested path (e.g. `audio/loop.mp3`). Reject empty,
        // backslash, and traversal segments; `..` is checked per-segment.
        const segments = aName.split("/");
        if (
          !pkgName ||
          !aName ||
          pkgName === "." ||
          pkgName === ".." ||
          pkgName.includes("/") ||
          pkgName.includes("\\") ||
          aName.includes("\\") ||
          segments.some((s) => s === "" || s === "." || s === "..")
        ) {
          return new Response(
            JSON.stringify(apiError(ApiErrorCode.ASSET_NOT_FOUND, "Not found")),
            {
              status: 404,
              headers: { "content-type": "application/json" }
            }
          );
        }
        const { createReadStream, statSync } = await import("node:fs");
        const { extname, resolve, relative, isAbsolute } = await import(
          "node:path"
        );
        const mimeTypes: Record<string, string> = {
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".svg": "image/svg+xml",
          ".mp3": "audio/mpeg",
          ".wav": "audio/wav",
          ".mp4": "video/mp4",
          ".webm": "video/webm",
          ".json": "application/json",
          ".txt": "text/plain"
        };

        // Resolve `<baseDir>/<segments...>` with a separator-agnostic
        // containment guard (works on Windows, where startsWith(baseDir + "/")
        // would not).
        const tryServe = (
          baseDir: string
        ): { path: string; size: number; mtimeMs: number } | null => {
          const candidate = resolve(baseDir, ...segments);
          const rel = relative(baseDir, candidate);
          if (rel.startsWith("..") || isAbsolute(rel)) {
            return null;
          }
          try {
            const st = statSync(candidate);
            if (!st.isFile()) return null;
            return { path: candidate, size: st.size, mtimeMs: st.mtimeMs };
          } catch {
            return null;
          }
        };

        // Configured bundled roots first (no Python needed). Only fall back to
        // Python package metadata — which walks the filesystem — when the asset
        // isn't found in a configured root, keeping the hot path cheap.
        let hit: { path: string; size: number; mtimeMs: number } | null = null;
        for (const root of apiOptions.packageAssetsRoots ?? []) {
          hit = tryServe(resolve(root, pkgName));
          if (hit) break;
        }
        if (!hit) {
          const loaded = loadPythonPackageMetadata({
            roots: apiOptions.metadataRoots,
            maxDepth: apiOptions.metadataMaxDepth
          });
          const pkg = loaded.packages.find((p) => p.name === pkgName);
          if (pkg?.sourceFolder) {
            hit = tryServe(
              resolve(`${pkg.sourceFolder}/nodetool/assets/${pkgName}`)
            );
          }
        }
        if (!hit) {
          return new Response(
            JSON.stringify(
              apiError(
                ApiErrorCode.ASSET_NOT_FOUND,
                `Asset '${aName}' not found in package '${pkgName}'`
              )
            ),
            {
              status: 404,
              headers: { "content-type": "application/json" }
            }
          );
        }
        const assetPath = hit.path;
        const fileStat = { size: hit.size, mtimeMs: hit.mtimeMs };
        const contentType =
          mimeTypes[extname(aName).toLowerCase()] ?? "application/octet-stream";
        const stream = createReadStream(assetPath);
        const webStream = new ReadableStream({
          start(controller) {
            stream.on("data", (chunk) => {
              try {
                controller.enqueue(chunk);
              } catch {
                stream.destroy();
              }
            });
            stream.on("end", () => {
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            });
            stream.on("error", (err) => {
              try {
                controller.error(err);
              } catch {
                /* already errored */
              }
            });
          },
          cancel() {
            stream.destroy();
          }
        });
        return new Response(webStream, {
          status: 200,
          headers: {
            "content-type": contentType,
            "content-length": String(fileStat.size),
            "cache-control": "public, max-age=31536000, immutable",
            etag: `"${pkgName}-${aName}-${fileStat.size}-${fileStat.mtimeMs}"`
          }
        });
      });
    }
  );

  // Multipart asset upload (file POST). The handler also accepts JSON bodies,
  // but the tRPC `assets.create` procedure is the preferred path for JSON.
  app.post("/api/assets", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleAssetsRoot(request, apiOptions)
    );
  });
};

export default assetsRoutes;
