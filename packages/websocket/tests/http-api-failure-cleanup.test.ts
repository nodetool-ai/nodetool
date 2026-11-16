/**
 * Regressions for two "row created, work failed, row left behind" bugs in the
 * REST handlers.
 *
 *  1. `handleWorkflowRun` creates the Job row at status "running" and then does
 *     flag hydration and the run itself with no `try`/`catch`. A registry
 *     throw returned a 500 and stranded the row at "running" forever. The
 *     project folder is resolved before the row exists, so an unreachable one
 *     leaves no row at all.
 *  2. `handleAssetsRoot` used to create the Asset row before writing the
 *     bytes, so a failed store left a row pointing at bytes that were never
 *     written. An upload is now a file in the project folder, written before
 *     its row: a failure after the write removes the file and creates no row.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initTestDb, Workflow, Job, Asset } from "@nodetool-ai/models";
import { BaseNode, NodeRegistry } from "@nodetool-ai/node-sdk";

const storeMock = vi.fn(async () => undefined);

vi.mock("@nodetool-ai/asset-services/thumbnail", async () => {
  const actual = await vi.importActual<
    typeof import("@nodetool-ai/asset-services/thumbnail")
  >("@nodetool-ai/asset-services/thumbnail");
  return {
    ...actual,
    storeAssetThumbnail: (...args: unknown[]) => storeMock(...args)
  };
});

const folderReason = vi.fn<() => string | null>(() => null);

vi.mock("../src/lib/workflow-workspace.js", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/workflow-workspace.js")
  >("../src/lib/workflow-workspace.js");
  const { createWorkspace } = await import("@nodetool-ai/runtime");
  const { InMemoryStorageAdapter } = await import("@nodetool-ai/storage");
  return {
    ...actual,
    resolveProjectWorkspace: async (projectId: string | null) => {
      const reason = folderReason();
      return reason
        ? { ok: false, projectId, reason }
        : {
            ok: true,
            projectId: projectId ?? "",
            workspace: createWorkspace(new InMemoryStorageAdapter())
          };
    }
  };
});

const { handleWorkflowRun, handleAssetsRoot } = await import(
  "../src/http-api.js"
);
const { createWorkspace, setProjectFolderResolver } = await import(
  "@nodetool-ai/runtime"
);
const { InMemoryStorageAdapter } = await import("@nodetool-ai/storage");
type Workspace = import("@nodetool-ai/runtime").Workspace;

// Registry stub: the run handler only asks whether each node type is a Python
// node, and an empty graph has none.
const emptyRegistry = {
  getMetadata: () => undefined,
  has: () => false,
  listMetadata: () => []
} as unknown as NodeRegistry;

class PlainNode extends BaseNode {
  static readonly nodeType = "test.cleanup.Plain";
  static readonly title = "Plain";
  static readonly description = "Does nothing";
  static readonly metadataOutputTypes = { output: "str" };
  async process(): Promise<Record<string, unknown>> {
    return { output: "" };
  }
}

/**
 * A real registry whose metadata lookup for flag hydration throws. The checks
 * before the Job row read metadata through `getMetadata`, so they pass, and
 * hydration is the first step after the row.
 */
function failingRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registry.register(PlainNode);
  vi.spyOn(registry, "resolveMetadata").mockImplementation(() => {
    throw new Error("registry unavailable");
  });
  return registry;
}

beforeEach(async () => {
  await initTestDb();
  folderReason.mockReset();
  folderReason.mockReturnValue(null);
  storeMock.mockReset();
  storeMock.mockResolvedValue(undefined);
});

