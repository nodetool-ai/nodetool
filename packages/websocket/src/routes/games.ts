/**
 * Native game export download — `GET /api/games/:id/export-zip`.
 *
 * The editor reads and writes games over `/trpc/games.*`; this is the one
 * non-tRPC door, because the response is a binary archive. It builds the
 * game's published revision with the same path as the `build_native_game`
 * capability, into the project workspace, and streams that build as a zip:
 * `target=web` is the static web player, `target=tauri` the desktop app
 * project.
 */

import type { FastifyPluginAsync } from "fastify";
import { bridge, streamedResponse } from "../lib/bridge.js";
import { getUserId, type HttpApiOptions } from "../http-api.js";
import { getAssetAdapter } from "../lib/storage.js";
import { streamZip } from "../lib/zip-stream.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const COMPRESSED_EXTENSIONS = new Set(["png", "jpg", "webp", "ogg", "mp3", "glb", "icns"]);

function jsonError(status: number, detail: string): Response {
  return new Response(JSON.stringify({ detail }), { status, headers: { "content-type": "application/json" } });
}

const gamesRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  app.get("/api/games/:id/export-zip", {
    schema: {
      params: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"] },
      querystring: {
        type: "object",
        properties: {
          target: { type: "string", enum: ["web", "tauri"] },
          revision: { type: "string", pattern: "^[a-f0-9]{32}$" }
        },
        additionalProperties: false
      }
    }
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { target?: "web" | "tauri"; revision?: string };
    await bridge(req, reply, async (request) => {
      const userId = getUserId(request, apiOptions.userIdHeader ?? "x-user-id");
      const target = query.target ?? "web";
      const { buildOwnedNativeGame } = await import("@nodetool-ai/agents/game-build");
      const built = await buildOwnedNativeGame({ userId, gameId: id, revision: query.revision, target, storage: getAssetAdapter(),
        signal: request.signal });
      if ("error" in built) {
        // Another owner's game is an absence, not a refusal.
        return jsonError(built.error === "Game not found" || built.error === "Game revision not found" ? 404 : 422, built.error);
      }
      const { workspace, build_path: buildPath } = built;
      const entries = (await workspace.list(buildPath, { recursive: true }))
        .filter((entry) => !entry.isDirectory)
        .sort((a, b) => a.path.localeCompare(b.path));
      const prefix = `${buildPath}/`;
      const folder = target === "tauri" ? "desktop" : "web";
      const body = streamZip(async (writer) => {
        for (const entry of entries) {
          const relative = entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.path;
          const bytes = await workspace.read(entry.path);
          if (!bytes) { throw new Error(`Build file disappeared: ${relative}`); }
          const extension = relative.slice(relative.lastIndexOf(".") + 1).toLowerCase();
          await writer.add(`${folder}/${relative}`, bytes, { compress: !COMPRESSED_EXTENSIONS.has(extension) });
        }
      });
      return streamedResponse(body, {
        status: 200,
        headers: {
          "content-type": "application/zip",
          "content-disposition": `attachment; filename="game-${built.game_id.slice(0, 12)}-${folder}.zip"`,
          "cache-control": "no-store"
        }
      });
    });
    // A streamed body is still being sent when bridge returns.
    return reply;
  });
};

export default gamesRoutes;
