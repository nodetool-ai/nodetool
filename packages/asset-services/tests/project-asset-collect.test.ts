/**
 * Collect (PRD T6, US9): every linked file of a project is copied into its
 * `Imported/` directory, the row is pointed at the copy, and `external_path`
 * is cleared. The asset id never changes, the linked file is never touched,
 * and an interrupted run resumes without copying an asset twice.
 *
 * Every case runs against a local directory and against a storage-backed
 * folder (a key prefix in an object store), through the same `Workspace`.
 */
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Asset, initTestDb, ModelObserver } from "@nodetool-ai/models";
import {
  createLocalWorkspace,
  createWorkspace,
  setProjectFolderResolver,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import {
  COLLECT_PATH_KEY,
  collectLinkedAssets,
  isProjectAssetPathInFlux
} from "../src/project-asset.js";
import {
  ProjectFolderUnavailableError,
  partialContentHash
} from "../src/project-asset-file.js";
import { ProjectAssetStorageAdapter } from "../src/project-asset-storage.js";
import { getAssetStorageKey } from "../src/asset-paths.js";
import { getAssetAdapter } from "../src/storage.js";

vi.mock("../src/storage.js", () => ({ getAssetAdapter: vi.fn() }));

const USER = "owner";
const PROJECT = "project-a";

let root: string;
let mediaDir: string;
let rawStore: InMemoryStorageAdapter;
let assetStore: ProjectAssetStorageAdapter;
let workspace: Workspace;
let reachable: boolean;

const kinds = {
  local: (): Workspace => createLocalWorkspace(join(root, "folder")),
  storage: (): Workspace =>
    createWorkspace(rawStore, { prefix: `workspaces/${USER}/${PROJECT}` })
} as const;

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-collect-"));
  mediaDir = join(root, "media");
  rawStore = new InMemoryStorageAdapter();
  assetStore = new ProjectAssetStorageAdapter(rawStore);
  vi.mocked(getAssetAdapter).mockReturnValue(assetStore);
  reachable = true;
});

