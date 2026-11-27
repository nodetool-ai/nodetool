import { describe, expect, it } from "vitest";
import type { Graph } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { BaseNode } from "../src/base-node.js";
import { prop } from "../src/decorators.js";
import { estimateWorkflowCost } from "../src/cost-estimate.js";
import {
  collectJsScriptLinks,
  collectModelProviders,
  collectModelSelectionIssues,
  collectSecretRequirementSites,
  validateGraph,
  type GraphValidationRegistry
} from "../src/graph-validation.js";
import { coerceManifestScalar } from "../src/manifest-node-values.js";
import type { NodeMetadata } from "../src/metadata.js";
import { NodeRegistry } from "../src/registry.js";
import { validateNodeProperties } from "../src/validation.js";
import { applyWorkflowDocumentTool } from "../src/workflow-document-tools.js";
import { deriveWorkflowInterfaceV1 } from "../src/workflow-interface.js";

function makeMetadata(
  nodeType: string,
  inputs: Record<string, { type: string; required?: boolean; default?: unknown }>,
  outputs: Record<string, string>,
  extra: Partial<NodeMetadata> = {}
): NodeMetadata {
  return {
    title: nodeType,
    description: "",
    namespace: "test",
    node_type: nodeType,
    properties: Object.entries(inputs).map(([name, spec]) => ({
      name,
      required: spec.required ?? false,
      default: spec.default,
      type: { type: spec.type, type_args: [] }
    })),
    outputs: Object.entries(outputs).map(([name, type]) => ({
      name,
      type: { type, type_args: [] }
    })),
    ...extra
  };
}

describe("workflow-document-tools prototype lookup bypasses", () => {
  const metadataByType: Record<string, NodeMetadata> = {
    "test.Source": makeMetadata("test.Source", {}, { output: "str" }),
    "test.Sink": makeMetadata("test.Sink", { value: { type: "str", required: true } }, {}),
    "test.Concat": makeMetadata(
      "test.Concat",
      {},
      { output: "str" },
      { supports_dynamic_inputs: true }
    ),
    "test.ProtoProp": makeMetadata(
      "test.ProtoProp",
      { toString: { type: "str", default: "fallback" } },
      {}
    )
  };
  const options = {
    workflowId: "wf-1",
    resolveMetadata: (type: string) => metadataByType[type],
    createEdgeId: () => "edge-1"
  };

  it("rejects __proto__ and Object.prototype names as handles on fixed-port nodes", () => {
    const graph: Graph = {
      nodes: [
        { id: "src", type: "test.Source", data: {}, dynamic_outputs: {} },
        { id: "dst", type: "test.Sink", data: {}, dynamic_inputs: {}, dynamic_properties: {} }
      ],
      edges: []
    };

    expect(() =>
      applyWorkflowDocumentTool(
        graph,
        "ui_connect_nodes",
        {
          source_node_id: "src",
          source_handle: "__proto__",
          target_node_id: "dst",
          target_handle: "value"
        },
        options
      )
    ).toThrow(/Source handle '__proto__' not found/);

    for (const handle of ["__proto__", "toString", "constructor", "valueOf"]) {
      expect(() =>
        applyWorkflowDocumentTool(
          graph,
          "ui_connect_nodes",
          {
            source_node_id: "src",
            source_handle: "output",
            target_node_id: "dst",
            target_handle: handle
          },
          options
        )
      ).toThrow(new RegExp(`Target handle '${handle}' not found`));
    }
  });

  it("declares dynamic inputs named after Object.prototype keys instead of treating them as already present", () => {
    const graph: Graph = {
      nodes: [
        { id: "src", type: "test.Source", data: {} },
        { id: "concat", type: "test.Concat", data: {} }
      ],
      edges: []
    };

    const applied = applyWorkflowDocumentTool(
      graph,
      "ui_connect_nodes",
      {
        source_node_id: "src",
        source_handle: "output",
        target_node_id: "concat",
        target_handle: "toString"
      },
      options
    );
    expect(applied.result).toMatchObject({ ok: true, declared_input: "toString" });
  });

  it("applies default for declared properties named after Object.prototype keys in ui_add_node", () => {
    const applied = applyWorkflowDocumentTool(
      { nodes: [], edges: [] },
      "ui_add_node",
      { id: "n1", type: "test.ProtoProp" },
      options
    );
    expect(applied.graph.nodes[0]?.data).toEqual({ toString: "fallback" });
  });
});

