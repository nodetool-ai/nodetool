/**
 * What the asset move job reports and schedules around a pass: failures that
 * wait for their retry, rows with no stored bytes, objects too large to move,
 * and a pass that a pause or a failure ends early.
 *
 * The folder is a key prefix in an in-memory object store, and the manifest
 * write and the hashing job are replaced, so the test sees what the pass asks
 * of them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Asset, ModelObserver, initTestDb } from "@nodetool-ai/models";
import {
  createWorkspace,
  setProjectFolderResolver,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { getAssetStorageKey } from "@nodetool-ai/asset-services/asset-paths";
import { scheduleProjectHashing } from "../src/project-hash-job.js";
import { scheduleAssetManifestWrite } from "../src/project-manifest.js";
import {
  ProjectAssetMoveJob,
  type AssetMoveGate
} from "../src/project-asset-move-job.js";

vi.mock("../src/project-manifest.js", () => ({
  scheduleAssetManifestWrite: vi.fn()
}));
vi.mock("../src/project-hash-job.js", () => ({
  scheduleProjectHashing: vi.fn()
}));

const USER = "owner";
const PROJECT = "project-a";
const MISSING = "The file is missing from asset storage";

let store: InMemoryStorageAdapter;
let workspace: Workspace;
let seq: number;

beforeEach(() => {
  initTestDb();
  store = new InMemoryStorageAdapter();
  workspace = createWorkspace(new InMemoryStorageAdapter(), {
    prefix: `workspaces/${PROJECT}`
  });
  seq = 0;
  setProjectFolderResolver(
    async (projectId): Promise<ProjectFolderResolution> => ({
      ok: true,
      projectId: projectId ?? PROJECT,
      workspace
    })
  );
});

afterEach(() => {
  ModelObserver.clear();
  setProjectFolderResolver(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.mocked(scheduleAssetManifestWrite).mockClear();
  vi.mocked(scheduleProjectHashing).mockClear();
});

function bytesOf(seed: number, length = 2048): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = (seed * 31 + i * 7) % 251;
  return bytes;
}

function newJob(gate?: AssetMoveGate): ProjectAssetMoveJob {
  return new ProjectAssetMoveJob({ settleMs: 0, storage: () => store, gate });
}

/** A row from before project folders, with its object in the store unless `bytes` is null. */
async function legacyAsset(
  name: string,
  bytes: Uint8Array | null = bytesOf(++seq),
  parentId: string | null = null
): Promise<Asset> {
  const order = String(++seq).padStart(3, "0");
  const asset = await Asset.create<Asset>({
    user_id: USER,
    project_id: PROJECT,
    parent_id: parentId,
    name,
    content_type: "image/png",
    size: bytes?.byteLength ?? 2048,
    created_at: `2024-01-01T00:00:00.${order}Z`
  });
  if (bytes) {
    await store.store(getAssetStorageKey(USER, asset.id, "image/png"), bytes, "image/png");
  }
  return asset;
}

async function folderRow(name: string): Promise<Asset> {
  return Asset.create<Asset>({
    user_id: USER,
    project_id: PROJECT,
    name,
    content_type: "folder"
  });
}

/** Make the object of `asset` unreadable while `stat` still finds it. */
function makeUnreadable(asset: Asset): () => void {
  const uri = store.uriForKey(getAssetStorageKey(USER, asset.id, "image/png"));
  const retrieve = store.retrieve.bind(store);
  const failing = vi
    .spyOn(store, "retrieve")
    .mockImplementation(async (asked) => (asked === uri ? null : retrieve(asked)));
  return () => failing.mockRestore();
}

/** A gate that allows the first `allowed` questions and refuses every later one. */
function gateAllowing(allowed: number): AssetMoveGate {
  let asked = 0;
  return async () => ++asked <= allowed;
}

