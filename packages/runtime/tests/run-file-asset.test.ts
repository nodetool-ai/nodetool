/**
 * A file the run names by path that is also an asset is written once when
 * the run's workspace is the project folder, and also lands in the run's
 * workspace when that is another folder.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import {
  PrefixedStorageAdapter,
  StorageWorkspace,
  saveRunFileAsset,
  setProjectFolderResolver,
  type RunFileAssetContext,
  type Workspace
} from "../src/index.js";

const BYTES = new Uint8Array([1, 2, 3]);

/** One bucket, as a cloud deployment's project folders share one. */
const bucket = new InMemoryStorageAdapter();
let folderCount = 0;

/** A folder in {@link bucket} whose writes are counted. */
function countingWorkspace(): { workspace: Workspace; writes: string[] } {
  const workspace = new StorageWorkspace(
    new PrefixedStorageAdapter(bucket, `folder-${++folderCount}`)
  );
  const writes: string[] = [];
  const write = workspace.write.bind(workspace);
  workspace.write = async (path, data, contentType) => {
    writes.push(path);
    await write(path, data, contentType);
  };
  return { workspace, writes };
}

/** A run whose `createAsset` writes the file into `folder`, as the server's does. */
function runIn(
  runWorkspace: Workspace | null,
  folder: Workspace,
  createAsset?: RunFileAssetContext["createAsset"]
): RunFileAssetContext {
  return {
    userId: "u1",
    projectId: "p1",
    workspace: runWorkspace,
    hasModelInterface: () => true,
    createAsset:
      createAsset ??
      (async (args) => {
        await folder.write(args.path ?? "Generated/x", args.content);
        return { id: "asset-1" };
      })
  };
}

afterEach(() => {
  setProjectFolderResolver(null);
});

describe("saveRunFileAsset", () => {
  it("writes the file once when the run works in the project folder", async () => {
    const { workspace, writes } = countingWorkspace();
    setProjectFolderResolver(async (projectId) => ({
      ok: true,
      projectId: projectId ?? "p1",
      workspace
    }));
    const createAsset = vi.fn(async (args: { path?: string | null; content: Uint8Array }) => {
      await workspace.write(args.path ?? "", args.content);
      return { id: "asset-1" };
    });

    const saved = await saveRunFileAsset(
      runIn(workspace, workspace, createAsset),
      BYTES,
      { path: "shots/hero.png", name: "hero.png", contentType: "image/png" }
    );

    expect(saved).toEqual({ asset_id: "asset-1", path: "shots/hero.png" });
    expect(createAsset).toHaveBeenCalledWith(
      expect.objectContaining({ path: "shots/hero.png", content: BYTES })
    );
    expect(writes).toEqual(["shots/hero.png"]);
  });

  it("also writes the run's workspace when the project folder is elsewhere", async () => {
    const project = countingWorkspace();
    const run = countingWorkspace();
    setProjectFolderResolver(async () => ({
      ok: true,
      projectId: "p1",
      workspace: project.workspace
    }));

    const saved = await saveRunFileAsset(
      runIn(run.workspace, project.workspace),
      BYTES,
      { path: "out.png", name: "out.png", contentType: "image/png" }
    );

    expect(saved.asset_id).toBe("asset-1");
    expect(project.writes).toEqual(["out.png"]);
    expect(run.writes).toEqual(["out.png"]);
    expect(await run.workspace.read("out.png")).toEqual(BYTES);
  });

  it("keeps the file in the run's workspace and reports why when the asset fails", async () => {
    const { workspace, writes } = countingWorkspace();
    setProjectFolderResolver(async () => ({ ok: true, projectId: "p1", workspace }));

    const saved = await saveRunFileAsset(
      runIn(workspace, workspace, async () => {
        throw new Error("folder unplugged");
      }),
      BYTES,
      { path: "out.png", name: "out.png", contentType: "image/png" }
    );

    expect(saved).toEqual({
      asset_id: null,
      path: "out.png",
      asset_error: "folder unplugged"
    });
    expect(writes).toEqual(["out.png"]);
  });

  it("writes only the workspace file on a host that saves no assets", async () => {
    const { workspace, writes } = countingWorkspace();
    const createAsset = vi.fn();
    const saved = await saveRunFileAsset(
      { ...runIn(workspace, workspace, createAsset), hasModelInterface: () => false },
      BYTES,
      { path: "out.png", name: "out.png", contentType: "image/png" }
    );

    expect(saved).toEqual({ asset_id: null, path: "out.png" });
    expect(createAsset).not.toHaveBeenCalled();
    expect(writes).toEqual(["out.png"]);
  });
});
