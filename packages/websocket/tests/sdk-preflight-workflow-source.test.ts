import type { Workflow } from "@nodetool-ai/models";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { describe, expect, it, vi } from "vitest";
import { createNodeToolSdkV1WorkflowSource } from "../src/sdk/sdk-preflight-workflow-source.js";
import { WorkflowInterfaceServiceError } from "../src/workflow-interface-service.js";

function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: "workflow-1",
    workspace_id: "workspace-1",
    graph: { nodes: [], edges: [] },
    getEtag: () => "etag-1",
    ...overrides
  } as Workflow;
}

describe("createNodeToolSdkV1WorkflowSource", () => {
  it("delegates authorization and reuses graph-derived interface generation", async () => {
    const workflow = makeWorkflow();
    const findAuthorizedWorkflow = vi.fn(async () => workflow);
    const source = createNodeToolSdkV1WorkflowSource({
      registry: new NodeRegistry(),
      findAuthorizedWorkflow
    });

    const result = await source.loadAuthorizedWorkflow({
      workflowId: "workflow-1",
      workspaceId: "workspace-1",
      principal: { userId: "user-1" }
    });

    expect(findAuthorizedWorkflow).toHaveBeenCalledWith("user-1", "workflow-1");
    expect(result).toEqual({
      graph: { nodes: [], edges: [] },
      workflowInterface: {
        version: 1,
        workflow_id: "workflow-1",
        etag: "etag-1",
        source: "server",
        inputs: [],
        outputs: [],
        diagnostics: []
      }
    });
  });

  it("conceals missing/inaccessible workflows and workspace mismatches identically", async () => {
    const missingSource = createNodeToolSdkV1WorkflowSource({
      registry: new NodeRegistry(),
      findAuthorizedWorkflow: async () => null
    });
    const mismatchSource = createNodeToolSdkV1WorkflowSource({
      registry: new NodeRegistry(),
      findAuthorizedWorkflow: async () => makeWorkflow()
    });
    const input = {
      workflowId: "workflow-1",
      workspaceId: "other-workspace",
      principal: { userId: "user-1" }
    };

    await expect(
      missingSource.loadAuthorizedWorkflow(input)
    ).resolves.toBeNull();
    await expect(
      mismatchSource.loadAuthorizedWorkflow(input)
    ).resolves.toBeNull();
  });

  it("preserves the existing stable invalid-graph error", async () => {
    const source = createNodeToolSdkV1WorkflowSource({
      registry: new NodeRegistry(),
      findAuthorizedWorkflow: async () =>
        makeWorkflow({ graph: { nodes: "invalid", edges: [] } as never })
    });

    await expect(
      source.loadAuthorizedWorkflow({
        workflowId: "workflow-1",
        workspaceId: null,
        principal: { userId: "user-1" }
      })
    ).rejects.toEqual(
      new WorkflowInterfaceServiceError(
        "invalid_graph",
        "Workflow graph is invalid"
      )
    );
  });
});
