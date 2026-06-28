import { describe, it, expect } from "vitest";
import {
  validateGraph,
  validationHeadline,
  type GraphValidationRegistry
} from "../src/graph-validation.js";
import type { NodeMetadata } from "../src/metadata.js";
import type { NodePropertyValidationIssue } from "../src/validation.js";

/** Minimal metadata factory for a node type with given inputs/outputs. */
function meta(
  nodeType: string,
  inputs: Record<string, string>,
  outputs: Record<string, string>,
  extra: Partial<NodeMetadata> = {}
): NodeMetadata {
  return {
    title: nodeType,
    description: "",
    namespace: nodeType.split(".").slice(0, -1).join("."),
    node_type: nodeType,
    properties: Object.entries(inputs).map(([name, type]) => ({
      name,
      type: { type } as NodeMetadata["properties"][number]["type"]
    })) as NodeMetadata["properties"],
    outputs: Object.entries(outputs).map(([name, type]) => ({
      name,
      type: { type } as NodeMetadata["outputs"][number]["type"]
    })) as NodeMetadata["outputs"],
    ...extra
  } as NodeMetadata;
}

/** Fake registry: known node types plus an optional per-node required-prop list. */
function fakeRegistry(
  metas: Record<string, NodeMetadata>,
  required: Record<string, string[]> = {}
): GraphValidationRegistry {
  return {
    has: (t) => t in metas,
    getMetadata: (t) => metas[t],
    validateNode: (descriptor, connectedHandles) => {
      const reqs = required[descriptor.type] ?? [];
      const issues: NodePropertyValidationIssue[] = [];
      const props = descriptor.properties ?? {};
      for (const name of reqs) {
        if (connectedHandles?.has(name)) continue;
        const v = props[name];
        if (v === undefined || v === null || v === "") {
          issues.push({
            nodeId: descriptor.id,
            nodeType: descriptor.type,
            property: name,
            message: `Required property "${name}" is not set`
          });
        }
      }
      return issues;
    }
  };
}

