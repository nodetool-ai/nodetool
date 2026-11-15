/**
 * Moving the bytes of assets from before project folders into their
 * project's folder (PRD T3, T9 step 4, issue #7602).
 *
 * Every case runs against a local directory and against a storage-backed
 * folder, through the same `Workspace` interface. A "kill" stops the job
 * between two steps of one asset's move, the way a process that dies there
 * stops, and a new job instance stands for the restarted process.
 */
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
  type StorageAdapter
} from "@nodetool-ai/storage";
import {
  getAssetFileName,
  getAssetStorageKey,
  getAssetThumbnailKey,
  retrieveAssetBytes
} from "@nodetool-ai/asset-services/asset-paths";
import { lookupExternalAssetPath } from "@nodetool-ai/asset-services/external-asset-lookup";
import {
  moveLegacyAssetIntoFolder,
  type LegacyAssetMoveStep
} from "@nodetool-ai/asset-services/legacy-asset-move";
import { ProjectAssetStorageAdapter } from "@nodetool-ai/asset-services/project-asset-storage";
import { getAssetAdapter } from "@nodetool-ai/asset-services/storage";
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
    assetStore = new FileStorageAdapter(join(root, "assets"), {
      externalPathLookup: lookupExternalAssetPath
    });
    rawAssets = new FileStorageAdapter(join(root, "assets"));
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

    it("leaves a row with no stored bytes as it is", async () => {
      const orphan = await Asset.create<Asset>({
        user_id: USER,
        project_id: PROJECT,
        name: "lost",
        content_type: "image/png"
      });
      const before = (await reload(orphan)).toRow();

      const report = await newJob().run(PROJECT, USER);

      expect(report.withoutBytes).toEqual([orphan.id]);
      expect((await reload(orphan)).toRow()).toEqual(before);
      expect(await folderFiles(kind)).toEqual([]);
    });

    it("finishes a copy that stopped part way without leaving a second file", async () => {
      const content = bytesOf(++seq, 4096);
      const asset = await legacyAsset({ name: "fox", bytes: content });
      asset.metadata = { [WORKSPACE_MOVE_TARGET_KEY]: "fox.png" };
      await asset.save();
      // The process died while it wrote the copy.
      await folder(kind).write("fox.png", content.subarray(0, 1500));

      const report = await newJob().run(PROJECT, USER);

      expect(report.moved).toEqual([asset.id]);
      expect((await reload(asset)).workspace_path).toBe("fox.png");
      expect(await folderFiles(kind)).toEqual(["fox.png"]);
      const file = await folder(kind).read("fox.png");
      expect(Buffer.from(file ?? []).equals(Buffer.from(content))).toBe(true);
      expect(await storedKeys()).toEqual([]);
    });

    it.each([
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
      const real = folder(kind);
      // A folder that stores less than it was given.
      const writeShort: Workspace["writeNew"] = (path, data, contentType) =>
        real.writeNew(
          path,
          typeof data === "string" ? data : data.subarray(0, data.byteLength - 1),
          contentType
        );
      const lossy = new Proxy(real, {
        get(target, property) {
          if (property === "writeNew") return writeShort;
          const value: unknown = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        }
      });
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

    it("keeps the legacy object when the row changed while the bytes were copied", async () => {
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

      // The next run finds the copy it made and uses it: no second file.
      const next = await newJob().run(PROJECT, USER);
      expect(next.moved).toEqual([asset.id]);
      expect((await reload(asset)).workspace_path).toBe("fox.png");
      expect((await reload(asset)).metadata?.["note"]).toBe("edited");
      expect(await folderFiles(kind)).toEqual(["fox.png"]);
      expect(await storedKeys()).toEqual([]);
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
