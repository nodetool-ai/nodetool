/**
 * Export a project whose assets are files in its folder, import the archive,
 * and open the imported project (project folders PRD T3, T9).
 *
 * An archive carries a folder-backed asset twice: its bytes under
 * `assets/<id>` and the same file under `workspaces/<folder>/`. The import
 * must give the new project each asset once, as the folder file, under the id
 * the imported documents name. Opening the project runs the folder reconcile
 * and the move of legacy bytes into the folder, and neither may add a row or
 * a file.
 *
 * Every case runs with project folders as local directories and as key
 * prefixes in the object store the assets live in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  Asset,
  Game,
  ModelObserver,
  Project,
  TimelineSequence,
  Workflow,
  Workspace as WorkspaceRow,
  assets,
  getPortableDb,
  initTestDb
} from "@nodetool-ai/models";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";
import type { Workspace } from "@nodetool-ai/runtime";

const mocks = vi.hoisted(() => ({ adapter: null as StorageAdapter | null }));

vi.mock("@nodetool-ai/asset-services/storage", async (orig) => {
  const actual =
    await orig<typeof import("@nodetool-ai/asset-services/storage")>();
  return { ...actual, getAssetAdapter: () => mocks.adapter };
});

import {
  setWorkspaceCloudStorage,
  workspaceFromRow
} from "@nodetool-ai/execution/service";
import { retrieveAssetBytes } from "@nodetool-ai/asset-services/asset-paths";
import { saveProjectAsset } from "@nodetool-ai/asset-services/project-asset";
import { ProjectAssetStorageAdapter } from "@nodetool-ai/asset-services/project-asset-storage";
import { projectAssetMoveJob } from "@nodetool-ai/project-services/project-asset-move-job";
import {
  cancelProjectReconciles,
  flushProjectReconciles,
  reconcileInBackground,
  scanFolder
} from "@nodetool-ai/project-services/project-index";
import { lookupExternalAssetPath } from "../src/lib/external-asset-lookup.js";
import {
  getAssetStorageKey,
  getAssetThumbnailKey
} from "../src/lib/asset-paths.js";
import {
  importProjectArchive,
  prepareProjectExport,
  writeProjectArchive,
  type ProjectArchiveManifest
} from "../src/lib/project-archive.js";
import { projectArchiveHost } from "../src/lib/project-archive-host.js";
import { collectZip } from "../src/lib/zip-stream.js";
import {
  projectWithFolder,
  useProjectFolders,
  type ProjectFolderFixture
} from "./project-folder-fixture.js";

const USER = "1";
const COUNT = 10;
const PNG = "image/png";

/** A valid 1x1 PNG whose pixel, and so whose bytes, depend on `seed`. */
function png(seed: number): Uint8Array {
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.from([0, seed % 256, (seed * 7) % 256, (seed * 13) % 256]);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(row)),
      chunk("IEND", Buffer.alloc(0))
    ])
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

let folders: ProjectFolderFixture;
let tmpDir: string;
let storageRoot: string;
/** Whether an object is stored under a raw key, without the key-miss lookup. */
let rawExists: (key: string) => Promise<boolean>;
/** Where a workspace row outside the projects directory keeps its files. */
let looseWorkspacePath: (name: string) => string;

function adapter(): StorageAdapter {
  if (!mocks.adapter) throw new Error("no asset store");
  return mocks.adapter;
}

function folderOf(row: WorkspaceRow): Workspace {
  const workspace = workspaceFromRow(row);
  if (!workspace) throw new Error("no workspace for row");
  return workspace;
}

/** The folder row of a project that has one. */
async function folderRowOf(projectId: string): Promise<WorkspaceRow> {
  const project = await Project.findOwned(USER, projectId);
  const row = await WorkspaceRow.find(USER, project?.workspace_id ?? "");
  if (!row) throw new Error(`project ${projectId} has no folder`);
  return row;
}

/** An asset's bytes as readers get them, through its id key. */
async function bytesOf(id: string): Promise<Uint8Array | null> {
  const bytes = await retrieveAssetBytes(adapter(), USER, id, PNG);
  // The local file store answers with a Buffer.
  return bytes ? new Uint8Array(bytes) : null;
}

/** The PNG files in a project folder, by path. */
async function pngFiles(row: WorkspaceRow): Promise<string[]> {
  const files = await scanFolder(folderOf(row));
  return [...files.keys()].filter((file) => file.endsWith(".png")).sort();
}

