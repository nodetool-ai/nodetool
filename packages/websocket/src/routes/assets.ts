import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import {
  handleAssetsRoot,
  handleAssetsSearch,
  handleAssetByFilename,
  handleAssetRecursive,
  handleAssetThumbnail,
  handleAssetById,
  getUserId,
  parseLimit,
} from "../http-api.js";
import { Asset } from "@nodetool/models";
import { loadPythonPackageMetadata } from "@nodetool/node-sdk";

interface RouteOptions { apiOptions: HttpApiOptions }

const assetsRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  // Static sub-routes first
  app.get("/api/assets/search", async (req, reply) => {
    await bridge(req, reply, (request) => handleAssetsSearch(request, apiOptions));
  });

  app.get("/api/assets/packages", async (_req, reply) => {
    reply.send({ assets: [], next: null });
  });

  app.post("/api/assets/download", async (_req, reply) => {
    reply.status(501).send({ detail: "ZIP download not available in standalone mode" });
  });

  app.get("/api/assets/by-filename", async (req, reply) => {
    await bridge(req, reply, (request) => handleAssetByFilename(request, "", apiOptions));
  });

  app.get("/api/assets/by-filename/:filename", async (req, reply) => {
    const { filename } = req.params as { filename: string };
    let decoded: string;
    try {
      decoded = decodeURIComponent(filename);
    } catch {
      reply.status(400).send({ detail: "Invalid URL encoding" });
      return;
    }
    await bridge(req, reply, (request) =>
      handleAssetByFilename(request, decoded, apiOptions)
    );
  });

  // /api/assets/packages/:packageName (list) and /api/assets/packages/:packageName/:assetName
  app.get("/api/assets/packages/:packageName", async (_req, reply) => {
    reply.send({ assets: [], next: null });
  });

  app.get("/api/assets/packages/:packageName/:assetName", async (req, reply) => {
    const { packageName, assetName } = req.params as { packageName: string; assetName: string };
    await bridge(req, reply, async (_request) => {
      let pkgName: string;
      let aName: string;
      try {
        pkgName = decodeURIComponent(packageName);
        aName = decodeURIComponent(assetName);
      } catch {
        return new Response(JSON.stringify({ detail: "Invalid URL encoding" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      if (!pkgName || !aName || pkgName.includes("..") || aName.includes("..") || pkgName.includes("/") || aName.includes("/") || pkgName.includes("\\") || aName.includes("\\")) {
        return new Response(JSON.stringify({ detail: "Not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      const loaded = loadPythonPackageMetadata({
        roots: apiOptions.metadataRoots,
        maxDepth: apiOptions.metadataMaxDepth,
      });
      const pkg = loaded.packages.find((p) => p.name === pkgName);
      if (!pkg || !pkg.sourceFolder) {
        return new Response(JSON.stringify({ detail: `Package '${pkgName}' not found` }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      const { createReadStream, statSync } = await import("node:fs");
      const { extname, resolve } = await import("node:path");
      const mimeTypes: Record<string, string> = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
        ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".webm": "video/webm",
        ".json": "application/json", ".txt": "text/plain",
      };
      const baseDir = resolve(`${pkg.sourceFolder}/nodetool/assets/${pkgName}`);
      const assetPath = resolve(baseDir, aName);
      // Prevent path traversal: resolved path must stay within the base directory
      if (!assetPath.startsWith(baseDir + "/") && assetPath !== baseDir) {
        return new Response(JSON.stringify({ detail: "Not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      let fileStat: { size: number; mtimeMs: number };
      try {
        fileStat = statSync(assetPath);
      } catch {
        return new Response(JSON.stringify({ detail: `Asset '${aName}' not found in package '${pkgName}'` }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      const contentType = mimeTypes[extname(aName).toLowerCase()] ?? "application/octet-stream";
      const stream = createReadStream(assetPath);
      const webStream = new ReadableStream({
        start(controller) {
          stream.on("data", (chunk) => {
            try { controller.enqueue(chunk); } catch { /* Intentional: stream already closed by consumer; destroy source */ stream.destroy(); }
          });
          stream.on("end", () => {
            try { controller.close(); } catch { /* Intentional: controller already closed */ }
          });
          stream.on("error", (err) => {
            try { controller.error(err); } catch { /* Intentional: controller already errored/closed */ }
          });
        },
        cancel() { stream.destroy(); },
      });
      return new Response(webStream, {
        status: 200,
        headers: {
          "content-type": contentType,
          "content-length": String(fileStat.size),
          "cache-control": "public, max-age=31536000, immutable",
          "etag": `"${pkgName}-${aName}-${fileStat.size}-${fileStat.mtimeMs}"`,
        },
      });
    });
  });

  // Sub-resource routes for /:id
  app.get("/api/assets/:id/children", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, async (request) => {
      const userId = getUserId(request, apiOptions.userIdHeader ?? "x-user-id");
      const url = new URL(request.url);
      const limit = parseLimit(url, 100);
      const [assets] = await Asset.paginate(userId, { parentId: decodeURIComponent(id), limit });
      return new Response(
        JSON.stringify({ assets: assets.map((a: any) => ({ id: a.id, name: a.name, content_type: a.content_type })), next: null }),
        { headers: { "content-type": "application/json" } }
      );
    });
  });

  app.get("/api/assets/:id/recursive", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleAssetRecursive(request, decodeURIComponent(id), apiOptions)
    );
  });

  app.get("/api/assets/:id/thumbnail", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleAssetThumbnail(request, decodeURIComponent(id), apiOptions)
    );
  });
  app.post("/api/assets/:id/thumbnail", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleAssetThumbnail(request, decodeURIComponent(id), apiOptions)
    );
  });

  // Root CRUD
  app.get("/api/assets", async (req, reply) => {
    await bridge(req, reply, (request) => handleAssetsRoot(request, apiOptions));
  });
  app.post("/api/assets", async (req, reply) => {
    await bridge(req, reply, (request) => handleAssetsRoot(request, apiOptions));
  });

  // Generic /:id (GET/PUT/DELETE)
  app.get("/api/assets/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleAssetById(request, decodeURIComponent(id), apiOptions)
    );
  });
  app.put("/api/assets/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleAssetById(request, decodeURIComponent(id), apiOptions)
    );
  });
  app.delete("/api/assets/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleAssetById(request, decodeURIComponent(id), apiOptions)
    );
  });
};

export default assetsRoutes;
