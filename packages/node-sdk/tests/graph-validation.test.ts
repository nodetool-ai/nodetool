import { describe, it, expect } from "vitest";
import {
  collectJsScriptLinks,
  collectMissingSecretIssues,
  collectModelProviders,
  collectModelSelectionIssues,
  collectSecretRequirementSites,
  validateGraph,
  validationHeadline,
  type GraphValidationRegistry
} from "../src/graph-validation.js";
import type { NodeMetadata } from "../src/metadata.js";
import type { NodePropertyValidationIssue } from "../src/validation.js";
import {
  refuseSandboxDelivery,
  setProcessSandboxModuleCatalog,
  type SandboxModuleCatalog
} from "@nodetool-ai/runtime";

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

  it("checks no handle on an edge whose endpoint type has no metadata", () => {
    const registry = fakeRegistry({ "a.Int": meta("a.Int", { in: "int" }, {}) });
    const report = validateGraph(
      {
        nodes: [
          { id: "1", type: "a.Ghost" },
          { id: "2", type: "a.Int" }
        ],
        edges: [
          { id: "e1", source: "1", sourceHandle: "out", target: "2", targetHandle: "in" }
        ]
      },
      registry
    );
    // The unknown type is the one report; nothing downstream invents a second.
    expect(report.issues.map((i) => i.code)).toEqual(["unknown_node"]);
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

  // ── Regressions: fan-in, dynamic outputs, dynamic-slot required ──────────

  it("accepts fan-in into a dynamic slot declared as a list", () => {
    const registry = fakeRegistry({
      "a.A": meta("a.A", {}, { out: "str" }),
      "a.Dyn": meta("a.Dyn", {}, {}, { supports_dynamic_inputs: true })
    });
    const report = validateGraph(
      {
        nodes: [
          { id: "1", type: "a.A" },
          { id: "2", type: "a.A" },
          {
            id: "3",
            type: "a.Dyn",
            dynamic_inputs: {
              items: { type: { type: "list", type_args: [{ type: "str" }] } }
            }
          }
        ],
        edges: [
          { id: "e1", source: "1", sourceHandle: "out", target: "3", targetHandle: "items" },
          { id: "e2", source: "2", sourceHandle: "out", target: "3", targetHandle: "items" }
        ]
      },
      registry
    );
    expect(report.issues.filter((i) => i.code === "fan_in")).toEqual([]);
  });

  it("still flags fan-in into a non-list dynamic slot", () => {
    const registry = fakeRegistry({
      "a.A": meta("a.A", {}, { out: "str" }),
      "a.Dyn": meta("a.Dyn", {}, {}, { supports_dynamic_inputs: true })
    });
    const report = validateGraph(
      {
        nodes: [
          { id: "1", type: "a.A" },
          { id: "2", type: "a.A" },
          {
            id: "3",
            type: "a.Dyn",
            dynamic_inputs: { one: { type: { type: "str" } } }
          }
        ],
        edges: [
          { id: "e1", source: "1", sourceHandle: "out", target: "3", targetHandle: "one" },
          { id: "e2", source: "2", sourceHandle: "out", target: "3", targetHandle: "one" }
        ]
      },
      registry
    );
    expect(report.issues.some((i) => i.code === "fan_in")).toBe(true);
  });

  it("does not count control edges towards fan-in", () => {
    const registry = fakeRegistry({
      "a.A": meta("a.A", {}, { out: "str" }),
      "a.Sink": meta("a.Sink", { in: "str" }, {})
    });
    const report = validateGraph(
      {
        nodes: [
          { id: "1", type: "a.A" },
          { id: "2", type: "a.A" },
          { id: "3", type: "a.Sink" }
        ],
        edges: [
          {
            id: "e1",
            source: "1",
            sourceHandle: "out",
            target: "3",
            targetHandle: "__control__",
            edge_type: "control"
          },
          {
            id: "e2",
            source: "2",
            sourceHandle: "out",
            target: "3",
            targetHandle: "__control__",
            edge_type: "control"
          }
        ]
      },
      registry
    );
    expect(report.issues.filter((i) => i.code === "fan_in")).toEqual([]);
  });

  it("does not count ReactFlow-shaped control edges towards fan-in", () => {
    const registry = fakeRegistry({
      "a.A": meta("a.A", {}, { out: "str" }),
      "a.Sink": meta("a.Sink", { in: "str" }, {})
    });
    const report = validateGraph(
      {
        nodes: [
          { id: "1", type: "a.A" },
          { id: "2", type: "a.A" },
          { id: "3", type: "a.Sink" }
        ],
        edges: [
          {
            id: "e1",
            source: "1",
            sourceHandle: "out",
            target: "3",
            targetHandle: "__control__",
            type: "control"
          },
          {
            id: "e2",
            source: "2",
            sourceHandle: "out",
            target: "3",
            targetHandle: "__control__",
            data: { edge_type: "control" }
          }
        ]
      },
      registry
    );
    expect(report.issues.filter((i) => i.code === "fan_in")).toEqual([]);
  });

  it("flags an unknown output handle even when the node carries dynamic_outputs: {}", () => {
    const registry = fakeRegistry({
      "a.A": meta("a.A", {}, { out: "str" }),
      "a.Sink": meta("a.Sink", { in: "str" }, {})
    });
    const report = validateGraph(
      {
        nodes: [
          { id: "1", type: "a.A", dynamic_outputs: {} },
          { id: "2", type: "a.Sink", dynamic_outputs: {} }
        ],
        edges: [
          { id: "e1", source: "1", sourceHandle: "nope", target: "2", targetHandle: "in" }
        ]
      },
      registry
    );
    expect(report.issues.some((i) => i.code === "unknown_handle")).toBe(true);
  });

  it("allows unknown output handles on nodes whose metadata supports dynamic outputs", () => {
    const registry = fakeRegistry({
      "a.A": meta("a.A", {}, { out: "str" }, { supports_dynamic_outputs: true }),
      "a.Sink": meta("a.Sink", { in: "str" }, {})
    });
    const report = validateGraph(
      {
        nodes: [
          { id: "1", type: "a.A", dynamic_outputs: {} },
          { id: "2", type: "a.Sink" }
        ],
        edges: [
          { id: "e1", source: "1", sourceHandle: "extra", target: "2", targetHandle: "in" }
        ]
      },
      registry
    );
    expect(report.issues.some((i) => i.code === "unknown_handle")).toBe(false);
  });

  it("forwards dynamic_inputs/dynamic_properties to the registry validator", () => {
    let seen: {
      dynamic_inputs?: Record<string, unknown>;
      dynamic_properties?: Record<string, unknown>;
    } = {};
    const registry: GraphValidationRegistry = {
      has: () => true,
      getMetadata: () => meta("a.Dyn", {}, {}, { supports_dynamic_inputs: true }),
      validateNode: (descriptor) => {
        seen = descriptor;
        return [];
      }
    };
    validateGraph(
      {
        nodes: [
          {
            id: "1",
            type: "a.Dyn",
            dynamic_inputs: { need: { type: { type: "str" }, required: true } },
            dynamic_properties: { need: "" }
          }
        ],
        edges: []
      },
      registry
    );
    expect(seen.dynamic_inputs).toEqual({
      need: { type: { type: "str" }, required: true }
    });
    expect(seen.dynamic_properties).toEqual({ need: "" });
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

describe("unknown_provider", () => {
  const registry = {
    has: () => true,
    getMetadata: () => ({ properties: [], outputs: [] }) as never,
    validateNode: () => [],
    listProviderIds: () => ["fal_ai", "openai"]
  };
  const graphWith = (provider: string) => ({
    nodes: [
      {
        id: "n",
        type: "nodetool.image.TextToImage",
        data: { model: { type: "image_model", provider, id: "x" } }
      }
    ],
    edges: []
  });

  it("flags a provider the runtime cannot construct", () => {
    const report = validateGraph(graphWith("huggingface_fal_ai"), registry);
    const issue = report.issues.find((i) => i.code === "unknown_provider");
    expect(issue?.message).toContain("huggingface_fal_ai");
  });

  it("accepts a registered provider", () => {
    const report = validateGraph(graphWith("fal_ai"), registry);
    expect(report.issues.some((i) => i.code === "unknown_provider")).toBe(false);
  });

  // Without the list there is nothing to check against; guessing would flag
  // every model in the graph.
  it("skips the check when the caller supplies no provider list", () => {
    const { listProviderIds: _omit, ...noProviders } = registry;
    const report = validateGraph(graphWith("huggingface_fal_ai"), noProviders);
    expect(report.issues.some((i) => i.code === "unknown_provider")).toBe(false);
  });

  it("ignores non-model objects that carry a provider field", () => {
    const report = validateGraph(
      {
        nodes: [
          {
            id: "n",
            type: "x",
            data: { cfg: { type: "settings", provider: "whatever" } }
          }
        ],
        edges: []
      },
      registry
    );
    expect(report.issues.some((i) => i.code === "unknown_provider")).toBe(false);
  });
});

describe("unknown_model", () => {
  const KIE_MODELS = [
    "kling/v3-turbo-image-to-video",
    "kling/v3-turbo-text-to-video",
    "wan/2-7-image-to-video",
    "gpt-image-2-text-to-image"
  ];
  const registry = {
    has: () => true,
    getMetadata: () => ({ properties: [], outputs: [] }) as never,
    validateNode: () => [],
    listProviderIds: () => ["kie", "openai"],
    // Mirrors the real index: manifest-backed provider, and only the model
    // types a manifest classifies. ASR is deliberately absent.
    listModelIds: (provider: string, modelType: string) =>
      provider === "kie" && modelType === "video_model" ? KIE_MODELS : undefined
  };
  const graphWith = (provider: string, id: string, type = "video_model") => ({
    nodes: [
      {
        id: "n",
        type: "nodetool.video.ImageToVideo",
        data: { model: { type, provider, id } }
      }
    ],
    edges: []
  });

  it("flags an id the provider does not offer", () => {
    const report = validateGraph(
      graphWith("kie", "totally-not-a-real-model-xyz"),
      registry
    );
    const issue = report.issues.find((i) => i.code === "unknown_model");
    expect(issue?.message).toContain("totally-not-a-real-model-xyz");
    expect(report.ok).toBe(false);
  });

  it("accepts an id the provider offers", () => {
    const report = validateGraph(
      graphWith("kie", "wan/2-7-image-to-video"),
      registry
    );
    expect(report.issues.some((i) => i.code === "unknown_model")).toBe(false);
  });

  it("suggests the near-miss behind a typo", () => {
    const report = validateGraph(
      graphWith("kie", "kling/v3-turbo-image-to-vid"),
      registry
    );
    const issue = report.issues.find((i) => i.code === "unknown_model");
    expect(issue?.message).toContain("kling/v3-turbo-image-to-video");
  });

  // A catalog only reachable over the network cannot prove an id wrong.
  it("skips providers whose models cannot be enumerated offline", () => {
    const report = validateGraph(
      graphWith("openai", "no-such-openai-model"),
      registry
    );
    expect(report.issues.some((i) => i.code === "unknown_model")).toBe(false);
  });

  it("skips the check when the caller supplies no model lister", () => {
    const { listModelIds: _omit, ...noModels } = registry;
    const report = validateGraph(
      graphWith("kie", "totally-not-a-real-model-xyz"),
      noModels
    );
    expect(report.issues.some((i) => i.code === "unknown_model")).toBe(false);
  });

  // An unregistered provider is already reported; naming its model too would
  // be a second complaint about one mistake.
  it("does not also flag the model of an unregistered provider", () => {
    const report = validateGraph(
      graphWith("nonesuch", "totally-not-a-real-model-xyz"),
      registry
    );
    expect(report.issues.some((i) => i.code === "unknown_provider")).toBe(true);
    expect(report.issues.some((i) => i.code === "unknown_model")).toBe(false);
  });

  // An unselected model is the registry's own required-property complaint.
  it("ignores a blank model id", () => {
    const report = validateGraph(graphWith("kie", ""), registry);
    expect(report.issues.some((i) => i.code === "unknown_model")).toBe(false);
  });

  // Regression: a flat per-provider id list flagged every real ASR selection.
  // `openai/whisper-large-v3` on fal_ai is a working model that appears in no
  // manifest, because manifests do not classify ASR at all. The catalog a
  // model must appear in is chosen by its type, not just its provider.
  it("does not flag a model type the index cannot enumerate", () => {
    const report = validateGraph(
      graphWith("kie", "openai/whisper-large-v3", "asr_model"),
      registry
    );
    expect(report.issues.some((i) => i.code === "unknown_model")).toBe(false);
  });

  // The same id under a type the index does cover stays a real finding, so the
  // fix above did not simply switch the check off.
  it("still flags an unknown id under a covered type", () => {
    const report = validateGraph(
      graphWith("kie", "openai/whisper-large-v3", "video_model"),
      registry
    );
    expect(report.issues.some((i) => i.code === "unknown_model")).toBe(true);
  });
});

describe("model selections in nested properties", () => {
  const registry = {
    has: () => true,
    getMetadata: () => ({ properties: [], outputs: [] }) as never,
    validateNode: () => [],
    listProviderIds: () => ["kie", "openai"],
    listModelIds: (provider: string, modelType: string) =>
      provider === "kie" && modelType === "video_model"
        ? ["wan/2-7-image-to-video"]
        : undefined
  };
  const nodeWith = (properties: Record<string, unknown>) => ({
    nodes: [{ id: "n", type: "nodetool.video.ImageToVideo", properties }],
    edges: []
  });

  it("flags a model inside a list property", () => {
    const report = validateGraph(
      nodeWith({
        models: [
          { type: "video_model", provider: "kie", id: "wan/2-7-image-to-video" },
          { type: "video_model", provider: "nonesuch", id: "x" }
        ]
      }),
      registry
    );
    const issue = report.issues.find((i) => i.code === "unknown_provider");
    expect(issue?.message).toContain("models[1]");
  });

  it("flags a model nested in a settings object", () => {
    const report = validateGraph(
      nodeWith({
        config: {
          model: { type: "video_model", provider: "kie", id: "not-a-model" }
        }
      }),
      registry
    );
    const issue = report.issues.find((i) => i.code === "unknown_model");
    expect(issue?.message).toContain("config.model");
  });

  it("checks dynamic property values too", () => {
    const report = validateGraph(
      {
        nodes: [
          {
            id: "n",
            type: "nodetool.video.ImageToVideo",
            dynamic_properties: {
              model: { type: "video_model", provider: "nonesuch", id: "x" }
            }
          }
        ],
        edges: []
      },
      registry
    );
    expect(report.issues.some((i) => i.code === "unknown_provider")).toBe(true);
  });
});

describe("missing_provider", () => {
  const registry = {
    has: () => true,
    getMetadata: () => ({ properties: [], outputs: [] }) as never,
    validateNode: () => [],
    listProviderIds: () => ["kie", "openai"]
  };
  const graphWith = (model: Record<string, unknown>) => ({
    nodes: [{ id: "n", type: "nodetool.video.ImageToVideo", data: { model } }],
    edges: []
  });

  it("flags a model id that names no provider", () => {
    const report = validateGraph(
      graphWith({ type: "video_model", id: "wan/2-7-image-to-video" }),
      registry
    );
    const issue = report.issues.find((i) => i.code === "missing_provider");
    expect(issue?.message).toContain("wan/2-7-image-to-video");
    expect(report.ok).toBe(false);
  });

  // An entirely empty ref is an unselected model — the registry's own
  // required-property check owns that complaint.
  it("ignores a model reference with neither id nor provider", () => {
    const report = validateGraph(graphWith({ type: "video_model" }), registry);
    expect(report.issues.some((i) => i.code === "missing_provider")).toBe(false);
  });

  it("ignores a blank provider on an unselected model", () => {
    const report = validateGraph(
      graphWith({ type: "video_model", provider: "", id: "" }),
      registry
    );
    expect(report.issues.some((i) => i.code === "missing_provider")).toBe(false);
  });
});

describe("collectModelSelectionIssues", () => {
  const registry = {
    listProviderIds: () => ["kie"],
    listModelIds: (provider: string, modelType: string) =>
      provider === "kie" && modelType === "video_model"
        ? ["wan/2-7-image-to-video"]
        : undefined
  };

  it("reports the same issues without needing node metadata", () => {
    const issues = collectModelSelectionIssues(
      {
        nodes: [
          {
            id: "n",
            type: "nodetool.video.ImageToVideo",
            properties: {
              model: { type: "video_model", provider: "kie", id: "nope" }
            }
          }
        ]
      },
      registry
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("unknown_model");
    expect(issues[0]?.nodeId).toBe("n");
  });

  // Failing toward silence is the whole contract: an unreachable registry
  // must not turn every model in the graph into an error.
  it("reports nothing when no provider list is available", () => {
    expect(
      collectModelSelectionIssues(
        {
          nodes: [
            {
              id: "n",
              type: "t",
              properties: {
                model: { type: "video_model", provider: "nonesuch", id: "x" }
              }
            }
          ]
        },
        { listProviderIds: () => [] }
      )
    ).toEqual([]);
  });
});

describe("Code nodes", () => {
  const CODE = "nodetool.code.Code";
  const codeMeta = meta(CODE, { code: "str", timeout: "int" }, {}, {
    supports_dynamic_inputs: true,
    supports_dynamic_outputs: true
  } as Partial<NodeMetadata>);
  const registry = fakeRegistry({
    [CODE]: codeMeta,
    "a.Sink": meta("a.Sink", { in: "str" }, {}),
    "a.IntSink": meta("a.IntSink", { in: "int" }, {})
  });

  /** A Code node plus an edge into a sink reading `out`. */
  const graph = (node: Record<string, unknown>) => ({
    nodes: [
      { id: "c", type: CODE, ...node },
      { id: "s", type: "a.Sink", properties: {} }
    ],
    edges: [
      { id: "e1", source: "c", sourceHandle: "out", target: "s", targetHandle: "in" }
    ]
  });

  it("passes a well-formed Code node", () => {
    const report = validateGraph(
      graph({
        properties: { code: "return { out: String(inputs.text) };" },
        dynamic_inputs: { text: { type: { type: "str" } } },
        dynamic_outputs: { out: { type: "str" } }
      }),
      registry
    );
    expect(report.issues).toEqual([]);
  });

  it("reports a syntax error against the node", () => {
    const report = validateGraph(
      graph({
        properties: { code: "return { out: };" },
        dynamic_outputs: { out: { type: "str" } }
      }),
      registry
    );
    const issue = report.issues.find((i) => i.code === "code_syntax");
    expect(issue?.severity).toBe("error");
    expect(issue?.nodeId).toBe("c");
    expect(report.ok).toBe(false);
  });

  it("treats a named inputs read as a declared handle", () => {
    const report = validateGraph(
      graph({
        properties: { code: "return { out: String(inputs.text) };" },
        dynamic_outputs: { out: { type: "str" } }
      }),
      registry
    );
    expect(report.issues.some((i) => i.code === "code_undefined_input")).toBe(
      false
    );
  });

  it("treats a named emit as a declared output", () => {
    const report = validateGraph(
      graph({
        properties: {
          code: 'await output("out", String(inputs.text));'
        }
      }),
      registry
    );
    expect(report.issues.some((i) => i.code === "code_undeclared_output")).toBe(
      false
    );
    expect(report.issues.some((i) => i.code === "code_undefined_input")).toBe(
      false
    );
  });

  it("flags code reading an input the node does not have", () => {
    const report = validateGraph(
      graph({
        properties: { code: "return { out: missing };" },
        dynamic_outputs: { out: { type: "str" } }
      }),
      registry
    );
    expect(
      report.issues.find((i) => i.code === "code_undefined_name")?.message
    ).toContain('"missing"');
  });

  it("counts a connected handle as an input the code may read", () => {
    const report = validateGraph(
      {
        nodes: [
          { id: "src", type: "a.Sink", properties: {} },
          {
            id: "c",
            type: CODE,
            properties: { code: "return { out: inputs.text };" },
            dynamic_outputs: { out: { type: "str" } }
          }
        ],
        edges: [
          { id: "e", source: "src", sourceHandle: "in", target: "c", targetHandle: "text" }
        ]
      },
      registry
    );
    expect(report.issues.some((i) => i.code === "code_undefined_name")).toBe(false);
  });

  // The streaming-input checks need to know which handles an edge feeds, which
  // only the graph knows — these prove `validateGraph` hands them over.
  it("takes a connected handle as a legal stream, and an unconnected one as a warning", () => {
    const streamingGraph = (targetHandle: string) => ({
      nodes: [
        { id: "src", type: "a.Sink", properties: {} },
        {
          id: "c",
          type: CODE,
          properties: {
            code: 'for await (const x of stream("text")) { await emit("out", x); }'
          },
          dynamic_inputs: {
            text: { type: { type: "str" } },
            other: { type: { type: "str" } }
          },
          dynamic_outputs: { out: { type: "str" } }
        }
      ],
      edges: [
        { id: "e", source: "src", sourceHandle: "in", target: "c", targetHandle }
      ]
    });

    const connected = validateGraph(streamingGraph("text"), registry);
    expect(
      connected.issues.some((i) => i.code === "code_unconnected_stream")
    ).toBe(false);

    const unconnected = validateGraph(streamingGraph("other"), registry);
    const issue = unconnected.issues.find(
      (i) => i.code === "code_unconnected_stream"
    );
    expect(issue?.severity).toBe("warning");
    expect(issue?.nodeId).toBe("c");
  });

  it("reports an `inputs` read of a handle an edge feeds in a streaming body", () => {
    const report = validateGraph(
      {
        nodes: [
          { id: "src", type: "a.Sink", properties: {} },
          {
            id: "c",
            type: CODE,
            properties: {
              code:
                'for await (const x of stream("text")) { await emit("out", inputs.text); }'
            },
            dynamic_inputs: { text: { type: { type: "str" } } },
            dynamic_outputs: { out: { type: "str" } }
          }
        ],
        edges: [
          { id: "e", source: "src", sourceHandle: "in", target: "c", targetHandle: "text" }
        ]
      },
      registry
    );
    const issue = report.issues.find((i) => i.code === "code_stream_input_read");
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain('stream("text")');
  });

  it("uses the edges into the node when nothing declares an output", () => {
    const report = validateGraph(
      graph({ properties: { code: "const x = 1;" } }),
      registry
    );
    const issue = report.issues.find((i) => i.code === "code_no_return");
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain('"out"');
  });

  it("leaves non-code nodes alone", () => {
    const report = validateGraph(
      {
        nodes: [{ id: "s", type: "a.Sink", properties: { in: "return {" } }],
        edges: []
      },
      registry
    );
    expect(report.issues.some((i) => i.code.startsWith("code_"))).toBe(false);
  });

  it("type-checks an edge out of a declared dynamic output", () => {
    const report = validateGraph(
      {
        nodes: [
          {
            id: "c",
            type: CODE,
            properties: { code: "return { out: 1 };" },
            dynamic_outputs: { out: { type: "int" } }
          },
          { id: "s", type: "a.Sink", properties: {} }
        ],
        edges: [
          { id: "e", source: "c", sourceHandle: "out", target: "s", targetHandle: "in" }
        ]
      },
      registry
    );
    const mismatch = report.issues.find((i) => i.code === "type_mismatch");
    expect(mismatch?.message).toContain("int");
  });

  it("flags an edge out of an output the node never declares", () => {
    const report = validateGraph(
      {
        nodes: [
          {
            id: "c",
            type: CODE,
            properties: { code: "return { out: 'x' };" },
            dynamic_outputs: { out: { type: "str" } }
          },
          { id: "s", type: "a.Sink", properties: {} }
        ],
        edges: [
          { id: "e", source: "c", sourceHandle: "ghost", target: "s", targetHandle: "in" }
        ]
      },
      registry
    );
    const issue = report.issues.find((i) => i.code === "unknown_handle");
    expect(issue?.message).toContain('"ghost"');
    expect(issue?.message).toContain('"out"');
  });

  it("stays quiet about handles on a node that declares no dynamic outputs", () => {
    const report = validateGraph(
      {
        nodes: [
          {
            id: "c",
            type: CODE,
            properties: { code: "return { out: 'x' };" },
            dynamic_outputs: {}
          },
          { id: "s", type: "a.Sink", properties: {} }
        ],
        edges: [
          { id: "e", source: "c", sourceHandle: "out", target: "s", targetHandle: "in" }
        ]
      },
      registry
    );
    expect(report.issues.some((i) => i.code === "unknown_handle")).toBe(false);
  });

  it("accepts a source handle the body emits but dynamic_outputs omits", () => {
    const report = validateGraph(
      {
        nodes: [
          {
            id: "c",
            type: CODE,
            properties: { code: 'await emit("extra", 1); return { out: "x" };' },
            dynamic_outputs: { out: { type: "str" } }
          },
          { id: "s", type: "a.IntSink", properties: {} }
        ],
        edges: [
          { id: "e", source: "c", sourceHandle: "extra", target: "s", targetHandle: "in" }
        ]
      },
      registry
    );
    expect(report.issues.some((i) => i.code === "unknown_handle")).toBe(false);
    // An inferred handle carries no declared type, so the edge is not
    // type-checked against the int sink.
    expect(report.issues.some((i) => i.code === "type_mismatch")).toBe(false);
  });
});

describe("slot_type_alias", () => {
  const registry = fakeRegistry({
    "a.Dyn": meta("a.Dyn", {}, {}, {
      supports_dynamic_inputs: true,
      supports_dynamic_outputs: true
    } as Partial<NodeMetadata>)
  });

  it("flags a JSON-Schema spelling on a dynamic input", () => {
    const report = validateGraph(
      {
        nodes: [
          { id: "n", type: "a.Dyn", dynamic_inputs: { count: { type: { type: "integer" } } } }
        ],
        edges: []
      },
      registry
    );
    const issue = report.issues.find((i) => i.code === "slot_type_alias");
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain('use "int"');
  });

  it("walks type arguments", () => {
    const report = validateGraph(
      {
        nodes: [
          {
            id: "n",
            type: "a.Dyn",
            dynamic_outputs: {
              rows: { type: "list", type_args: [{ type: "string" }] }
            }
          }
        ],
        edges: []
      },
      registry
    );
    expect(
      report.issues.find((i) => i.code === "slot_type_alias")?.message
    ).toContain('use "str"');
  });

  it("accepts a custom type name it does not recognize", () => {
    const report = validateGraph(
      {
        nodes: [
          { id: "n", type: "a.Dyn", dynamic_outputs: { x: { type: "my.custom.Thing" } } }
        ],
        edges: []
      },
      registry
    );
    expect(report.issues.some((i) => i.code === "slot_type_alias")).toBe(false);
  });
});

describe("validateGraph — cycles", () => {
  const registry = fakeRegistry({
    "a.N": meta("a.N", { in: "str" }, { out: "str" })
  });
  const node = (id: string) => ({ id, type: "a.N" });
  const edge = (id: string, source: string, target: string) => ({
    id,
    source,
    sourceHandle: "out",
    target,
    targetHandle: "in"
  });

  it("flags a self-loop", () => {
    const report = validateGraph(
      { nodes: [node("1")], edges: [edge("e1", "1", "1")] },
      registry
    );
    expect(report.ok).toBe(false);
    const issue = report.issues.find((i) => i.code === "cycle");
    expect(issue?.nodeId).toBe("1");
    expect(issue?.message).toContain("connected to itself");
  });

  it("flags a self-loop on a control edge too", () => {
    const report = validateGraph(
      {
        nodes: [node("1")],
        edges: [{ ...edge("e1", "1", "1"), edge_type: "control" }]
      },
      registry
    );
    expect(report.issues.some((i) => i.code === "cycle")).toBe(true);
  });

  it("flags a multi-node cycle and names every node in it", () => {
    const report = validateGraph(
      {
        nodes: [node("1"), node("2"), node("3")],
        edges: [
          edge("e1", "1", "2"),
          edge("e2", "2", "3"),
          edge("e3", "3", "1")
        ]
      },
      registry
    );
    expect(report.ok).toBe(false);
    const issue = report.issues.find((i) => i.message.includes("Cycle detected"));
    expect(issue?.code).toBe("cycle");
    expect(issue?.message).toContain("1, 2, 3");
  });

  it("ignores control edges when looking for cycles (the kernel does)", () => {
    const report = validateGraph(
      {
        nodes: [node("1"), node("2")],
        edges: [
          edge("e1", "1", "2"),
          { ...edge("e2", "2", "1"), edge_type: "control" }
        ]
      },
      registry
    );
    expect(report.issues.some((i) => i.code === "cycle")).toBe(false);
  });

  it("does not flag a diamond", () => {
    const registryList = fakeRegistry({
      "a.N": meta("a.N", { in: "str" }, { out: "str" }),
      "a.Join": meta("a.Join", { in: "list[str]" }, { out: "str" })
    });
    const report = validateGraph(
      {
        nodes: [node("1"), node("2"), node("3"), { id: "4", type: "a.Join" }],
        edges: [
          edge("e1", "1", "2"),
          edge("e2", "1", "3"),
          edge("e3", "2", "4"),
          edge("e4", "3", "4")
        ]
      },
      registryList
    );
    expect(report.issues.some((i) => i.code === "cycle")).toBe(false);
  });

  it("handles a long chain without recursing", () => {
    const nodes = Array.from({ length: 20000 }, (_, i) => node(`n${i}`));
    const edges = Array.from({ length: 19999 }, (_, i) =>
      edge(`e${i}`, `n${i}`, `n${i + 1}`)
    );
    const report = validateGraph({ nodes, edges }, registry);
    expect(report.issues.some((i) => i.code === "cycle")).toBe(false);
  });
});

describe("validateGraph — node/edge shape", () => {
  const registry = fakeRegistry(
    {
      "a.Source": meta("a.Source", {}, { out: "str" }),
      "a.LLM": meta("a.LLM", { prompt: "str" }, { out: "str" })
    },
    { "a.LLM": ["prompt"] }
  );

  it("reads properties from the editor's nested data.properties", () => {
    const report = validateGraph(
      {
        nodes: [
          {
            id: "1",
            type: "a.LLM",
            data: { properties: { prompt: "hello" }, dynamic_properties: {} }
          }
        ],
        edges: []
      },
      registry
    );
    expect(report.issues.filter((i) => i.code === "property")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("still reads a flattened data bag", () => {
    const report = validateGraph(
      { nodes: [{ id: "1", type: "a.LLM", data: { prompt: "hello" } }], edges: [] },
      registry
    );
    expect(report.issues.filter((i) => i.code === "property")).toEqual([]);
  });

  it("flags an edge that names no handles", () => {
    const report = validateGraph(
      {
        nodes: [
          { id: "1", type: "a.Source" },
          { id: "2", type: "a.LLM", properties: { prompt: "x" } }
        ],
        edges: [{ id: "e1", source: "1", target: "2" }]
      },
      registry
    );
    expect(report.ok).toBe(false);
    const missing = report.issues.filter((i) => i.code === "missing_handle");
    expect(missing).toHaveLength(2);
    expect(missing.map((i) => i.nodeId).sort()).toEqual(["1", "2"]);
  });

  it("flags a node with no id", () => {
    const report = validateGraph(
      { nodes: [{ type: "a.Source" }], edges: [] },
      registry
    );
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === "missing_id")).toBe(true);
  });

  // A graph is untrusted JSON: both shapes below threw a TypeError out of
  // `validateGraph` before they were reported.
  it("reports edges that are not an array", () => {
    const report = validateGraph(
      { nodes: [{ id: "1", type: "a.Source" }], edges: -1 as never },
      registry
    );
    expect(report.ok).toBe(false);
    expect(report.edgeCount).toBe(0);
    expect(report.issues.find((i) => i.code === "invalid_graph")?.message).toBe(
      "graph.edges must be an array, not a number"
    );
  });

  it("reports nodes that are not an array", () => {
    const report = validateGraph({ nodes: {} as never, edges: [] }, registry);
    expect(report.ok).toBe(false);
    expect(report.nodeCount).toBe(0);
    expect(report.issues.find((i) => i.code === "invalid_graph")?.message).toBe(
      "graph.nodes must be an array, not an object"
    );
  });

  it("treats an absent half of the graph as empty, not as an error", () => {
    const report = validateGraph(
      { nodes: [{ id: "1", type: "a.Source" }] },
      registry
    );
    expect(report.issues.some((i) => i.code === "invalid_graph")).toBe(false);
    expect(report.ok).toBe(true);
  });

  it("reports a duplicate id's properties only once", () => {
    const report = validateGraph(
      {
        nodes: [
          { id: "dup", type: "a.LLM", properties: {} },
          { id: "dup", type: "a.LLM", properties: {} }
        ],
        edges: []
      },
      registry
    );
    expect(report.issues.filter((i) => i.code === "property")).toHaveLength(1);
    expect(report.issues.filter((i) => i.code === "duplicate_id")).toHaveLength(1);
  });
});

describe("Code node sandbox packages", () => {
  const CODE = "nodetool.code.Code";
  const registry = fakeRegistry({
    [CODE]: meta(CODE, { code: "str" }, {}, {
      supports_dynamic_inputs: true,
      supports_dynamic_outputs: true
    } as Partial<NodeMetadata>)
  });

  const catalog: SandboxModuleCatalog = {
    summaries: () => [],
    diagnostics: () => [],
    authorizeDelivery: (moduleId) =>
      Promise.resolve(refuseSandboxDelivery(moduleId)),
    resolveForExecution: (declarations) => ({
      modules: [],
      statuses: declarations
        .filter((declaration) => declaration.specifier !== "@acme/geo")
        .map((declaration) => ({
          packName: "@acme/nodetool-missing",
          specifier: declaration.specifier,
          status: "error" as const,
          code: "module-not-found",
          message: `Sandbox module ${declaration.specifier} is not installed.`
        }))
    })
  };

  const graph = (properties: Record<string, unknown>) => ({
    nodes: [
      {
        id: "c",
        type: CODE,
        properties,
        dynamic_outputs: { out: { type: "str" } }
      }
    ],
    edges: []
  });

  const code = 'import { haversine } from "@acme/geo";\nreturn { out: haversine(1, 2) };';

  it("accepts an import the catalog serves", () => {
    const report = validateGraph(graph({ code }), registry, {
      sandboxModuleCatalog: catalog
    });
    expect(report.issues).toEqual([]);
  });

  it("checks nothing when there is no catalog to check against", () => {
    const report = validateGraph(graph({ code }), registry, {
      sandboxModuleCatalog: null
    });
    expect(report.issues).toEqual([]);
  });

  it("ignores a leftover packages property from a saved graph", () => {
    const report = validateGraph(
      graph({ code, packages: [{ specifier: "@stale/pack" }] }),
      registry,
      { sandboxModuleCatalog: catalog }
    );
    expect(report.issues).toEqual([]);
  });

  it("reports a specifier the catalog does not have", () => {
    const report = validateGraph(
      graph({ code: 'import { x } from "@nope/pack";\nreturn { out: x };' }),
      registry,
      { sandboxModuleCatalog: catalog }
    );
    const issue = report.issues.find(
      (i) => i.code === "code_package_unavailable"
    );
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain("@acme/nodetool-missing");
  });

  it("falls back to the process catalog when the caller passes none", () => {
    setProcessSandboxModuleCatalog(catalog);
    try {
      const report = validateGraph(
        graph({ code: 'import { x } from "@nope/pack";\nreturn { out: x };' }),
        registry,
        {}
      );
      expect(
        report.issues.some((i) => i.code === "code_package_unavailable")
      ).toBe(true);
    } finally {
      setProcessSandboxModuleCatalog(null);
    }
  });

  it("says nothing about the browser on a node declaring packages", () => {
    // The browser runner fetches and runs declared modules as of M2, so a
    // graph that declares them is an ordinary graph.
    const report = validateGraph(
      graph({ code, packages: ["@acme/geo"] }),
      registry,
      { sandboxModuleCatalog: catalog }
    );
    expect(report.issues.map((i) => i.code)).not.toContain(
      "code_package_browser_parity"
    );
    expect(report.issues.map((i) => i.code)).not.toContain(
      "code_package_disabled"
    );
  });
});

describe("Code nodes linked to a JS script", () => {
  const CODE = "nodetool.code.Code";
  const registry = fakeRegistry({
    [CODE]: meta(CODE, { code: "str", timeout: "int" }, {}, {
      supports_dynamic_inputs: true,
      supports_dynamic_outputs: true
    } as Partial<NodeMetadata>),
    "a.Sink": meta("a.Sink", { in: "str" }, {})
  });

  const script = (
    overrides: Partial<{
      code: string;
      inputs: { name: string; type: string }[];
      outputs: { name: string; type: string }[];
    }> = {}
  ) => ({
    id: "s1",
    name: "Shout",
    version: 2,
    document: {
      schemaVersion: 1 as const,
      description: "",
      code: 'await output("out", String(inputs.text).toUpperCase());',
      inputs: [{ name: "text", type: "str" }],
      outputs: [{ name: "out", type: "str" }],
      packages: [],
      secrets: [],
      timeoutSeconds: 30,
      tests: [],
      ...overrides
    }
  });

  /** A linked Code node feeding a sink from its `out` handle. */
  const graph = (node: Record<string, unknown>) => ({
    nodes: [
      {
        id: "c",
        type: CODE,
        properties: {
          // The body linking materialized onto the node — what a run executes.
          code: 'await output("out", String(inputs.text).toUpperCase());',
          script: { id: "s1", version: 2 }
        },
        dynamic_inputs: { text: { type: { type: "str" } } },
        dynamic_outputs: { out: { type: "str" } },
        ...node
      },
      { id: "s", type: "a.Sink", properties: {} }
    ],
    edges: [
      { id: "e1", source: "c", sourceHandle: "out", target: "s", targetHandle: "in" }
    ]
  });

  const lookup = (found: ReturnType<typeof script> | undefined) => () => found;

  it("accepts a linked node whose materialized body matches the script", () => {
    const report = validateGraph(graph({}), registry, {
      sandboxModuleCatalog: null,
      jsScriptLookup: lookup(script())
    });
    expect(report.counts.errors).toBe(0);
  });

  it("checks the materialized body like any inline one", () => {
    const report = validateGraph(
      graph({ properties: { code: "const x = ((", script: { id: "s1", version: 2 } } }),
      registry,
      { sandboxModuleCatalog: null, jsScriptLookup: lookup(script()) }
    );
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === "code_syntax")).toBe(true);
  });

  it("checks a materialized streaming body against the node's edges", () => {
    const report = validateGraph(
      graph({
        properties: {
          code: 'for await (const t of stream("text")) { await emit("out", t); }',
          script: { id: "s1", version: 2 }
        }
      }),
      registry,
      { sandboxModuleCatalog: null, jsScriptLookup: lookup(script()) }
    );
    // Nothing feeds `text`, so the stream yields nothing — a warning, not an error.
    expect(report.counts.errors).toBe(0);
    expect(
      report.issues.some((i) => i.code === "code_unconnected_stream")
    ).toBe(true);
  });

  it("warns rather than errors on a dangling link — the body still runs", () => {
    const report = validateGraph(graph({}), registry, {
      sandboxModuleCatalog: null,
      jsScriptLookup: lookup(undefined)
    });
    expect(report.ok).toBe(true);
    const issue = report.issues.find((i) => i.code === "js_script_missing");
    expect(issue?.severity).toBe("warning");
    expect(issue?.message).toContain("s1");
  });

  it("warns when no lookup can verify the link", () => {
    const report = validateGraph(graph({}), registry, {
      sandboxModuleCatalog: null
    });
    expect(report.ok).toBe(true);
    expect(
      report.issues.some((i) => i.code === "js_script_unverified")
    ).toBe(true);
  });

  it("errors when the script's ports and the node's slots disagree", () => {
    const report = validateGraph(
      graph({ dynamic_inputs: { other: { type: { type: "str" } } } }),
      registry,
      {
        sandboxModuleCatalog: null,
        jsScriptLookup: lookup(script())
      }
    );
    expect(report.ok).toBe(false);
    const messages = report.issues
      .filter((i) => i.code === "js_script_ports")
      .map((i) => i.message)
      .join(" ");
    expect(messages).toContain('"text"');
    expect(messages).toContain('"other"');
  });

  it("collects every pinned link in the graph", () => {
    expect(collectJsScriptLinks(graph({}))).toEqual([
      { id: "s1", version: 2 }
    ]);
  });
});

describe("collectSecretRequirementSites", () => {
  const KEYED = "a.Keyed";
  const CODE = "nodetool.code.Code";
  const registry = fakeRegistry({
    [KEYED]: meta(KEYED, { prompt: "str" }, { out: "str" }, {
      required_settings: ["FAL_API_KEY"]
    }),
    [CODE]: meta(CODE, { code: "str", secrets: "list[str]" }, {}, {
      supports_dynamic_inputs: true,
      supports_dynamic_outputs: true
    })
  });

  it("collects required_settings and Code-node declarations, deduplicated", () => {
    const sites = collectSecretRequirementSites(
      {
        nodes: [
          { id: "k1", type: KEYED, properties: {} },
          { id: "k2", type: KEYED, properties: {} },
          {
            id: "c",
            type: CODE,
            properties: { secrets: ["MY_KEY", "MY_KEY"] }
          }
        ]
      },
      registry
    );
    expect(sites).toEqual([
      {
        nodeId: "k1",
        nodeType: KEYED,
        key: "FAL_API_KEY",
        source: "required_setting"
      },
      {
        nodeId: "k2",
        nodeType: KEYED,
        key: "FAL_API_KEY",
        source: "required_setting"
      },
      {
        nodeId: "c",
        nodeType: CODE,
        key: "MY_KEY",
        source: "code_secret"
      }
    ]);
  });

  it("ignores a stray secrets property on a non-Code node", () => {
    const PLAIN = "a.Plain";
    const plainRegistry = fakeRegistry({
      [PLAIN]: meta(PLAIN, {}, {})
    });
    const sites = collectSecretRequirementSites(
      {
        nodes: [{ id: "s", type: PLAIN, properties: { secrets: ["X"] } }]
      },
      plainRegistry
    );
    expect(sites).toEqual([]);
  });

  it("skips node types the registry does not know", () => {
    const sites = collectSecretRequirementSites(
      { nodes: [{ id: "p", type: "python.Thing", properties: {} }] },
      registry
    );
    expect(sites).toEqual([]);
  });

  it("skips a known type whose metadata is absent", () => {
    const hollowRegistry: GraphValidationRegistry = {
      has: () => true,
      getMetadata: () => undefined,
      validateNode: () => []
    };
    expect(
      collectSecretRequirementSites(
        { nodes: [{ id: "h", type: "a.Hollow", properties: {} }] },
        hollowRegistry
      )
    ).toEqual([]);
  });

  it("skips an untyped node even when the registry answers has(\"\")", () => {
    const yesRegistry: GraphValidationRegistry = {
      has: () => true,
      getMetadata: () =>
        meta("a.Keyed", {}, {}, {
          required_settings: ["K"]
        }),
      validateNode: () => []
    };
    expect(
      collectSecretRequirementSites(
        { nodes: [{ id: "u", properties: {} }] },
        yesRegistry
      )
    ).toEqual([]);
  });

  it("ignores non-string names in both sources", () => {
    const CODE = "nodetool.code.Code";
    const sites = collectSecretRequirementSites(
      {
        nodes: [
          {
            id: "k",
            type: KEYED,
            properties: { secrets: [42, "", null, "REAL_KEY"] }
          },
          // A string is not a list — the declaration shape is wrong, and
          // guessing its characters would be worse than ignoring it.
          {
            id: "c",
            type: CODE,
            properties: { secrets: "REAL_KEY" }
          }
        ]
      },
      {
        ...registry,
        getMetadata: (t) => {
          if (t === KEYED) {
            const metadata = registry.getMetadata(KEYED);
            if (!metadata) return undefined;
            const malformed = { ...metadata };
            Reflect.set(malformed, "required_settings", ["GOOD_KEY", "", 7]);
            return malformed;
          }
          return t === CODE
            ? meta(CODE, { code: "str", secrets: "list[str]" }, {})
            : registry.getMetadata(t);
        }
      }
    );
    expect(sites).toEqual([
      // 42, "" and null drop out of both lists; the bare string on the Code
      // node is not a list at all and is ignored whole.
      {
        nodeId: "k",
        nodeType: KEYED,
        key: "GOOD_KEY",
        source: "required_setting"
      }
    ]);
  });

  it("deduplicates a repeated name inside one declaration list", () => {
    const dupMeta = meta(KEYED, {}, {}, {
      required_settings: ["SAME_KEY", "SAME_KEY"]
    });
    const sites = collectSecretRequirementSites(
      { nodes: [{ id: "d", type: KEYED, properties: {} }] },
      fakeRegistry({ [KEYED]: dupMeta })
    );
    expect(sites).toEqual([
      {
        nodeId: "d",
        nodeType: KEYED,
        key: "SAME_KEY",
        source: "required_setting"
      }
    ]);
  });

  it("does not let one node's key collide with another's", () => {
    const CODE = "nodetool.code.Code";
    const pairRegistry = fakeRegistry({
      [CODE]: meta(CODE, { code: "str", secrets: "list[str]" }, {})
    });
    const sites = collectSecretRequirementSites(
      {
        nodes: [
          { id: "c1", type: CODE, properties: { secrets: ["A_KEY"] } },
          { id: "c2", type: CODE, properties: { secrets: ["B_KEY"] } }
        ]
      },
      pairRegistry
    );
    expect(sites.map((s) => s.key)).toEqual(["A_KEY", "B_KEY"]);
  });
});

describe("collectMissingSecretIssues", () => {
  const KEYED = "a.Keyed";
  const registry = fakeRegistry({
    [KEYED]: meta(KEYED, {}, {}, {
      required_settings: ["FAL_API_KEY"]
    })
  });
  const graph = {
    nodes: [{ id: "k", type: KEYED, properties: {} }]
  };

  it("reports nothing without an availability set — silence, not guesses", () => {
    expect(collectMissingSecretIssues(graph, registry)).toEqual([]);
    expect(collectMissingSecretIssues(graph, registry, null)).toEqual([]);
  });

  it("warns when the set cannot resolve the key", () => {
    const issues = collectMissingSecretIssues(graph, registry, new Set());
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("warning");
    expect(issues[0]?.code).toBe("missing_secret");
    expect(issues[0]?.nodeId).toBe("k");
    expect(issues[0]?.message).toBe(
      `Node "k" (a.Keyed) needs "FAL_API_KEY", which this install cannot ` +
        "resolve. Set it in Settings → Credentials, or the node may fail " +
        "when it runs."
    );
  });

  it("worded for a Code node's own declared list", () => {
    const CODE = "nodetool.code.Code";
    const codeRegistry = fakeRegistry({
      [CODE]: meta(CODE, { code: "str", secrets: "list[str]" }, {})
    });
    const issues = collectMissingSecretIssues(
      {
        nodes: [
          { id: "c", type: CODE, properties: { secrets: ["MY_KEY"] } }
        ]
      },
      codeRegistry,
      new Set()
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toBe(
      `Node "c" declares secret "MY_KEY", which this install cannot ` +
        "resolve — the body's reads of it will fail."
    );
  });

  it("stays silent once the set resolves the key", () => {
    expect(
      collectMissingSecretIssues(graph, registry, new Set(["FAL_API_KEY"]))
    ).toEqual([]);
  });

  it("does not flip the report to not-ok — warnings inform, they do not refuse", () => {
    const report = validateGraph(graph, fakeRegistry({ [KEYED]: registry.getMetadata!(KEYED)! }), {
      availableSecrets: new Set()
    });
    expect(report.issues.some((i) => i.code === "missing_secret")).toBe(true);
    expect(report.ok).toBe(true);
  });
});

describe("collectModelProviders", () => {
  const graph = {
    nodes: [
      {
        id: "n1",
        type: "nodetool.image.TextToImage",
        properties: {
          model: { type: "image_model", provider: "fal_ai", id: "fal-ai/flux/schnell" }
        }
      },
      {
        id: "n2",
        type: "nodetool.video.ImageToVideo",
        dynamic_properties: {
          model: { type: "video_model", provider: "kie", id: "wan/2-7-image-to-video" }
        }
      },
      {
        id: "n3",
        type: "a.List",
        properties: {
          models: [
            { type: "image_model", provider: "openai", id: "gpt-image-2" },
            { type: "image_model", provider: "fal_ai", id: "fal-ai/flux/dev" }
          ]
        }
      }
    ]
  };

  it("walks top-level, dynamic, and list-nested refs, deduplicated in order", () => {
    expect(collectModelProviders(graph)).toEqual([
      "fal_ai",
      "kie",
      "openai"
    ]);
  });

  it("returns nothing for a graph with no model references", () => {
    expect(
      collectModelProviders({ nodes: [{ id: "t", type: "a.T", properties: {} }] })
    ).toEqual([]);
    expect(collectModelProviders({})).toEqual([]);
  });
});