describe("validateGraph", () => {
  it("passes a well-formed graph", () => {
    const registry = fakeRegistry({
      "a.Source": meta("a.Source", {}, { out: "str" }),
      "a.Sink": meta("a.Sink", { in: "str" }, {})
    });
    const report = validateGraph(
      {
        nodes: [
          { id: "1", type: "a.Source", properties: {} },
          { id: "2", type: "a.Sink", properties: {} }
        ],
        edges: [
          { id: "e1", source: "1", sourceHandle: "out", target: "2", targetHandle: "in" }
        ]
      },
      registry
    );
    expect(report.ok).toBe(true);
    expect(report.counts.errors).toBe(0);
    expect(report.nodeCount).toBe(2);
    expect(report.edgeCount).toBe(1);
  });

  it("flags unknown node types", () => {
    const registry = fakeRegistry({ "a.Known": meta("a.Known", {}, {}) });
    const report = validateGraph(
      { nodes: [{ id: "1", type: "a.Ghost" }], edges: [] },
      registry
    );
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === "unknown_node")).toBe(true);
  });

  it("flags duplicate node ids", () => {
    const registry = fakeRegistry({ "a.N": meta("a.N", {}, {}) });
    const report = validateGraph(
      {
        nodes: [
          { id: "dup", type: "a.N" },
          { id: "dup", type: "a.N" }
        ],
        edges: []
      },
      registry
    );
    expect(report.issues.some((i) => i.code === "duplicate_id")).toBe(true);
  });

  it("flags missing required properties", () => {
    const registry = fakeRegistry(
      { "a.LLM": meta("a.LLM", { prompt: "str" }, { out: "str" }) },
      { "a.LLM": ["prompt"] }
    );
    const report = validateGraph(
      { nodes: [{ id: "1", type: "a.LLM", properties: {} }], edges: [] },
      registry
    );
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === "property")).toBe(true);
  });

  it("does not flag a required prop fed by an incoming edge", () => {
    const registry = fakeRegistry(
      {
        "a.Source": meta("a.Source", {}, { out: "str" }),
        "a.LLM": meta("a.LLM", { prompt: "str" }, { out: "str" })
      },
      { "a.LLM": ["prompt"] }
    );
    const report = validateGraph(
      {
        nodes: [
          { id: "1", type: "a.Source" },
          { id: "2", type: "a.LLM", properties: {} }
        ],
        edges: [
          { id: "e1", source: "1", sourceHandle: "out", target: "2", targetHandle: "prompt" }
        ]
      },
      registry
    );
    expect(report.ok).toBe(true);
  });

  it("flags dangling edges", () => {
    const registry = fakeRegistry({ "a.N": meta("a.N", { in: "str" }, { out: "str" }) });
    const report = validateGraph(
      {
        nodes: [{ id: "1", type: "a.N" }],
        edges: [
          { id: "e1", source: "1", sourceHandle: "out", target: "ghost", targetHandle: "in" }
        ]
      },
      registry
    );
    expect(report.issues.some((i) => i.code === "dangling_edge")).toBe(true);
  });

  it("flags unknown edge handles but allows reserved __control__", () => {
    const registry = fakeRegistry({
      "a.A": meta("a.A", {}, { out: "str" }),
      "a.B": meta("a.B", { in: "str" }, {})
    });
    const bad = validateGraph(
      {
        nodes: [
          { id: "1", type: "a.A" },
          { id: "2", type: "a.B" }
        ],
        edges: [
          { id: "e1", source: "1", sourceHandle: "nope", target: "2", targetHandle: "in" }
        ]
      },
      registry
    );
    expect(bad.issues.some((i) => i.code === "unknown_handle")).toBe(true);

    const control = validateGraph(
      {
        nodes: [
          { id: "1", type: "a.A" },
          { id: "2", type: "a.B" }
        ],
        edges: [
          {
            id: "e1",
            source: "1",
            sourceHandle: "__control__",
            target: "2",
            targetHandle: "__control__"
          }
        ]
      },
      registry
    );
    expect(control.issues.some((i) => i.code === "unknown_handle")).toBe(false);
  });

  it("warns on incompatible scalar edge types but stays ok", () => {
    const registry = fakeRegistry({
      "a.Str": meta("a.Str", {}, { out: "str" }),
      "a.Int": meta("a.Int", { in: "int" }, {})
    });
    const report = validateGraph(
      {
        nodes: [
          { id: "1", type: "a.Str" },
          { id: "2", type: "a.Int" }
        ],
        edges: [
          { id: "e1", source: "1", sourceHandle: "out", target: "2", targetHandle: "in" }
        ]
      },
      registry
    );
    expect(report.ok).toBe(true); // warnings don't fail the verdict
    expect(report.counts.warnings).toBe(1);
    expect(report.issues.some((i) => i.code === "type_mismatch")).toBe(true);
  });

  it("treats int/float and any/object as compatible", () => {
    const registry = fakeRegistry({
      "a.Int": meta("a.Int", {}, { out: "int" }),
      "a.Float": meta("a.Float", { in: "float" }, { out: "any" }),
      "a.Obj": meta("a.Obj", { in: "object" }, {})
    });
    const report = validateGraph(
      {
        nodes: [
          { id: "1", type: "a.Int" },
          { id: "2", type: "a.Float" },
          { id: "3", type: "a.Obj" }
        ],
        edges: [
          { id: "e1", source: "1", sourceHandle: "out", target: "2", targetHandle: "in" },
          { id: "e2", source: "2", sourceHandle: "out", target: "3", targetHandle: "in" }
        ]
      },
      registry
    );
    expect(report.counts.warnings).toBe(0);
  });

  it("allows unknown target handles on dynamic-input nodes", () => {
    const registry = fakeRegistry({
      "a.A": meta("a.A", {}, { out: "str" }),
      "a.Dyn": meta("a.Dyn", {}, {}, { supports_dynamic_inputs: true })
    });
    const report = validateGraph(
      {
        nodes: [
          { id: "1", type: "a.A" },
          { id: "2", type: "a.Dyn" }
        ],
        edges: [
          { id: "e1", source: "1", sourceHandle: "out", target: "2", targetHandle: "anything" }
        ]
      },
      registry
    );
    expect(report.issues.some((i) => i.code === "unknown_handle")).toBe(false);
  });

  it("does not flag editor-only base nodes (Comment/Group/Reroute)", () => {
    const registry = fakeRegistry({ "a.N": meta("a.N", {}, {}) });
    const report = validateGraph(
      {
        nodes: [
          { id: "1", type: "nodetool.workflows.base_node.Comment" },
          { id: "2", type: "nodetool.workflows.base_node.Group" },
          { id: "3", type: "nodetool.workflows.base_node.Reroute" },
          { id: "4", type: "a.N" }
        ],
        edges: []
      },
      registry
    );
    expect(report.issues.some((i) => i.code === "unknown_node")).toBe(false);
    expect(report.ok).toBe(true);
  });

  it("reads properties from ReactFlow `data` shape", () => {
    const registry = fakeRegistry(
      { "a.LLM": meta("a.LLM", { prompt: "str" }, {}) },
      { "a.LLM": ["prompt"] }
    );
    const report = validateGraph(
      { nodes: [{ id: "1", type: "a.LLM", data: { prompt: "hi" } }], edges: [] },
      registry
    );
    expect(report.ok).toBe(true);
  });
});

describe("validationHeadline", () => {
  it("summarizes a clean run", () => {
    expect(
      validationHeadline({
        ok: true,
        nodeCount: 3,
        edgeCount: 2,
        counts: { errors: 0, warnings: 0 },
        issues: []
      })
    ).toContain("valid");
  });

  it("summarizes errors", () => {
    expect(
      validationHeadline({
        ok: false,
        nodeCount: 1,
        edgeCount: 0,
        counts: { errors: 2, warnings: 1 },
        issues: []
      })
    ).toContain("2 error");
  });
});
