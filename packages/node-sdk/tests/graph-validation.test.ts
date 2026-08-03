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

describe("stream_into_list_input", () => {
  // Iter streams; Map declares nothing and streams only because Iter feeds it
  // — the transitive case that makes this a fixed point, and the exact shape
  // of TextToImage between ScreenplayShots and ImageToVideo.
  const registry = fakeRegistry({
    "a.Iter": meta(
      "a.Iter",
      {},
      { item: "str" },
      {
        output_correlation: {
          item: { kind: "iteration", source: "__execution__", group: "items" }
        }
      } as never
    ),
    "a.Map": meta("a.Map", { input: "str" }, { output: "image" }),
    "a.Plain": meta("a.Plain", {}, { output: "image" }),
    "a.ListSink": meta("a.ListSink", { images: "list[image]" }, {}),
    "a.Collect": meta(
      "a.Collect",
      { input_item: "any" },
      { output: "list[any]" },
      {
        is_streaming_input: true,
        output_correlation: {
          output: { kind: "aggregate", source: "input_item" }
        }
      } as never
    )
  });
  const has = (r: { issues: { code: string }[] }) =>
    r.issues.some((i) => i.code === "stream_into_list_input");

  it("flags a stream arriving on a single-edge list handle", () => {
    const report = validateGraph(
      {
        nodes: [
          { id: "it", type: "a.Iter" },
          { id: "sink", type: "a.ListSink" }
        ],
        edges: [
          { id: "e1", source: "it", sourceHandle: "item", target: "sink", targetHandle: "images" }
        ]
      },
      registry
    );
    expect(has(report)).toBe(true);
    expect(report.ok).toBe(false);
  });

  it("flags a stream that arrives through a node declaring no correlation", () => {
    const report = validateGraph(
      {
        nodes: [
          { id: "it", type: "a.Iter" },
          { id: "map", type: "a.Map" },
          { id: "sink", type: "a.ListSink" }
        ],
        edges: [
          { id: "e1", source: "it", sourceHandle: "item", target: "map", targetHandle: "input" },
          { id: "e2", source: "map", sourceHandle: "output", target: "sink", targetHandle: "images" }
        ]
      },
      registry
    );
    expect(has(report)).toBe(true);
  });

  it("accepts a single value on a list handle", () => {
    const report = validateGraph(
      {
        nodes: [
          { id: "p", type: "a.Plain" },
          { id: "sink", type: "a.ListSink" }
        ],
        edges: [
          { id: "e1", source: "p", sourceHandle: "output", target: "sink", targetHandle: "images" }
        ]
      },
      registry
    );
    expect(has(report)).toBe(false);
  });

  // Collect is the remedy the message recommends, so it must not itself trip.
  it("does not flag a node that consumes streams by design", () => {
    const report = validateGraph(
      {
        nodes: [
          { id: "it", type: "a.Iter" },
          { id: "c", type: "a.Collect" }
        ],
        edges: [
          { id: "e1", source: "it", sourceHandle: "item", target: "c", targetHandle: "input_item" }
        ]
      },
      registry
    );
    expect(has(report)).toBe(false);
  });

  it("clears once an aggregate ends the stream", () => {
    const report = validateGraph(
      {
        nodes: [
          { id: "it", type: "a.Iter" },
          { id: "c", type: "a.Collect" },
          { id: "sink", type: "a.ListSink" }
        ],
        edges: [
          { id: "e1", source: "it", sourceHandle: "item", target: "c", targetHandle: "input_item" },
          { id: "e2", source: "c", sourceHandle: "output", target: "sink", targetHandle: "images" }
        ]
      },
      registry
    );
    expect(has(report)).toBe(false);
  });

  // The streaming walk indexes its edges once. Asking `edges.some(...)` per
  // node instead is O(nodes x edges) — half a billion comparisons on this
  // graph, and 40s of a CI job, before a single value has streamed anywhere.
  it("scales to a long chain", () => {
    const nodes = [
      { id: "it", type: "a.Iter" },
      ...Array.from({ length: 20000 }, (_, i) => ({
        id: `m${i}`,
        type: "a.Map"
      }))
    ];
    const edges = [
      {
        id: "e-seed",
        source: "it",
        sourceHandle: "item",
        target: "m0",
        targetHandle: "input"
      },
      ...Array.from({ length: 19999 }, (_, i) => ({
        id: `e${i}`,
        source: `m${i}`,
        sourceHandle: "output",
        target: `m${i + 1}`,
        targetHandle: "input"
      }))
    ];
    const report = validateGraph({ nodes, edges }, registry);
    // Every hop inherits the stream, and none of them is a list handle.
    expect(has(report)).toBe(false);
  });

  // Several edges into a list handle is the aggregating shape the kernel
  // already supports; fan_in owns that case and this check must stay out of it.
  it("ignores a list handle fed by several edges", () => {
    const report = validateGraph(
      {
        nodes: [
          { id: "it", type: "a.Iter" },
          { id: "p", type: "a.Plain" },
          { id: "sink", type: "a.ListSink" }
        ],
        edges: [
          { id: "e1", source: "it", sourceHandle: "item", target: "sink", targetHandle: "images" },
          { id: "e2", source: "p", sourceHandle: "output", target: "sink", targetHandle: "images" }
        ]
      },
      registry
    );
    expect(has(report)).toBe(false);
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
        properties: { code: "return { out: String(text) };" },
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
            properties: { code: "return { out: text };" },
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