describe("the asset move job", () => {
  it("keeps reporting an asset whose move failed while it waits for its retry", async () => {
    const asset = await legacyAsset("fox");
    const makeReadable = makeUnreadable(asset);
    const job = newJob();

    const first = await job.run(PROJECT, USER);
    expect(first.failed).toEqual([asset.id]);
    const reason = first.failureReasons[asset.id];
    expect(reason).toMatch(/could not be read/);

    // A second run in the same process within the retry time, such as one
    // after a pause, does not try the asset again and still reports it.
    makeReadable();
    const second = await job.run(PROJECT, USER);
    expect(second.failed).toEqual([asset.id]);
    expect(second.failureReasons).toEqual({ [asset.id]: reason });
    expect(second.moved).toEqual([]);
    expect((await Asset.find(USER, asset.id))?.workspace_path).toBeNull();

    // A retry forgets the failure and the asset moves.
    job.forgetFailures();
    const third = await job.run(PROJECT, USER);
    expect(third.moved).toEqual([asset.id]);
    expect(third.failed).toEqual([]);
  });

  it("reports a row with no stored bytes as failed in every run and stops counting it as waiting", async () => {
    const lost = await legacyAsset("lost", null);
    expect(await Asset.countAwaitingFolderMove(USER)).toBe(1);

    const first = await newJob().run(PROJECT, USER);

    expect(first.withoutBytes).toEqual([lost.id]);
    expect(first.failed).toEqual([lost.id]);
    expect(first.failureReasons).toEqual({ [lost.id]: MISSING });
    expect(await Asset.countAwaitingFolderMove(USER)).toBe(0);

    // A later run, in this process or another, still lists it.
    const second = await newJob().run(PROJECT, USER);
    expect(second.failed).toEqual([lost.id]);
    expect(second.failureReasons).toEqual({ [lost.id]: MISSING });

    // A retry of the migration clears the mark, and the row is looked at again.
    expect(await Asset.clearMissingBytesMarkers(USER)).toBe(1);
    expect(await Asset.countAwaitingFolderMove(USER)).toBe(1);
  });

  it("reports an object above the read limit as too large and does not try it again in this process", async () => {
    vi.stubEnv("NODETOOL_MAX_UPLOAD_BYTES", "1024");
    const large = await legacyAsset("large", bytesOf(++seq, 4096));
    const job = newJob();
    const reason = "The file is larger than the 1 KiB limit, so it stays in asset storage";

    const first = await job.run(PROJECT, USER);
    expect(first.failed).toEqual([large.id]);
    expect(first.failureReasons).toEqual({ [large.id]: reason });

    // Neither the retry time nor a retry of the migration tries it again.
    vi.unstubAllEnvs();
    job.forgetFailures();
    const second = await job.run(PROJECT, USER);
    expect(second.failed).toEqual([large.id]);
    expect(second.failureReasons).toEqual({ [large.id]: reason });
    expect((await Asset.find(USER, large.id))?.workspace_path).toBeNull();

    // A restarted process with a higher limit moves it.
    expect((await newJob().run(PROJECT, USER)).moved).toEqual([large.id]);
  });

  it("schedules the manifest write and the hashing for what moved before a pause", async () => {
    const first = await legacyAsset("fox");
    await legacyAsset("owl");
    // The pass asks once, then before each asset: the second asset is paused.
    const report = await newJob(gateAllowing(2)).run(PROJECT, USER);

    expect(report.stopped).toBe(true);
    expect(report.moved).toEqual([first.id]);
    expect(scheduleAssetManifestWrite).toHaveBeenCalledWith(PROJECT, USER);
    expect(scheduleProjectHashing).toHaveBeenCalledWith(PROJECT, USER);
  });

  it("leaves legacy folder rows while the migration is paused", async () => {
    const shots = await folderRow("Shots");
    const asset = await legacyAsset("fox", bytesOf(++seq), shots.id);
    // The pass asks once, then before the asset, then before the folder rows.
    const report = await newJob(gateAllowing(2)).run(PROJECT, USER);

    expect(report.moved).toEqual([asset.id]);
    expect(report.stopped).toBe(true);
    expect(report.foldersRemoved).toEqual([]);
    expect((await Asset.listFolders(USER)).map((row) => row.id)).toEqual([shots.id]);
    expect(scheduleAssetManifestWrite).toHaveBeenCalledWith(PROJECT, USER);
  });

  it("returns its report when the folder rows cannot be removed", async () => {
    const shots = await folderRow("Shots");
    const asset = await legacyAsset("fox", bytesOf(++seq), shots.id);
    vi.spyOn(Asset, "countChildren").mockRejectedValue(new Error("database is locked"));

    const report = await newJob().run(PROJECT, USER);

    expect(report.moved).toEqual([asset.id]);
    expect(report.foldersRemoved).toEqual([]);
    expect(scheduleAssetManifestWrite).toHaveBeenCalledWith(PROJECT, USER);
    expect(scheduleProjectHashing).toHaveBeenCalledWith(PROJECT, USER);
  });
});
