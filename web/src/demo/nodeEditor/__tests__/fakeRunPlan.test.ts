import {
  DEMO_NODE_TYPES,
  DEMO_SAMPLES,
  enhanceDraft,
  pickSample,
  planFakeRun,
  topologicalOrder,
  type FakeRunRequest
} from "../fakeRunPlan";
import { createDemoWorkflow } from "../embed/demoWorkflow";

type Message = Record<string, unknown>;

function requestFor(
  nodes: FakeRunRequest["graph"]["nodes"],
  edges: FakeRunRequest["graph"]["edges"]
): FakeRunRequest {
  return { job_id: "job-1", workflow_id: "wf-1", graph: { nodes, edges } };
}

function messages(request: FakeRunRequest): Message[] {
  return planFakeRun(request).map((event) => event.message as Message);
}

function completed(list: Message[], nodeId: string): Message | undefined {
  return list.find(
    (m) => m.type === "node_update" && m.node_id === nodeId && m.status === "completed"
  );
}

describe("pickSample", () => {
  it("picks the sample whose keyword is in the prompt", () => {
    expect(pickSample("Espresso on a wooden table").key).toBe("coffee");
    expect(pickSample("A LIGHTHOUSE at dusk").key).toBe("lighthouse");
  });

  it("gives an unmatched prompt the same sample every time", () => {
    const first = pickSample("a red fox in the snow");
    expect(pickSample("a red fox in the snow")).toBe(first);
    expect(DEMO_SAMPLES).toContain(first);
  });
});

describe("enhanceDraft", () => {
  it("keeps the draft and adds camera words", () => {
    const text = enhanceDraft("a lighthouse at dusk.");
    expect(text.startsWith("A lighthouse at dusk, ")).toBe(true);
    expect(text.endsWith(".")).toBe(true);
  });
});

describe("topologicalOrder", () => {
  it("returns null for a loop", () => {
    const nodes = [
      { id: "a", type: DEMO_NODE_TYPES.preview },
      { id: "b", type: DEMO_NODE_TYPES.preview }
    ];
    const edges = [
      { id: "1", source: "a", sourceHandle: "output", target: "b", targetHandle: "value" },
      { id: "2", source: "b", sourceHandle: "output", target: "a", targetHandle: "value" }
    ];
    expect(topologicalOrder(nodes, edges)).toBeNull();
  });
});

describe("planFakeRun", () => {
  it("runs the demo graph in order and animates the still it made", () => {
    const graph = createDemoWorkflow().graph;
    const events = planFakeRun(requestFor(graph.nodes as never, graph.edges as never));
    const times = events.map((event) => event.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));

    const list = events.map((event) => event.message as Message);
    expect(list[0]).toMatchObject({ type: "job_update", status: "running", job_id: "job-1", workflow_id: "wf-1" });
    expect(list[list.length - 1]).toMatchObject({ type: "job_update", status: "completed" });

    const lighthouse = DEMO_SAMPLES.find((sample) => sample.key === "lighthouse");
    expect(completed(list, "image")?.result).toEqual({ output: { type: "image", uri: lighthouse?.image } });
    expect(completed(list, "video")?.result).toEqual({ output: { type: "video", uri: lighthouse?.video } });

    const order = list
      .filter((m) => m.type === "node_update" && m.status === "running")
      .map((m) => m.node_id);
    expect(order).toEqual(["prompt", "image", "video"]);
  });

  it("streams the enhanced prompt and hands it downstream", () => {
    const list = messages(
      requestFor(
        [
          { id: "in", type: DEMO_NODE_TYPES.stringInput, data: { value: "coffee beans" } },
          { id: "enhance", type: DEMO_NODE_TYPES.enhancePrompt, data: { prompt: "" } },
          { id: "image", type: DEMO_NODE_TYPES.textToImage, data: { prompt: "" } }
        ],
        [
          { id: "e1", source: "in", sourceHandle: "output", target: "enhance", targetHandle: "prompt" },
          { id: "e2", source: "enhance", sourceHandle: "text", target: "image", targetHandle: "prompt" }
        ]
      )
    );
    const chunks = list.filter((m) => m.type === "chunk").map((m) => m.content).join("");
    expect(chunks).toBe(enhanceDraft("coffee beans"));
    const image = completed(list, "image")?.result as { output: { uri: string } } | undefined;
    expect(image?.output.uri).toContain("coffee");
  });

  it("sends output_update only for outputs with no outgoing edge", () => {
    const list = messages(
      requestFor(
        [
          { id: "in", type: DEMO_NODE_TYPES.stringInput, data: { value: "headphones" } },
          { id: "image", type: DEMO_NODE_TYPES.textToImage, data: {} }
        ],
        [{ id: "e1", source: "in", sourceHandle: "output", target: "image", targetHandle: "prompt" }]
      )
    );
    const outputs = list.filter((m) => m.type === "output_update").map((m) => m.node_id);
    expect(outputs).toEqual(["image"]);
  });

  it("fails Image To Video without an image", () => {
    const list = messages(
      requestFor([{ id: "video", type: DEMO_NODE_TYPES.imageToVideo, data: { image: [] } }], [])
    );
    expect(list.some((m) => m.type === "node_update" && m.status === "error")).toBe(true);
    expect(list[list.length - 1]).toMatchObject({ type: "job_update", status: "failed" });
  });

  it("fails a node type the demo does not have", () => {
    const list = messages(requestFor([{ id: "x", type: "nodetool.text.Concat", data: {} }], []));
    expect(list[list.length - 1]).toMatchObject({ type: "job_update", status: "failed" });
  });

  it("fails a graph with a loop", () => {
    const list = messages(
      requestFor(
        [
          { id: "a", type: DEMO_NODE_TYPES.preview },
          { id: "b", type: DEMO_NODE_TYPES.preview }
        ],
        [
          { id: "1", source: "a", sourceHandle: "output", target: "b", targetHandle: "value" },
          { id: "2", source: "b", sourceHandle: "output", target: "a", targetHandle: "value" }
        ]
      )
    );
    expect(list[list.length - 1]).toMatchObject({ type: "job_update", status: "failed" });
  });
});