describe("graph-validation and validation malformed input & prototype lookups", () => {
  const fixedMeta = makeMetadata(
    "test.Fixed",
    { text: { type: "str" } },
    { output: "str" }
  );
  const dynamicMeta = makeMetadata(
    "test.Dynamic",
    {},
    { output: "str" },
    { supports_dynamic_inputs: true }
  );
  const registry: GraphValidationRegistry = {
    has: (t) => t === "test.Fixed" || t === "test.Dynamic",
    getMetadata: (t) =>
      t === "test.Fixed" ? fixedMeta : t === "test.Dynamic" ? dynamicMeta : undefined,
    validateNode: (desc, connected) =>
      validateNodeProperties([], desc.properties ?? {}, {
        connectedHandles: connected,
        nodeId: desc.id,
        nodeType: desc.type,
        dynamicSlots: desc.dynamic_inputs,
        dynamicValues: desc.dynamic_properties
      }),
    listProviderIds: () => ["openai"]
  };

  it("does not throw when dynamic_inputs contains a null slot entry", () => {
    const issues = validateNodeProperties([], {}, {
      nodeId: "n1",
      nodeType: "test.Dynamic",
      dynamicSlots: { broken: null as never },
      dynamicValues: {}
    });
    expect(issues).toEqual([]);

    const report = validateGraph(
      {
        nodes: [
          {
            id: "n1",
            type: "test.Dynamic",
            dynamic_inputs: { broken: null as never }
          }
        ],
        edges: []
      },
      registry,
      { sandboxModuleCatalog: null }
    );
    expect(report.ok).toBe(true);
  });

  it("rejects null/primitive entries in graph.nodes and graph.edges without throwing", () => {
    const badGraph = {
      nodes: [null, 42, "bad", { id: "n1", type: "test.Fixed" }],
      edges: [null, "bad-edge"]
    } as never;

    const report = validateGraph(badGraph, registry, { sandboxModuleCatalog: null });
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === "invalid_graph")).toBe(true);

    expect(() => collectModelSelectionIssues(badGraph, registry)).not.toThrow();
    expect(() => collectSecretRequirementSites(badGraph, registry)).not.toThrow();
    expect(() => collectModelProviders(badGraph)).not.toThrow();
    expect(() => collectJsScriptLinks(badGraph)).not.toThrow();
  });

  it("does not read Object.prototype functions for unset properties or dynamic slots", () => {
    const propIssues = validateNodeProperties(
      [{ name: "toString", options: { type: "str", required: true } }],
      {}
    );
    expect(propIssues.map((i) => i.code)).toEqual(["required"]);

    const dynIssues = validateNodeProperties([], {}, {
      dynamicSlots: { toString: { type: { type: "str" }, required: true } },
      dynamicValues: {}
    });
    expect(dynIssues.map((i) => i.code)).toEqual(["required"]);

    const report = validateGraph(
      {
        nodes: [
          {
            id: "d1",
            type: "test.Dynamic",
            dynamic_inputs: { toString: { type: { type: "str" } } },
            dynamic_properties: {}
          }
        ],
        edges: []
      },
      registry,
      { sandboxModuleCatalog: null }
    );
    expect(report.issues.filter((i) => i.code === "dynamic_type_mismatch")).toEqual([]);
  });

  it("flags Object.prototype property names as unknown_property on fixed nodes", () => {
    const report = validateGraph(
      {
        nodes: [
          {
            id: "f1",
            type: "test.Fixed",
            properties: { toString: "extra" }
          }
        ],
        edges: []
      },
      registry,
      { sandboxModuleCatalog: null }
    );
    expect(report.issues.some((i) => i.code === "unknown_property")).toBe(true);
  });
});