/** The project's asset rows that are not folders. */
async function assetRows(projectId: string): Promise<Asset[]> {
  const rows = await Asset.listByProject(USER, projectId);
  return rows.filter((row) => row.content_type !== "folder");
}

/** The asset ids a project's timeline and workflow name, in clip order. */
async function referencedAssetIds(projectId: string): Promise<{
  timeline: string[];
  workflow: string[];
}> {
  const [timeline] = await TimelineSequence.listForProjects(USER, [projectId]);
  const [workflow] = await Workflow.listForProjects(USER, [projectId]);
  if (!timeline || !workflow) throw new Error("documents are missing");
  const document = JSON.parse(timeline.document) as {
    clips: Array<{ assetId: string }>;
  };
  return {
    timeline: document.clips.map((clip) => clip.assetId),
    workflow: [
      ...JSON.stringify(workflow.graph).matchAll(/asset:\/\/([0-9a-f]{32})\.png/g)
    ].map((match) => match[1] ?? "")
  };
}

/** A timeline and a workflow that name every asset of `ids`, in order. */
async function documentsNaming(projectId: string, ids: string[]): Promise<void> {
  await TimelineSequence.create<TimelineSequence>({
    user_id: USER,
    project_id: projectId,
    name: "Cut",
    document: JSON.stringify({
      tracks: [],
      clips: ids.map((id, index) => ({ id: `clip-${index}`, assetId: id })),
      markers: [],
      transcript: []
    })
  });
  await Workflow.create<Workflow>({
    user_id: USER,
    project_id: projectId,
    name: "Stills",
    access: "private",
    graph: {
      nodes: ids.map((id, index) => ({
        id: `n${index}`,
        type: "nodetool.constant.Image",
        data: { value: { type: "image", uri: `asset://${id}.png` } }
      })),
      edges: []
    }
  });
}

/** A project whose `COUNT` images are files in its folder, with documents. */
async function folderProject(name = "Film"): Promise<{
  project: Project;
  folder: WorkspaceRow;
  ids: string[];
  paths: string[];
}> {
  const { project, folder } = await projectWithFolder(USER, name);
  const ids: string[] = [];
  const paths: string[] = [];
  for (let index = 0; index < COUNT; index++) {
    const asset = await saveProjectAsset({
      userId: USER,
      projectId: project.id,
      name: `shot-${index}.png`,
      contentType: PNG,
      directory: "Shots",
      bytes: png(index)
    });
    ids.push(asset.id);
    paths.push(asset.workspace_path ?? "");
  }
  await documentsNaming(project.id, ids);
  return { project, folder, ids, paths: paths.sort() };
}

async function exportProject(projectId: string): Promise<{
  bytes: Uint8Array;
  manifest: ProjectArchiveManifest;
}> {
  await prepareProjectExport({
    userId: USER,
    projectId,
    linkedFiles: "refuse"
  });
  let manifest: ProjectArchiveManifest | undefined;
  const bytes = await collectZip(async (writer) => {
    manifest = await writeProjectArchive(
      { userId: USER, projectId, ...projectArchiveHost() },
      writer
    );
  });
  if (!manifest) throw new Error("no manifest");
  return { bytes, manifest };
}

function importArchive(bytes: Uint8Array) {
  return importProjectArchive(bytes, {
    userId: USER,
    name: "Film copy",
    ...projectArchiveHost()
  });
}

/** Rewrite an archive's entries, manifest and records, and zip it again. */
function rewriteArchive(
  bytes: Uint8Array,
  change: (archive: {
    entries: Record<string, Uint8Array>;
    manifest: ProjectArchiveManifest;
    records: Record<string, Array<Record<string, unknown>>>;
  }) => void
): Uint8Array {
  const entries = unzipSync(bytes);
  const archive = {
    entries,
    manifest: JSON.parse(
      strFromU8(entries["manifest.json"]!)
    ) as ProjectArchiveManifest,
    records: JSON.parse(strFromU8(entries["records.json"]!)) as Record<
      string,
      Array<Record<string, unknown>>
    >
  };
  change(archive);
  entries["manifest.json"] = strToU8(JSON.stringify(archive.manifest));
  entries["records.json"] = strToU8(JSON.stringify(archive.records));
  return zipSync(entries);
}

/** Rows are moved once they have gone unchanged for a while. Age them. */
async function ageRows(): Promise<void> {
  await getPortableDb()
    .update(assets)
    .set({ updated_at: "2024-01-01T00:00:00.000Z" });
}

/**
 * What opening a project starts, run to completion: the folder reconcile,
 * the move of legacy bytes into the folder, and the reconcile that follows
 * the files the move wrote.
 */
