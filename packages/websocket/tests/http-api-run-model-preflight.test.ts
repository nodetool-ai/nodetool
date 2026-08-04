/**
 * `POST /api/workflows/:id/run|debug` refuses a graph whose model properties
 * name a provider the runtime cannot construct.
 *
 * Without the check the run started, executed everything upstream, and died on
 * the model node — after the expensive half of the graph had already been paid
 * for. The ids are in the saved properties, so the run is refused before the
 * job row exists.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os from "node:os";
import { initTestDb, Workflow, Job } from "@nodetool-ai/models";
import {
  registerProvider,
  unregisterProvider,
  type BaseProvider
} from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";

vi.mock("../src/lib/workflow-workspace.js", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/workflow-workspace.js")
  >("../src/lib/workflow-workspace.js");
  return {
    ...actual,
    resolveWorkflowWorkspace: async () => os.tmpdir()
  };
});

const { handleWorkflowRun } = await import("../src/http-api.js");

const echoExecutor = {
  async process(ins: Record<string, unknown>): Promise<Record<string, unknown>> {
    return ins;
  }
};

const registry = {
  has: (t: string) => t.startsWith("test."),
  resolve: () => echoExecutor,
  getClass: () => undefined,
  resolveMetadata: () => undefined,
  getMetadata: () => undefined,
  listMetadata: () => []
} as unknown as NodeRegistry;

const PROVIDER_ID = "run_preflight_test_provider";

const workflowWith = async (model: Record<string, unknown>): Promise<Workflow> =>
  (await Workflow.create({
    user_id: "user-1",
    name: "Model WF",
    access: "private",
    graph: {
      nodes: [{ id: "gen", type: "test.Echo", properties: { model } }],
      edges: []
    }
  })) as Workflow;

const run = (workflowId: string): Promise<Response> =>
  handleWorkflowRun(
    new Request("http://localhost/x", {
      method: "POST",
      headers: { "x-user-id": "user-1", "content-type": "application/json" },
      body: JSON.stringify({})
    }),
    workflowId,
    { registry }
  );

beforeEach(async () => {
  await initTestDb();
  // A real registration, so `listRegisteredProviderIds` is non-empty and the
  // check runs at all — an empty list means "registry unreachable" and is
  // deliberately skipped.
  registerProvider(
    PROVIDER_ID,
    class {} as unknown as new (...args: never[]) => BaseProvider
  );
});

afterEach(() => {
  unregisterProvider(PROVIDER_ID);
});

describe("handleWorkflowRun model preflight", () => {
  it("refuses a run naming an unregistered provider, before the job exists", async () => {
    const workflow = await workflowWith({
      type: "image_model",
      provider: "definitely-not-registered",
      id: "some/model"
    });

    const res = await run(workflow.id);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("definitely-not-registered");

    const [jobs] = await Job.paginate("user-1", {
      workflowId: workflow.id,
      limit: 10
    });
    expect(jobs).toHaveLength(0);
  });

  it("refuses a model id that names no provider", async () => {
    const workflow = await workflowWith({
      type: "image_model",
      id: "some/model"
    });

    const res = await run(workflow.id);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("names no provider");
  });

  it("runs a workflow whose provider is registered", async () => {
    const workflow = await workflowWith({
      type: "image_model",
      provider: PROVIDER_ID,
      id: "some/model"
    });

    const res = await run(workflow.id);
    expect(res.status).toBe(200);
  });

  // An unselected model is the editor's own complaint, not a reason to refuse
  // a run that may never reach the node.
  it("lets an unselected model through", async () => {
    const workflow = await workflowWith({ type: "image_model" });
    expect((await run(workflow.id)).status).toBe(200);
  });
});
