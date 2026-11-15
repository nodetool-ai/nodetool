/**
 * `assets.copyToProject`: what an asset picker in a named project calls when
 * the user picks from the Personal tab (PRD D10, US10). The file is copied
 * into the project's `Imported/` directory and the picker stores the copy's
 * id. Picking the same unchanged asset again returns the same copy.
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
  initTestDb,
  type Workspace as WorkspaceRow
} from "@nodetool-ai/models";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";

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
import { lookupExternalAssetPath } from "../src/lib/external-asset-lookup.js";
import { retrieveAssetBytes } from "../src/lib/asset-paths.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import {
  personalWithFolder,
  projectWithFolder,
  useProjectFolders,
  type ProjectFolderFixture
} from "./project-folder-fixture.js";

const createCaller = createCallerFactory(appRouter);
const USER = "1";
const OTHER_USER = "2";

/** A 1x1 PNG, so the thumbnail generator has a real image. */
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
);

function caller(userId = USER) {
  return createCaller({
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context);
}

let folders: ProjectFolderFixture;
let tmpDir: string;

async function filesIn(row: WorkspaceRow): Promise<string[]> {
  const workspace = workspaceFromRow(row);
  if (!workspace) throw new Error("no workspace for row");
  return (await workspace.list("", { recursive: true }))
    .filter((entry) => !entry.isDirectory)
    .map((entry) => entry.path)
    .sort();
}

async function bytesOf(id: string): Promise<Uint8Array | null> {
  if (!mocks.adapter) throw new Error("no asset store");
  const bytes = await retrieveAssetBytes(mocks.adapter, USER, id, "image/png");
  return bytes && new Uint8Array(bytes);
}

beforeEach(async () => {
  initTestDb();
  folders = await useProjectFolders([USER, OTHER_USER]);
  tmpDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "copy-to-project-"))
  );
  vi.stubEnv("NODETOOL_ENV", "development");
  vi.stubEnv("NODETOOL_STORAGE_BACKEND", "file");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  ModelObserver.clear();
  setWorkspaceCloudStorage(null);
  mocks.adapter = null;
  await folders.cleanup();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe.each(["local", "cloud"] as const)(
  "assets.copyToProject (%s folders)",
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

    async function personalImage(): Promise<{
      asset: Asset;
      personal: Awaited<ReturnType<typeof personalWithFolder>>;
    }> {
      const personal = await personalWithFolder(USER);
      const asset = await saveProjectAsset({
        projectId: personal.project.id,
        userId: USER,
        name: "fox in snow",
        contentType: "image/png",
        bytes: PNG,
        directory: "Library"
      });
      return { asset, personal };
    }

    it("picking a Personal image in project A creates a file in A's Imported/ and returns the new asset id", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const { asset: original, personal } = await personalImage();

      const result = await caller().assets.copyToProject({
        asset_id: original.id,
        project_id: a.project.id
      });

      expect(result.copied).toBe(true);
      expect(result.asset.id).not.toBe(original.id);
      expect(await filesIn(a.folder)).toEqual(["Imported/fox-in-snow.png"]);
      expect(await Asset.find(USER, result.asset.id)).toMatchObject({
        project_id: a.project.id,
        workspace_path: "Imported/fox-in-snow.png"
      });
      expect(await bytesOf(result.asset.id)).toEqual(PNG);
      expect(await filesIn(personal.folder)).toContain("Library/fox-in-snow.png");
    });

    it("picking the same Personal asset twice creates one copy", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const { asset: original } = await personalImage();

      const first = await caller().assets.copyToProject({
        asset_id: original.id,
        project_id: a.project.id
      });
      const second = await caller().assets.copyToProject({
        asset_id: original.id,
        project_id: a.project.id
      });

      expect(second).toMatchObject({ copied: false });
      expect(second.asset.id).toBe(first.asset.id);
      expect(await filesIn(a.folder)).toEqual(["Imported/fox-in-snow.png"]);
      expect(await Asset.listByProject(USER, a.project.id)).toHaveLength(1);
    });

    it("deleting the copy leaves the Personal original, and a client cannot forge the copy's source", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const { asset: original } = await personalImage();
      const { asset: copy } = await caller().assets.copyToProject({
        asset_id: original.id,
        project_id: a.project.id
      });

      await caller().assets.update({
        id: copy.id,
        metadata: { copied_from_asset_id: "forged", copied_from_hash: "forged" }
      });
      expect((await Asset.find(USER, copy.id))?.metadata).toMatchObject({
        copied_from_asset_id: original.id
      });

      await caller().assets.delete({ id: copy.id });
      expect(await filesIn(a.folder)).toEqual([]);
      expect(await Asset.find(USER, original.id)).toMatchObject({
        workspace_path: "Library/fox-in-snow.png"
      });
      expect(await bytesOf(original.id)).toEqual(PNG);
    });

    it("refuses a project the user does not own and writes nothing", async () => {
      const theirs = await projectWithFolder(OTHER_USER, "Theirs");
      const { asset: original } = await personalImage();

      await expect(
        caller().assets.copyToProject({
          asset_id: original.id,
          project_id: theirs.project.id
        })
      ).rejects.toThrow("Project not found");
      expect(await filesIn(theirs.folder)).toEqual([]);
      expect(await Asset.listByProject(USER, theirs.project.id)).toEqual([]);
    });
  }
);
