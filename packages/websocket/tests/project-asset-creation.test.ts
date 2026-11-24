/**
 * Every way of creating an asset writes one file in the project folder (PRD
 * D2, T3, US3; issue PF06).
 *
 * An image an agent generates in a chat, an agent output with `output_file`,
 * a file dropped on a directory of the Files tree or on the canvas, a direct
 * upload, and a Save-file node each leave one file and one row. An upload
 * that names another user's project is refused. The agent's rename and
 * composition delete keep the file in step with the row.
 *
 * Every case runs with project folders as local directories and as key
 * prefixes in the object store the assets live in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  Asset,
  ModelObserver,
  Project,
  initTestDb,
  type Workspace as WorkspaceRow
} from "@nodetool-ai/models";
import {
  BaseProvider,
  ProcessingContext,
  type TextToImageParams
} from "@nodetool-ai/runtime";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  type StorageAdapter,
  type UploadTarget
} from "@nodetool-ai/storage";
import { UNGATED, createCapabilityRun } from "@nodetool-ai/agents";
import { writeSavedFile } from "@nodetool-ai/nodes-utils";

const mocks = vi.hoisted(() => ({ adapter: null as StorageAdapter | null }));

vi.mock("@nodetool-ai/asset-services/storage", async (orig) => {
  const actual =
    await orig<typeof import("@nodetool-ai/asset-services/storage")>();
  return { ...actual, getAssetAdapter: () => mocks.adapter };
});

import {
  resolveProjectWorkspace,
  setWorkspaceCloudStorage,
  workspaceFromRow
} from "@nodetool-ai/execution/service";
import { ProjectAssetStorageAdapter } from "@nodetool-ai/asset-services/project-asset-storage";
import { createAssetModelInterface } from "../src/lib/asset-model-interface.js";
import { lookupExternalAssetPath } from "../src/lib/external-asset-lookup.js";
import { getAssetStorageKey } from "../src/lib/asset-paths.js";
import { handleAssetsRoot } from "../src/http-api.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import {
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

function makeCtx(userId = USER): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

/** An image provider that answers every prompt with {@link PNG}. */
class FoxProvider extends BaseProvider {
  constructor() {
    super("fake");
  }
  override async textToImage(_params: TextToImageParams): Promise<Uint8Array> {
    return PNG;
  }
}

/** An object store that signs uploads and downloads, as S3 and Supabase do. */
class ObjectStore extends InMemoryStorageAdapter {
  async createDownloadUrl(uri: string): Promise<string | null> {
    return uri.startsWith("memory://")
      ? `https://bucket.example/${uri.slice("memory://".length)}?signed`
      : null;
  }
  async createUploadUrl(key: string): Promise<UploadTarget | null> {
    return {
      url: `https://bucket.example/${key}?upload`,
      method: "PUT",
      headers: {},
      expiresAt: Date.now() + 60_000
    };
  }
}

let folders: ProjectFolderFixture;
let tmpDir: string;
/** The store holding objects under raw keys, without the key-miss lookup. */
let rawStore: StorageAdapter;
/** Whether an object exists under `key` itself, not through the lookup. */
let rawExists: (key: string) => Promise<boolean>;

async function filesIn(row: WorkspaceRow): Promise<Record<string, Uint8Array>> {
  const workspace = workspaceFromRow(row);
  if (!workspace) throw new Error("no workspace for row");
  const files: Record<string, Uint8Array> = {};
  for (const entry of await workspace.list("", { recursive: true })) {
    if (entry.isDirectory) continue;
    const bytes = await workspace.read(entry.path);
    if (bytes) files[entry.path] = new Uint8Array(bytes);
  }
  return files;
}

/** A chat turn's context in `projectId`: its folder, and the server's asset port. */
async function chatContext(projectId: string): Promise<ProcessingContext> {
  const folder = await resolveProjectWorkspace(projectId, USER);
  if (!folder.ok) throw new Error(folder.reason);
  const context = new ProcessingContext({
    jobId: "chat-turn",
    userId: USER,
    projectId,
    workspace: folder.workspace,
    assetStorage: mocks.adapter,
    storage: new InMemoryStorageAdapter()
  });
  context.setModelInterfaces({ createAsset: createAssetModelInterface });
  context.setProviderResolver(() => new FoxProvider());
  return context;
}

