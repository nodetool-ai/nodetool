/**
 * Moving the bytes of assets from before project folders into their
 * project's folder (PRD T3, T9 step 4, issue #7602).
 *
 * Every case runs against a local directory and against a storage-backed
 * folder, through the same `Workspace` interface. A "kill" stops the job
 * between two steps of one asset's move, the way a process that dies there
 * stops, and a new job instance stands for the restarted process.
 */
import { createHash } from "node:crypto";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
  ModelObserver,
  Project,
  initTestDb,
  moveTargetOf
} from "@nodetool-ai/models";
import {
  WORKSPACE_MOVE_SOURCE_KEY,
  WORKSPACE_MOVE_TARGET_KEY,
  projectDirectoryId
} from "@nodetool-ai/protocol";
import {
  createLocalWorkspace,
  createWorkspace,
  setProjectFolderResolver,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  setAssetFolderPathLookup,
  type StorageAdapter
} from "@nodetool-ai/storage";
import {
  getAssetFileName,
  getAssetStorageKey,
  getAssetThumbnailKey,
  retrieveAssetBytes
} from "@nodetool-ai/asset-services/asset-paths";
import { updateAssetBytesModelInterface } from "@nodetool-ai/asset-services/asset-model-interface";
import {
  installAssetFolderLookup,
  lookupExternalAssetPath
} from "@nodetool-ai/asset-services/external-asset-lookup";
import {
  legacyAssetStagingName,
  moveLegacyAssetIntoFolder,
  type LegacyAssetMoveStep
} from "@nodetool-ai/asset-services/legacy-asset-move";
import { ProjectAssetStorageAdapter } from "@nodetool-ai/asset-services/project-asset-storage";
import { getAssetAdapter } from "@nodetool-ai/asset-services/storage";
import {
  storeLegacyAssetBytes,
  withProjectFolderLock
} from "@nodetool-ai/asset-services/project-asset";
import { ProjectDirectoryResolver } from "@nodetool-ai/protocol";
import {
  ProjectAssetMoveJob,
  scheduleLegacyAssetMoves
} from "../src/project-asset-move-job.js";
import {
  ensureAssetForPath,
  flushProjectReconciles,
  reconcileProjectIndex
} from "../src/project-index.js";

vi.mock("@nodetool-ai/asset-services/storage", () => ({
  getAssetAdapter: vi.fn()
}));

const USER = "owner";
const PROJECT = "project-a";
const MIB = 1024 * 1024;
const STEPS: readonly LegacyAssetMoveStep[] = [
  "claimed",
  "copied",
  "verified",
  "switched",
  "legacy_deleted"
];

let root: string;
let rawStore: InMemoryStorageAdapter;
/** The asset store readers resolve an asset's id key through. */
let assetStore: StorageAdapter;
/** The same store without the lookup through asset rows: objects only. */
let rawAssets: StorageAdapter;
let workspaces: Map<string, Workspace>;
let seq: number;

/** A directory name every OS accepts for a project id. */
function directoryName(projectId: string): string {
  return projectId.replace(/[^a-zA-Z0-9-]/g, "_");
}

const kinds = {
  /** A real directory on this host. */
  local: (projectId: string): Workspace =>
    createLocalWorkspace(join(root, "projects", directoryName(projectId))),
  /** A key prefix in the object store the assets live in. */
  storage: (projectId: string): Workspace =>
    createWorkspace(rawStore, {
      prefix: `workspaces/${USER}/${directoryName(projectId)}`
    })
} as const;
type Kind = keyof typeof kinds;

/**
 * The project's folder. Each call hands out its own `Workspace`, as the
 * project resolver does, so two readers never share a scratch directory.
 * `workspaces` holds a stand-in a test put in the folder's place.
 */
function folder(kind: Kind, projectId = PROJECT): Workspace {
  return workspaces.get(projectId) ?? kinds[kind](projectId);
}

function useFolders(kind: Kind): void {
  if (kind === "local") {
    // As on a server: the store is the asset folder, and every adapter a
    // host builds over that folder resolves a missed key through asset rows.
    vi.stubEnv("ASSET_FOLDER", join(root, "assets"));
    installAssetFolderLookup();
    assetStore = new FileStorageAdapter(join(root, "assets"), {
      externalPathLookup: lookupExternalAssetPath
    });
    rawAssets = new FileStorageAdapter(join(root, "assets"), {
      externalPathLookup: null
    });
  } else {
    assetStore = new ProjectAssetStorageAdapter(rawStore);
    rawAssets = rawStore;
  }
  vi.mocked(getAssetAdapter).mockReturnValue(assetStore);
  setProjectFolderResolver(
    async (projectId): Promise<ProjectFolderResolution> => {
      const id = projectId ?? "personal";
      return { ok: true, projectId: id, workspace: folder(kind, id) };
    }
  );
}

/** Bytes no other asset of a test has. */
function bytesOf(seed: number, length = 2048): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = (seed * 31 + i * 7) % 251;
  return bytes;
}

interface LegacyAssetInput {
  name: string;
  contentType?: string;
  bytes?: Uint8Array;
  parentId?: string | null;
  projectId?: string;
  /** Store the object under the flat key from before owner prefixes. */
  flat?: boolean;
}

/** An asset as it was before project folders: a row plus an object in the store. */
async function legacyAsset(input: LegacyAssetInput): Promise<Asset> {
  const contentType = input.contentType ?? "image/png";
  const bytes = input.bytes ?? bytesOf(++seq);
  const order = String(++seq).padStart(4, "0");
  const asset = await Asset.create<Asset>({
    user_id: USER,
    project_id: input.projectId ?? PROJECT,
    parent_id: input.parentId ?? null,
    name: input.name,
    content_type: contentType,
    size: bytes.byteLength,
    // Rows are moved oldest first, so creation order decides who keeps a name.
    created_at: `2024-01-01T00:00:00.${order.slice(1)}Z`
  });
  const key = input.flat
    ? getAssetFileName(asset.id, contentType)
    : getAssetStorageKey(USER, asset.id, contentType);
  await rawAssets.store(key, bytes, contentType);
  return asset;
}

async function folderRow(name: string, parentId: string | null = null): Promise<Asset> {
  return Asset.create<Asset>({
    user_id: USER,
    project_id: PROJECT,
    parent_id: parentId,
    name,
    content_type: "folder"
  });
}

