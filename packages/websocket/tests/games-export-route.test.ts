/**
 * `GET /api/games/:id/export-zip` — the editor's export download.
 *
 * Real database, real workspace and the real build path. What is pinned here
 * is the HTTP surface: the archive layout for each target, and that another
 * owner's game is not found.
 */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { unzipSync, strFromU8 } from "fflate";
import { ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import gamesRoutes from "../src/routes/games.js";

const USER_ID = "game-owner";
const PROJECT_ID = "game-project";
const assetRoot = vi.hoisted(() => ({ current: "" }));
vi.mock("../src/lib/storage.js", async () => {
  const { FileStorageAdapter } = await import("@nodetool-ai/storage");
  return { getAssetAdapter: () => new FileStorageAdapter(assetRoot.current) };
});

const createCaller = createCallerFactory(appRouter);
const makeCtx = (userId: string): Context => ({
  userId,
  registry: {} as never,
  apiOptions: { metadataRoots: [], registry: {} as never } as never,
  pythonBridge: {} as never,
  getPythonBridgeReady: () => false
}) as Context;

let workspaceDir: string;

async function buildServer(userId: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => { req.userId = userId; });
  await app.register(gamesRoutes, { apiOptions: {} as never });
  await app.ready();
  return app;
}

describe("game export download", () => {
  beforeEach(async () => {
    initTestDb();
    workspaceDir = await mkdtemp(join(tmpdir(), "nodetool-game-export-route-"));
    assetRoot.current = join(workspaceDir, "assets");
    await mkdir(assetRoot.current);
    await Project.insertNew({ id: PROJECT_ID, user_id: USER_ID, name: "Games", kind: "game" });
    await Workspace.create({ user_id: USER_ID, project_id: PROJECT_ID, name: "Project workspace", path: workspaceDir, is_default: false });
  });

  afterEach(async () => {
    ModelObserver.clear();
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("streams the published revision as a Tauri desktop project", async () => {
    const created = await createCaller(makeCtx(USER_ID)).games.create({ projectId: PROJECT_ID, name: "Cave Run" });
    const app = await buildServer(USER_ID);
    try {
      const response = await app.inject({ method: "GET", url: `/api/games/${created.game.id}/export-zip?target=tauri` });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("application/zip");
      expect(response.headers["content-disposition"]).toBe(`attachment; filename="game-${created.game.id.slice(0, 12)}-desktop.zip"`);
      const files = unzipSync(new Uint8Array(response.rawPayload));
      expect(Object.keys(files)).toEqual(expect.arrayContaining(["desktop/package.json", "desktop/dist/index.html", "desktop/dist/game.json",
        "desktop/src-tauri/Cargo.toml", "desktop/src-tauri/src/main.rs", "desktop/src-tauri/icons/icon.icns"]));
      const config = JSON.parse(strFromU8(files["desktop/src-tauri/tauri.conf.json"]!)) as { productName: string };
      expect(config.productName).toBe("Cave Run");
      expect(JSON.parse(strFromU8(files["desktop/dist/game.json"]!)).revision).toBe(created.game.revision);
    } finally {
      await app.close();
    }
  });

  it("streams the web player, and hides another owner's game", async () => {
    const created = await createCaller(makeCtx(USER_ID)).games.create({ projectId: PROJECT_ID, name: "Cave Run" });
    const owner = await buildServer(USER_ID);
    const stranger = await buildServer("someone-else");
    try {
      const web = await owner.inject({ method: "GET", url: `/api/games/${created.game.id}/export-zip` });
      expect(web.statusCode).toBe(200);
      expect(Object.keys(unzipSync(new Uint8Array(web.rawPayload)))).toEqual(expect.arrayContaining(["web/index.html", "web/game.json"]));
      const hidden = await stranger.inject({ method: "GET", url: `/api/games/${created.game.id}/export-zip?target=tauri` });
      expect(hidden.statusCode).toBe(404);
      expect(hidden.json()).toEqual({ detail: "Game not found" });
      const invalid = await owner.inject({ method: "GET", url: `/api/games/${created.game.id}/export-zip?target=electron` });
      expect(invalid.statusCode).toBe(400);
    } finally {
      await owner.close();
      await stranger.close();
    }
  });
});