describe("handleWorkflowRun failure cleanup", () => {
  it("marks the Job row failed when a pre-run step throws", async () => {
    const workflow = (await Workflow.create({
      user_id: "user-1",
      name: "WF",
      access: "private",
      graph: {
        nodes: [{ id: "n1", type: PlainNode.nodeType, data: {} }],
        edges: []
      }
    })) as Workflow;

    await expect(
      handleWorkflowRun(
        new Request("http://localhost/x", {
          method: "POST",
          headers: { "x-user-id": "user-1", "content-type": "application/json" },
          body: JSON.stringify({})
        }),
        workflow.id,
        { registry: failingRegistry() }
      )
    ).rejects.toThrow("registry unavailable");

    const [jobs] = await Job.paginate("user-1", {
      workflowId: workflow.id,
      limit: 10
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("failed");
    expect(String(jobs[0].error)).toContain("registry unavailable");
  });

  it("refuses a run whose project folder is unreachable before any Job row", async () => {
    folderReason.mockReturnValue("Project folder not found: /gone/My Film");
    const workflow = (await Workflow.create({
      user_id: "user-1",
      name: "WF",
      access: "private",
      graph: { nodes: [], edges: [] }
    })) as Workflow;

    const response = await handleWorkflowRun(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "x-user-id": "user-1", "content-type": "application/json" },
        body: JSON.stringify({})
      }),
      workflow.id,
      { registry: emptyRegistry }
    );

    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain(
      "Project folder not found: /gone/My Film"
    );
    const [jobs] = await Job.paginate("user-1", {
      workflowId: workflow.id,
      limit: 10
    });
    expect(jobs).toHaveLength(0);
  });
});

describe("asset upload failure cleanup", () => {
  let folder: Workspace;

  beforeEach(() => {
    // The upload lands in the project folder, here an in-memory one.
    folder = createWorkspace(new InMemoryStorageAdapter());
    setProjectFolderResolver(async (projectId) => ({
      ok: true,
      projectId: projectId ?? "personal",
      workspace: folder
    }));
  });

  afterEach(() => {
    setProjectFolderResolver(null);
  });

  const uploadForm = (name: string): FormData => {
    const form = new FormData();
    form.append(
      "json",
      JSON.stringify({ name, content_type: "image/png", parent_id: "user-1" })
    );
    form.append(
      "file",
      new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" })
    );
    return form;
  };

  it("leaves no row and no file when saving the asset throws after the write", async () => {
    storeMock.mockRejectedValue(new Error("thumbnail store unreachable"));

    await expect(
      handleAssetsRoot(
        new Request("http://localhost/api/assets", {
          method: "POST",
          headers: { "x-user-id": "user-1" },
          body: uploadForm("pic.png")
        }),
        {}
      )
    ).rejects.toThrow("thumbnail store unreachable");
    expect(storeMock).toHaveBeenCalledOnce();

    const [assets] = await Asset.paginate("user-1", { limit: 100 });
    expect(assets.filter((a) => a.name === "pic.png")).toHaveLength(0);
    expect(await folder.list("", { recursive: true })).toEqual([]);
  });

  it("refuses the upload and creates no row when the project folder is unreachable", async () => {
    setProjectFolderResolver(async (projectId) => ({
      ok: false,
      projectId: projectId ?? null,
      reason: "Project folder not found: /gone/My Film"
    }));

    const res = await handleAssetsRoot(
      new Request("http://localhost/api/assets", {
        method: "POST",
        headers: { "x-user-id": "user-1" },
        body: uploadForm("lost.png")
      }),
      {}
    );

    expect(res.status).toBe(409);
    const [assets] = await Asset.paginate("user-1", { limit: 100 });
    expect(assets.filter((a) => a.name === "lost.png")).toHaveLength(0);
  });

  it("keeps the row and its one file when the save succeeds", async () => {
    const res = await handleAssetsRoot(
      new Request("http://localhost/api/assets", {
        method: "POST",
        headers: { "x-user-id": "user-1" },
        body: uploadForm("ok.png")
      }),
      {}
    );
    expect(res.status).toBe(200);
    expect(storeMock).toHaveBeenCalledOnce();

    const [assets] = await Asset.paginate("user-1", { limit: 100 });
    const saved = assets.filter((a) => a.name === "ok.png");
    expect(saved).toHaveLength(1);
    expect(saved[0]!.workspace_path).toBe("Imported/ok.png");
    expect(
      (await folder.list("", { recursive: true }))
        .filter((entry) => !entry.isDirectory)
        .map((entry) => entry.path)
    ).toEqual(["Imported/ok.png"]);
  });
});
