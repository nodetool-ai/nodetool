import { describe, expect, it, vi } from "vitest";
import type { GraphData } from "@nodetool-ai/protocol";
import type { NodeMetadata } from "@nodetool-ai/node-sdk";
import {
  generationOutputFor,
  planPartialRun,
  previousGenerationFromAssets,
  type GenerationAssetRow,
  type PreviousGeneration
} from "../src/partial-run.js";

function metadata(overrides: Partial<NodeMetadata> = {}): NodeMetadata {
  return {
    title: "T",
    description: "",
    namespace: "test",
    node_type: "test.T",
    layout: "default",
    properties: [],
    outputs: [{ name: "output", type: { type: "any", type_args: [] } }],
    is_dynamic: false,
    ...overrides
  } as NodeMetadata;
}

const edge = (
  source: string,
  target: string,
  targetHandle = "input",
  sourceHandle = "output"
) => ({
  id: `${source}-${target}-${targetHandle}`,
  source,
  target,
  sourceHandle,
  targetHandle,
  edge_type: "data" as const
});

// prompt → gen → consumer → sink, and gen → sibling (an unrelated branch).
const graph: GraphData = {
  nodes: [
    { id: "prompt", type: "test.Text", properties: { value: "a cat" } },
    { id: "gen", type: "test.Gen", properties: {} },
    { id: "consumer", type: "test.Consumer", properties: {} },
    { id: "sink", type: "test.Consumer", properties: {} },
    { id: "sibling", type: "test.Consumer", properties: {} }
  ],
  edges: [
    edge("prompt", "gen", "prompt"),
    edge("gen", "consumer"),
    edge("consumer", "sink"),
    edge("gen", "sibling")
  ]
};

const genMeta = metadata({ auto_save_asset: true });
const getMetadata = (type: string) =>
  type === "test.Gen" ? genMeta : metadata();

const ids = (g: GraphData) => g.nodes.map((n) => n.id).sort();

