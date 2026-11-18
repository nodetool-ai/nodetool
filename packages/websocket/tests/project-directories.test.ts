/**
 * The asset browser's folders inside a project are the directories of the
 * project folder (project folders PRD T3, T8, D4). Listing groups assets by
 * directory, creating a folder makes a directory, moving an asset moves its
 * file, and renaming a folder renames the directory and rewrites every path
 * under it in one call.
 *
 * Every case runs with project folders as local directories and as key
 * prefixes in the object store the assets live in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  Asset,
  ModelObserver,
  Workspace as WorkspaceRow,
  initTestDb
} from "@nodetool-ai/models";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";
import type { Workspace } from "@nodetool-ai/runtime";
import { projectDirectoryId } from "@nodetool-ai/protocol";

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
import { ProjectAssetStorageAdapter } from "@nodetool-ai/asset-services/project-asset-storage";
import { saveProjectAsset } from "@nodetool-ai/asset-services/project-asset";
import {
  cancelProjectReconciles,
  flushProjectReconciles,
  reconcileProjectIndex
} from "@nodetool-ai/project-services/project-index";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { lookupExternalAssetPath } from "../src/lib/external-asset-lookup.js";
import { handleAssetsRoot } from "../src/http-api.js";
import {
  projectWithFolder,
  useProjectFolders,
  type ProjectFolderFixture
} from "./project-folder-fixture.js";

const createCaller = createCallerFactory(appRouter);
const USER = "1";

/** A 1x1 PNG, so the thumbnail generator has a real image. */
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
);

function makeCtx(userId = USER): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

let folders: ProjectFolderFixture;
let tmpDir: string;

/** The project's folder, unobserved: writes through it are another app's. */
function folderOf(row: WorkspaceRow): Workspace {
  const workspace = workspaceFromRow(row);
  if (!workspace) throw new Error("no workspace for row");
  return workspace;
}

async function reload(asset: { id: string }): Promise<Asset> {
  const found = await Asset.find(USER, asset.id);
  if (!found) throw new Error(`asset ${asset.id} is gone`);
  return found;
}

/** Every file in the folder, by path. */
async function filesIn(workspace: Workspace): Promise<string[]> {
  return (await workspace.list("", { recursive: true }))
    .filter((entry) => !entry.isDirectory)
    .map((entry) => entry.path)
    .sort();
}

function saveImage(projectId: string, name: string): Promise<Asset> {
  return saveProjectAsset({
    projectId,
    userId: USER,
    name,
    contentType: "image/png",
    bytes: PNG
  });
}

/** POST /api/assets with a JSON body, as the browser creates a folder. */
async function postFolder(body: Record<string, unknown>): Promise<Response> {
  return handleAssetsRoot(
    new Request("http://localhost/api/assets", {
      method: "POST",
      headers: { "x-user-id": USER, "content-type": "application/json" },
      body: JSON.stringify({ content_type: "folder", ...body })
    }),
    {}
  );
}

beforeEach(async () => {
  initTestDb();
  folders = await useProjectFolders([USER]);
  tmpDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "project-directories-"))
  );
  vi.stubEnv("NODETOOL_ENV", "development");
  vi.stubEnv("NODETOOL_STORAGE_BACKEND", "file");
});

