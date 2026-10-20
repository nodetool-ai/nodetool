/**
 * `games.playSession`, `games.listAll` and `GET /api/game-play/:token/*` — the
 * mobile player's delivery path.
 *
 * Real database, real workspace and the real web build. The file route runs
 * with no session on purpose: the play token in the path is the credential,
 * and the route must refuse everything that token does not name.
 */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { Game, ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import gamesRoutes from "../src/routes/games.js";
import { createGamePlayToken } from "../src/lib/game-play-token.js";

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
const savedEnv = { ...process.env };

async function buildServer(): Promise<FastifyInstance> {
  // The token segment is longer than Fastify's default 100-character param
  // limit; server.ts raises it to 8000 for every route.
  const app = Fastify({ logger: false, routerOptions: { maxParamLength: 8000 } });
  app.decorateRequest("userId", null);
  await app.register(gamesRoutes, { apiOptions: {} as never });
  await app.ready();
  return app;
}

describe("mobile game play delivery", () => {
  beforeEach(async () => {
    process.env["SECRETS_MASTER_KEY"] = "game-play-route-test-key";
    initTestDb();
    workspaceDir = await mkdtemp(join(tmpdir(), "nodetool-game-play-route-"));
    assetRoot.current = join(workspaceDir, "assets");
    await mkdir(assetRoot.current);
    await Project.insertNew({ id: PROJECT_ID, user_id: USER_ID, name: "Games", kind: "game" });
    await Workspace.create({ user_id: USER_ID, project_id: PROJECT_ID, name: "Project workspace", path: workspaceDir, is_default: false });
  });

  afterEach(async () => {
    process.env = { ...savedEnv };
    ModelObserver.clear();
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("serves the published web build under a play token, with no session", async () => {
    const owner = createCaller(makeCtx(USER_ID));
    const created = await owner.games.create({ projectId: PROJECT_ID, name: "Cave Run" });
    const session = await owner.games.playSession({ id: created.game.id });
    expect(session).toMatchObject({ gameId: created.game.id, name: "Cave Run", revision: created.game.revision, dimension: "2d", orientation: null });
    expect(session.path).toMatch(/^\/api\/game-play\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/index\.html$/);
    expect(Date.parse(session.expiresAt)).toBeGreaterThan(Date.now());
    const base = session.path.slice(0, -"index.html".length);
    const app = await buildServer();
    try {
      const page = await app.inject({ method: "GET", url: session.path });
      expect(page.statusCode).toBe(200);
      expect(page.headers["content-type"]).toBe("text/html");
      expect(page.headers["referrer-policy"]).toBe("no-referrer");
      expect(page.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(page.headers["cache-control"]).toBe("private, no-store");
      expect(page.body).toContain("<canvas id=\"game\"");
      const game = await app.inject({ method: "GET", url: `${base}game.json` });
      expect(game.statusCode).toBe(200);
      expect(game.json()).toMatchObject({ id: created.game.id, revision: created.game.revision });
      const wasm = await app.inject({ method: "GET", url: `${base}emscripten-module.wasm` });
      expect(wasm.headers["content-type"]).toBe("application/wasm");
      // The manifest is not a build file, and nothing outside the manifest is reachable.
      for (const path of ["build-integrity.json", "../game.json", "assets", "missing.js", "%2e%2e/%2e%2e/game.json"]) {
        expect((await app.inject({ method: "GET", url: `${base}${path}` })).statusCode).toBe(404);
      }
    } finally {
      await app.close();
    }
  });

  it("refuses a forged, expired, or orphaned token", async () => {
    const owner = createCaller(makeCtx(USER_ID));
    const created = await owner.games.create({ projectId: PROJECT_ID, name: "Cave Run" });
    const session = await owner.games.playSession({ id: created.game.id });
    const token = session.path.split("/")[3]!;
    const buildPath = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8")).b as string;
    const app = await buildServer();
    try {
      const forged = `${token.slice(0, -2)}AA`;
      expect((await app.inject({ method: "GET", url: `/api/game-play/${forged}/index.html` })).statusCode).toBe(404);
      const expired = createGamePlayToken({ userId: USER_ID, gameId: created.game.id, buildPath }, { now: Date.now() - 60 * 60 * 1000 });
      const response = await app.inject({ method: "GET", url: `/api/game-play/${expired.token}/index.html` });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ detail: "Play link expired or not found" });
      // A valid signature for another user is not ownership of this game.
      const stranger = createGamePlayToken({ userId: "someone-else", gameId: created.game.id, buildPath });
      expect((await app.inject({ method: "GET", url: `/api/game-play/${stranger.token}/index.html` })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("hides another owner's game from the session and the list", async () => {
    const owner = createCaller(makeCtx(USER_ID));
    const created = await owner.games.create({ projectId: PROJECT_ID, name: "Cave Run" });
    const stranger = createCaller(makeCtx("someone-else"));
    await expect(stranger.games.playSession({ id: created.game.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await stranger.games.listAll()).toEqual([]);
    const listed = await owner.games.listAll();
    expect(listed.map((game) => game.id)).toEqual([created.game.id]);
    expect(await Game.listByUser(USER_ID)).toHaveLength(1);
  });

  it("reports a 3D game's dimension and drawn orientation", async () => {
    const owner = createCaller(makeCtx(USER_ID));
    const created = await owner.games.create({ projectId: PROJECT_ID, name: "Blacksite", dimension: "3d" });
    const session = await owner.games.playSession({ id: created.game.id });
    expect(session.dimension).toBe("3d");
    expect(session.orientation).toBe("landscape");
  });
});