describe("planPartialRun", () => {
  it("keeps the selection and its upstream, drops downstream and siblings", async () => {
    const plan = await planPartialRun(graph, ["consumer"], { getMetadata });
    if (plan.kind !== "graph") throw new Error("expected a graph");
    expect(ids(plan.graph)).toEqual(["consumer", "gen", "prompt"]);
    expect(plan.graph.edges.map((e) => e.id).sort()).toEqual([
      "gen-consumer-input",
      "prompt-gen-prompt"
    ]);
    expect(plan.reused).toEqual([]);
  });

  it("reports unknown ids", async () => {
    expect(
      await planPartialRun(graph, ["consumer", "nope"], { getMetadata })
    ).toEqual({ kind: "unknown_nodes", ids: ["nope"] });
  });

  it("feeds a generator's previous output in place of running it", async () => {
    const loadPreviousGeneration = vi.fn(
      async (): Promise<PreviousGeneration> => ({
        outputs: { output: "saved" },
        jobId: "job-1",
        assetIds: ["asset-1"]
      })
    );
    const plan = await planPartialRun(graph, ["consumer"], {
      getMetadata,
      loadPreviousGeneration
    });
    if (plan.kind !== "graph") throw new Error("expected a graph");
    // The generator and everything only it needed are not run.
    expect(ids(plan.graph)).toEqual(["consumer"]);
    expect(plan.graph.edges).toEqual([]);
    expect(plan.graph.nodes[0]!.properties).toEqual({ input: "saved" });
    expect(plan.ran).toEqual(["consumer"]);
    expect(plan.reused).toEqual([
      { node_id: "gen", job_id: "job-1", asset_ids: ["asset-1"] }
    ]);
    expect(loadPreviousGeneration).toHaveBeenCalledTimes(1);
  });

  it("runs a generator with no previous generation", async () => {
    const plan = await planPartialRun(graph, ["consumer"], {
      getMetadata,
      loadPreviousGeneration: async () => null
    });
    if (plan.kind !== "graph") throw new Error("expected a graph");
    expect(ids(plan.graph)).toEqual(["consumer", "gen", "prompt"]);
    expect(plan.reused).toEqual([]);
  });

  it("always runs a selected generator", async () => {
    const loadPreviousGeneration = vi.fn(async () => null);
    const plan = await planPartialRun(graph, ["gen"], {
      getMetadata,
      loadPreviousGeneration
    });
    if (plan.kind !== "graph") throw new Error("expected a graph");
    expect(ids(plan.graph)).toEqual(["gen", "prompt"]);
    expect(loadPreviousGeneration).not.toHaveBeenCalled();
  });

  it("keeps the edge when the generator runs anyway for another selected node", async () => {
    const plan = await planPartialRun(graph, ["consumer", "gen"], {
      getMetadata,
      loadPreviousGeneration: async () => ({
        outputs: { output: "saved" },
        jobId: "job-1",
        assetIds: []
      })
    });
    if (plan.kind !== "graph") throw new Error("expected a graph");
    expect(ids(plan.graph)).toEqual(["consumer", "gen", "prompt"]);
    const consumer = plan.graph.nodes.find((n) => n.id === "consumer")!;
    expect(consumer.properties).toEqual({});
    expect(plan.reused).toEqual([]);
  });

  it("runs the generator when its saved generation lacks the edge's handle", async () => {
    const plan = await planPartialRun(graph, ["consumer"], {
      getMetadata,
      loadPreviousGeneration: async () => ({
        outputs: { image: 1, mask: 2 },
        jobId: "job-1",
        assetIds: []
      })
    });
    if (plan.kind !== "graph") throw new Error("expected a graph");
    expect(ids(plan.graph)).toEqual(["consumer", "gen", "prompt"]);
  });

  it("aggregates several reused edges into a list input", async () => {
    const listGraph: GraphData = {
      nodes: [
        { id: "a", type: "test.Gen", properties: {} },
        { id: "b", type: "test.Gen", properties: {} },
        { id: "collage", type: "test.Collage", properties: {} }
      ],
      edges: [edge("a", "collage", "images"), edge("b", "collage", "images")]
    };
    const plan = await planPartialRun(listGraph, ["collage"], {
      getMetadata: (type) =>
        type === "test.Collage"
          ? metadata({
              properties: [
                {
                  name: "images",
                  type: {
                    type: "list",
                    type_args: [{ type: "image", type_args: [] }]
                  }
                }
              ]
            })
          : genMeta,
      loadPreviousGeneration: async (node) => ({
        outputs: { output: `from-${node.id}` },
        jobId: null,
        assetIds: []
      })
    });
    if (plan.kind !== "graph") throw new Error("expected a graph");
    expect(plan.graph.nodes).toHaveLength(1);
    expect(plan.graph.nodes[0]!.properties!["images"]).toEqual([
      "from-a",
      "from-b"
    ]);
  });

  it("writes into dynamic_properties when the input is dynamic", async () => {
    const dynamicGraph: GraphData = {
      nodes: [
        { id: "gen", type: "test.Gen", properties: {} },
        {
          id: "fmt",
          type: "test.Format",
          properties: { template: "{{ text }}" },
          dynamic_properties: { text: "" }
        }
      ],
      edges: [edge("gen", "fmt", "text")]
    };
    const plan = await planPartialRun(dynamicGraph, ["fmt"], {
      getMetadata,
      loadPreviousGeneration: async () => ({
        outputs: { output: "hello" },
        jobId: null,
        assetIds: []
      })
    });
    if (plan.kind !== "graph") throw new Error("expected a graph");
    expect(plan.graph.nodes[0]).toMatchObject({
      properties: { template: "{{ text }}" },
      dynamic_properties: { text: "hello" }
    });
  });

  it("never serves a control edge from a saved generation", async () => {
    const controlGraph: GraphData = {
      nodes: [
        { id: "agent", type: "test.Gen", properties: {} },
        { id: "worker", type: "test.Consumer", properties: {} }
      ],
      edges: [{ ...edge("agent", "worker"), edge_type: "control" }]
    };
    const plan = await planPartialRun(controlGraph, ["worker"], {
      getMetadata,
      loadPreviousGeneration: async () => ({
        outputs: { output: "saved" },
        jobId: null,
        assetIds: []
      })
    });
    if (plan.kind !== "graph") throw new Error("expected a graph");
    expect(ids(plan.graph)).toEqual(["agent", "worker"]);
  });
});

