/**
 * `projects.migration`: the client reads the plan, the user confirms, and the
 * server enforces every transition (docs/project-folders/migration-ux.md,
 * issue #7634). Opening a project before confirmation moves nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  Asset,
  ModelObserver,
  Project,
  assets,
  getPortableDb,
  initTestDb
} from "@nodetool-ai/models";
import { FileStorageAdapter, type StorageAdapter } from "@nodetool-ai/storage";

const mocks = vi.hoisted(() => ({ adapter: null as StorageAdapter | null }));

vi.mock("@nodetool-ai/asset-services/storage", async (orig) => {
  const actual =
    await orig<typeof import("@nodetool-ai/asset-services/storage")>();
  return { ...actual, getAssetAdapter: () => mocks.adapter };
});

import { projectAssetMoveJob } from "@nodetool-ai/project-services/project-asset-move-job";
import { projectFolderMigrationRunner } from "@nodetool-ai/project-services/project-folder-migration";
import {
  cancelProjectReconciles,
  flushProjectReconciles
} from "@nodetool-ai/project-services/project-index";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { getAssetStorageKey } from "../src/lib/asset-paths.js";
import { useProjectFolders, type ProjectFolderFixture } from "./project-folder-fixture.js";

const createCaller = createCallerFactory(appRouter);
const USER = "1";
const PNG = "image/png";

function caller() {
  return createCaller({
    userId: USER,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context);
}

async function trpcCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason
  );
  if (!(error instanceof TRPCError)) throw new Error(`expected a TRPCError, got ${String(error)}`);
  return error.code;
}

let folders: ProjectFolderFixture;
let storageRoot: string;

async function legacyProjectWithAsset(): Promise<{ project: Project; asset: Asset }> {
  const project = await Project.insertNew({ user_id: USER, name: "Old film" });
  if (!project) throw new Error("no project");
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const asset = await Asset.create<Asset>({
    user_id: USER,
    project_id: project.id,
    parent_id: null,
    name: "fox.png",
    content_type: PNG,
    size: bytes.byteLength
  });
  await mocks.adapter?.store(getAssetStorageKey(USER, asset.id, PNG), bytes, PNG);
  await getPortableDb().update(assets).set({ updated_at: "2024-01-01T00:00:00.000Z" });
  return { project, asset };
}

beforeEach(async () => {
  initTestDb();
  folders = await useProjectFolders([USER]);
  storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "migration-router-"));
  mocks.adapter = new FileStorageAdapter(storageRoot, { externalPathLookup: null });
  vi.stubEnv("NODETOOL_ENV", "development");
  vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", "local");
  vi.stubEnv("NODETOOL_PROJECT_MIGRATION", "");
});

afterEach(async () => {
  await projectFolderMigrationRunner.idle(USER);
  await projectAssetMoveJob.idle();
  await flushProjectReconciles();
  cancelProjectReconciles();
  vi.unstubAllEnvs();
  ModelObserver.clear();
  mocks.adapter = null;
  await folders.cleanup();
  await fs.rm(storageRoot, { recursive: true, force: true });
});

describe("projects.migration", () => {
  it("moves nothing when a project is opened before confirmation", async () => {
    const { project, asset } = await legacyProjectWithAsset();

    const opened = await caller().projects.get({ id: project.id });
    await projectAssetMoveJob.idle();

    expect(opened.folder?.moving ?? null).toBeNull();
    expect((await Asset.find(USER, asset.id))?.workspace_path).toBeNull();
    expect((await caller().projects.migration.status()).state).toBe("not_started");
  });

  it("answers rejected transitions and bad locations as BAD_REQUEST", async () => {
    const { asset } = await legacyProjectWithAsset();

    expect(await trpcCode(caller().projects.migration.confirm())).toBe("BAD_REQUEST");
    expect(await trpcCode(caller().projects.migration.pause())).toBe("BAD_REQUEST");

    const plan = await caller().projects.migration.plan();
    expect(plan).toMatchObject({ projects: 1, assets: 1 });
    expect(
      await trpcCode(caller().projects.migration.confirm({ location: "not/absolute" }))
    ).toBe("BAD_REQUEST");

    const confirmed = await caller().projects.migration.confirm();
    expect(["confirmed", "running"]).toContain(confirmed.state);
    await projectFolderMigrationRunner.idle(USER);

    expect(await caller().projects.migration.status()).toMatchObject({
      applies: true,
      state: "done",
      progress: { done: 1, total: 1 }
    });
    expect((await Asset.find(USER, asset.id))?.workspace_path).toBeTruthy();
  });

  it("refuses every transition where the migration does not ask", async () => {
    vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", "cloud");

    expect((await caller().projects.migration.status()).applies).toBe(false);
    expect(await trpcCode(caller().projects.migration.plan())).toBe("FORBIDDEN");
  });
});
