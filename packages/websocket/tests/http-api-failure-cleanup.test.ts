/**
 * Regressions for two "row created, work failed, row left behind" bugs in the
 * REST handlers.
 *
 *  1. `handleWorkflowRun` creates the Job row at status "running" and then does
 *     flag hydration and the run itself with no `try`/`catch`. A registry
 *     throw returned a 500 and stranded the row at "running" forever. The
 *     project folder is resolved before the row exists, so an unreachable one
 *     leaves no row at all.
 *  2. `handleAssetsRoot` creates the Asset row before writing the bytes. When
 *     `storeAssetWithThumbnail` throws (over the upload cap, or any S3/Supabase
 *     failure) the request 500s and the row survives pointing at bytes that were
 *     never written.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { initTestDb, Workflow, Job, Asset } from "@nodetool-ai/models";
import { BaseNode, NodeRegistry } from "@nodetool-ai/node-sdk";

const storeMock = vi.fn(async () => undefined);

vi.mock("@nodetool-ai/asset-services/thumbnail", async () => {
  const actual = await vi.importActual<
    typeof import("@nodetool-ai/asset-services/thumbnail")
  >("@nodetool-ai/asset-services/thumbnail");
  return {
    ...actual,
    storeAssetWithThumbnail: (...args: unknown[]) => storeMock(...args)
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
  it("deletes the Asset row when storing the bytes throws", async () => {
    storeMock.mockRejectedValue(new Error("upload exceeds maximum size"));

    const form = new FormData();
    form.append(
      "json",
      JSON.stringify({
        name: "pic.png",
        content_type: "image/png",
        parent_id: "user-1"
      })
    );
    form.append(
      "file",
      new File([new Uint8Array([1, 2, 3])], "pic.png", { type: "image/png" })
    );

    await expect(
      handleAssetsRoot(
        new Request("http://localhost/api/assets", {
          method: "POST",
          headers: { "x-user-id": "user-1" },
          body: form
        }),
        {}
      )
    ).rejects.toThrow("upload exceeds maximum size");
    expect(storeMock).toHaveBeenCalledOnce();

    const [assets] = await Asset.paginate("user-1", { limit: 100 });
    expect(assets.filter((a) => a.name === "pic.png")).toHaveLength(0);
  });

  it("keeps the Asset row when the store succeeds", async () => {
    const form = new FormData();
    form.append(
      "json",
      JSON.stringify({
        name: "ok.png",
        content_type: "image/png",
        parent_id: "user-1"
      })
    );
    form.append(
      "file",
      new File([new Uint8Array([1, 2, 3])], "ok.png", { type: "image/png" })
    );

    const res = await handleAssetsRoot(
      new Request("http://localhost/api/assets", {
        method: "POST",
        headers: { "x-user-id": "user-1" },
        body: form
      }),
      {}
    );
    expect(res.status).toBe(200);
    expect(storeMock).toHaveBeenCalledOnce();

    const [assets] = await Asset.paginate("user-1", { limit: 100 });
    expect(assets.filter((a) => a.name === "ok.png")).toHaveLength(1);
  });
});
