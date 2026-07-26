import type { NodeMetadata } from "@nodetool-ai/node-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  runSdkV1Preflight,
  SdkV1PreflightServiceError
} from "../src/sdk/sdk-preflight-orchestrator.js";

const metadata: NodeMetadata = {
  title: "Echo",
  description: "",
  namespace: "test",
  node_type: "test.Echo",
  properties: [],
  outputs: [],
  required_runtimes: ["python"]
};

function makeRegistry() {
  return {
    has: vi.fn((nodeType: string) => nodeType === metadata.node_type),
    getMetadata: vi.fn((nodeType: string) =>
      nodeType === metadata.node_type ? metadata : undefined
    ),
    validateNode: vi.fn(() => [])
  };
}

const workflow = {
  graph: {
    nodes: [{ id: "echo-1", type: "test.Echo", data: {} }],
    edges: []
  },
  workflowInterface: {
    version: 1 as const,
    workflow_id: "workflow-1",
    etag: "etag-1",
    source: "server" as const,
    inputs: [
      {
        node_id: "input-text",
        name: "text",
        description: "",
        type: { type: "str", optional: false, type_args: [] },
        required: true,
        default: null
      }
    ],
    outputs: [],
    diagnostics: []
  }
};

function request(level: "static" | "availability" | "execution") {
  return {
    workflow_id: "workflow-1",
    workspace_id: "workspace-1",
    workflow_etag: "etag-1",
    interface_version: 1 as const,
    level,
    inputs: { text: "hello" }
  };
}

describe("runSdkV1Preflight", () => {
  it("loads through the authorization-enforcing source and dispatches static preflight", async () => {
    const loadAuthorizedWorkflow = vi.fn(async () => workflow);

    const result = await runSdkV1Preflight({
      request: request("static"),
      principal: { userId: "user-1" },
      workflowSource: { loadAuthorizedWorkflow },
      registry: makeRegistry()
    });

    expect(result).toMatchObject({
      level: "static",
      workflow_id: "workflow-1",
      runnable: true
    });
    expect(loadAuthorizedWorkflow).toHaveBeenCalledWith({
      workflowId: "workflow-1",
      workspaceId: "workspace-1",
      principal: { userId: "user-1" }
    });
  });

  it("uses the same not-found result for missing or inaccessible workflows", async () => {
    for (const reason of ["missing", "inaccessible"]) {
      const promise = runSdkV1Preflight({
        request: request("static"),
        principal: { userId: `user-${reason}` },
        workflowSource: {
          loadAuthorizedWorkflow: async () => null
        },
        registry: makeRegistry()
      });

      await expect(promise).rejects.toMatchObject({
        name: "SdkV1PreflightServiceError",
        code: "WORKFLOW_NOT_FOUND",
        message: "Workflow not found.",
        retryable: false
      });
    }
  });

  it("dispatches availability through the injected requirement resolver", async () => {
    const resolveRequirement = vi.fn(() => ({ status: "available" as const }));

    const result = await runSdkV1Preflight({
      request: request("availability"),
      principal: { userId: "user-1" },
      workflowSource: { loadAuthorizedWorkflow: async () => workflow },
      registry: makeRegistry(),
      resolveRequirement
    });

    expect(result.level).toBe("availability");
    expect(result.runnable).toBe(true);
    expect(resolveRequirement).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "runtime", id: "python" })
    );
  });

  it("dispatches execution through both injected readiness boundaries", async () => {
    const probeExecutionReadiness = vi.fn(() => ({
      requirements: [
        {
          kind: "worker" as const,
          id: "worker:local",
          name: "Local worker",
          status: "available" as const,
          blocking: true,
          message: null
        }
      ],
      issues: []
    }));

    const result = await runSdkV1Preflight({
      request: request("execution"),
      principal: { userId: "user-1" },
      workflowSource: { loadAuthorizedWorkflow: async () => workflow },
      registry: makeRegistry(),
      resolveRequirement: () => ({ status: "available" }),
      probeExecutionReadiness
    });

    expect(result.level).toBe("execution");
    expect(result.runnable).toBe(true);
    expect(probeExecutionReadiness).toHaveBeenCalledOnce();
  });

  it("fails with a stable error when a requested level has no adapter", async () => {
    const promise = runSdkV1Preflight({
      request: request("execution"),
      principal: { userId: "user-1" },
      workflowSource: { loadAuthorizedWorkflow: async () => workflow },
      registry: makeRegistry()
    });

    await expect(promise).rejects.toEqual(
      new SdkV1PreflightServiceError(
        "PREFLIGHT_LEVEL_UNAVAILABLE",
        "Execution preflight is not available.",
        false
      )
    );
  });
});
