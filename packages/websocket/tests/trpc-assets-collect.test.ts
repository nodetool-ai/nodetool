/**
 * Linked media and Collect (PRD D5, T6, US9) through the asset router and
 * the project export route:
 *
 * - `assets.createExternal` (Link) records the file in place and writes
 *   nothing to the project folder.
 * - `assets.collect` copies every linked file into `Imported/`, keeps the
 *   asset ids, and clears `external_path`.
 * - `GET /api/projects/:id/export` refuses a project with linked files and
 *   names them, or collects them first with `?linked=collect`.
 *
 * Folder cases run against a local directory and a storage-backed folder.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { strFromU8, unzipSync } from "fflate";
import { Asset, initTestDb, ModelObserver, Project } from "@nodetool-ai/models";
import {
  createLocalWorkspace,
  createWorkspace,
  setProjectFolderResolver,
  type Workspace
} from "@nodetool-ai/runtime";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";

const mocks = vi.hoisted(() => ({
  adapter: null as StorageAdapter | null
}));

vi.mock("@nodetool-ai/asset-services/storage", () => ({
  getAssetAdapter: () => mocks.adapter
}));

vi.mock("@nodetool-ai/asset-services/thumbnail", async (orig) => {
  const actual = await orig<typeof import("../src/lib/thumbnail.js")>();
  return { ...actual, generateThumbnailForStoredAsset: vi.fn(async () => {}) };
});

import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { lookupExternalAssetPath } from "../src/lib/external-asset-lookup.js";
import projectArchiveRoutes from "../src/routes/project-archive.js";

const createCaller = createCallerFactory(appRouter);
const USER = "user-1";

function makeCtx(userId = USER): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

let tmpDir: string;
let mediaDir: string;
let projectId: string;
let workspace: Workspace;

const kinds = {
  local: (): Workspace => createLocalWorkspace(path.join(tmpDir, "folder")),
  storage: (): Workspace =>
    createWorkspace(new InMemoryStorageAdapter(), {
      prefix: `workspaces/${USER}/project`
    })
} as const;

beforeEach(async () => {
  initTestDb();
  tmpDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "collect-assets-"))
  );
  mediaDir = path.join(tmpDir, "media");
  await fs.mkdir(mediaDir, { recursive: true });
  mocks.adapter = new FileStorageAdapter(path.join(tmpDir, "storage"), {
    externalPathLookup: lookupExternalAssetPath
  });
  vi.stubEnv("NODETOOL_LOCAL_FILE_ROOTS", mediaDir);
  vi.stubEnv("NODETOOL_ENV", "development");
  vi.stubEnv("NODETOOL_STORAGE_BACKEND", "file");
  const project = await Project.insertNew({
    user_id: USER,
    name: "Launch spot",
    kind: "spot"
  });
  projectId = project!.id;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  ModelObserver.clear();
  setProjectFolderResolver(null);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function useFolder(kind: keyof typeof kinds): void {
  workspace = kinds[kind]();
  setProjectFolderResolver(async (id) => ({
    ok: true,
    projectId: id ?? "personal",
    workspace
  }));
}

async function folderFiles(): Promise<string[]> {
  return (await workspace.list("", { recursive: true }))
    .filter((entry) => !entry.isDirectory)
    .map((entry) => entry.path)
    .sort();
}

async function linkFile(name: string, content: string) {
  const file = path.join(mediaDir, name);
  await fs.writeFile(file, content);
  return createCaller(makeCtx()).assets.createExternal({
    path: file,
    project_id: projectId
  });
}

async function linkThree() {
  return [
    await linkFile("take one.mp4", "first take"),
    await linkFile("take two.mp4", "second take"),
    await linkFile("take three.mp4", "third take")
  ];
}

describe.each(["local", "storage"] as const)(
  "linked media in a %s project folder",
  (kind) => {
    beforeEach(() => useFolder(kind));

    it("Link creates a row with external_path and writes nothing to the project folder", async () => {
      const created = await linkFile("take one.mp4", "first take");

      const row = await Asset.find(USER, created.id);
      expect(row?.external_path).toBe(path.join(mediaDir, "take one.mp4"));
      expect(row?.workspace_path).toBeNull();
      expect(row?.project_id).toBe(projectId);
      expect(await folderFiles()).toEqual([]);
    });

    it("Collect on three linked files leaves three files in Imported/ and keeps the ids", async () => {
      const linked = await linkThree();

      const result = await createCaller(makeCtx()).assets.collect({
        project_id: projectId
      });

      expect(result.copied.map((a) => a.id)).toEqual(linked.map((a) => a.id));
      expect(result).toMatchObject({ skipped: [], failed: [], interrupted: false });
      expect(await folderFiles()).toEqual([
        "Imported/take-one.mp4",
        "Imported/take-three.mp4",
        "Imported/take-two.mp4"
      ]);
      const rows = await Asset.listByProject(USER, projectId);
      expect(rows.map((r) => r.id).sort()).toEqual(
        linked.map((a) => a.id).sort()
      );
      for (const row of rows) {
        expect(row.external_path).toBeNull();
        expect(row.workspace_path).toMatch(/^Imported\//);
      }
      // The linked files stay where they were.
      expect(await fs.readdir(mediaDir)).toHaveLength(3);

      // A second run has nothing left to copy.
      const again = await createCaller(makeCtx()).assets.collect({
        project_id: projectId
      });
      expect(again.copied).toEqual([]);
      expect(await folderFiles()).toHaveLength(3);
    });

    it("reports an offline linked file as skipped", async () => {
      const [present, offline] = [
        await linkFile("here.mp4", "here"),
        await linkFile("gone.mp4", "gone")
      ];
      await fs.rm(path.join(mediaDir, "gone.mp4"));

      const result = await createCaller(makeCtx()).assets.collect({
        project_id: projectId
      });

      expect(result.copied.map((a) => a.id)).toEqual([present.id]);
      expect(result.skipped).toEqual([
        {
          id: offline.id,
          name: "gone.mp4",
          reason: "The linked file is missing or changed since it was linked"
        }
      ]);
    });

    it("refuses a project the caller does not own", async () => {
      await expect(
        createCaller(makeCtx("someone-else")).assets.collect({
          project_id: projectId
        })
      ).rejects.toThrow(/Project not found/);
    });
  }
);

describe("linked media metadata", () => {
  beforeEach(() => useFolder("local"));

  it("keeps the pending collect path out of a client's metadata update", async () => {
    const created = await linkFile("take.mp4", "bytes");

    await createCaller(makeCtx()).assets.update({
      id: created.id,
      metadata: { collect_path: "Generated/someone-elses.png", note: "x" }
    });

    const row = await Asset.find(USER, created.id);
    expect(row?.metadata).toMatchObject({ note: "x" });
    expect(row?.metadata).not.toHaveProperty("collect_path");
  });
});

describe("Link in production", () => {
  it("is refused", async () => {
    useFolder("local");
    vi.stubEnv("NODETOOL_ENV", "production");
    const file = path.join(mediaDir, "take.mp4");
    await fs.writeFile(file, "bytes");

    await expect(
      createCaller(makeCtx()).assets.createExternal({
        path: file,
        project_id: projectId
      })
    ).rejects.toThrow(/disabled in production/);
    expect(await Asset.listByProject(USER, projectId)).toEqual([]);
  });
});

describe.each(["local", "storage"] as const)(
  "export of a project with linked files from a %s folder",
  (kind) => {
    let app: FastifyInstance;

    beforeEach(async () => {
      useFolder(kind);
      app = Fastify();
      // What the auth plugin does: the bridge trusts only `req.userId`.
      app.addHook("onRequest", async (req) => {
        req.userId = USER;
      });
      await app.register(projectArchiveRoutes, {
        apiOptions: { metadataRoots: [], registry: {} as never } as never
      });
    });

    afterEach(async () => {
      await app.close();
    });

    function exportProject(query = "") {
      return app.inject({
        method: "GET",
        url: `/api/projects/${projectId}/export${query}`
      });
    }

    it("refuses and names the linked files", async () => {
      await linkThree();

      const response = await exportProject();

      expect(response.statusCode).toBe(409);
      const body = response.json<{ linked_files: { name: string }[] }>();
      expect(body.linked_files.map((f) => f.name)).toEqual([
        "take one.mp4",
        "take two.mp4",
        "take three.mp4"
      ]);
      // Nothing was copied: refusing leaves the links.
      expect(await folderFiles()).toEqual([]);
    });

    it("collects the linked files first when asked, then exports", async () => {
      const linked = await linkThree();

      const response = await exportProject("?linked=collect");

      expect(response.statusCode).toBe(200);
      expect(await folderFiles()).toHaveLength(3);
      if (kind === "local") {
        // Linking needs the local file asset store, which reads a project
        // file only from a local folder. A cloud host pairs a storage-backed
        // folder with the project asset store and has no linked files.
        const entries = unzipSync(new Uint8Array(response.rawPayload));
        const manifest = JSON.parse(strFromU8(entries["manifest.json"]!)) as {
          assets: { id: string }[];
        };
        expect(manifest.assets.map((a) => a.id).sort()).toEqual(
          linked.map((a) => a.id).sort()
        );
      }
      for (const row of await Asset.listByProject(USER, projectId)) {
        expect(row.external_path).toBeNull();
      }
    });

    it("refuses with the names of linked files that could not be collected", async () => {
      await linkFile("here.mp4", "here");
      await linkFile("gone.mp4", "gone");
      await fs.rm(path.join(mediaDir, "gone.mp4"));

      const response = await exportProject("?linked=collect");

      expect(response.statusCode).toBe(409);
      expect(
        response.json<{ linked_files: { name: string }[] }>().linked_files
      ).toEqual([expect.objectContaining({ name: "gone.mp4" })]);
    });

    it("exports a project with no linked files as before", async () => {
      const response = await exportProject();
      expect(response.statusCode).toBe(200);
    });
  }
);
