import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  WorkflowSyncer,
  type WorkflowSyncerDeps
} from "../src/workflow-syncer.js";
import type { AdminHTTPClient } from "../src/admin-client.js";

function makeMockClient(): AdminHTTPClient {
  return {
    updateWorkflow: vi.fn().mockResolvedValue({})
  } as unknown as AdminHTTPClient;
}

function makeMockDeps(
  overrides: Partial<WorkflowSyncerDeps> = {}
): WorkflowSyncerDeps {
  return {
    getWorkflowData: vi.fn().mockResolvedValue({
      id: "wf-1",
      name: "Test Workflow",
      graph: { nodes: [] }
    }),
    ...overrides
  };
}

describe("WorkflowSyncer", () => {
  let client: ReturnType<typeof makeMockClient>;
  let deps: WorkflowSyncerDeps;
  let syncer: WorkflowSyncer;

  beforeEach(() => {
    client = makeMockClient();
    deps = makeMockDeps();
    syncer = new WorkflowSyncer(client, deps);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns true on successful sync", async () => {
    expect(await syncer.syncWorkflow("wf-1")).toBe(true);
  });

  it("calls updateWorkflow with the workflow data", async () => {
    await syncer.syncWorkflow("wf-1");
    expect(client.updateWorkflow).toHaveBeenCalledWith(
      "wf-1",
      expect.objectContaining({ id: "wf-1" })
    );
  });

  it("calls getWorkflowData with the given ID", async () => {
    await syncer.syncWorkflow("wf-42");
    expect(deps.getWorkflowData).toHaveBeenCalledWith("wf-42");
  });

  it("returns false when the workflow is not found locally", async () => {
    syncer = new WorkflowSyncer(
      client,
      makeMockDeps({ getWorkflowData: vi.fn().mockResolvedValue(null) })
    );
    expect(await syncer.syncWorkflow("nonexistent")).toBe(false);
  });

  it("returns false when updateWorkflow throws", async () => {
    client.updateWorkflow = vi
      .fn()
      .mockRejectedValue(new Error("network error"));
    expect(await syncer.syncWorkflow("wf-1")).toBe(false);
  });

  it("returns false when getWorkflowData throws", async () => {
    syncer = new WorkflowSyncer(
      client,
      makeMockDeps({
        getWorkflowData: vi.fn().mockRejectedValue(new Error("db down"))
      })
    );
    expect(await syncer.syncWorkflow("wf-1")).toBe(false);
  });
});
