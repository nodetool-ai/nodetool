/**
 * Keeping a project folder and its asset index in step while the project is
 * open (PRD D4, T3, T4, US5): the folder watcher, the reconcile of changed
 * paths, the background job that computes full content hashes, the rematch
 * that uses them, what a changed file invalidates, and the asset manifest.
 *
 * Cases that read or write project files run against a local directory and
 * against a storage-backed folder, through the same `Workspace` interface.
 * A watcher exists only for a local directory, so its cases are local.
 */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, open, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getHeapStatistics } from "node:v8";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Asset, ModelObserver, initTestDb } from "@nodetool-ai/models";
import {
  createLocalWorkspace,
  createWorkspace,
  loadSharpOrThrow,
  setProjectFolderResolver,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";
import { getAssetThumbnailKey } from "@nodetool-ai/asset-services/asset-paths";
import { lookupExternalAssetPath } from "@nodetool-ai/asset-services/external-asset-lookup";
import {
  saveProjectAsset,
  withProjectFolderLock
} from "@nodetool-ai/asset-services/project-asset";
import {
  PARTIAL_HASH_SPAN,
  isProjectAssetOffline,
  partialContentHash
} from "@nodetool-ai/asset-services/project-asset-file";
import { ProjectAssetStorageAdapter } from "@nodetool-ai/asset-services/project-asset-storage";
import { getAssetAdapter } from "@nodetool-ai/asset-services/storage";
import { ProjectHashJob } from "../src/project-hash-job.js";
import {
  ensureAssetForPath,
  flushProjectReconciles,
  onProjectFileChanged,
  reconcileProjectIndex,
  scheduleProjectReconcile
} from "../src/project-index.js";
import {
  ASSET_MANIFEST_FILE,
  ASSET_MANIFEST_TEMP_FILE,
  MANIFEST_DEBOUNCE_MS,
  assetManifestOf,
  flushAssetManifestWrites,
  scheduleAssetManifestWrite,
  writeAssetManifest,
  writeProjectAssetManifest,
  type AssetManifest
} from "../src/project-manifest.js";
import {
  ProjectFolderWatchers,
  WATCH_DEBOUNCE_MS,
  WATCH_MAX_PATHS,
  WATCH_MAX_WAIT_MS,
  type FolderWatchFactory
} from "../src/project-watch.js";

vi.mock("@nodetool-ai/asset-services/storage", () => ({
  getAssetAdapter: vi.fn()
}));

const USER = "owner";
const PROJECT = "project-a";
const MIB = 1024 * 1024;

let root: string;
let rawStore: InMemoryStorageAdapter;
/** The asset store readers resolve an asset's id key through. */
let assetStore: StorageAdapter;
let workspaces: Map<string, Workspace>;
let nodetoolDirs: Map<string, Workspace>;
let red: Uint8Array;
let blue: Uint8Array;

const kinds = {
  /** A real directory on this host. */
  local: {
    folder: (projectId: string): Workspace =>
      createLocalWorkspace(join(root, "projects", projectId)),
    nodetoolDir: (projectId: string): Workspace =>
      createLocalWorkspace(join(root, "projects", projectId, ".nodetool"))
  },
  /** A key prefix in the object store the assets live in. */
  storage: {
    folder: (projectId: string): Workspace =>
      createWorkspace(rawStore, { prefix: `workspaces/${USER}/${projectId}` }),
    nodetoolDir: (projectId: string): Workspace =>
      createWorkspace(rawStore, {
        prefix: `workspaces/${USER}/${projectId}/.nodetool`
      })
  }
} as const;
type Kind = keyof typeof kinds;

/** The project's folder. Writes through it stand for another app's. */
function folder(kind: Kind, projectId = PROJECT): Workspace {
  let workspace = workspaces.get(projectId);
  if (!workspace) {
    workspace = kinds[kind].folder(projectId);
    workspaces.set(projectId, workspace);
  }
  return workspace;
}

/** The folder's reserved directory, where NodeTool keeps its own files. */
function nodetoolDir(kind: Kind, projectId = PROJECT): Workspace {
  let workspace = nodetoolDirs.get(projectId);
  if (!workspace) {
    workspace = kinds[kind].nodetoolDir(projectId);
    nodetoolDirs.set(projectId, workspace);
  }
  return workspace;
}

function useFolders(kind: Kind): void {
  assetStore =
    kind === "local"
      ? new FileStorageAdapter(join(root, "assets"), {
          externalPathLookup: lookupExternalAssetPath
        })
      : new ProjectAssetStorageAdapter(rawStore);
  vi.mocked(getAssetAdapter).mockReturnValue(assetStore);
  setProjectFolderResolver(
    async (projectId): Promise<ProjectFolderResolution> => {
      const id = projectId ?? "personal";
      return {
        ok: true,
        projectId: id,
        workspace: folder(kind, id),
        nodetoolDir: nodetoolDir(kind, id)
      };
    }
  );
}

/** The directory of a local project folder on this host. */
function directoryOf(projectId = PROJECT): string {
  return join(root, "projects", projectId);
}

async function rowsOf(projectId = PROJECT): Promise<Asset[]> {
  return Asset.listProjectFiles(USER, projectId);
}

async function reload(asset: Asset): Promise<Asset> {
  const found = await Asset.find(USER, asset.id);
  if (!found) throw new Error(`asset ${asset.id} is gone`);
  return found;
}

function saveImage(name: string, bytes: Uint8Array = red): Promise<Asset> {
  return saveProjectAsset({
    projectId: PROJECT,
    userId: USER,
    name,
    contentType: "image/png",
    bytes
  });
}

async function thumbnailOf(asset: Asset): Promise<Uint8Array | null> {
  return assetStore.retrieve(
    assetStore.uriForKey(getAssetThumbnailKey(USER, asset.id))
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function solidPng(r: number, g: number, b: number): Promise<Uint8Array> {
  const sharp = await loadSharpOrThrow();
  const png = await sharp({
    create: { width: 16, height: 16, channels: 3, background: { r, g, b } }
  })
    .png()
    .toBuffer();
  return new Uint8Array(png);
}

/**
 * A file of two partial-hash spans plus a middle. Two twins differ only in
 * one byte of the middle, so their size and their first and last 1 MiB are
 * equal and the partial fingerprint cannot tell them apart.
 */
function twin(middle: number): Uint8Array {
  const bytes = new Uint8Array(2 * PARTIAL_HASH_SPAN + 64).fill(7);
  bytes[PARTIAL_HASH_SPAN + 10] = middle;
  return bytes;
}

async function until(
  what: string,
  timeoutMs: number,
  check: () => Promise<boolean>
): Promise<number> {
  const started = Date.now();
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return Date.now() - started;
}

/** A watcher factory that records what it was asked to watch. */
function recordingWatch(): {
  watch: FolderWatchFactory;
  directories: string[];
  closed: string[];
  change(directory: string, path: string | null): void;
  fail(directory: string, error: Error): void;
} {
  const live = new Map<
    string,
    { onChange: (path: string | null) => void; onError: (e: unknown) => void }
  >();
  const directories: string[] = [];
  const closed: string[] = [];
  return {
    directories,
    closed,
    watch: (directory, onChange, onError) => {
      directories.push(directory);
      live.set(directory, { onChange, onError });
      return {
        close: () => {
          closed.push(directory);
          live.delete(directory);
        }
      };
    },
    change: (directory, path) => live.get(directory)?.onChange(path),
    fail: (directory, error) => live.get(directory)?.onError(error)
  };
}

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-project-sync-"));
  rawStore = new InMemoryStorageAdapter();
  workspaces = new Map();
  nodetoolDirs = new Map();
  red ??= await solidPng(255, 0, 0);
  blue ??= await solidPng(0, 0, 255);
});

afterEach(async () => {
  await flushProjectReconciles();
  vi.useRealTimers();
  ModelObserver.clear();
  setProjectFolderResolver(null);
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe("the folder watcher", () => {
  it("overwriting a file on disk updates the fingerprint and the thumbnail within five seconds, under the same asset id", async () => {
    useFolders("local");
    const asset = await saveImage("a");
    expect(asset.workspace_path).toBe("Generated/a.png");
    const before = await thumbnailOf(asset);
    expect(before).not.toBeNull();
    const watchers = new ProjectFolderWatchers();
    const client = {};
    try {
      await watchers.setOpenProject(client, USER, PROJECT);
      expect(watchers.isWatching(PROJECT, USER)).toBe(true);
      // The reconcile a project open starts has nothing to do with the change.
      await flushProjectReconciles();

      // Another app saves over the file.
      await writeFile(join(directoryOf(), "Generated", "a.png"), blue);
      const elapsed = await until("the changed file to be indexed", 5_000, async () => {
        const row = await reload(asset);
        const thumbnail = await thumbnailOf(asset);
        return (
          row.metadata?.["workspace_hash"] === partialContentHash(blue) &&
          thumbnail !== null &&
          !Buffer.from(thumbnail).equals(Buffer.from(before!))
        );
      });

      expect(elapsed).toBeLessThan(5_000);
      const rows = await rowsOf();
      expect(rows.map((row) => row.id)).toEqual([asset.id]);
      expect(rows[0]).toMatchObject({
        workspace_path: "Generated/a.png",
        size: blue.byteLength
      });
    } finally {
      watchers.closeAll();
    }
  }, 30_000);

  it("a file another app moves and a file it adds are indexed while the project is open", async () => {
    useFolders("local");
    const asset = await saveImage("a");
    const watchers = new ProjectFolderWatchers();
    try {
      await watchers.setOpenProject({}, USER, PROJECT);
      await flushProjectReconciles();

      await mkdir(join(directoryOf(), "shots"), { recursive: true });
      await rename(
        join(directoryOf(), "Generated", "a.png"),
        join(directoryOf(), "shots", "hero.png")
      );
      await writeFile(join(directoryOf(), "shots", "new.png"), blue);

      await until("the moved and the new file to be indexed", 5_000, async () => {
        const rows = await rowsOf();
        return (
          rows.length === 2 &&
          rows.some((row) => row.workspace_path === "shots/new.png") &&
          (await reload(asset)).workspace_path === "shots/hero.png"
        );
      });
      expect(isProjectAssetOffline(await reload(asset))).toBe(false);
    } finally {
      watchers.closeAll();
    }
  }, 30_000);

  it("no watcher exists for a cloud folder", async () => {
    useFolders("storage");
    await saveImage("a");
    const recorded = recordingWatch();
    const watchers = new ProjectFolderWatchers(recorded.watch);

    await watchers.setOpenProject({}, USER, PROJECT);

    expect(recorded.directories).toEqual([]);
    expect(watchers.isWatching(PROJECT, USER)).toBe(false);
    expect(watchers.watching).toBe(0);
    // The project's index is still reconciled when it opens.
    await flushProjectReconciles();
    expect(await rowsOf()).toHaveLength(1);
  });

  it("watches a local folder from the first client that opens the project to the last that leaves", async () => {
    useFolders("local");
    const recorded = recordingWatch();
    const watchers = new ProjectFolderWatchers(recorded.watch);
    const first = {};
    const second = {};

    expect(watchers.watching).toBe(0);
    await watchers.setOpenProject(first, USER, PROJECT);
    await watchers.setOpenProject(second, USER, PROJECT);
    expect(recorded.directories).toEqual([directoryOf()]);
    expect(watchers.isWatching(PROJECT, USER)).toBe(true);

    watchers.release(first);
    expect(recorded.closed).toEqual([]);
    expect(watchers.isWatching(PROJECT, USER)).toBe(true);

    watchers.release(second);
    expect(recorded.closed).toEqual([directoryOf()]);
    expect(watchers.isWatching(PROJECT, USER)).toBe(false);
    expect(watchers.watching).toBe(0);
  });

  it("a client has one project open: opening another, or none, stops the watcher of the one it left", async () => {
    useFolders("local");
    const recorded = recordingWatch();
    const watchers = new ProjectFolderWatchers(recorded.watch);
    const client = {};

    await watchers.setOpenProject(client, USER, PROJECT);
    await watchers.setOpenProject(client, USER, "project-b");
    expect(recorded.directories).toEqual([
      directoryOf(),
      directoryOf("project-b")
    ]);
    expect(recorded.closed).toEqual([directoryOf()]);
    expect(watchers.isWatching("project-b", USER)).toBe(true);

    await watchers.setOpenProject(client, USER, null);
    expect(recorded.closed).toEqual([directoryOf(), directoryOf("project-b")]);
    expect(watchers.watching).toBe(0);
  });

  it("a client that left while its folder was being resolved gets no watcher", async () => {
    useFolders("local");
    const recorded = recordingWatch();
    const watchers = new ProjectFolderWatchers(recorded.watch);
    const client = {};

    const opening = watchers.setOpenProject(client, USER, PROJECT);
    watchers.release(client);
    await opening;

    expect(recorded.directories).toEqual([]);
    expect(watchers.watching).toBe(0);
  });

  it("starts no watcher for a project whose folder cannot be reached", async () => {
    useFolders("local");
    setProjectFolderResolver(async (projectId) => ({
      ok: false,
      projectId: projectId ?? null,
      reason: "Project folder not found"
    }));
    const recorded = recordingWatch();
    const watchers = new ProjectFolderWatchers(recorded.watch);

    await expect(
      watchers.setOpenProject({}, USER, PROJECT)
    ).resolves.toBeUndefined();
    expect(recorded.directories).toEqual([]);
  });

  it("stops a watcher that fails, and the next open starts one again", async () => {
    useFolders("local");
    const recorded = recordingWatch();
    const watchers = new ProjectFolderWatchers(recorded.watch);

    await watchers.setOpenProject({}, USER, PROJECT);
    recorded.fail(directoryOf(), new Error("the directory is gone"));
    expect(watchers.isWatching(PROJECT, USER)).toBe(false);
    expect(recorded.closed).toEqual([directoryOf()]);

    await watchers.setOpenProject({}, USER, PROJECT);
    expect(watchers.isWatching(PROJECT, USER)).toBe(true);
    expect(recorded.directories).toEqual([directoryOf(), directoryOf()]);
  });

  describe("events", () => {
    let recorded: ReturnType<typeof recordingWatch>;
    let watchers: ProjectFolderWatchers;

    beforeEach(() => useFolders("local"));

    /** Open the project, let its open reconcile run, then use fake timers. */
    async function open(): Promise<void> {
      recorded = recordingWatch();
      watchers = new ProjectFolderWatchers(recorded.watch);
      await watchers.setOpenProject({}, USER, PROJECT);
      await flushProjectReconciles();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    }

    it("debounces a burst of events into one reconcile of the changed paths only", async () => {
      const asset = await saveImage("a");
      const other = await saveImage("b");
      await open();
      const workspace = folder("local");
      await workspace.write("Generated/a.png", blue);
      // Changed too, but no event names it: a reconcile of paths leaves it.
      await workspace.write("Generated/b.png", blue);
      const lists = vi.spyOn(workspace, "list");
      const stats = vi.spyOn(workspace, "stat");
      const saves: string[] = [];
      ModelObserver.subscribe(
        (instance) => saves.push((instance as Asset).id),
        "Asset"
      );

      recorded.change(directoryOf(), "Generated/a.png");
      await vi.advanceTimersByTimeAsync(WATCH_DEBOUNCE_MS - 1);
      recorded.change(directoryOf(), "Generated/a.png");
      await vi.advanceTimersByTimeAsync(WATCH_DEBOUNCE_MS - 1);
      expect(stats).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await watchers.flush();

      // One reconcile, which listed no directory and saved the named file only.
      expect(lists).not.toHaveBeenCalled();
      expect(saves).toEqual([asset.id]);
      expect((await reload(asset)).metadata?.["workspace_hash"]).toBe(
        partialContentHash(blue)
      );
      expect((await reload(other)).metadata?.["workspace_hash"]).toBe(
        partialContentHash(red)
      );
    });

    it("does not wait forever while events keep arriving", async () => {
      const asset = await saveImage("a");
      await open();
      await folder("local").write("Generated/a.png", blue);
      const stats = vi.spyOn(folder("local"), "stat");

      const step = WATCH_DEBOUNCE_MS - 50;
      for (let waited = 0; waited < WATCH_MAX_WAIT_MS; waited += step) {
        recorded.change(directoryOf(), "Generated/a.png");
        await vi.advanceTimersByTimeAsync(step);
      }

      // It started on its own, with an event still less than the quiet time old.
      expect(stats).toHaveBeenCalledWith("Generated/a.png");
      await watchers.flush();
      expect((await reload(asset)).metadata?.["workspace_hash"]).toBe(
        partialContentHash(blue)
      );
    });

    it("ignores NodeTool's own directory and the directories the index never enters", async () => {
      await saveImage("a");
      await open();
      const workspace = folder("local");
      const stats = vi.spyOn(workspace, "stat");
      const lists = vi.spyOn(workspace, "list");

      recorded.change(directoryOf(), ".nodetool/assets.json");
      recorded.change(directoryOf(), ".NodeTool/assets.json.tmp");
      recorded.change(directoryOf(), "node_modules/pkg/logo.png");
      recorded.change(directoryOf(), ".git/objects/ab/cd.png");
      await vi.advanceTimersByTimeAsync(WATCH_MAX_WAIT_MS);
      await watchers.flush();

      expect(stats).not.toHaveBeenCalled();
      expect(lists).not.toHaveBeenCalled();
    });

    it("scans the whole folder when an event names no path, or too many paths changed", async () => {
      await saveImage("a");
      await open();
      const workspace = folder("local");
      await workspace.write("art/unnamed.png", blue);
      const lists = vi.spyOn(workspace, "list");

      recorded.change(directoryOf(), null);
      await vi.advanceTimersByTimeAsync(WATCH_DEBOUNCE_MS);
      await watchers.flush();
      expect(lists.mock.calls.map(([path]) => path)).toContain("");
      expect((await rowsOf()).map((row) => row.workspace_path).sort()).toEqual([
        "Generated/a.png",
        "art/unnamed.png"
      ]);

      lists.mockClear();
      await workspace.write("art/late.png", red);
      for (let n = 0; n <= WATCH_MAX_PATHS; n++) {
        recorded.change(directoryOf(), `burst/file-${n}.txt`);
      }
      await vi.advanceTimersByTimeAsync(WATCH_MAX_WAIT_MS);
      await watchers.flush();
      expect(lists.mock.calls.map(([path]) => path)).toContain("");
      expect((await rowsOf()).map((row) => row.workspace_path)).toContain(
        "art/late.png"
      );
    });

    it("drops the changes still waiting when the last client leaves", async () => {
      const asset = await saveImage("a");
      await open();
      await folder("local").write("Generated/a.png", blue);

      recorded.change(directoryOf(), "Generated/a.png");
      watchers.closeAll();
      await vi.advanceTimersByTimeAsync(WATCH_MAX_WAIT_MS);
      await watchers.flush();

      expect((await reload(asset)).metadata?.["workspace_hash"]).toBe(
        partialContentHash(red)
      );
    });
  });
});

describe.each(["local", "storage"] as const)(
  "reconcile of changed paths (%s folder)",
  (kind) => {
    beforeEach(() => useFolders(kind));

    it("a changed file gets its new fingerprint, and a file not named is not looked at", async () => {
      const named = await saveImage("named");
      const unnamed = await saveImage("unnamed");
      const workspace = folder(kind);
      await workspace.write("Generated/named.png", blue);
      await workspace.write("Generated/unnamed.png", blue);
      const lists = vi.spyOn(workspace, "list");

      const report = await reconcileProjectIndex(PROJECT, USER, {
        paths: ["Generated/named.png"]
      });

      expect(report).toMatchObject({ files: 1, updated: [named.id] });
      expect(lists).not.toHaveBeenCalled();
      expect((await reload(unnamed)).metadata?.["workspace_hash"]).toBe(
        partialContentHash(red)
      );
      // The whole scan then finds the other one.
      expect((await reconcileProjectIndex(PROJECT, USER)).updated).toEqual([
        unnamed.id
      ]);
    });

    it("a moved file keeps its asset when both of its paths are named", async () => {
      const asset = await saveImage("fox");
      await folder(kind).move("Generated/fox.png", "shots/hero.png");

      const report = await reconcileProjectIndex(PROJECT, USER, {
        paths: ["Generated/fox.png", "shots/hero.png"]
      });

      expect(report.moved).toEqual([asset.id]);
      expect(report.created).toEqual([]);
      expect((await reload(asset)).workspace_path).toBe("shots/hero.png");
    });

    it("a deleted file leaves its row offline, and only that row", async () => {
      const gone = await saveImage("gone");
      const kept = await saveImage("kept");
      await folder(kind).delete("Generated/gone.png");

      const report = await reconcileProjectIndex(PROJECT, USER, {
        paths: ["Generated/gone.png"]
      });

      expect(report.offline).toEqual([gone.id]);
      expect(isProjectAssetOffline(await reload(gone))).toBe(true);
      expect(isProjectAssetOffline(await reload(kept))).toBe(false);
    });

    it("a new media file gets a row, and another new file does not", async () => {
      await folder(kind).write("art/new.png", red);
      await folder(kind).write("notes/plan.txt", new TextEncoder().encode("plan"));

      const report = await reconcileProjectIndex(PROJECT, USER, {
        paths: ["art/new.png", "notes/plan.txt"]
      });

      const rows = await rowsOf();
      expect(rows.map((row) => row.workspace_path)).toEqual(["art/new.png"]);
      expect(report.created).toEqual([rows[0]?.id]);
    });

    it("a renamed directory is named by itself, and every file below it keeps its asset", async () => {
      const first = await saveProjectAsset({
        projectId: PROJECT,
        userId: USER,
        name: "one",
        contentType: "image/png",
        bytes: red,
        path: "takes/day-1/one.png"
      });
      const second = await saveProjectAsset({
        projectId: PROJECT,
        userId: USER,
        name: "two",
        contentType: "image/png",
        bytes: blue,
        path: "takes/two.png"
      });
      const workspace = folder(kind);
      await workspace.move("takes/day-1/one.png", "selects/day-1/one.png");
      await workspace.move("takes/two.png", "selects/two.png");

      const report = await reconcileProjectIndex(PROJECT, USER, {
        paths: ["takes", "selects"]
      });

      expect([...report.moved].sort()).toEqual([first.id, second.id].sort());
      expect(report.offline).toEqual([]);
      expect((await reload(first)).workspace_path).toBe("selects/day-1/one.png");
      expect((await reload(second)).workspace_path).toBe("selects/two.png");
    });

    it("leaves out a path in NodeTool's own directory, in a skipped directory, or outside the folder", async () => {
      await saveImage("fox");
      const workspace = folder(kind);
      const stats = vi.spyOn(workspace, "stat");

      const report = await reconcileProjectIndex(PROJECT, USER, {
        paths: [
          ".nodetool/assets.json",
          "node_modules/pkg/logo.png",
          ".cache/thumb.png",
          "../outside.png"
        ]
      });

      expect(stats).not.toHaveBeenCalled();
      expect(report).toMatchObject({ files: 0, created: [], offline: [] });
    });
  }
);

describe.each(["local", "storage"] as const)(
  "the full content hash (%s folder)",
  (kind) => {
    beforeEach(() => useFolders(kind));

    it("the hash job stores the SHA-256 of every indexed file", async () => {
      const first = await saveImage("first", red);
      const second = await saveImage("second", blue);
      expect(first.content_hash).toBeNull();

      const job = new ProjectHashJob();
      job.schedule(PROJECT, USER);
      await job.idle();

      expect((await reload(first)).content_hash).toBe(sha256(red));
      expect((await reload(second)).content_hash).toBe(sha256(blue));
    });

    it("storing a hash changes nothing else on the row and announces no change", async () => {
      const asset = await saveImage("fox");
      const events: string[] = [];
      ModelObserver.subscribe((_instance, event) => events.push(event), "Asset");

      const job = new ProjectHashJob();
      job.schedule(PROJECT, USER);
      await job.idle();

      const after = await reload(asset);
      expect(after.content_hash).toBe(sha256(red));
      expect(after.updated_at).toBe(asset.updated_at);
      expect(after.metadata).toEqual(asset.metadata);
      expect(events).toEqual([]);
    });

    it("skips a file that is offline and a file that changed since its row was recorded", async () => {
      const offline = await saveImage("offline");
      const changed = await saveImage("changed");
      const workspace = folder(kind);
      await workspace.delete("Generated/offline.png");
      await reconcileProjectIndex(PROJECT, USER);
      // Saved over after the reconcile: the row still records the old file.
      await workspace.write("Generated/changed.png", twin(1));

      const job = new ProjectHashJob();
      job.schedule(PROJECT, USER);
      await job.idle();

      expect((await reload(offline)).content_hash).toBeNull();
      expect((await reload(changed)).content_hash).toBeNull();

      // The reconcile records the new file, and the next pass hashes it.
      await reconcileProjectIndex(PROJECT, USER);
      job.schedule(PROJECT, USER);
      await job.idle();
      expect((await reload(changed)).content_hash).toBe(sha256(twin(1)));
    });

    it("a file whose fingerprint changes loses its full hash until it is hashed again", async () => {
      const asset = await saveImage("fox");
      const job = new ProjectHashJob();
      job.schedule(PROJECT, USER);
      await job.idle();
      expect((await reload(asset)).content_hash).toBe(sha256(red));

      await folder(kind).write("Generated/fox.png", blue);
      await reconcileProjectIndex(PROJECT, USER);
      expect((await reload(asset)).content_hash).toBeNull();

      job.schedule(PROJECT, USER);
      await job.idle();
      expect((await reload(asset)).content_hash).toBe(sha256(blue));
    });

    it("a hash read from a file that changed while it was read is not stored", async () => {
      const asset = await saveImage("fox");
      const workspace = folder(kind);
      const materialize = workspace.materialize.bind(workspace);
      vi.spyOn(workspace, "materialize").mockImplementation(async (path) => {
        const staged = await materialize(path);
        // Another app saves over the file after the job opened it.
        await workspace.write("Generated/fox.png", twin(2));
        return staged;
      });

      const job = new ProjectHashJob();
      job.schedule(PROJECT, USER);
      await job.idle();

      expect((await reload(asset)).content_hash).toBeNull();
    });

    it("killing the job during hashing and starting a new one completes the remaining files without rehashing finished ones", async () => {
      const assets: Asset[] = [];
      for (let n = 0; n < 5; n++) {
        assets.push(await saveImage(`take-${n}`, Uint8Array.from([...red, n])));
      }
      const workspace = folder(kind);
      const materialize = workspace.materialize.bind(workspace);
      const reads: string[] = [];
      let killAt: number | null = 3;
      const first = new ProjectHashJob();
      vi.spyOn(workspace, "materialize").mockImplementation(async (path) => {
        reads.push(path);
        // The process dies while the third file is being read.
        if (reads.length === killAt) first.stop();
        return materialize(path);
      });

      first.schedule(PROJECT, USER);
      await first.idle();

      const finished = (await rowsOf()).filter((row) => row.content_hash !== null);
      expect(finished).toHaveLength(2);
      expect(reads).toHaveLength(3);
      const finishedPaths = finished.map((row) => row.workspace_path);
      expect(reads.slice(0, 2).sort()).toEqual([...finishedPaths].sort());

      // After the restart nothing is left of the first job but the rows.
      killAt = null;
      reads.length = 0;
      const second = new ProjectHashJob();
      second.schedule(PROJECT, USER);
      await second.idle();

      for (const asset of assets) {
        const row = await reload(asset);
        expect(row.content_hash).toBe(
          sha256(Uint8Array.from([...red, assets.indexOf(asset)]))
        );
      }
      expect(reads).toHaveLength(3);
      for (const path of finishedPaths) expect(reads).not.toContain(path);
    });

    it("a stopped job starts nothing more", async () => {
      const asset = await saveImage("fox");
      const job = new ProjectHashJob();
      job.stop();
      job.schedule(PROJECT, USER);
      await job.idle();
      expect((await reload(asset)).content_hash).toBeNull();
    });

    describe("rematching a moved file", () => {
      /** Two indexed files a partial fingerprint cannot tell apart. */
      async function saveTwins(): Promise<{ one: Asset; two: Asset }> {
        expect(partialContentHash(twin(1))).toBe(partialContentHash(twin(2)));
        const save = (name: string, bytes: Uint8Array): Promise<Asset> =>
          saveProjectAsset({
            projectId: PROJECT,
            userId: USER,
            name,
            contentType: "video/mp4",
            bytes,
            path: `takes/${name}.mp4`
          });
        return { one: await save("one", twin(1)), two: await save("two", twin(2)) };
      }

      async function hashAll(): Promise<void> {
        const job = new ProjectHashJob();
        job.schedule(PROJECT, USER);
        await job.idle();
      }

      /** Another app renames the directory both twins are in. */
      async function moveBoth(): Promise<void> {
        const workspace = folder(kind);
        await workspace.move("takes/one.mp4", "selects/a.mp4");
        await workspace.move("takes/two.mp4", "selects/b.mp4");
      }

      it("before hashing, twins that moved leave their rows offline", async () => {
        const { one, two } = await saveTwins();
        await moveBoth();

        const report = await reconcileProjectIndex(PROJECT, USER);

        expect(report.moved).toEqual([]);
        expect([...report.offline].sort()).toEqual([one.id, two.id].sort());
        expect((await reload(one)).workspace_path).toBe("takes/one.mp4");
        expect((await reload(two)).workspace_path).toBe("takes/two.mp4");
      });

      it("once hashed, twins that moved are told apart and each row follows its own file", async () => {
        const { one, two } = await saveTwins();
        await hashAll();
        await moveBoth();

        const report = await reconcileProjectIndex(PROJECT, USER);

        expect([...report.moved].sort()).toEqual([one.id, two.id].sort());
        expect(report.offline).toEqual([]);
        const movedOne = await reload(one);
        const movedTwo = await reload(two);
        expect(movedOne.workspace_path).toBe("selects/a.mp4");
        expect(movedTwo.workspace_path).toBe("selects/b.mp4");
        // A match the full hash proved keeps the hash.
        expect(movedOne.content_hash).toBe(sha256(twin(1)));
        expect(movedTwo.content_hash).toBe(sha256(twin(2)));
      });

      it("before hashing, moving one twin next to an unindexed twin leaves its row offline", async () => {
        const workspace = folder(kind);
        await workspace.write("raw/one.dat", twin(1));
        await workspace.write("raw/two.dat", twin(2));
        const one = await ensureAssetForPath(PROJECT, USER, "raw/one.dat");
        await workspace.move("raw/one.dat", "moved/one.dat");

        const report = await reconcileProjectIndex(PROJECT, USER);

        expect(report.moved).toEqual([]);
        expect(report.offline).toEqual([one.id]);
      });

      it("once hashed, moving one twin next to an unindexed twin rematches it to its own file", async () => {
        const workspace = folder(kind);
        await workspace.write("raw/one.dat", twin(1));
        await workspace.write("raw/two.dat", twin(2));
        const one = await ensureAssetForPath(PROJECT, USER, "raw/one.dat");
        await hashAll();
        await workspace.move("raw/one.dat", "moved/one.dat");

        const report = await reconcileProjectIndex(PROJECT, USER);

        expect(report.moved).toEqual([one.id]);
        expect((await reload(one)).workspace_path).toBe("moved/one.dat");
      });

      it("once hashed, a row stays offline when no candidate has its full hash", async () => {
        const { one } = await saveTwins();
        await hashAll();
        const workspace = folder(kind);
        await workspace.delete("takes/one.mp4");
        // Two files with the row's partial fingerprint and another middle.
        await workspace.write("raw/x.dat", twin(3));
        await workspace.write("raw/y.dat", twin(4));

        const report = await reconcileProjectIndex(PROJECT, USER);

        expect(report.moved).toEqual([]);
        expect(report.offline).toEqual([one.id]);
      });

      it("a match by the partial fingerprint alone drops the full hash, and the job computes it again", async () => {
        const asset = await saveImage("fox");
        await hashAll();
        await folder(kind).move("Generated/fox.png", "shots/hero.png");

        const report = await reconcileProjectIndex(PROJECT, USER);
        expect(report.moved).toEqual([asset.id]);
        expect((await reload(asset)).content_hash).toBeNull();

        await hashAll();
        expect((await reload(asset)).content_hash).toBe(sha256(red));
      });

      it("reads no file in full while the partial fingerprint names one candidate", async () => {
        const asset = await saveImage("fox");
        await hashAll();
        await folder(kind).move("Generated/fox.png", "shots/hero.png");
        // A partial hash stages a file once. A full hash would stage it again.
        const stagings = vi.spyOn(folder(kind), "materialize");

        const report = await reconcileProjectIndex(PROJECT, USER);

        expect(report.moved).toEqual([asset.id]);
        expect(stagings.mock.calls.map(([path]) => path)).toEqual([
          "shots/hero.png"
        ]);
      });
    });
  }
);

describe("the hash job on a large file (local folder)", () => {
  it(
    "hashes a file larger than the heap as a stream, without holding the folder lock",
    async () => {
      useFolders("local");
      const size = getHeapStatistics().heap_size_limit + 16 * MIB;
      await mkdir(join(directoryOf(), "footage"), { recursive: true });
      // A sparse file: its size is real, and it takes no room on disk.
      const handle = await open(join(directoryOf(), "footage", "long.mp4"), "w");
      try {
        await handle.truncate(size);
        await handle.write(Uint8Array.of(1, 2, 3), 0, 3, Math.floor(size / 2));
      } finally {
        await handle.close();
      }
      const report = await reconcileProjectIndex(PROJECT, USER);
      expect(report.created).toHaveLength(1);
      const [asset] = await rowsOf();
      expect(asset?.size).toBe(size);

      const baseline = process.memoryUsage().arrayBuffers;
      let peak = baseline;
      let turns = 0;
      const sampler = setInterval(() => {
        turns++;
        peak = Math.max(peak, process.memoryUsage().arrayBuffers);
      }, 5);
      const job = new ProjectHashJob();
      let savedWhileHashing: Asset | null = null;
      try {
        job.schedule(PROJECT, USER);
        // An asset save takes the folder lock. It finishes while the job reads.
        const saved = await saveImage("during");
        await withProjectFolderLock(USER, PROJECT, async () => undefined);
        savedWhileHashing = (await reload(asset!)).content_hash === null ? saved : null;
        await job.idle();
      } finally {
        clearInterval(sampler);
      }

      expect((await reload(asset!)).content_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(savedWhileHashing).not.toBeNull();
      // Streamed: the file never sat in memory, and the event loop kept turning.
      expect(peak - baseline).toBeLessThan(size / 4);
      expect(turns).toBeGreaterThan(20);
    },
    300_000
  );
});

describe.each(["local", "storage"] as const)(
  "what a changed file invalidates (%s folder)",
  (kind) => {
    beforeEach(() => useFolders(kind));

    it("replaces the thumbnail before the row announces the change", async () => {
      const asset = await saveImage("fox", red);
      const before = await thumbnailOf(asset);
      expect(before).not.toBeNull();
      await folder(kind).write("Generated/fox.png", blue);
      /** The thumbnail a client would fetch when it hears of the change. */
      let seenOnChange: Uint8Array | null | undefined;
      ModelObserver.subscribe((instance) => {
        if ((instance as Asset).id !== asset.id) return;
        void thumbnailOf(asset).then((thumbnail) => {
          seenOnChange ??= thumbnail;
        });
      }, "Asset");

      await reconcileProjectIndex(PROJECT, USER);

      const after = await thumbnailOf(asset);
      expect(after).not.toBeNull();
      expect(Buffer.from(after!).equals(Buffer.from(before!))).toBe(false);
      await vi.waitFor(() => expect(seenOnChange).toBeDefined());
      expect(Buffer.from(seenOnChange!).equals(Buffer.from(after!))).toBe(true);
    });

    it("removes the thumbnail of a file whose new contents cannot be drawn", async () => {
      const asset = await saveImage("fox", red);
      expect(await thumbnailOf(asset)).not.toBeNull();
      await folder(kind).write(
        "Generated/fox.png",
        new TextEncoder().encode("not a picture")
      );

      await reconcileProjectIndex(PROJECT, USER);

      expect(await thumbnailOf(asset)).toBeNull();
    });

    it("leaves the thumbnail of an unchanged file alone", async () => {
      const asset = await saveImage("fox", red);
      const remove = vi.spyOn(assetStore, "delete");
      const store = vi.spyOn(assetStore, "store");

      await reconcileProjectIndex(PROJECT, USER);

      expect(remove).not.toHaveBeenCalled();
      expect(store).not.toHaveBeenCalled();
      expect(await thumbnailOf(asset)).not.toBeNull();
    });

    it("tells the change listeners about a changed file once, after its row is saved", async () => {
      const changed = await saveImage("changed");
      await saveImage("unchanged");
      const heard: Array<{ id: string; hash: unknown }> = [];
      const remove = onProjectFileChanged(async (asset) => {
        const row = await reload(asset);
        heard.push({ id: asset.id, hash: row.metadata?.["workspace_hash"] });
      });
      try {
        await folder(kind).write("Generated/changed.png", blue);
        await reconcileProjectIndex(PROJECT, USER);
        await reconcileProjectIndex(PROJECT, USER);
      } finally {
        remove();
      }

      expect(heard).toEqual([
        { id: changed.id, hash: partialContentHash(blue) }
      ]);
    });

    it("a listener that fails does not fail the reconcile", async () => {
      const asset = await saveImage("fox");
      const remove = onProjectFileChanged(() => {
        throw new Error("listener broke");
      });
      try {
        await folder(kind).write("Generated/fox.png", blue);
        const report = await reconcileProjectIndex(PROJECT, USER);
        expect(report.updated).toEqual([asset.id]);
      } finally {
        remove();
      }
    });
  }
);

describe.each(["local", "storage"] as const)(
  "the asset manifest (%s folder)",
  (kind) => {
    beforeEach(() => useFolders(kind));

    async function readManifest(): Promise<AssetManifest> {
      const text = await nodetoolDir(kind).readText(ASSET_MANIFEST_FILE);
      if (text === null) throw new Error("the folder has no asset manifest");
      return JSON.parse(text) as AssetManifest;
    }

    it("lists every indexed asset after a reconcile, with its path and fingerprint", async () => {
      const saved = await saveImage("saved", red);
      await folder(kind).write("art/added.png", blue);
      await folder(kind).write("notes/plan.txt", new TextEncoder().encode("plan"));

      scheduleProjectReconcile(PROJECT, USER);
      await flushProjectReconciles();

      const rows = await rowsOf();
      expect(rows).toHaveLength(2);
      const manifest = await readManifest();
      expect(manifest).toMatchObject({ format: "nodetool.assets", version: 1 });
      expect(manifest.assets.map((entry) => entry.path)).toEqual([
        "Generated/saved.png",
        "art/added.png"
      ]);
      expect(manifest.assets.map((entry) => entry.id).sort()).toEqual(
        rows.map((row) => row.id).sort()
      );
      const entry = manifest.assets.find((item) => item.id === saved.id);
      const row = await reload(saved);
      expect(entry).toEqual({
        id: saved.id,
        path: "Generated/saved.png",
        size: red.byteLength,
        mtime: row.metadata?.["workspace_mtime"],
        partial_hash: partialContentHash(red),
        // The hash job ran after the reconcile and the manifest was rewritten.
        content_hash: sha256(red)
      });
    });

    it("leaves out the full hash of a file that has none yet, and keeps an offline asset", async () => {
      const asset = await saveImage("fox");
      await folder(kind).delete("Generated/fox.png");
      await reconcileProjectIndex(PROJECT, USER);

      await writeProjectAssetManifest(PROJECT, USER);

      expect((await readManifest()).assets).toEqual([
        {
          id: asset.id,
          path: "Generated/fox.png",
          size: red.byteLength,
          mtime: asset.metadata?.["workspace_mtime"],
          partial_hash: partialContentHash(red)
        }
      ]);
    });

    it("is not a file of the project: no listing shows it and no reconcile indexes it", async () => {
      await saveImage("fox");
      await writeProjectAssetManifest(PROJECT, USER);
      expect(await nodetoolDir(kind).exists(ASSET_MANIFEST_FILE)).toBe(true);

      const listed = await folder(kind).list("", { recursive: true });
      expect(listed.map((entry) => entry.path)).not.toContain(
        `.nodetool/${ASSET_MANIFEST_FILE}`
      );
      const report = await reconcileProjectIndex(PROJECT, USER);
      expect(report).toMatchObject({ files: 1, created: [] });
    });

    it("is valid JSON after an interrupted write, and the next write replaces it", async () => {
      const first = await saveImage("first");
      await writeProjectAssetManifest(PROJECT, USER);
      const before = await nodetoolDir(kind).readText(ASSET_MANIFEST_FILE);
      await saveImage("second");
      const rows = await rowsOf();

      // The process dies after half of the new contents reached the disk.
      const dir = nodetoolDir(kind);
      const write = dir.write.bind(dir);
      const interrupted = vi
        .spyOn(dir, "write")
        .mockImplementationOnce(async (path, data, contentType) => {
          const text = typeof data === "string" ? data : new TextDecoder().decode(data);
          await write(path, text.slice(0, Math.floor(text.length / 2)), contentType);
          throw new Error("killed during the write");
        });
      await expect(writeAssetManifest(dir, assetManifestOf(rows))).rejects.toThrow(
        "killed during the write"
      );
      expect(interrupted).toHaveBeenCalledTimes(1);

      const survived = await dir.readText(ASSET_MANIFEST_FILE);
      expect(survived).toBe(before);
      expect((JSON.parse(survived!) as AssetManifest).assets.map((e) => e.id)).toEqual([
        first.id
      ]);
      // What the interrupted write left behind is not valid JSON.
      const leftover = await dir.readText(ASSET_MANIFEST_TEMP_FILE);
      expect(() => JSON.parse(leftover!) as unknown).toThrow();

      await writeProjectAssetManifest(PROJECT, USER);
      expect((await readManifest()).assets).toHaveLength(2);
      expect(await dir.exists(ASSET_MANIFEST_TEMP_FILE)).toBe(false);
    });

    it("writes once for a burst of changes, and not at all when nothing changed", async () => {
      await saveImage("fox");
      const write = vi.spyOn(nodetoolDir(kind), "write");
      /** Writes of new manifest contents. Each goes to the temporary file. */
      const writes = {
        get count(): number {
          return write.mock.calls.filter(
            ([path]) => path === ASSET_MANIFEST_TEMP_FILE
          ).length;
        }
      };
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

      scheduleAssetManifestWrite(PROJECT, USER);
      await vi.advanceTimersByTimeAsync(MANIFEST_DEBOUNCE_MS - 1);
      scheduleAssetManifestWrite(PROJECT, USER);
      await vi.advanceTimersByTimeAsync(MANIFEST_DEBOUNCE_MS - 1);
      expect(writes.count).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      await flushAssetManifestWrites();
      expect(writes.count).toBe(1);

      scheduleAssetManifestWrite(PROJECT, USER);
      await flushAssetManifestWrites();
      expect(writes.count).toBe(1);
    });

    it("a scheduled write for a folder that cannot be reached does not throw", async () => {
      setProjectFolderResolver(async (projectId) => ({
        ok: false,
        projectId: projectId ?? null,
        reason: "Project folder not found"
      }));
      scheduleAssetManifestWrite(PROJECT, USER);
      await expect(flushAssetManifestWrites()).resolves.toBeUndefined();
    });
  }
);
