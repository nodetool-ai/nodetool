import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Asset, Game, ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { parsePackageAssetUri } from "@nodetool-ai/protocol";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { retrieveAssetBytes } from "../src/lib/asset-paths.js";
import { getAssetAdapter } from "../src/lib/storage.js";
import {
  getExampleGameBundle,
  listExampleGames,
  readExampleGameFile,
  resolveExampleGamesDir
} from "../src/lib/example-games.js";

const USER_ID = "example-player";
const PROJECT_ID = "example-project";
const assetRoot = vi.hoisted(() => ({ current: "" }));
vi.mock("../src/lib/storage.js", async () => {
  const { FileStorageAdapter } = await import("@nodetool-ai/storage");
  return { getAssetAdapter: () => new FileStorageAdapter(assetRoot.current) };
});

const baseNodes = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), "../../base-nodes/nodetool");
const examplesDir = nodePath.join(baseNodes, "examples", "nodetool-base");
const options = { examplesDir };
const createCaller = createCallerFactory(appRouter);
let workspaceDir: string;

const makeCtx = (): Context =>
  ({
    userId: USER_ID,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never, examplesDir } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  }) as Context;

describe("example games", () => {
  beforeEach(async () => {
    initTestDb();
    workspaceDir = await mkdtemp(nodePath.join(tmpdir(), "nodetool-example-game-"));
    assetRoot.current = nodePath.join(workspaceDir, "assets");
    await mkdir(assetRoot.current);
    await Project.insertNew({ id: PROJECT_ID, user_id: USER_ID, name: "Games", kind: "game" });
    await Workspace.create({
      user_id: USER_ID,
      project_id: PROJECT_ID,
      name: "Project workspace",
      path: workspaceDir,
      is_default: false
    });
  });

  afterEach(async () => {
    ModelObserver.clear();
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("reads a playable example without installing game or asset rows", async () => {
    const caller = createCaller(makeCtx());
    const result = await caller.games.example({ slug: "kindle" });
    expect(result.name).toBe("Kindle");
    expect(Object.values(result.document.assets).some((binding) => binding.assetId.startsWith("package://"))).toBe(true);
    expect(await Game.listByProject(USER_ID, PROJECT_ID)).toEqual([]);
    expect(await Asset.listByProject(USER_ID, PROJECT_ID)).toEqual([]);
    await expect(caller.games.example({ slug: "../kindle" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("finds the shipped games, their posters, and every bound media file", () => {
    expect(resolveExampleGamesDir(options)).toBe(nodePath.join(baseNodes, "examples", "games"));
    const games = listExampleGames(options);
    expect(games.map((game) => game.slug)).toEqual(["aether", "blacksite", "kindle", "lumen", "neon-drift"]);
    let checked = 0;
    for (const game of games) {
      const poster = parsePackageAssetUri(game.posterUri);
      expect(poster).not.toBeNull();
      expect(existsSync(nodePath.join(baseNodes, "assets", poster!.packageName, poster!.path))).toBe(true);
      const bundle = getExampleGameBundle(options, game.slug)!;
      for (const [slot, binding] of Object.entries(bundle.document.assets)) {
        const bytes = readExampleGameFile(options, binding.assetId);
        expect(bytes, `${game.slug}/${slot}`).not.toBeNull();
        expect(createHash("sha256").update(bytes!).digest("hex"), `${game.slug}/${slot}`).toBe(binding.digest);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(getExampleGameBundle(options, "../kindle")).toBeNull();
    expect(readExampleGameFile(options, "package://nodetool-base/../../examples/games/kindle.game.json")).toBeNull();
  });

  it.each(["neon-drift", "blacksite", "aether"])("installs %s with owned media and its original dimension", async (slug) => {
    const caller = createCaller(makeCtx());
    const bundle = getExampleGameBundle(options, slug)!;
    const installed = await caller.games.installExample({ slug, projectId: PROJECT_ID });

    expect(installed.game.name).toBe(bundle.name);
    expect(installed.document.schemaVersion).toBe(bundle.document.schemaVersion);
    expect(installed.document.scenes.map((scene) => scene.id)).toEqual(bundle.document.scenes.map((scene) => scene.id));
    expect(Object.keys(installed.document.assets)).toEqual(Object.keys(bundle.document.assets));
    for (const [slot, binding] of Object.entries(installed.document.assets)) {
      const asset = await Asset.find(USER_ID, binding.assetId);
      expect(asset, slot).not.toBeNull();
      expect(asset!.project_id).toBe(PROJECT_ID);
      expect(binding.assetId).toMatch(/^[a-f0-9]{32}$/);
      if (slot === "facility") { expect(asset!.content_type).toBe("model/gltf-binary"); }
      const stored = await retrieveAssetBytes(getAssetAdapter(), USER_ID, asset!.id, asset!.content_type);
      expect(stored, slot).not.toBeNull();
      expect(createHash("sha256").update(stored!).digest("hex")).toBe(binding.digest);
      expect(binding.digest).toBe(bundle.document.assets[slot]!.digest);
    }
    expect((await caller.games.get({ id: installed.game.id })).document.assets).toEqual(installed.document.assets);
  });

  it("refuses an unknown example without creating assets", async () => {
    const caller = createCaller(makeCtx());
    await expect(caller.games.installExample({ slug: "missing", projectId: PROJECT_ID })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await caller.games.list({ projectId: PROJECT_ID })).toEqual([]);
  });
});