function upload(
  fields: Record<string, unknown>,
  file: { name: string; bytes: Uint8Array; type: string },
  userId = USER
): Promise<Response> {
  const form = new FormData();
  form.append("json", JSON.stringify(fields));
  form.append(
    "file",
    new File([file.bytes], file.name, { type: file.type })
  );
  return handleAssetsRoot(
    new Request("http://localhost/api/assets", {
      method: "POST",
      headers: { "x-user-id": userId },
      body: form
    }),
    {}
  );
}

beforeEach(async () => {
  initTestDb();
  folders = await useProjectFolders([USER, OTHER_USER]);
  tmpDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "project-asset-creation-"))
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
  "creating assets writes one file in the project folder (%s)",
  (mode) => {
    beforeEach(() => {
      vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", mode);
      if (mode === "local") {
        const adapter = new FileStorageAdapter(path.join(tmpDir, "storage"), {
          externalPathLookup: lookupExternalAssetPath
        });
        mocks.adapter = adapter;
        rawStore = adapter;
        rawExists = async (key) =>
          existsSync(path.join(tmpDir, "storage", key));
        setWorkspaceCloudStorage(null);
      } else {
        // The server hands project folders the asset store itself, so one
        // bucket holds both.
        const store = new ObjectStore();
        const adapter = new ProjectAssetStorageAdapter(store);
        mocks.adapter = adapter;
        rawStore = store;
        rawExists = (key) => store.exists(store.uriForKey(key));
        setWorkspaceCloudStorage(adapter);
      }
    });

    it("an image an agent generates in a chat of project A exists once, in Generated/, and the message, row and file name the same bytes", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const b = await projectWithFolder(USER, "Film B");
      const context = await chatContext(a.project.id);
      const run = createCapabilityRun({ context, gate: UNGATED });

      const result = (await run.invoke("generate_image", {
        provider: "fake",
        model: "fox",
        prompt: "fox in snow"
      })) as { asset_id?: string; asset_uri?: string; path?: string; error?: string };

      expect(result.error).toBeUndefined();
      const files = await filesIn(a.folder);
      const paths = Object.keys(files);
      expect(paths).toHaveLength(1);
      expect(paths[0]).toMatch(/^Generated\/[^/]+\.png$/);
      expect(files[paths[0]!]).toEqual(PNG);
      expect(await filesIn(b.folder)).toEqual({});
      // No workspace copy: the asset is the only handle.
      expect(result.path).toBeUndefined();

      const rows = await Asset.listByProject(USER, a.project.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: result.asset_id,
        workspace_path: paths[0],
        size: PNG.byteLength
      });
      expect(
        await rawExists(getAssetStorageKey(USER, rows[0]!.id, "image/png"))
      ).toBe(false);
      // What the chat message carries reads back as the same bytes.
      expect(result.asset_uri).toBe(`asset://${rows[0]!.id}.png`);
      const resolved = await context.resolveAssetBytes(result.asset_uri!);
      expect(resolved.bytes && new Uint8Array(resolved.bytes)).toEqual(PNG);
    });

    it("output_file shots/hero.png creates one file at that path and a row whose workspace_path is that path", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const context = await chatContext(a.project.id);
      const run = createCapabilityRun({ context, gate: UNGATED });

      const result = (await run.invoke("generate_image", {
        provider: "fake",
        model: "fox",
        prompt: "fox in snow",
        output_file: "shots/hero.png"
      })) as { asset_id?: string; path?: string; error?: string };

      expect(result.error).toBeUndefined();
      expect(result.path).toBe("shots/hero.png");
      expect(await filesIn(a.folder)).toEqual({ "shots/hero.png": PNG });
      const rows = await Asset.listByProject(USER, a.project.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: result.asset_id,
        workspace_path: "shots/hero.png"
      });
    });

    it("a file dropped on footage/ in Files lands in footage/, and one dropped on the canvas lands in Imported/", async () => {
      const a = await projectWithFolder(USER, "Film A");

      const onTree = await upload(
        { project_id: a.project.id, directory: "footage", parent_id: USER },
        { name: "take 1.png", bytes: PNG, type: "image/png" }
      );
      const onCanvas = await upload(
        { project_id: a.project.id, parent_id: USER },
        { name: "interview.png", bytes: PNG, type: "image/png" }
      );

      expect(onTree.status).toBe(200);
      expect(onCanvas.status).toBe(200);
      expect(await filesIn(a.folder)).toEqual({
        "footage/take-1.png": PNG,
        "Imported/interview.png": PNG
      });
      const rows = await Asset.listByProject(USER, a.project.id);
      expect(rows.map((row) => row.workspace_path).sort()).toEqual([
        "Imported/interview.png",
        "footage/take-1.png"
      ]);
      for (const row of rows) {
        expect(
          await rawExists(getAssetStorageKey(USER, row.id, row.content_type))
        ).toBe(false);
      }
    });

    it("an upload dropped on the folder itself lands at its root", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const res = await upload(
        { project_id: a.project.id, directory: ".", parent_id: USER },
        { name: "notes.png", bytes: PNG, type: "image/png" }
      );
      expect(res.status).toBe(200);
      expect(Object.keys(await filesIn(a.folder))).toEqual(["notes.png"]);
    });

    it("an upload that names a project the user does not own is refused and writes nothing", async () => {
      const theirs = await projectWithFolder(OTHER_USER, "Their film");

      const res = await upload(
        { project_id: theirs.project.id, parent_id: USER },
        { name: "intrusion.png", bytes: PNG, type: "image/png" }
      );

      expect(res.status).toBe(400);
      expect(await filesIn(theirs.folder)).toEqual({});
      expect(await Asset.listByProject(OTHER_USER, theirs.project.id)).toEqual([]);
      const [mine] = await Asset.paginate(USER, { limit: 100 });
      expect(mine.filter((row) => row.name === "intrusion.png")).toEqual([]);
    });

    it("an upload that escapes the project folder through its directory is refused", async () => {
      const a = await projectWithFolder(USER, "Film A");
      for (const directory of ["../outside", ".nodetool"]) {
        const res = await upload(
          { project_id: a.project.id, directory, parent_id: USER },
          { name: "x.png", bytes: PNG, type: "image/png" }
        );
        expect(res.status).toBe(400);
      }
      expect(await filesIn(a.folder)).toEqual({});
      expect(await Asset.listByProject(USER, a.project.id)).toEqual([]);
    });

    it("a Save-file node with save_to_workspace writes one file and a row that points at it", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const context = await chatContext(a.project.id);

      for (let i = 0; i < 2; i++) {
        await writeSavedFile({
          folder: "",
          filename: "renders/still.png",
          saveToWorkspace: true,
          workspace: context.workspace,
          context,
          contentType: "image/png",
          bytes: PNG
        });
      }

      expect(await filesIn(a.folder)).toEqual({
        "renders/still.png": PNG,
        "renders/still_1.png": PNG
      });
      const rows = await Asset.listByProject(USER, a.project.id);
      expect(rows.map((row) => row.workspace_path).sort()).toEqual([
        "renders/still.png",
        "renders/still_1.png"
      ]);
    });

    it("the agent's update_asset renames the file with the row", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const context = await chatContext(a.project.id);
      const run = createCapabilityRun({ context, gate: UNGATED });
      const created = (await run.invoke("generate_image", {
        provider: "fake",
        model: "fox",
        prompt: "fox",
        output_file: "Generated/fox.png"
      })) as { asset_id: string };

      const updated = (await run.invoke("update_asset", {
        asset_id: created.asset_id,
        name: "fox in snow"
      })) as { error?: string };

      expect(updated.error).toBeUndefined();
      expect(await filesIn(a.folder)).toEqual({
        "Generated/fox-in-snow.png": PNG
      });
      expect((await Asset.find(USER, created.asset_id))?.workspace_path).toBe(
        "Generated/fox-in-snow.png"
      );
    });

    it("delete_composition removes the composition's file with its row", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const context = await chatContext(a.project.id);
      const run = createCapabilityRun({ context, gate: UNGATED });
      // A composition as `save_composition` stores it: a JSON asset saved
      // through `context.createAsset`, marked in its metadata.
      const saved = (await context.createAsset({
        name: "Lower-third.composition.json",
        contentType: "application/json",
        content: new TextEncoder().encode("{}\n"),
        metadata: { nodetool_composition: { name: "Lower third", param_names: [] } }
      })) as { id: string };
      expect(Object.keys(await filesIn(a.folder))).toEqual([
        "Generated/Lower-third.composition.json"
      ]);

      const deleted = (await run.invoke("delete_composition", {
        composition_id: saved.id
      })) as { ok?: boolean; error?: string };

      expect(deleted).toMatchObject({ ok: true });
      expect(await filesIn(a.folder)).toEqual({});
      expect(await Asset.find(USER, saved.id)).toBeNull();
    });

    it("a direct upload is moved into the directory it was dropped on when it is finalized", async () => {
      if (mode === "local") {
        // The local file store has no signed upload, so the client posts the
        // file instead; the multipart cases above cover it.
        const caller = createCaller(makeCtx());
        const a = await projectWithFolder(USER, "Film A");
        const created = await caller.assets.createUpload({
          name: "take.png",
          content_type: "image/png",
          size: PNG.byteLength,
          project_id: a.project.id
        });
        expect(created.upload).toBeNull();
        return;
      }
      const caller = createCaller(makeCtx());
      const a = await projectWithFolder(USER, "Film A");
      const created = await caller.assets.createUpload({
        name: "take.png",
        content_type: "image/png",
        size: PNG.byteLength,
        project_id: a.project.id
      });
      expect(created.upload).not.toBeNull();
      // The client's PUT lands the bytes under the key it was given.
      await rawStore.store(created.key, PNG, "image/png");

      const finalized = await caller.assets.finalizeUpload({
        asset_id: created.asset_id,
        directory: "footage"
      });

      expect(finalized.id).toBe(created.asset_id);
      expect(await filesIn(a.folder)).toEqual({ "footage/take.png": PNG });
      expect(await rawExists(created.key)).toBe(false);
      expect((await Asset.find(USER, created.asset_id))?.workspace_path).toBe(
        "footage/take.png"
      );
    });

    it("a direct upload to another user's project is refused before a row exists", async () => {
      const caller = createCaller(makeCtx());
      const theirs = await projectWithFolder(OTHER_USER, "Their film");
      await expect(
        caller.assets.createUpload({
          name: "take.png",
          content_type: "image/png",
          size: PNG.byteLength,
          project_id: theirs.project.id
        })
      ).rejects.toThrow(/Project not found/);
      expect(await Project.findOwned(USER, theirs.project.id)).toBeNull();
    });

    it("a direct upload to the caller's Personal project lazily creates Personal and refuses another user's", async () => {
      const caller = createCaller(makeCtx());
      const personalId = `personal:${USER}`;
      expect(await Project.findOwned(USER, personalId)).toBeNull();

      const created = await caller.assets.createUpload({
        name: "Untitled.md",
        content_type: "text/markdown",
        size: 0,
        project_id: personalId
      });
      if (mode === "local") {
        expect(created.upload).toBeNull();
      } else {
        expect(created.upload).not.toBeNull();
      }
      expect(await Project.findOwned(USER, personalId)).not.toBeNull();

      await expect(
        caller.assets.createUpload({
          name: "Untitled.md",
          content_type: "text/markdown",
          size: 0,
          project_id: `personal:${OTHER_USER}`
        })
      ).rejects.toThrow(/Project not found/);
    });
  }
);
