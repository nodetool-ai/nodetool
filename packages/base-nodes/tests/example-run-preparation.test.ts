import { describe, it, expect } from "vitest";
import { COMFY_CLOUD_GRAPH_NODE_TYPE } from "@nodetool-ai/protocol";
import {
  NETWORK_BYPASSING_NODES,
  NON_TERMINATING_NODES,
  SAMPLE_MEDIA,
  prepareForFakeRun,
  unrunnableNodeTypes
} from "./support/example-run-preparation.js";

const emptyModel = { type: "language_model", provider: "", id: "", name: "" };
const chosenModel = {
  type: "image_model",
  provider: "openai",
  id: "gpt-image-1",
  name: "GPT Image 1"
};
const pickedImage = { type: "image", uri: "asset://picked.png" };

function graph() {
  return {
    nodes: [
      { id: "llm", type: "nodetool.agents.Agent", data: { model: emptyModel } },
      { id: "draw", type: "nodetool.image.TextToImage", data: { model: chosenModel } },
      { id: "photo", type: "nodetool.input.ImageInput", data: { value: null } },
      { id: "voice", type: "nodetool.input.AudioInput", data: {} },
      { id: "kept", type: "nodetool.input.ImageInput", data: { value: pickedImage } }
    ],
    edges: [{ source: "photo", target: "draw" }]
  };
}

function nodeData(
  g: ReturnType<typeof prepareForFakeRun>,
  id: string
): Record<string, unknown> {
  const node = g.nodes.find((n) => n.id === id);
  return node?.data as Record<string, unknown>;
}

describe("prepareForFakeRun", () => {
  it("fills an empty model with a fake model whose provider names the node", () => {
    const prepared = prepareForFakeRun(graph());
    expect(nodeData(prepared, "llm").model).toEqual({
      type: "language_model",
      provider: "fake-llm",
      id: "fake-model",
      name: "Fake"
    });
  });

  it("leaves a chosen model alone", () => {
    const prepared = prepareForFakeRun(graph());
    expect(nodeData(prepared, "draw").model).toEqual(chosenModel);
  });

  it("gives an empty media input the shipped sample for its type", () => {
    const prepared = prepareForFakeRun(graph());
    expect(nodeData(prepared, "photo").value).toEqual(
      SAMPLE_MEDIA["nodetool.input.ImageInput"]
    );
    expect(nodeData(prepared, "voice").value).toEqual(
      SAMPLE_MEDIA["nodetool.input.AudioInput"]
    );
  });

  it("leaves a filled media input alone", () => {
    const prepared = prepareForFakeRun(graph());
    expect(nodeData(prepared, "kept").value).toEqual(pickedImage);
  });

  it("does not modify its input", () => {
    const input = graph();
    const snapshot = structuredClone(input);
    const prepared = prepareForFakeRun(input);
    expect(input).toEqual(snapshot);
    expect(prepared.nodes[0]).not.toBe(input.nodes[0]);
    expect(prepared.edges).toEqual(input.edges);
  });

  it("copies the sample instead of sharing the SAMPLE_MEDIA object", () => {
    const prepared = prepareForFakeRun(graph());
    expect(nodeData(prepared, "photo").value).not.toBe(
      SAMPLE_MEDIA["nodetool.input.ImageInput"]
    );
  });
});

describe("unrunnable node types", () => {
  it("includes the collapsed Comfy graph type from @nodetool-ai/protocol", () => {
    expect(NETWORK_BYPASSING_NODES.has(COMFY_CLOUD_GRAPH_NODE_TYPE)).toBe(true);
  });

  it("lists the network-bypassing and non-terminating nodes in a graph", () => {
    const types = unrunnableNodeTypes({
      nodes: [
        { id: "a", type: "nodetool.triggers.IntervalTrigger" },
        { id: "b", type: "nodetool.text.Concat" },
        { id: "c", type: "openai.agents.RealtimeAgent" }
      ],
      edges: []
    });
    expect(types).toEqual([
      "nodetool.triggers.IntervalTrigger",
      "openai.agents.RealtimeAgent"
    ]);
    expect(NON_TERMINATING_NODES.has(types[0])).toBe(true);
    expect(NETWORK_BYPASSING_NODES.has(types[1])).toBe(true);
  });
});