describe("cost-estimate prototype-keyed node ids", () => {
  it("does not throw when a node id matches an Object.prototype key", () => {
    const result = estimateWorkflowCost({
      nodes: [{ id: "toString", type: "nodetool.image.TextToImage", data: {} }],
      getMetadata: () => ({ title: "Text To Image" })
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.node_title).toBe("Text To Image");
  });
});

describe("workflow-interface prototype lookups and malformed type_args", () => {
  const registry = {
    resolveMetadata: () => undefined
  };

  it("does not treat nodes with Object.prototype type names as dedicated outputs", () => {
    const iface = deriveWorkflowInterfaceV1({
      workflowId: "wf-1",
      graph: {
        nodes: [{ id: "n1", type: "toString", data: { name: "x" } }],
        edges: []
      },
      registry
    });
    expect(iface.outputs).toEqual([]);
  });

  it("does not resolve __proto__ on dynamic_outputs or crash on null type_args", () => {
    const iface = deriveWorkflowInterfaceV1({
      workflowId: "wf-1",
      graph: {
        nodes: [
          {
            id: "src",
            type: "unknown.PackNode",
            dynamic_outputs: {
              broken: { type: "list", type_args: [null] }
            }
          },
          { id: "out1", type: "nodetool.output.Output", data: { name: "o1" } },
          { id: "out2", type: "nodetool.output.Output", data: { name: "o2" } }
        ],
        edges: [
          { source: "src", sourceHandle: "__proto__", target: "out1", targetHandle: "value" },
          { source: "src", sourceHandle: "broken", target: "out2", targetHandle: "value" }
        ]
      },
      registry
    });
    expect(
      iface.diagnostics.some(
        (d) => d.pin_name === "__proto__" && d.code === "missing_node_metadata"
      )
    ).toBe(true);
    expect(iface.outputs).toHaveLength(2);
  });
});

describe("BaseNode trigger payload and dynamic slot validation hardening", () => {
  class TriggerNode extends BaseNode {
    static readonly nodeType = "test.Trigger";
    static readonly isTrigger = true;
    static readonly outputTypes = { message: "str" };

    @prop({ type: "str", default: "" })
    label = "";

    async process(): Promise<Record<string, unknown>> {
      return { message: "" };
    }
  }

  it("does not emit inherited Object.prototype keys from trigger payloads", async () => {
    const node = new TriggerNode();
    const emitted: Array<[string, unknown]> = [];
    await node.emitTriggerEvent(
      {
        trigger_id: "t1",
        node_id: "n1",
        payload: { message: "ok", toString: "evil", constructor: "evil" }
      } as never,
      {
        emit: async (handle: string, value: unknown) => {
          emitted.push([handle, value]);
        }
      } as never
    );
    expect(emitted).toEqual([["message", "ok"]]);
  });

  it("does not read Object.prototype properties when collecting dynamic slot values", () => {
    const issues = TriggerNode.validateProperties(
      {},
      {
        dynamicSlots: { toString: { type: { type: "str" }, required: true } }
      }
    );
    expect(issues.map((i) => i.code)).toEqual(["required"]);

    const reg = new NodeRegistry();
    reg.loadCatalog([
      {
        node_type: "cat.Dynamic",
        pack: "cat",
        declared: [],
        metadata: makeMetadata("cat.Dynamic", {}, {}, { supports_dynamic_inputs: true })
      }
    ]);
    const catIssues = reg.validateNode({
      id: "c1",
      type: "cat.Dynamic",
      properties: {},
      dynamic_inputs: { toString: { type: { type: "str" }, required: true } }
    });
    expect(catIssues.map((i) => i.code)).toEqual(["required"]);
  });
});

describe("coerceManifestScalar NaN and blank string handling", () => {
  it("returns null instead of NaN/Infinity for invalid numeric enum values", () => {
    expect(coerceManifestScalar("auto", "enum", [1024, 2048])).toBeNull();
    expect(coerceManifestScalar(Number.POSITIVE_INFINITY, "enum", [1024, 2048])).toBeNull();
    expect(coerceManifestScalar("", "enum", [1024, 2048])).toBeNull();
    expect(coerceManifestScalar("1024", "enum", [1024, 2048])).toBe(1024);
  });

  it("returns null instead of 0 for blank strings in int and float fields", () => {
    expect(coerceManifestScalar("", "int")).toBeNull();
    expect(coerceManifestScalar("   ", "int")).toBeNull();
    expect(coerceManifestScalar("", "float")).toBeNull();
    expect(coerceManifestScalar("   ", "float")).toBeNull();
  });
});