describe("generationOutputFor", () => {
  it("prefers the named handle, else the sole value", () => {
    expect(generationOutputFor({ image: 1, mask: 2 }, "mask")).toBe(2);
    expect(generationOutputFor({ output: 1 }, "image")).toBe(1);
    expect(generationOutputFor({ image: 1, mask: 2 }, "other")).toBeUndefined();
  });
});

describe("previousGenerationFromAssets", () => {
  const row = (
    overrides: Partial<GenerationAssetRow> & { id: string }
  ): GenerationAssetRow => ({
    job_id: "job-2",
    content_type: "image/png",
    size: 10,
    metadata: { generation_index: 0 },
    ...overrides
  });

  it("rebuilds a media generation as asset refs on its output handle", () => {
    const generation = previousGenerationFromAssets(
      [row({ id: "img2" }), row({ id: "img1", job_id: "job-1" })],
      metadata({
        outputs: [{ name: "output", type: { type: "image", type_args: [] } }]
      })
    );
    expect(generation).toEqual({
      outputs: {
        output: { type: "image", uri: "asset://img2.png", asset_id: "img2" }
      },
      jobId: "job-2",
      assetIds: ["img2"]
    });
  });

  it("collects every asset of one generation into a list output, in save order", () => {
    const generation = previousGenerationFromAssets(
      [
        row({ id: "b" }),
        row({ id: "a" }),
        row({ id: "older", metadata: { generation_index: 1 } })
      ],
      metadata({
        outputs: [
          {
            name: "images",
            type: { type: "list", type_args: [{ type: "image", type_args: [] }] }
          }
        ]
      })
    );
    expect(generation?.outputs["images"]).toEqual([
      { type: "image", uri: "asset://a.png", asset_id: "a" },
      { type: "image", uri: "asset://b.png", asset_id: "b" }
    ]);
    expect(generation?.assetIds).toEqual(["a", "b"]);
  });

  it("files a media asset under the handle that produced it", () => {
    const generation = previousGenerationFromAssets(
      [
        row({
          id: "frame",
          metadata: { generation_index: 0, output_name: "last_frame" }
        }),
        row({
          id: "clip",
          content_type: "video/mp4",
          metadata: { generation_index: 0, output_name: "video" }
        })
      ],
      metadata()
    );
    expect(generation?.outputs).toEqual({
      video: { type: "video", uri: "asset://clip.mp4", asset_id: "clip" },
      last_frame: { type: "image", uri: "asset://frame.png", asset_id: "frame" }
    });
  });

  it("uses the pinned generation over the newest", () => {
    const generation = previousGenerationFromAssets(
      [row({ id: "new" }), row({ id: "pinned", job_id: "job-1" })],
      metadata(),
      "pinned"
    );
    expect(generation?.assetIds).toEqual(["pinned"]);
    expect(
      previousGenerationFromAssets([row({ id: "new" })], metadata(), "gone")
    ).toBeNull();
  });

  it("reads a text generation from its inline copy unless it was truncated", () => {
    const textMeta = metadata({
      outputs: [{ name: "text", type: { type: "str", type_args: [] } }]
    });
    const text = row({
      id: "t",
      content_type: "text/plain",
      size: 5,
      metadata: { text: "hello" }
    });
    expect(previousGenerationFromAssets([text], textMeta)?.outputs).toEqual({
      text: "hello"
    });
    expect(
      previousGenerationFromAssets([{ ...text, size: 900_000 }], textMeta)
    ).toBeNull();
  });

  it("reads a structured generation from its inline JSON", () => {
    const generation = previousGenerationFromAssets(
      [
        row({
          id: "j",
          content_type: "application/json",
          metadata: { json: { items: [1, 2], count: 2 } }
        })
      ],
      metadata()
    );
    expect(generation?.outputs).toEqual({ items: [1, 2], count: 2 });
    expect(
      previousGenerationFromAssets(
        [row({ id: "big", content_type: "application/json", metadata: {} })],
        metadata()
      )
    ).toBeNull();
  });
});