async function openProject(projectId: string) {
  const first = await reconcileInBackground(projectId, USER);
  await ageRows();
  const moved = await projectAssetMoveJob.run(projectId, USER);
  const last = await reconcileInBackground(projectId, USER);
  await flushProjectReconciles();
  return { first, moved, last };
}

/**
 * The imported project holds each of the `COUNT` images once: one row, one
 * file, and the id the imported documents name, serving the bytes of the
 * image the source document named at that position.
 */
async function expectEachAssetOnce(
  projectId: string,
  expectedBytes: (index: number) => Uint8Array = png
): Promise<Asset[]> {
  const rows = await assetRows(projectId);
  expect(rows).toHaveLength(COUNT);
  const files = await pngFiles(await folderRowOf(projectId));
  expect(files).toHaveLength(COUNT);
  expect(rows.map((row) => row.workspace_path).sort()).toEqual(files);

  const rowIds = rows.map((row) => row.id).sort();
  const named = await referencedAssetIds(projectId);
  expect([...named.timeline].sort()).toEqual(rowIds);
  expect(named.workflow).toEqual(named.timeline);
  for (const [index, id] of named.timeline.entries()) {
    expect(await bytesOf(id)).toEqual(
      expectedBytes(index)
    );
    // The file in the folder is the asset's only copy.
    expect(await rawExists(getAssetStorageKey(USER, id, PNG))).toBe(false);
  }
  return rows;
}

beforeEach(async () => {
  initTestDb();
  folders = await useProjectFolders([USER]);
  tmpDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "project-archive-folder-"))
  );
  storageRoot = path.join(tmpDir, "storage");
  vi.stubEnv("NODETOOL_ENV", "development");
  vi.stubEnv("NODETOOL_STORAGE_BACKEND", "file");
});

