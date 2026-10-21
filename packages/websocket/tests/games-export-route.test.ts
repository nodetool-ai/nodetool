/**
 * `GET /api/games/:id/export-zip` and `POST /api/games/:id/build-executable`
 * — the editor's export download and its desktop executable build.
 *
 * Real database, real workspace and the real build path. What is pinned here
 * is the HTTP surface: the archive layout for each target, that another
 * owner's game is not found, and the build stream's events. A Node program
 * stands in for cargo, so the stream is tested without a Rust toolchain.
 */
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
const savedEnv = { ...process.env };

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
    process.env = { ...savedEnv };
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

  it("streams the published revision as an Expo mobile project", async () => {
    const created = await createCaller(makeCtx(USER_ID)).games.create({ projectId: PROJECT_ID, name: "Cave Run" });
    const app = await buildServer(USER_ID);
    try {
      const response = await app.inject({ method: "GET", url: `/api/games/${created.game.id}/export-zip?target=expo` });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-disposition"]).toBe(`attachment; filename="game-${created.game.id.slice(0, 12)}-mobile.zip"`);
      const files = unzipSync(new Uint8Array(response.rawPayload));
      expect(Object.keys(files)).toEqual(expect.arrayContaining(["mobile/package.json", "mobile/app.json", "mobile/App.js",
        "mobile/metro.config.js", "mobile/assets/icon.png", "mobile/assets/game/game.html"]));
      const config = JSON.parse(strFromU8(files["mobile/app.json"]!)) as { expo: { name: string; android: { package: string } } };
      expect(config.expo.name).toBe("Cave Run");
      expect(config.expo.android.package).toBe("ai.nodetool.game.caverun");
      expect(strFromU8(files["mobile/assets/game/game.html"]!)).toContain(`"game.json":"`);
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

  it("offers the Rust package when cargo is missing", async () => {
    const created = await createCaller(makeCtx(USER_ID)).games.create({ projectId: PROJECT_ID, name: "Cave Run" });
    process.env["PATH"] = join(workspaceDir, "no-bin");
    process.env["CARGO_HOME"] = join(workspaceDir, "no-cargo");
    const app = await buildServer(USER_ID);
    try {
      const response = await app.inject({ method: "POST", url: `/api/games/${created.game.id}/build-executable` });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ runtime_package: "rust" });
    } finally {
      await app.close();
    }
  });

  it("refuses to run a compiler under the cloud profile", async () => {
    const created = await createCaller(makeCtx(USER_ID)).games.create({ projectId: PROJECT_ID, name: "Cave Run" });
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    const app = await buildServer(USER_ID);
    try {
      const response = await app.inject({ method: "POST", url: `/api/games/${created.game.id}/build-executable` });
      expect(response.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it.skipIf(process.platform === "win32").each([true, false])("streams Cargo output and requires its executable artifact (reported=%s)", async (reported) => {
    const created = await createCaller(makeCtx(USER_ID)).games.create({ projectId: PROJECT_ID, name: "Cave Run" });
    const bin = join(workspaceDir, "bin");
    await mkdir(bin);
    await writeFile(join(bin, "cargo"), `#!${process.execPath}
      const {mkdir,realpath,writeFile} = require("node:fs/promises");
      const {join} = require("node:path");
      (async () => {
        console.log("   Compiling cave-run v1.0.0");
        console.error("warning: unused variable");
        const output = join(process.env.CARGO_TARGET_DIR, "release");
        await mkdir(output, {recursive:true});
        const executable = join(output, "cave-run");
        await writeFile(executable, "game binary");
        if (${reported}) {
          console.log(JSON.stringify({reason:"compiler-artifact",manifest_path:await realpath("Cargo.toml"),
            target:{name:"cave-run",kind:["bin"]},executable}));
        }
        console.log("    Finished release");
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `);
    await chmod(join(bin, "cargo"), 0o755);
    process.env["PATH"] = `${bin}:${savedEnv["PATH"] ?? ""}`;
    const app = await buildServer(USER_ID);
    try {
      const response = await app.inject({ method: "POST", url: `/api/games/${created.game.id}/build-executable` });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("application/x-ndjson");
      const events = response.body.trim().split("\n").map((line) => JSON.parse(line) as Record<string, string>);
      expect(events[0]).toMatchObject({ type: "status", message: "Compiling Cave Run with cargo" });
      const lines = events.filter((event) => event.type === "log").map((event) => event.line);
      expect(lines).toEqual(expect.arrayContaining(["   Compiling cave-run v1.0.0", "warning: unused variable", "    Finished release"]));
      const done = events.at(-1)!;
      if (!reported) {
        expect(done).toMatchObject({ type: "error", detail: expect.stringContaining("executable") });
        expect(events.some((event) => event.type === "done")).toBe(false);
        return;
      }
      expect(done).toMatchObject({ type: "done" });
      expect(done.binary_path).toBe(join(done.project_path!, "bin", "cave-run"));
      expect(await readFile(done.binary_path!, "utf8")).toBe("game binary");
    } finally {
      await app.close();
    }
  });
});