afterEach(async () => {
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
  "the asset browser reads the project folder (%s)",
  (mode) => {
    beforeEach(() => {
      vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", mode);
      if (mode === "local") {
        mocks.adapter = new FileStorageAdapter(path.join(tmpDir, "storage"), {
          externalPathLookup: lookupExternalAssetPath
        });
        setWorkspaceCloudStorage(null);
      } else {
        const adapter = new ProjectAssetStorageAdapter(
          new InMemoryStorageAdapter()
        );
        mocks.adapter = adapter;
        setWorkspaceCloudStorage(adapter);
      }
    });

    it("a directory made outside NodeTool is a folder after reconcile, with the media inside it", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const workspace = folderOf(folder);
      await workspace.write("footage/day1/shot.png", PNG);
      await reconcileProjectIndex(project.id, USER);
      const caller = createCaller(makeCtx());

      const root = await caller.assets.list({ project_id: project.id });
      const footageId = projectDirectoryId(project.id, "footage");
      expect(root.assets.map((a) => [a.id, a.name, a.content_type])).toEqual([
        [footageId, "footage", "folder"]
      ]);
      expect(root.assets[0]!.parent_id).toBe(USER);

      const footage = await caller.assets.list({
        project_id: project.id,
        parent_id: footageId
      });
      const dayId = projectDirectoryId(project.id, "footage/day1");
      expect(footage.assets.map((a) => a.id)).toEqual([dayId]);

      const day = await caller.assets.list({
        project_id: project.id,
        parent_id: dayId
      });
      expect(day.assets.map((a) => [a.name, a.parent_id])).toEqual([
        ["shot.png", dayId]
      ]);

      const tree = await caller.assets.list({
        project_id: project.id,
        content_type: "folder"
      });
      expect(tree.assets.map((a) => [a.id, a.parent_id])).toEqual([
        [footageId, USER],
        [dayId, footageId]
      ]);

      const got = await caller.assets.get({ id: dayId });
      expect([got.name, got.parent_id, got.content_type]).toEqual([
        "day1",
        footageId,
        "folder"
      ]);
      const recursive = await caller.assets.recursive({
        id: footageId,
        project_id: project.id
      });
      expect(recursive.assets.map((a) => a.name).sort()).toEqual([
        "day1",
        "shot.png"
      ]);
    });

    it("creating a folder makes a directory and no folder row", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const workspace = folderOf(folder);

      const response = await postFolder({
        name: "Shots",
        parent_id: USER,
        project_id: project.id
      });
      expect(response.status).toBe(200);
      const shots = (await response.json()) as { id: string; name: string };
      expect(shots).toMatchObject({
        id: projectDirectoryId(project.id, "Shots"),
        name: "Shots"
      });

      const nested = await postFolder({
        name: "Wide",
        parent_id: shots.id,
        project_id: project.id
      });
      expect(((await nested.json()) as { id: string }).id).toBe(
        projectDirectoryId(project.id, "Shots/Wide")
      );
      expect(await Asset.listFolders(USER)).toEqual([]);

      if (mode === "local") {
        // An object store has no empty directories. A local folder does.
        expect((await workspace.stat("Shots/Wide"))?.isDirectory).toBe(true);
        const listed = await createCaller(makeCtx()).assets.list({
          project_id: project.id
        });
        expect(listed.assets.map((a) => a.id)).toEqual([shots.id]);
        const again = await postFolder({
          name: "Shots",
          parent_id: USER,
          project_id: project.id
        });
        expect(again.status).toBe(400);
      }
      const hidden = await postFolder({
        name: ".nodetool",
        parent_id: USER,
        project_id: project.id
      });
      expect(hidden.status).toBe(400);
    });

    it("a file uploaded into a directory folder lands in that directory", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const form = new FormData();
      form.append(
        "json",
        JSON.stringify({
          name: "fox.png",
          content_type: "image/png",
          parent_id: projectDirectoryId(project.id, "Shots"),
          project_id: project.id
        })
      );
      form.append("file", new File([PNG], "fox.png", { type: "image/png" }));
      const response = await handleAssetsRoot(
        new Request("http://localhost/api/assets", {
          method: "POST",
          headers: { "x-user-id": USER },
          body: form
        }),
        {}
      );
      expect(response.status).toBe(200);
      const created = (await response.json()) as { id: string; parent_id: string };
      expect((await reload(created)).workspace_path).toBe("Shots/fox.png");
      expect(created.parent_id).toBe(projectDirectoryId(project.id, "Shots"));
      expect(await filesIn(folderOf(folder))).toEqual(["Shots/fox.png"]);
    });

    it("moving an asset to a folder moves its file, and a rename that sends the parent back keeps it there", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const workspace = folderOf(folder);
      const fox = await saveImage(project.id, "fox");
      expect(fox.workspace_path).toBe("Generated/fox.png");
      const caller = createCaller(makeCtx());
      const shotsId = projectDirectoryId(project.id, "Shots");

      const moved = await caller.assets.update({ id: fox.id, parent_id: shotsId });
      expect(moved.id).toBe(fox.id);
      expect(moved.parent_id).toBe(shotsId);
      expect((await reload(fox)).workspace_path).toBe("Shots/fox.png");
      expect(await filesIn(workspace)).toEqual(["Shots/fox.png"]);

      // The browser sends the parent it was given along with a new name.
      const renamed = await caller.assets.update({
        id: fox.id,
        name: "wolf",
        parent_id: moved.parent_id!
      });
      expect(renamed.parent_id).toBe(shotsId);
      expect((await reload(fox)).workspace_path).toBe("Shots/wolf.png");

      await caller.assets.update({ id: fox.id, parent_id: USER });
      expect((await reload(fox)).workspace_path).toBe("wolf.png");
      expect(await filesIn(workspace)).toEqual(["wolf.png"]);

      await expect(
        caller.assets.update({
          id: fox.id,
          parent_id: projectDirectoryId("another-project", "Shots")
        })
      ).rejects.toThrow("another project");
    });

    it("renaming a folder that holds 1,000 assets moves every file and rewrites every path in one call", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const workspace = folderOf(folder);
      const count = 1000;
      const ids: string[] = [];
      for (let i = 0; i < count; i++) {
        const file = `Shots/day ${i % 10}/clip-${i}.png`;
        await workspace.write(file, PNG);
        const row = await Asset.create<Asset>({
          user_id: USER,
          project_id: project.id,
          parent_id: USER,
          name: `clip-${i}.png`,
          content_type: "image/png",
          workspace_path: file
        });
        ids.push(row.id);
      }
      const statements = vi.spyOn(Asset, "moveWorkspaceDirectory");
      const saves = vi.spyOn(Asset.prototype, "save");
      const caller = createCaller(makeCtx());

      // One call, which rewrites the rows in one statement and saves none
      // of them one by one.
      const renamed = await caller.assets.update({
        id: projectDirectoryId(project.id, "Shots"),
        name: "Takes"
      });

      expect(statements).toHaveBeenCalledTimes(1);
      expect(saves).not.toHaveBeenCalled();
      expect(renamed.id).toBe(projectDirectoryId(project.id, "Takes"));
      const rows = await Asset.findMany(USER, ids);
      expect(rows).toHaveLength(count);
      for (const row of rows) {
        expect(row.workspace_path).toMatch(/^Takes\/day \d\/clip-\d+\.png$/);
      }
      const files = await filesIn(workspace);
      expect(files).toHaveLength(count);
      expect(files.every((file) => file.startsWith("Takes/"))).toBe(true);
      expect(new Set(files)).toEqual(new Set(rows.map((r) => r.workspace_path)));
    }, 120_000);

    it("moving a folder into another one moves its files, and a name in use or a move into itself is refused", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const workspace = folderOf(folder);
      const fox = await saveImage(project.id, "fox");
      await workspace.write("Takes/keep.txt", "x");
      const caller = createCaller(makeCtx());
      const generated = projectDirectoryId(project.id, "Generated");

      await expect(
        caller.assets.update({ id: generated, name: "Takes" })
      ).rejects.toThrow("already exists");
      await expect(
        caller.assets.update({
          id: generated,
          parent_id: projectDirectoryId(project.id, "Generated/inner")
        })
      ).rejects.toThrow("into itself");
      expect((await reload(fox)).workspace_path).toBe("Generated/fox.png");

      const moved = await caller.assets.update({
        id: generated,
        parent_id: projectDirectoryId(project.id, "Takes")
      });
      expect(moved.id).toBe(projectDirectoryId(project.id, "Takes/Generated"));
      expect((await reload(fox)).workspace_path).toBe("Takes/Generated/fox.png");
      expect(await filesIn(workspace)).toEqual([
        "Takes/Generated/fox.png",
        "Takes/keep.txt"
      ]);
    });

    it("an asset with no file in the folder lists under its parent_id chain and follows a folder rename", async () => {
      const { project } = await projectWithFolder(USER, "Film");
      const old = await Asset.create<Asset>({
        user_id: USER,
        project_id: project.id,
        parent_id: USER,
        name: "Old",
        content_type: "folder"
      });
      const sub = await Asset.create<Asset>({
        user_id: USER,
        project_id: project.id,
        parent_id: old.id,
        name: "Sub",
        content_type: "folder"
      });
      const legacy = await Asset.create<Asset>({
        user_id: USER,
        project_id: project.id,
        parent_id: sub.id,
        name: "legacy.png",
        content_type: "image/png"
      });
      const caller = createCaller(makeCtx());
      const subId = projectDirectoryId(project.id, "Old/Sub");

      const root = await caller.assets.list({ project_id: project.id });
      expect(root.assets.map((a) => a.id)).toEqual([
        projectDirectoryId(project.id, "Old")
      ]);
      const inSub = await caller.assets.list({
        project_id: project.id,
        parent_id: subId
      });
      expect(inSub.assets.map((a) => a.id)).toEqual([legacy.id]);

      await caller.assets.update({
        id: projectDirectoryId(project.id, "Old"),
        name: "New"
      });
      const moved = await caller.assets.list({
        project_id: project.id,
        parent_id: projectDirectoryId(project.id, "New/Sub")
      });
      expect(moved.assets.map((a) => a.id)).toEqual([legacy.id]);
      // Its bytes are not in the folder, so no file moved and no row path.
      expect((await reload(legacy)).workspace_path).toBeNull();
    });

    it("deleting a folder deletes its assets and their files, and keeps a directory that still holds other files", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const workspace = folderOf(folder);
      const fox = await saveImage(project.id, "fox");
      const owl = await saveImage(project.id, "owl");
      await workspace.write("Notes/todo.txt", "x");
      const notes = await saveImage(project.id, "notes-cover");
      const caller = createCaller(makeCtx());
      await caller.assets.update({
        id: notes.id,
        parent_id: projectDirectoryId(project.id, "Notes")
      });

      const generated = projectDirectoryId(project.id, "Generated");
      const deleted = await caller.assets.delete({ id: generated });
      expect(deleted.deleted_asset_ids.sort()).toEqual(
        [fox.id, owl.id, generated].sort()
      );
      expect(await Asset.find(USER, fox.id)).toBeNull();
      expect(await workspace.stat("Generated")).toBeNull();

      await caller.assets.delete({ id: projectDirectoryId(project.id, "Notes") });
      expect(await Asset.find(USER, notes.id)).toBeNull();
      expect(await filesIn(workspace)).toEqual(["Notes/todo.txt"]);
    });
  }
);

describe("linked media", () => {
  it("an asset that references a file in place reports linked", async () => {
    const { project } = await projectWithFolder(USER, "Film");
    mocks.adapter = new FileStorageAdapter(path.join(tmpDir, "storage"), {
      externalPathLookup: lookupExternalAssetPath
    });
    const file = path.join(tmpDir, "interview.wav");
    await fs.writeFile(file, Uint8Array.from([1, 2, 3]));
    const linked = await Asset.create<Asset>({
      user_id: USER,
      project_id: project.id,
      parent_id: USER,
      name: "interview.wav",
      content_type: "audio/wav",
      external_path: file
    });
    const copied = await saveImage(project.id, "fox");
    const caller = createCaller(makeCtx());
    expect((await caller.assets.get({ id: linked.id })).linked).toBe(true);
    expect((await caller.assets.get({ id: copied.id })).linked).toBeUndefined();
  });
});