afterEach(async () => {
  await projectAssetMoveJob.idle();
  await flushProjectReconciles();
  cancelProjectReconciles();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  ModelObserver.clear();
  setWorkspaceCloudStorage(null);
  mocks.adapter = null;
  await folders.cleanup();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe.each(["local", "cloud"] as const)(
  "export, import and open a project with assets in its folder (%s)",
  (mode) => {
    beforeEach(() => {
      vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", mode);
      if (mode === "local") {
        mocks.adapter = new FileStorageAdapter(storageRoot, {
          externalPathLookup: lookupExternalAssetPath
        });
        setWorkspaceCloudStorage(null);
        rawExists = async (key) =>
          fs.stat(path.join(storageRoot, key)).then(
            () => true,
            () => false
          );
        looseWorkspacePath = (name) => path.join(tmpDir, name);
      } else {
        // The server hands project folders the asset store itself, so one
        // bucket holds both.
        const store = new InMemoryStorageAdapter();
        const cloud = new ProjectAssetStorageAdapter(store);
        mocks.adapter = cloud;
        setWorkspaceCloudStorage(cloud);
        rawExists = (key) => store.exists(store.uriForKey(key));
        looseWorkspacePath = (name) => `workspaces/${USER}/${name}`;
      }
    });

    it("the imported and opened project has each asset once, under the id its documents name", async () => {
      const source = await folderProject();
      const { bytes, manifest } = await exportProject(source.project.id);
      // The archive carries each asset as its bytes and as its folder file.
      expect(manifest.assets.map((entry) => entry.id).sort()).toEqual(
        [...source.ids].sort()
      );
      expect(
        manifest.workspace_files
          .map((file) => file.path)
          .filter((file) => file.endsWith(".png"))
          .sort()
      ).toEqual(source.paths);

      const { project, counts, missing, checksumMismatches } =
        await importArchive(bytes);
      expect(counts["assets"]).toBe(COUNT);
      expect(missing).toEqual([]);
      expect(checksumMismatches).toEqual([]);

      await openProject(project.id);

      const rows = await expectEachAssetOnce(project.id);
      expect(rows.map((row) => row.workspace_path).sort()).toEqual(source.paths);
      expect(rows.map((row) => row.id).sort()).not.toEqual(
        [...source.ids].sort()
      );

      // The project the archive was made from is as it was.
      expect(
        (await assetRows(source.project.id)).map((row) => row.id).sort()
      ).toEqual([...source.ids].sort());
      expect(await pngFiles(source.folder)).toEqual(source.paths);
    });

    it("each imported row names its folder file at once, so opening the project changes nothing", async () => {
      const source = await folderProject();
      const { bytes } = await exportProject(source.project.id);

      const { project } = await importArchive(bytes);

      const imported = await expectEachAssetOnce(project.id);
      // Each has its thumbnail, as an asset imported into the store has.
      for (const row of imported) {
        expect(await rawExists(getAssetThumbnailKey(USER, row.id))).toBe(true);
      }
      const opened = await openProject(project.id);

      // The reconcile finds each file with its row, and nothing waits to move.
      expect(opened.first.created).toEqual([]);
      expect(opened.first.updated).toEqual([]);
      expect(opened.first.offline).toEqual([]);
      expect(opened.first.unchanged).toBe(COUNT);
      expect(opened.moved.moved).toEqual([]);
      expect(opened.moved.withoutBytes).toEqual([]);
      expect(opened.last.created).toEqual([]);
      expect(opened.last.deferred).toEqual([]);
      const settled = await expectEachAssetOnce(project.id);
      expect(settled.map((row) => row.id).sort()).toEqual(
        imported.map((row) => row.id).sort()
      );
    });

    it("an archive from before project folders imports into the asset store, and its assets move into the folder once", async () => {
      // A project with no folder: its assets are rows plus stored objects.
      const project = await Project.insertNew({ user_id: USER, name: "Old film" });
      if (!project) throw new Error("no project");
      const ids: string[] = [];
      for (let index = 0; index < COUNT; index++) {
        const asset = await Asset.create<Asset>({
          user_id: USER,
          project_id: project.id,
          parent_id: USER,
          name: `shot-${index}.png`,
          content_type: PNG,
          size: png(index).byteLength
        });
        await adapter().store(
          getAssetStorageKey(USER, asset.id, PNG),
          png(index),
          PNG
        );
        ids.push(asset.id);
      }
      await documentsNaming(project.id, ids);
      const exported = await exportProject(project.id);
      expect(exported.manifest.workspace_files).toEqual([]);
      // Asset rows from before project folders have neither column.
      const bytes = rewriteArchive(exported.bytes, ({ records }) => {
        for (const row of records["assets"] ?? []) {
          delete row["workspace_path"];
          delete row["content_hash"];
        }
      });

      const result = await importArchive(bytes);

      // As before: every asset is a row with its bytes under its storage key.
      const imported = await assetRows(result.project.id);
      expect(imported).toHaveLength(COUNT);
      const named = await referencedAssetIds(result.project.id);
      expect([...named.timeline].sort()).toEqual(
        imported.map((row) => row.id).sort()
      );
      for (const [index, id] of named.timeline.entries()) {
        const row = imported.find((asset) => asset.id === id);
        expect(row?.workspace_path).toBeNull();
        expect(row?.size).toBe(png(index).byteLength);
        expect(await rawExists(getAssetStorageKey(USER, id, PNG))).toBe(true);
        expect(await bytesOf(id)).toEqual(
          png(index)
        );
      }
      expect(await pngFiles(await folderRowOf(result.project.id))).toEqual([]);

      const opened = await openProject(result.project.id);

      expect(opened.first.created).toEqual([]);
      expect([...opened.moved.moved].sort()).toEqual(
        imported.map((row) => row.id).sort()
      );
      expect(opened.last.created).toEqual([]);
      await expectEachAssetOnce(result.project.id);
    });

    it("an archive that carries only the folder file of an asset imports it once", async () => {
      const source = await folderProject();
      const exported = await exportProject(source.project.id);
      const bytes = rewriteArchive(exported.bytes, ({ entries, manifest }) => {
        for (const entry of manifest.assets) delete entries[entry.file];
        manifest.assets = [];
      });

      const { project, missing } = await importArchive(bytes);

      expect(missing).toEqual([]);
      await expectEachAssetOnce(project.id);
      const opened = await openProject(project.id);
      expect(opened.first.created).toEqual([]);
      expect(opened.moved.moved).toEqual([]);
      await expectEachAssetOnce(project.id);
    });

    it("an asset whose archived bytes are not those of the folder file keeps its own bytes", async () => {
      const source = await folderProject();
      const exported = await exportProject(source.project.id);
      const changed = source.ids[3]!;
      const other = png(200);
      const bytes = rewriteArchive(exported.bytes, ({ entries, manifest }) => {
        const entry = manifest.assets.find((asset) => asset.id === changed);
        if (!entry) throw new Error("the asset is not in the archive");
        entries[entry.file] = other;
        entry.bytes = other.byteLength;
        entry.sha256 = sha256(other);
      });

      const { project, checksumMismatches } = await importArchive(bytes);

      expect(checksumMismatches).toEqual([]);
      const named = await referencedAssetIds(project.id);
      const own = named.timeline[3]!;
      const before = await assetRows(project.id);
      expect(before).toHaveLength(COUNT);
      // The file at the asset's path is not the asset's, so the row does not
      // name it and the bytes the archive gave the asset are kept.
      expect(before.find((row) => row.id === own)?.workspace_path).toBeNull();
      expect(await bytesOf(own)).toEqual(other);

      await openProject(project.id);

      // The file with other contents is an asset of its own. Nothing is lost
      // and no other asset is doubled.
      const rows = await assetRows(project.id);
      expect(rows).toHaveLength(COUNT + 1);
      expect(await pngFiles(await folderRowOf(project.id))).toHaveLength(
        COUNT + 1
      );
      expect(await bytesOf(own)).toEqual(other);
      for (const [index, id] of named.timeline.entries()) {
        if (index === 3) continue;
        expect(await bytesOf(id)).toEqual(
          png(index)
        );
      }
    });

    it("a project whose folder is not its oldest workspace imports with that folder, and each asset once", async () => {
      const source = await folderProject();
      // An older workspace of the project that is not its folder, with a
      // file at the path of an asset.
      const older = await WorkspaceRow.create<WorkspaceRow>({
        user_id: USER,
        project_id: source.project.id,
        name: "Old notes",
        path: looseWorkspacePath("old-notes"),
        created_at: "2020-01-01T00:00:00.000Z"
      });
      await folderOf(older).write(source.paths[0]!, png(100));
      const { bytes, manifest } = await exportProject(source.project.id);
      expect(manifest.project.folder_workspace_id).toBe(source.folder.id);

      const { project } = await importArchive(bytes);

      await expectEachAssetOnce(project.id);
      const opened = await openProject(project.id);
      expect(opened.first.created).toEqual([]);
      expect(opened.moved.moved).toEqual([]);
      await expectEachAssetOnce(project.id);
      // The older workspace came along as a workspace of its own.
      const rows = await WorkspaceRow.listByProject(USER, project.id);
      expect(rows).toHaveLength(2);
    });

    it("an older archive of a Personal project takes its default workspace as the folder", async () => {
      const source = await folderProject();
      const older = await WorkspaceRow.create<WorkspaceRow>({
        user_id: USER,
        project_id: source.project.id,
        name: "Old notes",
        path: looseWorkspacePath("old-notes"),
        created_at: "2020-01-01T00:00:00.000Z"
      });
      await folderOf(older).write("notes.md", strToU8("# notes"));
      const { bytes } = await exportProject(source.project.id);
      // As Personal was exported before the folder was recorded: the folder
      // is its default workspace.
      const legacy = rewriteArchive(bytes, ({ manifest, records }) => {
        manifest.project.kind = "personal";
        delete (manifest.project as { folder_workspace_id?: unknown })
          .folder_workspace_id;
        for (const row of records["workspaces"] ?? []) {
          row["is_default"] = row["id"] === source.folder.id;
        }
      });

      const { project } = await importArchive(legacy);

      await expectEachAssetOnce(project.id);
      const opened = await openProject(project.id);
      expect(opened.first.created).toEqual([]);
      expect(opened.moved.moved).toEqual([]);
    });

    it("the folder files are taken from the folder, not from an older workspace a game uses", async () => {
      const source = await folderProject();
      // A game's workspace, older than the project folder, with a file at the
      // path of an asset.
      const gameWorkspace = await WorkspaceRow.create<WorkspaceRow>({
        user_id: USER,
        project_id: source.project.id,
        name: "Game sources",
        path: looseWorkspacePath("game-sources"),
        created_at: "2020-01-01T00:00:00.000Z"
      });
      await folderOf(gameWorkspace).write(source.paths[0]!, png(100));
      const game = await Game.insertNew({
        id: "a".repeat(31) + "1",
        userId: USER,
        projectId: source.project.id,
        workspaceId: gameWorkspace.id,
        name: "Game",
        revision: "b".repeat(31) + "2"
      });
      if (!game) throw new Error("no game");
      const { bytes } = await exportProject(source.project.id);

      const { project } = await importArchive(bytes);

      await expectEachAssetOnce(project.id);
      const opened = await openProject(project.id);
      expect(opened.first.created).toEqual([]);
      expect(opened.moved.moved).toEqual([]);
      await expectEachAssetOnce(project.id);
    });
  }
);
