/**
 * Native game builds outside tRPC, because neither answer is JSON.
 *
 * `GET /api/games/:id/export-zip` builds the game's published revision with
 * the same path as the `build_native_game` capability, into the project
 * workspace, and streams that build as a zip: `target=web` is the static web
 * player, `target=tauri` the desktop app project.
 *
 * `POST /api/games/:id/build-executable` builds the desktop app project and
 * compiles it with cargo on this machine, streaming cargo's output as
 * newline-delimited JSON events. It runs a compiler on the server, so the
 * cloud profile refuses it.
 */

import { chmod, copyFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { PassThrough } from "node:stream";
import type { FastifyPluginAsync } from "fastify";
import { importPack } from "@nodetool-ai/node-catalog";
import { CLOUD_PROFILE_ENV, NODE_ENV_VAR, isCloudProfileActive, missingRuntimePackageOf } from "@nodetool-ai/protocol";
import { bridge, streamedResponse } from "../lib/bridge.js";
import { getUserId, type HttpApiOptions } from "../http-api.js";
import { getAssetAdapter } from "../lib/storage.js";
import { streamZip } from "../lib/zip-stream.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const COMPRESSED_EXTENSIONS = new Set(["png", "jpg", "webp", "ogg", "mp3", "glb", "icns"]);

function jsonError(status: number, detail: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ detail, ...extra }), { status, headers: { "content-type": "application/json" } });
}

const GAME_ID_PARAMS = { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"] } as const;

/** One line of the build-executable stream. */
export type GameExecutableBuildEvent =
  | { readonly type: "status"; readonly message: string; readonly project_path: string }
  | { readonly type: "log"; readonly line: string }
  | { readonly type: "done"; readonly binary_path: string; readonly project_path: string }
  | { readonly type: "error"; readonly detail: string; readonly runtime_package?: string };

const gamesRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  app.get("/api/games/:id/export-zip", {
    schema: {
      params: GAME_ID_PARAMS,
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

  app.post("/api/games/:id/build-executable", { schema: { params: GAME_ID_PARAMS } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    // Closing the request (the editor navigating away) stops cargo.
    const abort = new AbortController();
    reply.raw.on("close", () => { if (!reply.raw.writableFinished) { abort.abort(); } });
    await bridge(req, reply, async (request) => {
      if (isCloudProfileActive(process.env[CLOUD_PROFILE_ENV], process.env[NODE_ENV_VAR])) {
        return jsonError(403, "Building an executable runs a compiler on the server, so it is available only in the desktop app and on a local server. Export the desktop app project instead.");
      }
      const userId = getUserId(request, apiOptions.userIdHeader ?? "x-user-id");
      const { findCargo, compileTauriGameProject } = await importPack<typeof import("@nodetool-ai/game-renderer/build-tauri")>("game", "@nodetool-ai/game-renderer/build-tauri");
      if (!(await findCargo())) {
        return jsonError(503, "cargo was not found. Install Rust from the Package Manager, or from https://rustup.rs, to build the executable.",
          { runtime_package: "rust" });
      }
      const { buildOwnedNativeGame } = await import("@nodetool-ai/agents/game-build");
      const built = await buildOwnedNativeGame({ userId, gameId: id, target: "tauri", storage: getAssetAdapter(), signal: abort.signal });
      if ("error" in built) {
        return jsonError(built.error === "Game not found" || built.error === "Game revision not found" ? 404 : 422, built.error);
      }
      const localDir = built.workspace.localDir;
      if (!localDir || !built.app) {
        return jsonError(422, "Building an executable needs a project workspace on this machine's disk.");
      }
      const app = built.app;
      const projectDir = join(localDir, built.build_path);
      const out = new PassThrough();
      const send = (event: GameExecutableBuildEvent): void => { out.write(`${JSON.stringify(event)}\n`); };
      void (async () => {
        let pending = "";
        const flush = (final: boolean): void => {
          const lines = pending.split(/\r?\n/);
          pending = final ? "" : lines.pop() ?? "";
          for (const line of lines) { if (line.trim()) { send({ type: "log", line }); } }
        };
        try {
          send({ type: "status", message: `Compiling ${app.productName} with cargo`, project_path: projectDir });
          // Every game shares one target directory, so only the first build compiles Tauri itself.
          const { binaryPath } = await compileTauriGameProject({ tauriDir: join(projectDir, "src-tauri"), metadata: app }, {
            env: { ...process.env, CARGO_TARGET_DIR: join(localDir, "game-builds", ".tauri-target") },
            signal: abort.signal,
            onOutput: (chunk) => { pending += chunk; flush(false); }
          });
          flush(true);
          const binDir = join(projectDir, "bin");
          await mkdir(binDir, { recursive: true });
          const destination = join(binDir, basename(binaryPath));
          await copyFile(binaryPath, destination);
          await chmod(destination, 0o755);
          send({ type: "done", binary_path: destination, project_path: projectDir });
        } catch (error) {
          flush(true);
          const runtimePackage = missingRuntimePackageOf(error);
          const detail = error instanceof Error ? error.message : String(error);
          send(runtimePackage ? { type: "error", detail, runtime_package: runtimePackage } : { type: "error", detail });
        } finally {
          out.end();
        }
      })();
      return streamedResponse(out, {
        status: 200,
        headers: { "content-type": "application/x-ndjson", "cache-control": "no-store", "x-content-type-options": "nosniff" }
      });
    });
    return reply;
  });
};

export default gamesRoutes;