async function reload(asset: Asset): Promise<Asset> {
  const found = await Asset.find(USER, asset.id);
  if (!found) throw new Error(`asset ${asset.id} is gone`);
  return found;
}

/** The asset's bytes as a reader gets them: by its id key, through the store. */
function readById(asset: Asset): Promise<Uint8Array | null> {
  return retrieveAssetBytes(assetStore, USER, asset.id, asset.content_type);
}

/** Every object in the asset store, without the files of project folders. */
async function storedKeys(): Promise<string[]> {
  const { entries } = await rawAssets.list("");
  return entries
    .map((entry) => entry.key)
    .filter((key) => !key.startsWith("workspaces/"))
    .sort();
}

/** Every file in the project folder, by path. */
async function folderFiles(
  kind: Kind,
  projectId = PROJECT
): Promise<string[]> {
  const entries = await folder(kind, projectId).list("", { recursive: true });
  return entries
    .filter((entry) => !entry.isDirectory)
    .map((entry) => entry.path)
    .sort();
}

function newJob(
  afterStep?: (step: LegacyAssetMoveStep, assetId: string) => void | Promise<void>
): ProjectAssetMoveJob {
  return new ProjectAssetMoveJob({ settleMs: 0, afterStep });
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The stored object of a legacy asset, read without the lookup through rows. */
function storedObject(asset: Asset): Promise<Uint8Array | null> {
  return rawAssets.retrieve(
    rawAssets.uriForKey(getAssetStorageKey(USER, asset.id, asset.content_type))
  );
}

/** Store new bytes under the asset's key, as a bytes update of a legacy asset does. */
async function updateStoredBytes(asset: Asset, bytes: Uint8Array): Promise<void> {
  await rawAssets.store(
    getAssetStorageKey(USER, asset.id, asset.content_type),
    bytes,
    asset.content_type
  );
}

/** A folder that hands `corrupt(data)` to the exclusive create instead of the data. */
function folderWriting(
  real: Workspace,
  corrupt: (data: Uint8Array) => Uint8Array
): Workspace {
  const writeNew: Workspace["writeNew"] = (path, data, contentType, options) =>
    real.writeNew(
      path,
      typeof data === "string" ? data : corrupt(data),
      contentType,
      options
    );
  return new Proxy(real, {
    get(target, property) {
      if (property === "writeNew") return writeNew;
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

/**
 * Make the stored object of `asset` unreadable where the asset store itself
 * fails: below the lookup that answers a missed key from the folder file.
 * The object is still there and `stat` still finds it. Returns what makes it
 * readable again.
 */
async function makeUnreadable(
  kind: Kind,
  asset: Asset
): Promise<() => Promise<void>> {
  const key = getAssetStorageKey(USER, asset.id, asset.content_type);
  if (kind === "local") {
    // The file store refuses to read a file that has a second name.
    const alias = join(root, `alias-${asset.id}`);
    await link(join(root, "assets", key), alias);
    return () => rm(alias);
  }
  // An object store answers a failed read with null.
  const uri = rawStore.uriForKey(key);
  const retrieve = rawStore.retrieve.bind(rawStore);
  const failing = vi
    .spyOn(rawStore, "retrieve")
    .mockImplementation(async (asked) =>
      asked === uri ? null : retrieve(asked)
    );
  return async () => failing.mockRestore();
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** A job that dies after `step` of the `nth` asset that reaches it. */
function jobKilledAfter(step: LegacyAssetMoveStep, nth = 1): ProjectAssetMoveJob {
  let seen = 0;
  const job: ProjectAssetMoveJob = newJob((reached) => {
    if (reached !== step || ++seen !== nth) return;
    job.stop();
    throw new Error(`killed after ${step}`);
  });
  return job;
}

interface Seeded {
  shots: Asset;
  dayOne: Asset;
  empty: Asset;
  fox: Asset;
  secondFox: Asset;
  take: Asset;
  notes: Asset;
  upload: Asset;
  old: Asset;
  bytes: Map<string, Uint8Array>;
  assets: Asset[];
  expected: Map<string, string>;
}

/**
 * A project from before project folders: nested folder rows, two assets of
 * one name, an asset filed under a directory id, one under the flat key, and
 * a thumbnail.
 */
async function seedProject(): Promise<Seeded> {
  const shots = await folderRow("Shots");
  const dayOne = await folderRow("Day 1", shots.id);
  const empty = await folderRow("Empty");
  const bytes = new Map<string, Uint8Array>();
  const make = async (input: LegacyAssetInput): Promise<Asset> => {
    const content = input.bytes ?? bytesOf(++seq);
    const asset = await legacyAsset({ ...input, bytes: content });
    bytes.set(asset.id, content);
    return asset;
  };
  const fox = await make({ name: "fox" });
  const secondFox = await make({ name: "fox", parentId: USER });
  // Longer than both partial-hash spans, so the middle is not hashed.
  const take = await make({
    name: "take one.png",
    parentId: shots.id,
    bytes: bytesOf(++seq, 2 * MIB + 4096)
  });
  const notes = await make({
    name: "notes",
    contentType: "text/plain",
    parentId: dayOne.id
  });
  // An upload into a directory of the folder is filed under the directory id.
  const upload = await make({
    name: "upload",
    parentId: projectDirectoryId(PROJECT, "Uploads/Raw")
  });
  const old = await make({ name: "old", flat: true });
  await rawAssets.store(getAssetThumbnailKey(USER, fox.id), bytesOf(999, 64));

  const expected = new Map([
    [fox.id, "fox.png"],
    [secondFox.id, "fox-2.png"],
    [take.id, "Shots/take-one.png"],
    [notes.id, "Shots/Day 1/notes.txt"],
    [upload.id, "Uploads/Raw/upload.png"],
    [old.id, "old.png"]
  ]);
  return {
    shots,
    dayOne,
    empty,
    fox,
    secondFox,
    take,
    notes,
    upload,
    old,
    bytes,
    assets: [fox, secondFox, take, notes, upload, old],
    expected
  };
}

/** Assert that every seeded asset still reads the bytes it had, by its id. */
async function expectAllReadable(seeded: Seeded): Promise<void> {
  for (const asset of seeded.assets) {
    const read = await readById(asset);
    expect(read, `asset ${asset.name} (${asset.id}) is readable`).not.toBeNull();
    expect(Buffer.from(read ?? []).equals(Buffer.from(seeded.bytes.get(asset.id) ?? []))).toBe(true);
  }
}

/** Assert the state every finished move of the seeded project ends in. */
async function expectMoved(kind: Kind, seeded: Seeded): Promise<void> {
  for (const asset of seeded.assets) {
    const row = await reload(asset);
    expect(row.workspace_path).toBe(seeded.expected.get(asset.id));
    expect(moveTargetOf(row)).toBeNull();
    const file = await folder(kind).read(row.workspace_path ?? "");
    expect(Buffer.from(file ?? []).equals(Buffer.from(seeded.bytes.get(asset.id) ?? []))).toBe(true);
    expect(row.metadata?.["workspace_size"]).toBe(file?.byteLength);
    expect(typeof row.metadata?.["workspace_hash"]).toBe("string");
  }
  // One file per asset, and nothing else.
  expect(await folderFiles(kind)).toEqual([...seeded.expected.values()].sort());
  // Only the thumbnail is left in the asset store.
  expect(await storedKeys()).toEqual([getAssetThumbnailKey(USER, seeded.fox.id)]);
  await expectAllReadable(seeded);
}

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-asset-move-"));
  rawStore = new InMemoryStorageAdapter();
  workspaces = new Map();
  seq = 0;
});

afterEach(async () => {
  await flushProjectReconciles();
  ModelObserver.clear();
  setProjectFolderResolver(null);
  setAssetFolderPathLookup(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe.each(["local", "storage"] as const)(
  "moving existing asset bytes into a %s project folder",
  (kind) => {
    beforeEach(() => useFolders(kind));

    it("gives every asset a file under its former folder path and name and leaves no legacy object", async () => {
      const seeded = await seedProject();

      const report = await newJob().run(PROJECT, USER);

      expect(report.moved.sort()).toEqual(seeded.assets.map((a) => a.id).sort());
      expect(report.failed).toEqual([]);
      await expectMoved(kind, seeded);
    });

    it("deletes a folder row once its children have moved and keeps its directory", async () => {
      const seeded = await seedProject();

      const report = await newJob().run(PROJECT, USER);

      expect(report.foldersRemoved.sort()).toEqual(
        [seeded.shots.id, seeded.dayOne.id, seeded.empty.id].sort()
      );
      expect(await Asset.listFolders(USER)).toEqual([]);
      // Each moved asset is filed under the directory its file is in.
      expect((await reload(seeded.take)).parent_id).toBe(
        projectDirectoryId(PROJECT, "Shots")
      );
      expect((await reload(seeded.fox)).parent_id).toBe(USER);
      if (kind === "local") {
        // A folder with nothing in it is still a folder afterwards.
        const emptyDir = await stat(join(root, "projects", PROJECT, "Empty"));
        expect(emptyDir.isDirectory()).toBe(true);
      }
    });

    it("keeps asset ids and id-based references resolving to the same bytes", async () => {
      const seeded = await seedProject();
      const ids = seeded.assets.map((asset) => asset.id);
      const keys = seeded.assets.map((asset) =>
        getAssetStorageKey(USER, asset.id, asset.content_type)
      );
      await expectAllReadable(seeded);

      await newJob().run(PROJECT, USER);

      const rows = await Asset.listByProject(USER, PROJECT);
      expect(rows.map((row) => row.id).sort()).toEqual([...ids].sort());
      // A document holds `asset://<id>`, which a reader turns into this key.
      for (const [index, asset] of seeded.assets.entries()) {
        const uri = assetStore.uriForKey(keys[index]);
        expect(await assetStore.exists(uri)).toBe(true);
        const read = await assetStore.retrieve(uri);
        expect(Buffer.from(read ?? []).equals(Buffer.from(seeded.bytes.get(asset.id) ?? []))).toBe(true);
        expect((await assetStore.stat(uri))?.size).toBe(
          seeded.bytes.get(asset.id)?.byteLength
        );
      }
    });

    it.each(STEPS)(
      "resumes to the same final state after the process stops after the %s step",
      async (step) => {
        const seeded = await seedProject();

        // The second asset to reach the step is the one that is cut short:
        // one asset is done, one is half way, the rest have not started.
        const killed = jobKilledAfter(step, 2);
        const first = await killed.run(PROJECT, USER);
        expect(first.failed).toHaveLength(1);
        expect(first.moved.length).toBeLessThan(seeded.assets.length);

        // Nothing is unreadable while the move is half done.
        await expectAllReadable(seeded);
        // A project opened before the move resumes reconciles its folder.
        // The copy that waits for its row must not become a second asset.
        const reconciled = await reconcileProjectIndex(PROJECT, USER);
        expect(reconciled.created).toEqual([]);
        expect(reconciled.offline).toEqual([]);
        await expectAllReadable(seeded);

        const resumed = await newJob().run(PROJECT, USER);
        expect(resumed.failed).toEqual([]);
        await expectMoved(kind, seeded);
        expect(await Asset.listFolders(USER)).toEqual([]);
        expect((await Asset.listByProject(USER, PROJECT)).length).toBe(
          seeded.assets.length
        );
      }
    );

    it("changes nothing on a second run", async () => {
      const seeded = await seedProject();
      await newJob().run(PROJECT, USER);
      // The full hashes the first run asked for are in before the comparison.
      await flushProjectReconciles();
      const snapshot = async () => ({
        rows: (await Asset.listByProject(USER, PROJECT))
          .map((row) => row.toRow())
          .sort((a, b) => (a.id < b.id ? -1 : 1)),
        files: (await folder(kind).list("", { recursive: true })).sort((a, b) =>
          a.path < b.path ? -1 : 1
        ),
        stored: await storedKeys()
      });
      const before = await snapshot();
      const changes: string[] = [];
      ModelObserver.subscribe((instance) => {
        changes.push((instance as Asset).id);
      });

      const second = await newJob().run(PROJECT, USER);

      expect(second.moved).toEqual([]);
      expect(second.failed).toEqual([]);
      expect(second.foldersRemoved).toEqual([]);
      expect(changes).toEqual([]);
      expect(await snapshot()).toEqual(before);
      await expectMoved(kind, seeded);
    });

    it("leaves external assets, their files and their folder rows untouched", async () => {
      const shots = await folderRow("Shots");
      const externalDir = join(root, "external");
      await mkdir(externalDir, { recursive: true });
      const externalFile = join(externalDir, "plate.png");
      const plate = bytesOf(++seq);
      await writeFile(externalFile, plate);
      const info = await stat(externalFile);
      const linked = await Asset.create<Asset>({
        user_id: USER,
        project_id: PROJECT,
        parent_id: shots.id,
        name: "plate",
        content_type: "image/png",
        size: plate.byteLength,
        external_path: externalFile,
        metadata: { external_size: info.size, external_mtime: info.mtimeMs }
      });
      const moved = await legacyAsset({ name: "fox", parentId: shots.id });
      const before = (await reload(linked)).toRow();

      const report = await newJob().run(PROJECT, USER);

      expect(report.moved).toEqual([moved.id]);
      expect((await reload(linked)).toRow()).toEqual(before);
      expect(Buffer.from(await readFile(externalFile)).equals(Buffer.from(plate))).toBe(true);
      expect((await stat(externalFile)).mtimeMs).toBe(info.mtimeMs);
      // The linked asset is still filed under the folder row, so the row stays.
      expect(report.foldersRemoved).toEqual([]);
      expect((await Asset.listFolders(USER)).map((row) => row.id)).toEqual([shots.id]);
      expect(await folderFiles(kind)).toEqual(["Shots/fox.png"]);
    });

    it("leaves a row with no stored bytes where it is, marked and reported", async () => {
      // A row from before project folders. A row with no size made in the
      // last hours may still get the bytes of a client-direct upload.
      const orphan = await Asset.create<Asset>({
        user_id: USER,
        project_id: PROJECT,
        name: "lost",
        content_type: "image/png",
        created_at: "2024-01-01T00:00:00.000Z"
      });
      const before = (await reload(orphan)).toRow();

      const report = await newJob().run(PROJECT, USER);

      expect(report.withoutBytes).toEqual([orphan.id]);
      expect(report.failed).toEqual([orphan.id]);
      // Only the mark is new. `updated_at` versions the asset's URL and stays.
      expect((await reload(orphan)).toRow()).toEqual({
        ...before,
        metadata: { [Asset.LEGACY_BYTES_MISSING_KEY]: before.updated_at }
      });
      expect(await Asset.countAwaitingFolderMove(USER)).toBe(0);
      expect(await folderFiles(kind)).toEqual([]);
    });

    it("removes its own staging file that a copy cut short left behind", async () => {
      const content = bytesOf(++seq, 4096);
      const asset = await legacyAsset({ name: "fox", bytes: content });
      asset.metadata = { [WORKSPACE_MOVE_TARGET_KEY]: "fox.png" };
      await asset.save();
      // The process died while it wrote the copy under its staging name.
      await folder(kind).write(
        legacyAssetStagingName(asset.id),
        content.subarray(0, 1500)
      );

      const report = await newJob().run(PROJECT, USER);

      expect(report.moved).toEqual([asset.id]);
      expect((await reload(asset)).workspace_path).toBe("fox.png");
      expect(await folderFiles(kind)).toEqual(["fox.png"]);
      const file = await folder(kind).read("fox.png");
      expect(Buffer.from(file ?? []).equals(Buffer.from(content))).toBe(true);
      expect(await storedKeys()).toEqual([]);
    });

    it("publishes every copy through its own staging name, on a first copy and on a resumed one", async () => {
      const first = await legacyAsset({ name: "fox" });
      const resumed = await legacyAsset({ name: "owl" });
      resumed.metadata = { [WORKSPACE_MOVE_TARGET_KEY]: "owl.png" };
      await resumed.save();
      const staged = new Map<string, string | undefined>();
      const real = folder(kind);
      const writeNew: Workspace["writeNew"] = (path, data, contentType, options) => {
        staged.set(path, options?.stagingName);
        return real.writeNew(path, data, contentType, options);
      };
      workspaces.set(
        PROJECT,
        new Proxy(real, {
          get(target, property) {
            if (property === "writeNew") return writeNew;
            const value: unknown = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
          }
        })
      );

      await newJob().run(PROJECT, USER);

      // The name carries the asset id, so no two assets share one.
      expect(Object.fromEntries(staged)).toEqual({
        "fox.png": `.${first.id}.nodetool-move.tmp`,
        "owl.png": `.${resumed.id}.nodetool-move.tmp`
      });
      expect(legacyAssetStagingName(first.id)).toBe(staged.get("fox.png"));
    });

    it("leaves no staging file in the folder after a move", async () => {
      const seeded = await seedProject();

      await newJob().run(PROJECT, USER);

      const names = (await folder(kind).list("", { recursive: true })).map(
        (entry) => entry.name
      );
      expect(names.filter((name) => name.endsWith(".tmp"))).toEqual([]);
      await expectMoved(kind, seeded);
    });

    it.each([
      // An empty file is the start of every asset, and so is a file that
      // holds the first bytes. Both are files a creator can have made.
      ["an empty file", () => new Uint8Array()],
      ["a file that holds the beginning of the bytes", (c: Uint8Array) => new Uint8Array(c.subarray(0, 1500))],
      ["a shorter file with other content", (c: Uint8Array) => bytesOf(777, c.byteLength - 10)],
      ["a file of the same length with other content", (c: Uint8Array) => bytesOf(778, c.byteLength)],
      ["a longer file", (c: Uint8Array) => bytesOf(779, c.byteLength + 10)]
    ])(
      "never replaces or removes %s at the recorded target",
      async (_what, foreignOf) => {
        const content = bytesOf(++seq, 4096);
        const asset = await legacyAsset({ name: "fox", bytes: content });
        asset.metadata = { [WORKSPACE_MOVE_TARGET_KEY]: "fox.png" };
        await asset.save();
        // Someone else's file took the name before the copy was made.
        const foreign = foreignOf(content);
        await folder(kind).write("fox.png", foreign);

        const report = await newJob().run(PROJECT, USER);

        expect(report.moved).toEqual([asset.id]);
        expect((await reload(asset)).workspace_path).toBe("fox-2.png");
        const kept = await folder(kind).read("fox.png");
        expect(Buffer.from(kept ?? []).equals(Buffer.from(foreign))).toBe(true);
        const file = await folder(kind).read("fox-2.png");
        expect(Buffer.from(file ?? []).equals(Buffer.from(content))).toBe(true);
      }
    );

    it("takes another name when a new asset took the recorded target", async () => {
      const content = bytesOf(++seq);
      const asset = await legacyAsset({ name: "fox", bytes: content });
      asset.metadata = { [WORKSPACE_MOVE_TARGET_KEY]: "fox.png" };
      await asset.save();
      const taker = bytesOf(++seq);
      await folder(kind).write("fox.png", taker);
      const other = await Asset.create<Asset>({
        user_id: USER,
        project_id: PROJECT,
        name: "fox",
        content_type: "image/png",
        workspace_path: "fox.png"
      });

      await newJob().run(PROJECT, USER);

      expect((await reload(asset)).workspace_path).toBe("fox-2.png");
      expect((await reload(other)).workspace_path).toBe("fox.png");
      const kept = await folder(kind).read("fox.png");
      expect(Buffer.from(kept ?? []).equals(Buffer.from(taker))).toBe(true);
    });

    it("keeps the legacy object and removes the copy when the copy does not verify", async () => {
      const content = bytesOf(++seq, 4096);
      const asset = await legacyAsset({ name: "fox", bytes: content });
      // A folder that stores less than it was given.
      const lossy = folderWriting(folder(kind), (data) =>
        data.subarray(0, data.byteLength - 1)
      );
      workspaces.set(PROJECT, lossy);

      const report = await newJob().run(PROJECT, USER);

      expect(report.failed).toEqual([asset.id]);
      expect(report.moved).toEqual([]);
      const row = await reload(asset);
      expect(row.workspace_path).toBeNull();
      expect(await storedKeys()).toEqual([
        getAssetStorageKey(USER, asset.id, "image/png")
      ]);
      expect(await folderFiles(kind)).toEqual([]);
      const read = await readById(asset);
      expect(Buffer.from(read ?? []).equals(Buffer.from(content))).toBe(true);

      // With the folder working again, the next run moves the asset.
      workspaces.delete(PROJECT);
      expect((await newJob().run(PROJECT, USER)).moved).toEqual([asset.id]);
      expect((await reload(asset)).workspace_path).toBe("fox.png");
    });

    it("keeps the legacy object and removes its copy when the row changed while the bytes were copied", async () => {
      const content = bytesOf(++seq);
      const asset = await legacyAsset({ name: "fox", bytes: content });
      const job = newJob(async (step) => {
        if (step !== "copied") return;
        // A request saves the row it read before the move began.
        const stale = await reload(asset);
        stale.metadata = { note: "edited" };
        await stale.save();
      });

      const report = await job.run(PROJECT, USER);

      expect(report.failed).toEqual([asset.id]);
      const row = await reload(asset);
      expect(row.workspace_path).toBeNull();
      expect(row.metadata).toEqual({ note: "edited" });
      expect(await storedKeys()).toHaveLength(1);
      const read = await readById(asset);
      expect(Buffer.from(read ?? []).equals(Buffer.from(content))).toBe(true);
      // The copy has no row. Left in the folder, it would be indexed as a
      // second asset.
      expect(await folderFiles(kind)).toEqual([]);
      expect((await reconcileProjectIndex(PROJECT, USER)).created).toEqual([]);
      expect((await Asset.listByProject(USER, PROJECT)).length).toBe(1);

      // The next run moves the asset under the name it would have had.
      const next = await newJob().run(PROJECT, USER);
      expect(next.moved).toEqual([asset.id]);
      expect((await reload(asset)).workspace_path).toBe("fox.png");
      expect((await reload(asset)).metadata?.["note"]).toBe("edited");
      expect(await folderFiles(kind)).toEqual(["fox.png"]);
      expect(await storedKeys()).toEqual([]);
    });

    it.each(["copied", "verified", "switched"] as const)(
      "never deletes bytes stored under the asset's key after the %s step",
      async (step) => {
        const content = bytesOf(++seq, 4096);
        // The same length, so only the content tells the two apart.
        const updated = bytesOf(++seq, 4096);
        const asset = await legacyAsset({ name: "fox", bytes: content });
        const job = newJob(async (reached) => {
          // A bytes update of the asset lands while its move runs. The row
          // names no file yet, so the new bytes go under the legacy key.
          if (reached === step) await updateStoredBytes(asset, updated);
        });

        const report = await job.run(PROJECT, USER);

        expect(report.moved).toEqual([]);
        expect(report.failed).toEqual([asset.id]);
        // The new bytes are still stored, and they are what the asset reads.
        const stored = await storedObject(asset);
        expect(Buffer.from(stored ?? []).equals(Buffer.from(updated))).toBe(true);
        const read = await readById(asset);
        expect(Buffer.from(read ?? []).equals(Buffer.from(updated))).toBe(true);
        // The row names no file, and the copy of the old bytes is gone.
        expect((await reload(asset)).workspace_path).toBeNull();
        expect(await folderFiles(kind)).toEqual([]);

        // A later pass moves the new bytes.
        const next = await newJob().run(PROJECT, USER);
        expect(next.moved).toEqual([asset.id]);
        expect((await reload(asset)).workspace_path).toBe("fox.png");
        const file = await folder(kind).read("fox.png");
        expect(Buffer.from(file ?? []).equals(Buffer.from(updated))).toBe(true);
        const after = await readById(asset);
        expect(Buffer.from(after ?? []).equals(Buffer.from(updated))).toBe(true);
        expect(await storedKeys()).toEqual([]);
      }
    );

    it("never deletes bytes stored under the asset's key between a stop and the restart", async () => {
      const content = bytesOf(++seq, 4096);
      const updated = bytesOf(++seq, 4096);
      const asset = await legacyAsset({ name: "fox", bytes: content });
      await jobKilledAfter("switched").run(PROJECT, USER);
      expect((await reload(asset)).workspace_path).toBe("fox.png");
      await updateStoredBytes(asset, updated);

      const report = await newJob().run(PROJECT, USER);

      // Neither side is the other's copy, so both are kept.
      expect(report.moved).toEqual([]);
      expect(report.failed).toEqual([asset.id]);
      const stored = await storedObject(asset);
      expect(Buffer.from(stored ?? []).equals(Buffer.from(updated))).toBe(true);
      const file = await folder(kind).read("fox.png");
      expect(Buffer.from(file ?? []).equals(Buffer.from(content))).toBe(true);
      const read = await readById(asset);
      expect(Buffer.from(read ?? []).equals(Buffer.from(updated))).toBe(true);
    });

    it("does not take a stored object for gone when the store cannot be asked about it", async () => {
      const content = bytesOf(++seq);
      const asset = await legacyAsset({ name: "fox", bytes: content });
      const before = (await reload(asset)).toRow();
      const uri = rawAssets.uriForKey(
        getAssetStorageKey(USER, asset.id, asset.content_type)
      );
      // The store fails every lookup of the key. `stat` answers that with
      // null, the way it answers a missing key.
      const adapterClass = Object.getPrototypeOf(rawAssets) as StorageAdapter;
      const stat = adapterClass.stat;
      const statStrict = adapterClass.statStrict!;
      const failingStat = vi
        .spyOn(adapterClass, "stat")
        .mockImplementation(function (this: StorageAdapter, asked: string) {
          return asked === uri ? Promise.resolve(null) : stat.call(this, asked);
        });
      const failingStrict = vi
        .spyOn(adapterClass, "statStrict")
        .mockImplementation(function (this: StorageAdapter, asked: string) {
          return asked === uri
            ? Promise.reject(new Error("storage unavailable"))
            : statStrict.call(this, asked);
        });
      const report = await newJob().run(PROJECT, USER);
      failingStat.mockRestore();
      failingStrict.mockRestore();

      expect(report.withoutBytes).toEqual([]);
      expect(report.failed).toEqual([asset.id]);
      expect((await reload(asset)).toRow()).toEqual(before);
      const stored = await storedObject(asset);
      expect(Buffer.from(stored ?? []).equals(Buffer.from(content))).toBe(true);

      // Once the store answers again, the asset moves.
      expect((await newJob().run(PROJECT, USER)).moved).toEqual([asset.id]);
      expect((await reload(asset)).workspace_path).toBe("fox.png");
    });

    it("leaves a row waiting for a client-direct upload until its upload URL has expired", async () => {
      // `assets.createUpload` makes the row with no size and hands the client
      // a URL for the legacy key. The client writes there outside every lock.
      const pending = await Asset.create<Asset>({
        user_id: USER,
        project_id: PROJECT,
        name: "upload",
        content_type: "image/png",
        size: null,
        created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
        updated_at: new Date(Date.now() - 10 * 60_000).toISOString()
      });
      await updateStoredBytes(pending, bytesOf(++seq));
      const before = (await reload(pending)).toRow();

      const report = await newJob().run(PROJECT, USER);

      expect(report.deferred).toEqual([pending.id]);
      expect(report.moved).toEqual([]);
      expect((await reload(pending)).toRow()).toEqual(before);
      expect(await folderFiles(kind)).toEqual([]);
    });

    it("keeps a stored object it cannot read, also with a file of the same size at the recorded target", async () => {
      const content = bytesOf(++seq, 4096);
      const asset = await legacyAsset({ name: "fox", bytes: content });
      asset.metadata = { [WORKSPACE_MOVE_TARGET_KEY]: "fox.png" };
      await asset.save();
      // A creator's file of the same length sits where the copy was to go.
      const creators = bytesOf(++seq, 4096);
      await folder(kind).write("fox.png", creators);
      const before = (await reload(asset)).toRow();

      // The read of the object fails. The store answers null, as it does
      // for a key with no object.
      const makeReadable = await makeUnreadable(kind, asset);
      const report = await newJob().run(PROJECT, USER);
      await makeReadable();

      expect(report.moved).toEqual([]);
      expect(report.withoutBytes).toEqual([]);
      expect(report.failed).toEqual([asset.id]);
      expect((await reload(asset)).toRow()).toEqual(before);
      const stored = await storedObject(asset);
      expect(Buffer.from(stored ?? []).equals(Buffer.from(content))).toBe(true);
      const kept = await folder(kind).read("fox.png");
      expect(Buffer.from(kept ?? []).equals(Buffer.from(creators))).toBe(true);

      // With the store readable again, the asset moves beside that file.
      expect((await newJob().run(PROJECT, USER)).moved).toEqual([asset.id]);
      expect((await reload(asset)).workspace_path).toBe("fox-2.png");
      expect(await storedKeys()).toEqual([]);
    });

    it("keeps the stored object when it cannot be read after the row names the file", async () => {
      const content = bytesOf(++seq, 4096);
      const asset = await legacyAsset({ name: "fox", bytes: content });
      await jobKilledAfter("switched").run(PROJECT, USER);

      // The asset store answers a key it cannot read from the folder file.
      // That answer must not pass for the object.
      const makeReadable = await makeUnreadable(kind, asset);
      const viaStore = await readById(asset);
      expect(Buffer.from(viaStore ?? []).equals(Buffer.from(content))).toBe(true);
      const report = await newJob().run(PROJECT, USER);
      await makeReadable();

      expect(report.moved).toEqual([]);
      expect(report.failed).toEqual([asset.id]);
      const stored = await storedObject(asset);
      expect(Buffer.from(stored ?? []).equals(Buffer.from(content))).toBe(true);

      // Readable again, the object is the one that was copied and goes.
      expect((await newJob().run(PROJECT, USER)).moved).toEqual([asset.id]);
      expect(await storedKeys()).toEqual([]);
    });

    it("a bytes update that loaded the row before the move named the file is not lost to the delete", async () => {
      const content = bytesOf(++seq, 4096);
      const updated = bytesOf(++seq, 4096);
      const asset = await legacyAsset({
        name: "notes",
        contentType: "text/plain",
        bytes: content
      });
      const key = getAssetStorageKey(USER, asset.id, "text/plain");
      const objectUri = rawAssets.uriForKey(key);

      // Without the folder lock, the update's store under the legacy key
      // runs whenever it likes. This holds it back until the move is about
      // to delete the object, which is the moment that loses the bytes.
      let openGate = (): void => {};
      const gate = new Promise<void>((resolve) => {
        openGate = resolve;
      });
      let updateStored = (): void => {};
      const stored = new Promise<void>((resolve) => {
        updateStored = resolve;
      });
      const store = assetStore.store.bind(assetStore);
      vi.spyOn(assetStore, "store").mockImplementation(
        async (storeKey, data, contentType) => {
          if (storeKey !== key) return store(storeKey, data, contentType);
          await gate;
          const uri = await store(storeKey, data, contentType);
          updateStored();
          return uri;
        }
      );
      // The move's delete of the object lets the held store go first.
      const beforeDelete = async (uri: string): Promise<void> => {
        if (uri !== objectUri) return;
        openGate();
        await Promise.race([stored, sleep(200)]);
      };
      if (kind === "local") {
        const remove = FileStorageAdapter.prototype.delete;
        vi.spyOn(FileStorageAdapter.prototype, "delete").mockImplementation(
          async function (this: FileStorageAdapter, uri: string) {
            await beforeDelete(uri);
            return remove.call(this, uri);
          }
        );
      } else {
        const remove = rawStore.delete.bind(rawStore);
        vi.spyOn(rawStore, "delete").mockImplementation(async (uri) => {
          await beforeDelete(uri);
          return remove(uri);
        });
      }

      let update: Promise<unknown> = Promise.resolve();
      const job = newJob(async (step) => {
        if (step !== "verified") return;
        // The update loads the row now: before the move names the file.
        update = updateAssetBytesModelInterface({
          userId: USER,
          assetId: asset.id,
          content: updated
        });
        await sleep(20);
      });
      await job.run(PROJECT, USER);
      await update;

      // The asset reads the new bytes, from its file in the folder.
      const read = await readById(asset);
      expect(Buffer.from(read ?? []).equals(Buffer.from(updated))).toBe(true);
      const row = await reload(asset);
      expect(row.workspace_path).toBe("notes.txt");
      const file = await folder(kind).read("notes.txt");
      expect(Buffer.from(file ?? []).equals(Buffer.from(updated))).toBe(true);
      expect(await folderFiles(kind)).toEqual(["notes.txt"]);
      // Nothing was stored under the key, where it would shadow the file.
      expect(await storedKeys()).toEqual([]);
    });

    it("a bytes update of an asset with no file in the folder is stored under its key and moved later", async () => {
      const updated = bytesOf(++seq, 4096);
      const asset = await legacyAsset({ name: "notes", contentType: "text/plain" });

      await updateAssetBytesModelInterface({
        userId: USER,
        assetId: asset.id,
        content: updated
      });

      const stored = await storedObject(asset);
      expect(Buffer.from(stored ?? []).equals(Buffer.from(updated))).toBe(true);
      expect((await reload(asset)).workspace_path).toBeNull();
      expect((await reload(asset)).size).toBe(updated.byteLength);

      expect((await newJob().run(PROJECT, USER)).moved).toEqual([asset.id]);
      const file = await folder(kind).read("notes.txt");
      expect(Buffer.from(file ?? []).equals(Buffer.from(updated))).toBe(true);
    });

    it("a bytes update of a row loaded before a move stopped keeps the move's record, and the restart leaves one file", async () => {
      const content = bytesOf(++seq, 4096);
      const updated = bytesOf(++seq, 4096);
      const asset = await legacyAsset({ name: "fox", bytes: content });
      // A request loads the row, then the move copies the bytes and stops.
      const loaded = await reload(asset);
      await jobKilledAfter("copied").run(PROJECT, USER);
      expect(moveTargetOf(await reload(asset))).toBe("fox.png");

      // The request stores new bytes and saves the row it loaded.
      const outcome = await storeLegacyAssetBytes(loaded, async () => {
        await updateStoredBytes(loaded, updated);
        loaded.size = updated.byteLength;
        await loaded.save();
      });
      expect(outcome).toBe("stored");
      expect(moveTargetOf(await reload(asset))).toBe("fox.png");

      expect((await newJob().run(PROJECT, USER)).moved).toEqual([asset.id]);
      expect((await reload(asset)).workspace_path).toBe("fox.png");
      expect(await folderFiles(kind)).toEqual(["fox.png"]);
      const file = await folder(kind).read("fox.png");
      expect(Buffer.from(file ?? []).equals(Buffer.from(updated))).toBe(true);
      expect(await storedKeys()).toEqual([]);
    });

    it("a bytes update takes the folder lock of the project the row names now", async () => {
      const asset = await legacyAsset({ name: "fox" });
      const loaded = await reload(asset);
      // The asset goes to another project after the request loaded it.
      const current = await reload(asset);
      current.project_id = "project-b";
      await current.save();

      let releaseB!: () => void;
      const holdingB = withProjectFolderLock(
        USER,
        "project-b",
        () => new Promise<void>((resolve) => (releaseB = resolve))
      );
      let stored = false;
      const update = storeLegacyAssetBytes(loaded, async () => {
        stored = true;
        await loaded.save();
      });
      await sleep(50);
      expect(stored).toBe(false);
      releaseB();
      await holdingB;
      expect(await update).toBe("stored");
      expect(stored).toBe(true);
      // The save did not put the asset back in the project it was loaded from.
      expect((await reload(asset)).project_id).toBe("project-b");
    });

    it("points a row whose stored object is gone at the file its move recorded, and at no other", async () => {
      const content = bytesOf(++seq, 4096);
      const make = async (name: string, fileBytes: Uint8Array): Promise<Asset> => {
        const asset = await Asset.create<Asset>({
          user_id: USER,
          project_id: PROJECT,
          name,
          content_type: "image/png",
          size: content.byteLength,
          // A stale save put the row back after its stored object was deleted.
          metadata: {
            [WORKSPACE_MOVE_TARGET_KEY]: `${name}.png`,
            [WORKSPACE_MOVE_SOURCE_KEY]: sha256(content)
          }
        });
        await folder(kind).write(`${name}.png`, fileBytes);
        return asset;
      };
      const own = await make("own", content);
      // The same size as the asset, and not its bytes.
      const other = await make("other", bytesOf(++seq, 4096));

      const report = await newJob().run(PROJECT, USER);

      expect(report.moved).toEqual([own.id]);
      expect(report.withoutBytes).toEqual([other.id]);
      expect((await reload(own)).workspace_path).toBe("own.png");
      expect(moveTargetOf(await reload(own))).toBeNull();
      expect((await reload(other)).workspace_path).toBeNull();
      expect(await folderFiles(kind)).toEqual(["other.png", "own.png"]);
    });

    it("keeps the legacy object when the copy differs only in the middle of a large file", async () => {
      // Longer than both partial-hash spans. The size and the first and last
      // 1 MiB of the copy are right, and one byte between them is not.
      const content = bytesOf(++seq, 2 * MIB + 4096);
      const asset = await legacyAsset({ name: "take", bytes: content });
      workspaces.set(
        PROJECT,
        folderWriting(folder(kind), (data) => {
          // A copy of its own: `slice` on a Buffer shares the bytes.
          const copy = new Uint8Array(data);
          copy[MIB + 100] = (copy[MIB + 100] ?? 0) ^ 0xff;
          return copy;
        })
      );

      const report = await newJob().run(PROJECT, USER);

      expect(report.moved).toEqual([]);
      expect(report.failed).toEqual([asset.id]);
      expect((await reload(asset)).workspace_path).toBeNull();
      const stored = await storedObject(asset);
      expect(Buffer.from(stored ?? []).equals(Buffer.from(content))).toBe(true);
      expect(await folderFiles(kind)).toEqual([]);
    });

    it("leaves no file behind for an asset that was deleted while its bytes were copied", async () => {
      const asset = await legacyAsset({ name: "fox" });
      const job = newJob(async (step) => {
        if (step === "copied") await (await reload(asset)).delete();
      });

      const report = await job.run(PROJECT, USER);

      expect(report.moved).toEqual([]);
      expect(await Asset.find(USER, asset.id)).toBeNull();
      expect(await folderFiles(kind)).toEqual([]);
      // The reconcile finds nothing to turn into a new asset.
      expect((await reconcileProjectIndex(PROJECT, USER)).created).toEqual([]);
    });

    it("keeps the legacy object when the file left the folder before it was deleted", async () => {
      const content = bytesOf(++seq);
      const asset = await legacyAsset({ name: "fox", bytes: content });
      const job = newJob(async (step) => {
        if (step === "switched") await folder(kind).delete("fox.png");
      });

      const report = await job.run(PROJECT, USER);

      expect(report.failed).toEqual([asset.id]);
      // The stored bytes are the only copy left, and the asset still reads.
      expect(await storedKeys()).toEqual([
        getAssetStorageKey(USER, asset.id, "image/png")
      ]);
      const read = await readById(asset);
      expect(Buffer.from(read ?? []).equals(Buffer.from(content))).toBe(true);
    });

    it("files an asset of a hidden folder under a name the reconcile reads", async () => {
      const hidden = await folderRow(".cache");
      const asset = await legacyAsset({ name: "fox", parentId: hidden.id });

      await newJob().run(PROJECT, USER);

      expect((await reload(asset)).workspace_path).toBe("_.cache/fox.png");
      const reconciled = await reconcileProjectIndex(PROJECT, USER);
      expect(reconciled.offline).toEqual([]);
      expect(reconciled.created).toEqual([]);
    });

    it("hands the waiting copy to its own asset when a tool asks for the row of that path", async () => {
      const asset = await legacyAsset({
        name: "notes",
        contentType: "text/plain"
      });
      await jobKilledAfter("copied").run(PROJECT, USER);
      expect(await folderFiles(kind)).toEqual(["notes.txt"]);

      const row = await ensureAssetForPath(PROJECT, USER, "notes.txt");

      expect(row.id).toBe(asset.id);
      expect((await Asset.listByProject(USER, PROJECT)).length).toBe(1);
    });

    it("assigns assets in no project to Personal first and moves them into its folder", async () => {
      const content = bytesOf(++seq);
      const loose = await legacyAsset({
        name: "loose",
        bytes: content,
        projectId: "default"
      });
      const job = newJob();

      const scheduled = await scheduleLegacyAssetMoves(job);
      await job.idle();

      const personal = await Project.ensurePersonal(USER);
      expect(scheduled).toBe(1);
      const row = await reload(loose);
      expect(row.project_id).toBe(personal.id);
      expect(row.workspace_path).toBe("loose.png");
      const file = await folder(kind, personal.id).read("loose.png");
      expect(Buffer.from(file ?? []).equals(Buffer.from(content))).toBe(true);
      expect(await storedKeys()).toEqual([]);
    });

    it("reports progress per project while it moves and none afterwards", async () => {
      const seeded = await seedProject();
      const seen: (number | undefined)[] = [];
      const job: ProjectAssetMoveJob = newJob((step) => {
        if (step === "switched") seen.push(job.progress(PROJECT, USER)?.done);
      });
      expect(job.progress(PROJECT, USER)).toBeNull();

      const prepared = await job.prepare(PROJECT, USER);
      expect(prepared).toEqual({ done: 0, total: seeded.assets.length });
      // What a project page reads right after it opened the project.
      expect(job.progress(PROJECT, USER)).toEqual(prepared);
      expect(job.progress("another-project", USER)).toBeNull();
      await job.idle();

      expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
      expect(job.progress(PROJECT, USER)).toBeNull();
      expect(await job.prepare(PROJECT, USER)).toBeNull();
      await expectMoved(kind, seeded);
    });

    it("leaves a row that changed a moment ago for a later pass", async () => {
      const asset = await legacyAsset({ name: "fresh" });
      const job = new ProjectAssetMoveJob();
      try {
        const report = await job.run(PROJECT, USER);

        expect(report.deferred).toEqual([asset.id]);
        expect(report.moved).toEqual([]);
        expect((await reload(asset)).workspace_path).toBeNull();
        expect(await storedKeys()).toHaveLength(1);
      } finally {
        job.stop();
      }
    });
  }
);

describe("a local project folder", () => {
  it("finishes a move that stopped after the copy was published and before its staging name was removed", async () => {
    useFolders("local");
    const content = bytesOf(++seq, 4096);
    const asset = await legacyAsset({ name: "fox", bytes: content });
    asset.metadata = { [WORKSPACE_MOVE_TARGET_KEY]: "fox.png" };
    await asset.save();
    const directory = join(root, "projects", PROJECT);
    await mkdir(directory, { recursive: true });
    const staging = join(directory, legacyAssetStagingName(asset.id));
    await writeFile(staging, content);
    await link(staging, join(directory, "fox.png"));

    const report = await newJob().run(PROJECT, USER);

    expect(report.moved).toEqual([asset.id]);
    expect((await reload(asset)).workspace_path).toBe("fox.png");
    expect(await folderFiles("local")).toEqual(["fox.png"]);
    expect((await stat(join(directory, "fox.png"))).nlink).toBe(1);
    const read = await readById(asset);
    expect(Buffer.from(read ?? []).equals(Buffer.from(content))).toBe(true);
    expect(await storedKeys()).toEqual([]);
  });
});

describe("one asset's move", () => {
  it("moves nothing for an asset of another project", async () => {
    useFolders("local");
    const asset = await legacyAsset({ name: "fox", projectId: "project-b" });

    const outcome = await moveLegacyAssetIntoFolder(USER, asset.id, {
      storage: assetStore,
      workspace: folder("local"),
      projectId: PROJECT,
      resolver: new ProjectDirectoryResolver(PROJECT, new Map())
    });

    expect(outcome).toEqual({ status: "settled" });
    expect((await reload(asset)).workspace_path).toBeNull();
    expect(await folderFiles("local")).toEqual([]);
    expect(await storedKeys()).toHaveLength(1);
  });
});