afterEach(async () => {
  ModelObserver.clear();
  setProjectFolderResolver(null);
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

function useFolder(kind: keyof typeof kinds): void {
  workspace = kinds[kind]();
  setProjectFolderResolver(
    async (projectId): Promise<ProjectFolderResolution> => {
      const id = projectId ?? "personal";
      if (!reachable) {
        return { ok: false, projectId: id, reason: `Project folder not found: ${id}` };
      }
      return { ok: true, projectId: id, workspace };
    }
  );
}

async function files(): Promise<string[]> {
  return (await workspace.list("", { recursive: true }))
    .filter((entry) => !entry.isDirectory)
    .map((entry) => entry.path)
    .sort();
}

/** A linked asset, created the way `assets.createExternal` records one. */
async function link(name: string, content: string): Promise<Asset> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(mediaDir, { recursive: true });
  const path = join(mediaDir, name);
  await writeFile(path, content);
  const info = await stat(path);
  return Asset.create<Asset>({
    user_id: USER,
    project_id: PROJECT,
    parent_id: USER,
    name,
    content_type: "video/mp4",
    size: info.size,
    external_path: path,
    metadata: { external_size: info.size, external_mtime: info.mtimeMs }
  });
}

async function threeLinked(): Promise<Asset[]> {
  return [
    await link("take one.mp4", "first take"),
    await link("take two.mp4", "second take"),
    await link("take three.mp4", "third take")
  ];
}

describe.each(["local", "storage"] as const)(
  "collect in a %s folder",
  (kind) => {
    beforeEach(() => useFolder(kind));

    it("copies three linked files into Imported/ and keeps every asset id", async () => {
      const linked = await threeLinked();

      const result = await collectLinkedAssets({
        projectId: PROJECT,
        userId: USER
      });

      expect(result.copied.map((a) => a.id)).toEqual(linked.map((a) => a.id));
      expect(result.skipped).toEqual([]);
      expect(result.failed).toEqual([]);
      expect(await files()).toEqual([
        "Imported/take-one.mp4",
        "Imported/take-three.mp4",
        "Imported/take-two.mp4"
      ]);
      for (const original of linked) {
        const row = await Asset.find(USER, original.id);
        expect(row?.external_path).toBeNull();
        expect(row?.workspace_path).toMatch(/^Imported\/take-.*\.mp4$/);
        expect(row?.metadata).not.toHaveProperty("external_size");
        expect(row?.metadata).not.toHaveProperty(COLLECT_PATH_KEY);
        const bytes = await workspace.read(row!.workspace_path!);
        expect(Buffer.from(bytes!).toString()).toBe(
          await readFile(original.external_path!, "utf8")
        );
        expect(row?.metadata?.["workspace_hash"]).toBe(partialContentHash(bytes!));
        // Readers keep using the id key, now served from the copy.
        const key = getAssetStorageKey(USER, original.id, "video/mp4");
        expect(await assetStore.retrieve(assetStore.uriForKey(key))).toEqual(bytes);
      }
      expect(await Asset.listByProject(USER, PROJECT)).toHaveLength(3);
    });

    it("leaves every linked file where it was, unchanged", async () => {
      const linked = await threeLinked();
      const before = await Promise.all(
        linked.map((a) => readFile(a.external_path!, "utf8"))
      );

      await collectLinkedAssets({ projectId: PROJECT, userId: USER });

      expect(
        await Promise.all(linked.map((a) => readFile(a.external_path!, "utf8")))
      ).toEqual(before);
    });

    it("finishes the other two after an interruption without copying the first twice", async () => {
      const linked = await threeLinked();
      const controller = new AbortController();
      const absorb = vi.spyOn(workspace, "absorbNew");
      absorb.mockImplementation(async function (this: Workspace, ...args) {
        // Stop the run once the first file is on its way.
        controller.abort();
        absorb.mockRestore();
        return workspace.absorbNew(...args);
      });

      const first = await collectLinkedAssets({
        projectId: PROJECT,
        userId: USER,
        signal: controller.signal
      });
      expect(first.interrupted).toBe(true);
      expect(first.copied.map((a) => a.id)).toEqual([linked[0]!.id]);
      expect(await files()).toEqual(["Imported/take-one.mp4"]);
      expect((await Asset.find(USER, linked[1]!.id))?.external_path).toBe(
        linked[1]!.external_path
      );

      const absorbed = vi.spyOn(workspace, "absorbNew");
      const second = await collectLinkedAssets({
        projectId: PROJECT,
        userId: USER
      });

      expect(second.interrupted).toBe(false);
      expect(second.copied.map((a) => a.id)).toEqual([
        linked[1]!.id,
        linked[2]!.id
      ]);
      expect(absorbed).toHaveBeenCalledTimes(2);
      expect(await files()).toEqual([
        "Imported/take-one.mp4",
        "Imported/take-three.mp4",
        "Imported/take-two.mp4"
      ]);
      expect((await Asset.find(USER, linked[0]!.id))?.workspace_path).toBe(
        "Imported/take-one.mp4"
      );
    });

    it("keeps an edit made to a later asset while an earlier one was copied", async () => {
      const [first, second] = await threeLinked();
      const absorb = vi.spyOn(workspace, "absorbNew");
      absorb.mockImplementationOnce(async (from, to, contentType) => {
        // The creator renames the second asset during the first copy.
        const row = await Asset.find(USER, second!.id);
        row!.name = "hero take.mp4";
        await row!.save();
        absorb.mockRestore();
        return workspace.absorbNew(from, to, contentType);
      });

      const result = await collectLinkedAssets({ projectId: PROJECT, userId: USER });

      expect(result.copied[0]?.id).toBe(first!.id);
      expect((await Asset.find(USER, second!.id))?.name).toBe("hero take.mp4");
      expect(await files()).toContain("Imported/hero-take.mp4");
    });

    it("keeps the reconciler off the copy until its row names it", async () => {
      await link("take.mp4", "bytes");
      const seen: boolean[] = [];
      const absorb = vi.spyOn(workspace, "absorbNew");
      absorb.mockImplementationOnce(async (from, to, contentType) => {
        absorb.mockRestore();
        const written = await workspace.absorbNew(from, to, contentType);
        seen.push(isProjectAssetPathInFlux(USER, PROJECT, to));
        return written;
      });

      const result = await collectLinkedAssets({ projectId: PROJECT, userId: USER });

      expect(seen).toEqual([true]);
      expect(
        isProjectAssetPathInFlux(USER, PROJECT, result.copied[0]!.workspace_path)
      ).toBe(false);
    });

    it("reuses the copy a run published before it stopped", async () => {
      const asset = await link("long take.mp4", "the whole take");
      // What a run that died after publishing its copy, before the row
      // moved, leaves.
      await workspace.write("Imported/long-take.mp4", "the whole take");
      asset.metadata = {
        ...asset.metadata,
        [COLLECT_PATH_KEY]: "Imported/long-take.mp4"
      };
      await asset.save();
      const absorbed = vi.spyOn(workspace, "absorbNew");

      const result = await collectLinkedAssets({
        projectId: PROJECT,
        userId: USER
      });

      expect(result.copied).toEqual([
        { id: asset.id, name: "long take.mp4", workspace_path: "Imported/long-take.mp4" }
      ]);
      expect(absorbed).not.toHaveBeenCalled();
      expect(await files()).toEqual(["Imported/long-take.mp4"]);
    });

    it("never writes over a recorded file whose bytes are not the linked file", async () => {
      const asset = await link("long take.mp4", "the whole take");
      // A file another app saved at the recorded path since.
      await workspace.write("Imported/long-take.mp4", "the creator's file");
      asset.metadata = {
        ...asset.metadata,
        [COLLECT_PATH_KEY]: "Imported/long-take.mp4"
      };
      await asset.save();

      const result = await collectLinkedAssets({
        projectId: PROJECT,
        userId: USER
      });

      expect(result.copied).toEqual([
        { id: asset.id, name: "long take.mp4", workspace_path: "Imported/long-take-2.mp4" }
      ]);
      expect(
        Buffer.from((await workspace.read("Imported/long-take.mp4"))!).toString()
      ).toBe("the creator's file");
      expect(
        Buffer.from((await workspace.read("Imported/long-take-2.mp4"))!).toString()
      ).toBe("the whole take");
    });

    it("never writes over a reserved file that another asset took", async () => {
      const asset = await link("long take.mp4", "the whole take");
      await workspace.write("Imported/long-take.mp4", "someone else's");
      await Asset.create({
        user_id: USER,
        project_id: PROJECT,
        name: "other",
        content_type: "video/mp4",
        workspace_path: "Imported/long-take.mp4"
      });
      asset.metadata = { ...asset.metadata, [COLLECT_PATH_KEY]: "Imported/long-take.mp4" };
      await asset.save();

      const result = await collectLinkedAssets({ projectId: PROJECT, userId: USER });

      expect(result.copied[0]?.workspace_path).toBe("Imported/long-take-2.mp4");
      expect(
        Buffer.from((await workspace.read("Imported/long-take.mp4"))!).toString()
      ).toBe("someone else's");
    });

    /**
     * Another app saves `path` once, as an editor does: a whole new file put
     * in place in one step, when the copy into the folder starts.
     */
    function competingSaveDuringCopy(
      bytes: string,
      after?: () => Promise<never>
    ): void {
      const methods = workspace as unknown as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
      >;
      let saved = false;
      for (const method of ["absorb", "absorbNew"]) {
        const original = methods[method];
        if (typeof original !== "function") continue;
        methods[method] = async (from: unknown, to: unknown, ...rest) => {
          if (!saved) {
            saved = true;
            await workspace.write(to as string, bytes);
            if (after) await after();
          }
          return original.call(workspace, from, to, ...rest);
        };
      }
    }

    it("never replaces a file another app saved over the name during the copy", async () => {
      const asset = await link("take.mp4", "the linked take");
      competingSaveDuringCopy("the creator's take");

      const result = await collectLinkedAssets({ projectId: PROJECT, userId: USER });

      expect(result.copied).toEqual([
        { id: asset.id, name: "take.mp4", workspace_path: "Imported/take-2.mp4" }
      ]);
      expect(await files()).toEqual(["Imported/take-2.mp4", "Imported/take.mp4"]);
      const read = async (path: string): Promise<string> =>
        Buffer.from((await workspace.read(path))!).toString();
      expect(await read("Imported/take.mp4")).toBe("the creator's take");
      expect(await read("Imported/take-2.mp4")).toBe("the linked take");
    });

    it("keeps a file another app saved over the name when the copy fails", async () => {
      const asset = await link("take.mp4", "the linked take");
      competingSaveDuringCopy("the creator's take", () =>
        Promise.reject(new Error("copy failed"))
      );

      const result = await collectLinkedAssets({ projectId: PROJECT, userId: USER });

      expect(result.failed).toEqual([
        { id: asset.id, name: "take.mp4", reason: "copy failed" }
      ]);
      expect(await files()).toEqual(["Imported/take.mp4"]);
      expect(
        Buffer.from((await workspace.read("Imported/take.mp4"))!).toString()
      ).toBe("the creator's take");
      expect((await Asset.find(USER, asset.id))?.external_path).toBe(
        asset.external_path
      );
    });

    it("skips and reports an offline linked file and keeps its link", async () => {
      const [present, missing, changed] = await threeLinked();
      await rm(missing!.external_path!);
      await writeFile(changed!.external_path!, "re-encoded since");

      const result = await collectLinkedAssets({
        projectId: PROJECT,
        userId: USER
      });

      expect(result.copied.map((a) => a.id)).toEqual([present!.id]);
      expect(result.skipped.map((a) => a.id)).toEqual([missing!.id, changed!.id]);
      expect(result.skipped[0]?.reason).toMatch(/missing or changed/);
      expect(await files()).toEqual(["Imported/take-one.mp4"]);
      const kept = await Asset.find(USER, missing!.id);
      expect(kept?.external_path).toBe(missing!.external_path);
      expect(kept?.workspace_path).toBeNull();
    });

    it("reports a copy that does not verify, removes it, and keeps the link", async () => {
      const asset = await link("take.mp4", "original bytes");
      vi.spyOn(workspace, "absorbNew").mockImplementation(async (_from, to) => {
        await workspace.write(to, "corrupted bytes");
        return true;
      });

      const result = await collectLinkedAssets({ projectId: PROJECT, userId: USER });

      expect(result.failed).toEqual([
        { id: asset.id, name: "take.mp4", reason: "The copy does not match the linked file" }
      ]);
      expect(await files()).toEqual([]);
      const row = await Asset.find(USER, asset.id);
      expect(row?.external_path).toBe(asset.external_path);
      expect(row?.workspace_path).toBeNull();
      expect(row?.metadata).not.toHaveProperty(COLLECT_PATH_KEY);
    });

    it("leaves assets that keep their file in the folder alone", async () => {
      await workspace.write("Generated/fox.png", "png");
      await Asset.create({
        user_id: USER,
        project_id: PROJECT,
        name: "fox",
        content_type: "image/png",
        workspace_path: "Generated/fox.png"
      });

      const result = await collectLinkedAssets({ projectId: PROJECT, userId: USER });

      expect(result).toEqual({ copied: [], skipped: [], failed: [], interrupted: false });
      expect(await files()).toEqual(["Generated/fox.png"]);
    });

    it("refuses when the project folder cannot be reached", async () => {
      await link("take.mp4", "bytes");
      reachable = false;

      await expect(
        collectLinkedAssets({ projectId: PROJECT, userId: USER })
      ).rejects.toBeInstanceOf(ProjectFolderUnavailableError);
    });
  }
);
