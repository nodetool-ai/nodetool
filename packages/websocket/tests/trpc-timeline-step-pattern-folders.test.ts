/**
 * `timeline.stepPatternFolders` — tRPC.
 *
 * Uses a real SQLite test database (`initTestDb`) and a temporary
 * `FileStorageAdapter` so every rename and delete executes the real atomic DB
 * transaction, JSON byte update, ownership enforcement, and halfway failure
 * rollback end-to-end.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileStorageAdapter } from "@nodetool-ai/storage";

const storageDir = mkdtempSync(join(tmpdir(), "nodetool-step-pattern-folders-"));
const testAdapter = new FileStorageAdapter(storageDir);

vi.mock("@nodetool-ai/asset-services/storage", () => ({
  getAssetAdapter: () => testAdapter,
  getTempAdapter: () => testAdapter
}));

import {
  Asset,
  ModelObserver,
  closeDb,
  getRawDb,
  initTestDb
} from "@nodetool-ai/models";
import { directoryFolderId } from "@nodetool-ai/protocol";
import {
  STEP_PATTERN_ASSET_CONTENT_TYPE,
  STEP_PATTERN_FOLDER_METADATA_KEY,
  STEP_PATTERN_METADATA_KEY,
  patternFromText
} from "@nodetool-ai/timeline";
import { getAssetStorageKey } from "../src/lib/asset-paths.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);
const USER_ID = "trpc-step-folder-user";
const OTHER_USER = "trpc-step-folder-other";

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: USER_ID,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

async function seedFolderMarker(opts: {
  id?: string;
  userId?: string;
  kind?: "pattern" | "template";
  name: string;
  folder: string;
}) {
  const userId = opts.userId ?? USER_ID;
  const kind = opts.kind ?? "pattern";
  const asset = await Asset.create<Asset>({
    ...(opts.id ? { id: opts.id } : {}),
    user_id: userId,
    project_id: "default",
    parent_id: directoryFolderId(userId, `personal:${userId}`, opts.folder),
    name: `folder-${opts.name.toLowerCase()}.step-pattern.json`,
    content_type: STEP_PATTERN_ASSET_CONTENT_TYPE,
    metadata: {
      [STEP_PATTERN_FOLDER_METADATA_KEY]: {
        kind,
        name: opts.name,
        folder: opts.folder
      }
    }
  });
  const key = getAssetStorageKey(userId, asset.id, STEP_PATTERN_ASSET_CONTENT_TYPE);
  await testAdapter.store(
    key,
    new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        entryType: "folder",
        kind,
        name: opts.name,
        folder: opts.folder
      })
    ),
    STEP_PATTERN_ASSET_CONTENT_TYPE
  );
  return asset;
}

async function seedPattern(opts: {
  id?: string;
  userId?: string;
  kind?: "pattern" | "template";
  name: string;
  folder: string;
}) {
  const userId = opts.userId ?? USER_ID;
  const kind = opts.kind ?? "pattern";
  const asset = await Asset.create<Asset>({
    ...(opts.id ? { id: opts.id } : {}),
    user_id: userId,
    project_id: "default",
    parent_id: directoryFolderId(userId, `personal:${userId}`, opts.folder),
    name: `${opts.name.toLowerCase().replace(/\s+/g, "-")}.step-pattern.json`,
    content_type: STEP_PATTERN_ASSET_CONTENT_TYPE,
    metadata: {
      [STEP_PATTERN_METADATA_KEY]: {
        name: opts.name,
        kind,
        folder: opts.folder,
        category: kind === "template" ? "templates" : "user",
        tags: [kind, "user"]
      }
    }
  });
  const key = getAssetStorageKey(userId, asset.id, STEP_PATTERN_ASSET_CONTENT_TYPE);
  await testAdapter.store(
    key,
    new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        name: opts.name,
        kind,
        category: kind === "template" ? "templates" : "user",
        tags: [kind, "user"],
        folder: opts.folder,
        pattern: patternFromText("Kick: x... x... x... x...", { name: opts.name })
      })
    ),
    STEP_PATTERN_ASSET_CONTENT_TYPE
  );
  return asset;
}

async function readStoredFolder(userId: string, assetId: string): Promise<string> {
  const key = getAssetStorageKey(userId, assetId, STEP_PATTERN_ASSET_CONTENT_TYPE);
  const bytes = await testAdapter.retrieve(testAdapter.uriForKey(key));
  expect(bytes).not.toBeNull();
  return (JSON.parse(new TextDecoder().decode(bytes!)) as { folder: string }).folder;
}

describe("timeline.stepPatternFolders (tRPC)", () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(async () => {
    ModelObserver.clear();
    await closeDb();
  });

  afterAll(() => {
    rmSync(storageDir, { recursive: true, force: true });
  });

  it("renames a folder and moves its nested subfolder and patterns in one request", async () => {
    const drums = await seedFolderMarker({ name: "Drums", folder: "Step Patterns/Patterns/Drums" });
    const trap = await seedFolderMarker({ name: "Trap", folder: "Step Patterns/Patterns/Drums/Trap" });
    const beatA = await seedPattern({ name: "Beat A", folder: "Step Patterns/Patterns/Drums" });
    const beatB = await seedPattern({ name: "Beat B", folder: "Step Patterns/Patterns/Drums/Trap" });

    const caller = createCaller(makeCtx());
    const result = await caller.timeline.stepPatternFolders.rename({
      folder: drums.id.slice(0, 12),
      newName: "Percussion"
    });

    expect(result).toMatchObject({
      id: drums.id,
      name: "Percussion",
      kind: "pattern",
      previousFolder: "Step Patterns/Patterns/Drums",
      folder: "Step Patterns/Patterns/Percussion",
      parentFolder: "Step Patterns/Patterns",
      movedPatternCount: 2
    });
    expect(result.movedPatterns.map((p) => p.folder).sort()).toEqual([
      "Step Patterns/Patterns/Percussion",
      "Step Patterns/Patterns/Percussion/Trap"
    ]);

    expect(
      ((await Asset.find(USER_ID, drums.id))?.metadata?.[STEP_PATTERN_FOLDER_METADATA_KEY] as Record<string, unknown>)["folder"]
    ).toBe("Step Patterns/Patterns/Percussion");
    expect(
      ((await Asset.find(USER_ID, trap.id))?.metadata?.[STEP_PATTERN_FOLDER_METADATA_KEY] as Record<string, unknown>)["folder"]
    ).toBe("Step Patterns/Patterns/Percussion/Trap");
    expect(
      ((await Asset.find(USER_ID, beatA.id))?.metadata?.[STEP_PATTERN_METADATA_KEY] as Record<string, unknown>)["folder"]
    ).toBe("Step Patterns/Patterns/Percussion");
    expect(
      ((await Asset.find(USER_ID, beatB.id))?.metadata?.[STEP_PATTERN_METADATA_KEY] as Record<string, unknown>)["folder"]
    ).toBe("Step Patterns/Patterns/Percussion/Trap");

    expect(await readStoredFolder(USER_ID, beatA.id)).toBe("Step Patterns/Patterns/Percussion");
    expect(await readStoredFolder(USER_ID, beatB.id)).toBe("Step Patterns/Patterns/Percussion/Trap");
  });

  it("deletes a folder subtree and moves its patterns to the parent folder in one request", async () => {
    const drums = await seedFolderMarker({ name: "Drums", folder: "Step Patterns/Patterns/Drums" });
    const trap = await seedFolderMarker({ name: "Trap", folder: "Step Patterns/Patterns/Drums/Trap" });
    const beatA = await seedPattern({ name: "Beat A", folder: "Step Patterns/Patterns/Drums" });
    const beatB = await seedPattern({ name: "Beat B", folder: "Step Patterns/Patterns/Drums/Trap" });

    const caller = createCaller(makeCtx());
    const result = await caller.timeline.stepPatternFolders.delete({
      folder: drums.id.slice(0, 12)
    });

    expect(result).toMatchObject({
      kind: "pattern",
      deletedFolder: "Step Patterns/Patterns/Drums",
      parentFolder: "Step Patterns/Patterns",
      movedPatternCount: 2
    });
    expect(await Asset.find(USER_ID, drums.id)).toBeNull();
    expect(await Asset.find(USER_ID, trap.id)).toBeNull();
    expect(
      await testAdapter.exists(
        testAdapter.uriForKey(getAssetStorageKey(USER_ID, drums.id, STEP_PATTERN_ASSET_CONTENT_TYPE))
      )
    ).toBe(false);
    expect(
      await testAdapter.exists(
        testAdapter.uriForKey(getAssetStorageKey(USER_ID, trap.id, STEP_PATTERN_ASSET_CONTENT_TYPE))
      )
    ).toBe(false);
    expect(
      ((await Asset.find(USER_ID, beatA.id))?.metadata?.[STEP_PATTERN_METADATA_KEY] as Record<string, unknown>)["folder"]
    ).toBe("Step Patterns/Patterns");
    expect(
      ((await Asset.find(USER_ID, beatB.id))?.metadata?.[STEP_PATTERN_METADATA_KEY] as Record<string, unknown>)["folder"]
    ).toBe("Step Patterns/Patterns");
    expect(await readStoredFolder(USER_ID, beatA.id)).toBe("Step Patterns/Patterns");
    expect(await readStoredFolder(USER_ID, beatB.id)).toBe("Step Patterns/Patterns");
  });

  it("leaves no partial move when rename fails halfway inside the transaction", async () => {
    const drums = await seedFolderMarker({ name: "Drums", folder: "Step Patterns/Patterns/Drums" });
    const beatA = await seedPattern({ name: "Beat A", folder: "Step Patterns/Patterns/Drums" });
    const beatB = await seedPattern({ name: "Beat B", folder: "Step Patterns/Patterns/Drums" });

    getRawDb().exec(`
      CREATE TRIGGER fail_trpc_rename_halfway
      BEFORE UPDATE ON nodetool_assets
      WHEN NEW.id = '${beatB.id}'
      BEGIN
        SELECT RAISE(ABORT, 'simulated trpc rename failure');
      END;
    `);

    const caller = createCaller(makeCtx());
    await expect(
      caller.timeline.stepPatternFolders.rename({
        folder: drums.id,
        newName: "Percussion"
      })
    ).rejects.toThrow(/simulated trpc rename failure/);

    expect(
      ((await Asset.find(USER_ID, drums.id))?.metadata?.[STEP_PATTERN_FOLDER_METADATA_KEY] as Record<string, unknown>)["folder"]
    ).toBe("Step Patterns/Patterns/Drums");
    expect(
      ((await Asset.find(USER_ID, beatA.id))?.metadata?.[STEP_PATTERN_METADATA_KEY] as Record<string, unknown>)["folder"]
    ).toBe("Step Patterns/Patterns/Drums");
    expect(await readStoredFolder(USER_ID, beatA.id)).toBe("Step Patterns/Patterns/Drums");
    expect(await readStoredFolder(USER_ID, beatB.id)).toBe("Step Patterns/Patterns/Drums");
  });

  it("leaves no partial move when delete fails halfway inside the transaction", async () => {
    const drums = await seedFolderMarker({ name: "Drums", folder: "Step Patterns/Patterns/Drums" });
    const beatA = await seedPattern({ name: "Beat A", folder: "Step Patterns/Patterns/Drums" });

    getRawDb().exec(`
      CREATE TRIGGER fail_trpc_delete_halfway
      BEFORE DELETE ON nodetool_assets
      WHEN OLD.id = '${drums.id}'
      BEGIN
        SELECT RAISE(ABORT, 'simulated trpc delete failure');
      END;
    `);

    const caller = createCaller(makeCtx());
    await expect(
      caller.timeline.stepPatternFolders.delete({ folder: drums.id })
    ).rejects.toThrow(/simulated trpc delete failure/);

    expect(await Asset.find(USER_ID, drums.id)).not.toBeNull();
    expect(await readStoredFolder(USER_ID, drums.id)).toBe("Step Patterns/Patterns/Drums");
    expect(
      ((await Asset.find(USER_ID, beatA.id))?.metadata?.[STEP_PATTERN_METADATA_KEY] as Record<string, unknown>)["folder"]
    ).toBe("Step Patterns/Patterns/Drums");
    expect(await readStoredFolder(USER_ID, beatA.id)).toBe("Step Patterns/Patterns/Drums");
  });

  it("enforces auth, ownership, ambiguity, root protection, and duplicate-name refusal", async () => {
    const drums = await seedFolderMarker({
      id: "deadbeef123400000000000000000001",
      name: "Drums",
      folder: "Step Patterns/Patterns/Drums"
    });
    await seedFolderMarker({
      id: "deadbeef123400000000000000000002",
      name: "Bass",
      folder: "Step Patterns/Patterns/Bass"
    });

    const unauth = createCaller(makeCtx({ userId: null }));
    await expect(
      unauth.timeline.stepPatternFolders.rename({ folder: drums.id, newName: "X" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const other = createCaller(makeCtx({ userId: OTHER_USER }));
    await expect(
      other.timeline.stepPatternFolders.delete({ folder: drums.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await Asset.find(USER_ID, drums.id)).not.toBeNull();

    const caller = createCaller(makeCtx());
    await expect(
      caller.timeline.stepPatternFolders.rename({
        folder: "deadbeef1234",
        newName: "Gamma"
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      caller.timeline.stepPatternFolders.rename({
        folder: drums.id,
        newName: "Bass"
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      caller.timeline.stepPatternFolders.delete({
        folder: "Step Patterns/Patterns"
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
