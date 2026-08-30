import type { NodeMetadata } from "@nodetool-ai/node-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  buildSdkV1AvailabilityPreflight,
  buildSdkV1ExecutionPreflight,
  buildSdkV1StaticPreflight
} from "../src/sdk/sdk-static-preflight-service.js";

const metadata: NodeMetadata = {
  title: "Echo",
  description: "",
  namespace: "test",
  node_type: "test.Echo",
  properties: [],
  outputs: [],
  fal_unit_pricing: {
    endpoint_id: "test/echo",
    unit_price: 0.25,
    billing_unit: "run",
    currency: "USD",
    source: "bundle"
  }
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

const workflowInterface = {
  version: 1 as const,
  workflow_id: "workflow-1",
  etag: "etag-1",
  source: "server" as const,
  inputs: [
    {
      node_id: "input-count",
      name: "count",
      description: "",
      type: { type: "int", optional: false, type_args: [] },
      required: true,
      default: null,
      min: 1,
      max: 10
    },
    {
      node_id: "input-labels",
      name: "labels",
      description: "",
      type: {
        type: "list",
        optional: false,
        type_args: [{ type: "str", optional: false, type_args: [] }]
      },
      required: false,
      default: []
    }
  ],
  outputs: [],
  diagnostics: []
};

const graph = {
  nodes: [{ id: "echo-1", type: "test.Echo", data: {} }],
  edges: []
};

describe("buildSdkV1StaticPreflight", () => {
  it("reuses graph validation and cost estimation without side effects", () => {
    const registry = makeRegistry();

    const result = buildSdkV1StaticPreflight({
      request: {
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: "etag-1",
        interface_version: 1,
        level: "static",
        inputs: { count: 3, labels: ["alpha", "beta"] }
      },
      workflowInterface,
      graph,
      registry,
      approvalThreshold: 0.2
    });

    expect(result).toMatchObject({
      runnable: true,
      issues: [],
      requirements: [],
      cost: {
        amount: 0.25,
        currency: "USD",
        confidence: "estimate",
        unknown_cost_nodes: [],
        approval_required: true
      }
    });
    expect(registry.validateNode).toHaveBeenCalledOnce();
  });

  it("does not report known local workflow plumbing as unknown cost", () => {
    const registry = makeRegistry();
    const result = buildSdkV1StaticPreflight({
      request: {
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: "etag-1",
        interface_version: 1,
        level: "static",
        inputs: { count: 3 }
      },
      workflowInterface,
      graph: {
        nodes: [
          { id: "input-1", type: "nodetool.input.IntegerInput", data: {} },
          { id: "constant-1", type: "nodetool.constant.Integer", data: {} },
          { id: "dict-1", type: "nodetool.dictionary.Get", data: {} },
          { id: "output-1", type: "nodetool.output.Output", data: {} }
        ],
        edges: []
      },
      registry
    });

    expect(result.cost).toEqual({
      amount: 0,
      currency: "USD",
      confidence: "exact",
      unknown_cost_nodes: [],
      approval_required: false
    });
  });

  it("prices a billable node by the shared usesAiModel predicate", () => {
    // A node type the registry knows is billable exactly when `usesAiModel`
    // says so — a plain data node with metadata is excluded even though its
    // namespace is not on the plumbing allowlist, and a provider-model node in
    // such a namespace stays priced.
    const plain: NodeMetadata = {
      ...metadata,
      node_type: "custom.pack.Slugify",
      properties: [],
      fal_unit_pricing: undefined
    };
    const model: NodeMetadata = {
      ...metadata,
      node_type: "custom.pack.Describe",
      fal_unit_pricing: undefined,
      properties: [
        {
          name: "model",
          type: { type: "language_model", optional: false, type_args: [] },
          default: null,
          title: "Model",
          description: ""
        }
      ]
    };
    const registry = {
      has: vi.fn(() => true),
      getMetadata: vi.fn((nodeType: string) =>
        nodeType === plain.node_type ? plain : model
      ),
      validateNode: vi.fn(() => [])
    };
    const result = buildSdkV1StaticPreflight({
      request: {
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: "etag-1",
        interface_version: 1,
        level: "static",
        inputs: { count: 1 }
      },
      workflowInterface,
      graph: {
        nodes: [
          { id: "plain-1", type: plain.node_type, data: {} },
          { id: "model-1", type: model.node_type, data: {} }
        ],
        edges: []
      },
      registry
    });

    expect(result.cost?.unknown_cost_nodes).toEqual(["model-1"]);
  });

  it("prices a node's fan-out when the caller states no quantity", () => {
    const registry = makeRegistry();
    const fanned = buildSdkV1StaticPreflight({
      request: {
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: "etag-1",
        interface_version: 1,
        level: "static",
        inputs: { count: 1 }
      },
      workflowInterface,
      graph: {
        nodes: [{ id: "echo-1", type: "test.Echo", data: { num_images: 3 } }],
        edges: []
      },
      registry
    });
    expect(fanned.cost?.amount).toBeCloseTo(0.75);

    const explicit = buildSdkV1StaticPreflight({
      request: {
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: "etag-1",
        interface_version: 1,
        level: "static",
        inputs: { count: 1 }
      },
      workflowInterface,
      graph: {
        nodes: [{ id: "echo-1", type: "test.Echo", data: { num_images: 3 } }],
        edges: []
      },
      registry,
      // A caller's own count wins over the node's property.
      quantities: { "echo-1": 2 }
    });
    expect(explicit.cost?.amount).toBeCloseTo(0.5);
  });

  it("derives node packages only from an explicit identity resolver", () => {
    const registry = makeRegistry();
    const withoutResolver = buildSdkV1StaticPreflight({
      request: {
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: "etag-1",
        interface_version: 1,
        level: "static",
        inputs: { count: 3 }
      },
      workflowInterface,
      graph,
      registry
    });
    expect(withoutResolver.requirements).toEqual([]);

    const resolveNodePackageId = vi.fn(
      ({ nodeType }: { nodeType: string }) =>
        nodeType === "test.Echo" ? "@nodetool-ai/test-pack" : null
    );
    const withResolver = buildSdkV1StaticPreflight({
      request: {
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: "etag-1",
        interface_version: 1,
        level: "static",
        inputs: { count: 3 }
      },
      workflowInterface,
      graph,
      registry,
      resolveNodePackageId
    });

    expect(withResolver.requirements).toEqual([
      {
        kind: "node_pack",
        id: "@nodetool-ai/test-pack",
        name: "@nodetool-ai/test-pack",
        status: "unknown",
        blocking: true,
        message: null,
        details: { node_ids: ["echo-1"] }
      }
    ]);
    expect(resolveNodePackageId).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: "echo-1",
        nodeType: "test.Echo",
        metadata
      })
    );
  });

  it("can identify the package for a missing node from an explicit catalog", () => {
    const registry = makeRegistry();
    const result = buildSdkV1StaticPreflight({
      request: {
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: "etag-1",
        interface_version: 1,
        level: "static",
        inputs: { count: 3 }
      },
      workflowInterface,
      graph: {
        nodes: [{ id: "missing-1", type: "acme.Missing", data: {} }],
        edges: []
      },
      registry,
      resolveNodePackageId: ({ nodeType, metadata: resolvedMetadata }) => {
        expect(resolvedMetadata).toBeUndefined();
        return nodeType === "acme.Missing" ? "@acme/nodes" : null;
      }
    });

    expect(result.requirements).toEqual([
      expect.objectContaining({
        kind: "node_pack",
        id: "@acme/nodes",
        details: { node_ids: ["missing-1"] }
      })
    ]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "graph_unknown_node" })
      ])
    );
  });

  it("enumerates graph and input requirements without probing external state", () => {
    const modelMetadata: NodeMetadata = {
      ...metadata,
      required_settings: ["OPENAI_API_KEY", "OPENAI_API_KEY"],
      required_runtimes: ["python"],
      properties: [
        {
          name: "model",
          title: "Model",
          description: "",
          type: {
            type: "language_model",
            optional: false,
            type_args: []
          }
        }
      ]
    };
    const registry = makeRegistry();
    registry.getMetadata.mockImplementation((nodeType: string) =>
      nodeType === metadata.node_type ? modelMetadata : undefined
    );

    const result = buildSdkV1StaticPreflight({
      request: {
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: "etag-1",
        interface_version: 1,
        level: "static",
        inputs: {
          count: 3,
          source: {
            asset_id: "asset-1",
            nested: [
              { asset_id: "asset-1" },
              { asset_id: "asset-2" },
              { uri: "asset://asset-3.png" }
            ]
          }
        }
      },
      workflowInterface: {
        ...workflowInterface,
        inputs: [
          ...workflowInterface.inputs,
          {
            node_id: "input-source",
            name: "source",
            description: "",
            type: { type: "any", optional: false, type_args: [] },
            required: false,
            default: null
          }
        ]
      },
      graph: {
        nodes: [
          {
            id: "echo-1",
            type: "test.Echo",
            data: {
              model: { id: "gpt-test", provider: "openai" }
            }
          }
        ],
        edges: []
      },
      registry
    });

    expect(result.requirements).toEqual([
      {
        kind: "asset",
        id: "asset-1",
        name: "asset-1",
        status: "unknown",
        blocking: true,
        message: null
      },
      {
        kind: "asset",
        id: "asset-2",
        name: "asset-2",
        status: "unknown",
        blocking: true,
        message: null
      },
      {
        kind: "asset",
        id: "asset-3",
        name: "asset-3",
        status: "unknown",
        blocking: true,
        message: null
      },
      {
        kind: "credential",
        id: "OPENAI_API_KEY",
        name: "OPENAI_API_KEY",
        status: "unknown",
        blocking: true,
        message: null,
        details: { node_ids: ["echo-1"] }
      },
      {
        kind: "model",
        id: "gpt-test",
        name: "gpt-test",
        status: "unknown",
        blocking: true,
        message: null,
        details: {
          node_ids: ["echo-1"],
          provider_ids: ["openai"],
          model_types: ["language_model"]
        }
      },
      {
        kind: "provider",
        id: "openai",
        name: "openai",
        status: "unknown",
        blocking: true,
        message: null,
        details: { node_ids: ["echo-1"] }
      },
      {
        kind: "runtime",
        id: "python",
        name: "python",
        status: "unknown",
        blocking: true,
        message: null,
        details: { node_ids: ["echo-1"] }
      }
    ]);
  });

  it("returns stable input, etag, interface, and graph issues", () => {
    const result = buildSdkV1StaticPreflight({
      request: {
        workflow_id: "other-workflow",
        workspace_id: null,
        workflow_etag: "stale-etag",
        interface_version: 1,
        level: "static",
        inputs: { count: 0, labels: [1], typo: true }
      },
      workflowInterface,
      graph: {
        nodes: [{ id: "missing-1", type: "missing.Node", data: {} }],
        edges: []
      },
      registry: makeRegistry()
    });

    expect(result.runnable).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "workflow_id_mismatch",
      "workflow_etag_mismatch",
      "unknown_input",
      "input_below_minimum",
      "input_type_mismatch",
      "graph_unknown_node"
    ]);
    expect(result.cost).toMatchObject({
      amount: null,
      confidence: "unknown",
      unknown_cost_nodes: ["missing-1"]
    });
  });

  it("reports a required input only when neither request nor interface default supplies it", () => {
    const result = buildSdkV1StaticPreflight({
      request: {
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: null,
        interface_version: 1,
        level: "static",
        inputs: {}
      },
      workflowInterface,
      graph,
      registry: makeRegistry()
    });

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "missing_input",
        pin_name: "count",
        node_id: "input-count"
      })
    ]);
  });

  it("rejects availability/execution requests until their services exist", () => {
    expect(() =>
      buildSdkV1StaticPreflight({
        request: {
          workflow_id: "workflow-1",
          workspace_id: null,
          workflow_etag: null,
          interface_version: 1,
          level: "availability",
          inputs: { count: 1 }
        },
        workflowInterface,
        graph,
        registry: makeRegistry()
      })
    ).toThrow('only accepts level "static"');
  });

  it("resolves availability through injected read-only probes", async () => {
    const runtimeMetadata: NodeMetadata = {
      ...metadata,
      required_settings: ["TEST_TOKEN"],
      required_runtimes: ["python"]
    };
    const registry = makeRegistry();
    registry.getMetadata.mockImplementation((nodeType: string) =>
      nodeType === metadata.node_type ? runtimeMetadata : undefined
    );
    const resolveRequirement = vi.fn(
      (requirement: { kind: string; id: string }) => ({
        status:
          requirement.kind === "runtime" ? "available" : ("missing" as const),
        message:
          requirement.kind === "runtime"
            ? null
            : "Credential is not configured."
      })
    );

    const result = await buildSdkV1AvailabilityPreflight({
      request: {
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: "etag-1",
        interface_version: 1,
        level: "availability",
        inputs: { count: 3 }
      },
      workflowInterface,
      graph,
      registry,
      resolveRequirement
    });

    expect(resolveRequirement).toHaveBeenCalledTimes(2);
    expect(result.level).toBe("availability");
    expect(result.runnable).toBe(false);
    expect(result.requirements).toEqual([
      expect.objectContaining({
        kind: "credential",
        id: "TEST_TOKEN",
        status: "missing",
        message: "Credential is not configured."
      }),
      expect.objectContaining({
        kind: "runtime",
        id: "python",
        status: "available",
        message: null
      })
    ]);
  });

  it("reports runnable when structural checks and all blocking requirements are available", async () => {
    const runtimeMetadata: NodeMetadata = {
      ...metadata,
      required_runtimes: ["python"]
    };
    const registry = makeRegistry();
    registry.getMetadata.mockImplementation((nodeType: string) =>
      nodeType === metadata.node_type ? runtimeMetadata : undefined
    );

    const result = await buildSdkV1AvailabilityPreflight({
      request: {
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: "etag-1",
        interface_version: 1,
        level: "availability",
        inputs: { count: 3 }
      },
      workflowInterface,
      graph,
      registry,
      resolveRequirement: () => ({ status: "available" })
    });

    expect(result.runnable).toBe(true);
    expect(result.requirements).toEqual([
      expect.objectContaining({
        kind: "runtime",
        id: "python",
        status: "available"
      })
    ]);
  });

  it("preserves requirement provenance when a probe adds readiness details", async () => {
    const modelMetadata: NodeMetadata = {
      ...metadata,
      required_runtimes: ["python"]
    };
    const registry = makeRegistry();
    registry.getMetadata.mockReturnValue(modelMetadata);

    const result = await buildSdkV1AvailabilityPreflight({
      request: {
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: "etag-1",
        interface_version: 1,
        level: "availability",
        inputs: { count: 3 }
      },
      workflowInterface,
      graph,
      registry,
      resolveRequirement: () => ({
        status: "available",
        message: null,
        details: { probe: "local" }
      })
    });

    expect(result.requirements).toEqual([
      expect.objectContaining({
        kind: "runtime",
        details: {
          node_ids: ["echo-1"],
          probe: "local"
        }
      })
    ]);
  });

  it("redacts availability probe failures and does not claim runnable", async () => {
    const runtimeMetadata: NodeMetadata = {
      ...metadata,
      required_runtimes: ["python"]
    };
    const registry = makeRegistry();
    registry.getMetadata.mockImplementation((nodeType: string) =>
      nodeType === metadata.node_type ? runtimeMetadata : undefined
    );

    const result = await buildSdkV1AvailabilityPreflight({
      request: {
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: "etag-1",
        interface_version: 1,
        level: "availability",
        inputs: { count: 3 }
      },
      workflowInterface,
      graph,
      registry,
      resolveRequirement: () => {
        throw new Error("secret internal provider response");
      }
    });

    expect(result.runnable).toBe(false);
    expect(result.requirements[0]).toMatchObject({
      status: "unknown",
      message: "Availability check failed."
    });
    expect(JSON.stringify(result)).not.toContain("secret internal");
  });

  it("composes execution readiness and preserves non-blocking queue warnings", async () => {
    const result = await buildSdkV1ExecutionPreflight({
      request: {
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: "etag-1",
        interface_version: 1,
        level: "execution",
        inputs: { count: 3 }
      },
      workflowInterface,
      graph,
      registry: makeRegistry(),
      resolveRequirement: () => ({ status: "available" }),
      probeExecutionReadiness: () => ({
        requirements: [
          {
            kind: "worker",
            id: "worker:local",
            name: "Local worker",
            status: "available",
            blocking: true,
            message: "Ready",
            details: {
              capacity: "queued",
              queue_position_estimate: 2
            }
          }
        ],
        issues: [
          {
            severity: "warning",
            code: "likely_queued",
            message: "The workflow is likely to queue.",
            node_id: null,
            pin_name: null
          }
        ]
      })
    });

    expect(result.level).toBe("execution");
    expect(result.runnable).toBe(true);
    expect(result.requirements).toEqual([
      expect.objectContaining({
        kind: "worker",
        id: "worker:local",
        status: "available"
      })
    ]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "likely_queued"
      })
    ]);
  });

  it("does not claim execution readiness for an unavailable blocking target", async () => {
    const result = await buildSdkV1ExecutionPreflight({
      request: {
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: "etag-1",
        interface_version: 1,
        level: "execution",
        inputs: { count: 3 }
      },
      workflowInterface,
      graph,
      registry: makeRegistry(),
      resolveRequirement: () => ({ status: "available" }),
      probeExecutionReadiness: () => ({
        requirements: [
          {
            kind: "worker",
            id: "worker:local",
            name: "Local worker",
            status: "unavailable",
            blocking: true,
            message: "Worker is offline."
          }
        ],
        issues: []
      })
    });

    expect(result.runnable).toBe(false);
    expect(result.requirements[0]).toMatchObject({
      kind: "worker",
      status: "unavailable"
    });
  });

  it("redacts execution probe failures", async () => {
    const result = await buildSdkV1ExecutionPreflight({
      request: {
        workflow_id: "workflow-1",
        workspace_id: null,
        workflow_etag: "etag-1",
        interface_version: 1,
        level: "execution",
        inputs: { count: 3 }
      },
      workflowInterface,
      graph,
      registry: makeRegistry(),
      resolveRequirement: () => ({ status: "available" }),
      probeExecutionReadiness: () => {
        throw new Error("private worker connection details");
      }
    });

    expect(result.runnable).toBe(false);
    expect(result.requirements).toEqual([
      expect.objectContaining({
        kind: "worker",
        id: "execution-target",
        status: "unknown",
        message: "Execution readiness check failed."
      })
    ]);
    expect(JSON.stringify(result)).not.toContain("private worker");
  });
});
