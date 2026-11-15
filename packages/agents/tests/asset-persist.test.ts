/**
 * `persistOutput` saves media as one asset. With `output_file` the asset's
 * file is at that path and no second copy is written into the workspace.
 */
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import {
  StorageWorkspace,
  setProjectFolderResolver,
  type ProcessingContext,
  type Workspace
} from "@nodetool-ai/runtime";
import { persistOutput } from "../src/tools/asset-persist.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

/**
 * A run in the project folder `workspace`, whose `createAsset` writes the
 * file there the way the server's port does. Every workspace write is logged.
 */
function runInProjectFolder(): {
  context: ProcessingContext;
  created: Array<Record<string, unknown>>;
  writes: string[];
  workspace: Workspace;
} {
  const workspace = new StorageWorkspace(new InMemoryStorageAdapter());
  const writes: string[] = [];
  const write = workspace.write.bind(workspace);
  workspace.write = async (path, data, contentType) => {
    writes.push(path);
    await write(path, data, contentType);
  };
  setProjectFolderResolver(async () => ({ ok: true, projectId: "p1", workspace }));
  const created: Array<Record<string, unknown>> = [];
  const context = {
    userId: "u1",
    projectId: "p1",
    workspace,
    hasModelInterface: (name: string) => name === "createAsset",
    createAsset: async (args: Record<string, unknown>) => {
      created.push(args);
      const path = typeof args.path === "string" ? args.path : "Generated/out.png";
      await workspace.write(path, args.content as Uint8Array);
      return { id: `asset-${created.length}` };
    }
  } as unknown as ProcessingContext;
  return { context, created, writes, workspace };
}

afterEach(() => {
  setProjectFolderResolver(null);
});

describe("persistOutput", () => {
  it("saves output_file as the asset's own file and writes it once", async () => {
    const { context, created, writes, workspace } = runInProjectFolder();

    const saved = await persistOutput(context, PNG, {
      namePrefix: "shot",
      mime: "image/png",
      outputFile: "shots/hero.png"
    });

    expect(created).toEqual([
      expect.objectContaining({ path: "shots/hero.png", name: "hero.png" })
    ]);
    expect(writes).toEqual(["shots/hero.png"]);
    expect(await workspace.read("shots/hero.png")).toEqual(PNG);
    expect(saved).toMatchObject({
      asset_id: "asset-1",
      asset_uri: "asset://asset-1.png",
      path: "shots/hero.png"
    });
  });

  it("leaves the file name to the host without output_file and writes no workspace copy", async () => {
    const { context, created, writes } = runInProjectFolder();

    const saved = await persistOutput(context, PNG, {
      namePrefix: "shot",
      mime: "image/png"
    });

    expect(created).toHaveLength(1);
    expect(created[0]).not.toHaveProperty("path");
    expect(writes).toEqual(["Generated/out.png"]);
    expect(saved.path).toBeUndefined();
    expect(saved.asset_id).toBe("asset-1");
  });
});
