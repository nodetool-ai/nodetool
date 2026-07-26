import { describe, expect, it, vi } from "vitest";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { WorkflowInterfaceV1Response } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { createNodeToolSdkV1CachedModelInventory } from "../src/sdk/sdk-cached-model-inventory.js";
import { createNodeToolSdkV1PreflightService } from "../src/sdk/sdk-preflight-service.js";
import { SdkV1PreflightServiceError } from "../src/sdk/sdk-preflight-orchestrator.js";

const workflowInterface: WorkflowInterfaceV1Response = {
  workflow_id: "workflow-1",
  version: 1,
  etag: "etag-1",
  source: "server",
  inputs: [],
  outputs: [],
  diagnostics: []
};

const registry = {
  getMetadata: () => undefined
} as unknown as NodeRegistry;

function request(level: "static" | "availability" | "execution") {
  return {
    workflow_id: "workflow-1",
    workspace_id: null,
    workflow_etag: null,
    interface_version: 1 as const,
    level,
    inputs: {}
  };
}

describe("NodeTool SDK v1 preflight service", () => {
  it("does not construct availability dependencies for static preflight", async () => {
    const createRequirementResolver = vi.fn();
    const service = createNodeToolSdkV1PreflightService({
      registry,
      workflowSource: {
        async loadAuthorizedWorkflow() {
          return { graph: { nodes: [], edges: [] }, workflowInterface };
        }
      },
      createRequirementResolver
    });

    await expect(
      service.preflight({
        request: request("static"),
        principal: { userId: "alice" }
      })
    ).resolves.toMatchObject({ level: "static", runnable: true });
    expect(createRequirementResolver).not.toHaveBeenCalled();
  });

  it("binds availability lookup to the authenticated principal", async () => {
    const resolver = vi.fn(async () => ({
      status: "available" as const,
      message: null
    }));
    const createRequirementResolver = vi.fn(() => resolver);
    const service = createNodeToolSdkV1PreflightService({
      registry,
      workflowSource: {
        async loadAuthorizedWorkflow() {
          return { graph: { nodes: [], edges: [] }, workflowInterface };
        }
      },
      createRequirementResolver
    });

    await service.preflight({
      request: request("availability"),
      principal: { userId: "alice" }
    });

    expect(createRequirementResolver).toHaveBeenCalledWith({
      userId: "alice"
    });
  });

  it("passes principal and request context to execution readiness", async () => {
    const probeExecutionReadiness = vi.fn(async () => ({
      requirements: [],
      issues: []
    }));
    const service = createNodeToolSdkV1PreflightService({
      registry,
      workflowSource: {
        async loadAuthorizedWorkflow() {
          return { graph: { nodes: [], edges: [] }, workflowInterface };
        }
      },
      createRequirementResolver: () => async () => ({
        status: "available",
        message: null
      }),
      probeExecutionReadiness
    });

    await expect(
      service.preflight({
        request: request("execution"),
        principal: { userId: "alice" }
      })
    ).resolves.toMatchObject({ level: "execution", runnable: true });
    expect(probeExecutionReadiness).toHaveBeenCalledWith({
      request: request("execution"),
      principal: { userId: "alice" }
    });
  });

  it("keeps execution preflight unavailable without a readiness adapter", async () => {
    const service = createNodeToolSdkV1PreflightService({
      registry,
      workflowSource: {
        async loadAuthorizedWorkflow() {
          return { graph: { nodes: [], edges: [] }, workflowInterface };
        }
      },
      createRequirementResolver: () => async () => ({
        status: "available",
        message: null
      })
    });

    await expect(
      service.preflight({
        request: request("execution"),
        principal: { userId: "alice" }
      })
    ).rejects.toMatchObject<SdkV1PreflightServiceError>({
      code: "PREFLIGHT_LEVEL_UNAVAILABLE"
    });
  });

  it("uses principal-bound capacity snapshots for execution preflight", async () => {
    const getExecutionCapacitySnapshot = vi.fn(async () => ({
      inFlightJobs: 4,
      maxConcurrentJobs: 4,
      queuedJobs: 1,
      workflowInFlightJobs: 1,
      maxConcurrentRunsForWorkflow: 1,
      likelyQueued: true
    }));
    const service = createNodeToolSdkV1PreflightService({
      registry,
      workflowSource: {
        async loadAuthorizedWorkflow() {
          return { graph: { nodes: [], edges: [] }, workflowInterface };
        }
      },
      createRequirementResolver: () => async () => ({
        status: "available",
        message: null
      }),
      getExecutionCapacitySnapshot
    });

    const result = await service.preflight({
      request: request("execution"),
      principal: { userId: "alice" }
    });

    expect(result.runnable).toBe(true);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "execution_likely_queued" })
    ]);
    expect(getExecutionCapacitySnapshot).toHaveBeenCalledWith({
      request: request("execution"),
      principal: { userId: "alice" }
    });
  });

  it("uses actual Python bridge readiness for runtime requirements", async () => {
    const runtimeRegistry = {
      has: () => true,
      getMetadata: () => ({
        title: "Python node",
        description: "",
        namespace: "test",
        node_type: "test.python",
        properties: [],
        outputs: [],
        required_runtimes: ["python"]
      }),
      validateNode: () => []
    } as unknown as NodeRegistry;
    const service = createNodeToolSdkV1PreflightService({
      registry: runtimeRegistry,
      workflowSource: {
        async loadAuthorizedWorkflow() {
          return {
            graph: {
              nodes: [{ id: "python-1", type: "test.python", data: {} }],
              edges: []
            },
            workflowInterface
          };
        }
      },
      getPythonBridgeReady: () => false,
      requirementResolverOptions: {
        getCredential: async () => null,
        findAsset: async () => null,
        listProviderIds: () => [],
        isProviderReady: async () => false
      }
    });

    const result = await service.preflight({
      request: request("availability"),
      principal: { userId: "alice" }
    });

    expect(result.runnable).toBe(false);
    expect(result.requirements).toEqual([
      expect.objectContaining({
        kind: "runtime",
        id: "python",
        status: "unavailable"
      })
    ]);
  });

  it("uses registry package provenance and inventory without namespace inference", async () => {
    const packageRegistry = {
      has: () => true,
      getMetadata: () => ({
        title: "Pack node",
        description: "",
        namespace: "unrelated.namespace",
        node_type: "test.pack",
        properties: [],
        outputs: []
      }),
      validateNode: () => [],
      getNodePackageId: () => "@acme/pack",
      listNodePackageIds: () => ["@acme/pack"]
    } as unknown as NodeRegistry;
    const service = createNodeToolSdkV1PreflightService({
      registry: packageRegistry,
      workflowSource: {
        async loadAuthorizedWorkflow() {
          return {
            graph: {
              nodes: [{ id: "pack-1", type: "test.pack", data: {} }],
              edges: []
            },
            workflowInterface
          };
        }
      },
      requirementResolverOptions: {
        getCredential: async () => null,
        findAsset: async () => null,
        listProviderIds: () => [],
        isProviderReady: async () => false
      }
    });

    const result = await service.preflight({
      request: request("availability"),
      principal: { userId: "alice" }
    });

    expect(result.requirements).toEqual([
      expect.objectContaining({
        kind: "node_pack",
        id: "@acme/pack",
        status: "available",
        details: { node_ids: ["pack-1"] }
      })
    ]);
  });

  it("uses only the injected cache/local model inventory", async () => {
    const modelRegistry = {
      has: () => true,
      getMetadata: () => ({
        title: "Model node",
        description: "",
        namespace: "test",
        node_type: "test.model",
        properties: [
          {
            name: "model",
            type: { type: "language_model", type_args: [] }
          }
        ],
        outputs: []
      }),
      validateNode: () => []
    } as unknown as NodeRegistry;
    const listModels = vi.fn(async () => [
      { id: "model-1", name: "Model 1", downloaded: true }
    ]);
    const listCachedModelIds = createNodeToolSdkV1CachedModelInventory({
      sources: [{ providerIds: ["openai"], listModels }]
    });
    const service = createNodeToolSdkV1PreflightService({
      registry: modelRegistry,
      workflowSource: {
        async loadAuthorizedWorkflow() {
          return {
            graph: {
              nodes: [
                {
                  id: "model-node",
                  type: "test.model",
                  data: {
                    model: { id: "model-1", provider: "openai" }
                  }
                }
              ],
              edges: []
            },
            workflowInterface
          };
        }
      },
      requirementResolverOptions: {
        getCredential: async () => null,
        findAsset: async () => null,
        listProviderIds: () => ["openai"],
        isProviderReady: async () => true
      },
      listCachedModelIds
    });

    const result = await service.preflight({
      request: request("availability"),
      principal: { userId: "alice" }
    });

    expect(result.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "model",
          id: "model-1",
          status: "available"
        })
      ])
    );
    expect(listModels).toHaveBeenCalledOnce();
  });
});
