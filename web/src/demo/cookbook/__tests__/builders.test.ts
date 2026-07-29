/**
 * @jest-environment node
 */
import {
  cookbookWorkflow,
  fitViewport,
  stringInputMeta,
  imageInputMeta,
  audioInputMeta,
  previewMeta,
  outputMeta,
  textAgentMeta,
  listGeneratorMeta,
  dataGeneratorMeta,
  imageNodeMeta,
  videoNodeMeta,
  audioNodeMeta,
  simpleMeta,
  node,
  edge,
} from "../builders";
import { prop } from "../../castHelpers";

const makeNode = (id: string, x: number, y: number, width = 200) =>
  node(id, "nodetool.test.Node", x, y, width, "Test");

describe("cookbookWorkflow", () => {
  it("returns a Workflow with the given id, name, and description", () => {
    const n = makeNode("n1", 0, 0);
    const wf = cookbookWorkflow("wf-1", "Test", "A test workflow", [n], []);
    expect(wf.id).toBe("wf-1");
    expect(wf.name).toBe("Test");
    expect(wf.description).toBe("A test workflow");
  });

  it("embeds the graph with nodes and edges", () => {
    const n1 = makeNode("n1", 0, 0);
    const n2 = makeNode("n2", 200, 0);
    const e = edge("e1", "n1", "output", "n2", "input");
    const wf = cookbookWorkflow("wf-2", "Graph", "", [n1, n2], [e]);
    expect(wf.graph.nodes).toHaveLength(2);
    expect(wf.graph.edges).toHaveLength(1);
  });

  it("sets default timestamps and access", () => {
    const wf = cookbookWorkflow("wf-3", "N", "D", [], []);
    expect(wf.access).toBe("private");
    expect(wf.created_at).toBeDefined();
    expect(wf.updated_at).toBeDefined();
  });
});

describe("fitViewport", () => {
  it("computes centered viewport for a single node", () => {
    const nodes = [makeNode("n1", 100, 100)];
    const vp = fitViewport(nodes);
    expect(vp.zoom).toBeGreaterThan(0);
    expect(vp.zoom).toBeLessThanOrEqual(1.1);
    expect(typeof vp.x).toBe("number");
    expect(typeof vp.y).toBe("number");
  });

  it("decreases zoom for widely spaced nodes", () => {
    const narrow = [makeNode("n1", 0, 0), makeNode("n2", 300, 0)];
    const wide = [makeNode("n1", 0, 0), makeNode("n2", 5000, 0)];
    const vpNarrow = fitViewport(narrow);
    const vpWide = fitViewport(wide);
    expect(vpWide.zoom).toBeLessThan(vpNarrow.zoom);
  });

  it("zoom never exceeds 1.1", () => {
    const nodes = [makeNode("n1", 0, 0)];
    const vp = fitViewport(nodes);
    expect(vp.zoom).toBeLessThanOrEqual(1.1);
  });

  it("respects custom padding", () => {
    const nodes = [makeNode("n1", 0, 0), makeNode("n2", 1000, 0)];
    const smallPad = fitViewport(nodes, 300, 50);
    const largePad = fitViewport(nodes, 300, 400);
    expect(smallPad.zoom).toBeGreaterThan(largePad.zoom);
  });

  it("zoom is rounded to three decimal places", () => {
    const nodes = [makeNode("n1", 0, 0), makeNode("n2", 1500, 500)];
    const vp = fitViewport(nodes);
    const decimals = vp.zoom.toString().split(".")[1] ?? "";
    expect(decimals.length).toBeLessThanOrEqual(3);
  });
});

describe("metadata factories", () => {
  it("stringInputMeta has correct node_type and outputs", () => {
    const m = stringInputMeta();
    expect(m.node_type).toBe("nodetool.input.StringInput");
    expect(m.title).toBe("String Input");
    expect(m.outputs.length).toBeGreaterThan(0);
    expect(m.outputs[0].name).toBe("output");
  });

  it("imageInputMeta has image output", () => {
    const m = imageInputMeta();
    expect(m.node_type).toBe("nodetool.input.ImageInput");
    expect(m.outputs[0].type.type).toBe("image");
  });

  it("audioInputMeta has audio output", () => {
    const m = audioInputMeta();
    expect(m.node_type).toBe("nodetool.input.AudioInput");
    expect(m.outputs[0].type.type).toBe("audio");
  });

  it("previewMeta uses default title", () => {
    const m = previewMeta();
    expect(m.title).toBe("Preview");
  });

  it("previewMeta accepts custom title", () => {
    const m = previewMeta("My Preview");
    expect(m.title).toBe("My Preview");
  });

  it("outputMeta uses default title", () => {
    const m = outputMeta();
    expect(m.title).toBe("Output");
  });

  it("textAgentMeta sets streaming output", () => {
    const m = textAgentMeta("nodetool.agents.Agent", "Agent");
    expect(m.is_streaming_output).toBe(true);
    expect(m.outputs.some((o) => o.name === "chunk")).toBe(true);
  });

  it("listGeneratorMeta has item and output outputs", () => {
    const m = listGeneratorMeta();
    expect(m.outputs.some((o) => o.name === "item")).toBe(true);
    expect(m.outputs.some((o) => o.name === "output")).toBe(true);
  });

  it("dataGeneratorMeta has record and dataframe outputs", () => {
    const m = dataGeneratorMeta();
    expect(m.outputs.some((o) => o.name === "record")).toBe(true);
    expect(m.outputs.some((o) => o.name === "dataframe")).toBe(true);
  });

  it("imageNodeMeta sets input_fields from properties", () => {
    const m = imageNodeMeta("nodetool.image.Gen", "Image Gen", [
      prop("prompt", "str"),
      prop("seed", "int"),
    ]);
    expect(m.input_fields).toEqual(["prompt", "seed"]);
  });

  it("videoNodeMeta has video output", () => {
    const m = videoNodeMeta("nodetool.video.Gen", "Video Gen");
    expect(m.outputs[0].type.type).toBe("video");
  });

  it("audioNodeMeta has audio and chunk outputs", () => {
    const m = audioNodeMeta("nodetool.audio.TTS", "TTS");
    expect(m.outputs.some((o) => o.name === "audio")).toBe(true);
    expect(m.outputs.some((o) => o.name === "chunk")).toBe(true);
  });

  it("simpleMeta uses defaults when no opts provided", () => {
    const m = simpleMeta("nodetool.text.Upper", "Upper", "str");
    expect(m.node_type).toBe("nodetool.text.Upper");
    expect(m.outputs[0].type.type).toBe("str");
    expect(m.is_streaming_output).toBe(false);
  });

  it("simpleMeta passes streaming option through", () => {
    const m = simpleMeta("nodetool.test.S", "Streamer", "str", {
      streaming: true,
    });
    expect(m.is_streaming_output).toBe(true);
  });
});
