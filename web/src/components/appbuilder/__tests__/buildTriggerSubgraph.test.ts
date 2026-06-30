/**
 * buildTriggerSubgraph turns a trigger input into the minimal browser-runnable
 * downstream subgraph, with live UI values injected onto input nodes.
 */
import { buildTriggerSubgraph } from "../runtime/buildTriggerSubgraph";
import { WorkflowIO } from "../workflowIO";

// browserSupportsSync needs the registry loaded; stub it so the prefix logic is
// driven by the test, not by whether the browser runner warmed up.
jest.mock("../../../lib/workflow/browserWorkflowRunner", () => ({
  browserSupportsSync: () => browserSupports
}));

let browserSupports: boolean | undefined = true;

const makeWorkflow = () =>
  ({
    id: "wf1",
    graph: {
      nodes: [
        { id: "hue", type: "nodetool.input.FloatInput", data: { name: "hue", value: 0 }, ui_properties: {} },
        { id: "img", type: "nodetool.input.ImageInput", data: { name: "image", value: { type: "image", uri: "data:img" } }, ui_properties: {} },
        { id: "grade", type: "nodetool.fake.ColorGrade", data: {}, ui_properties: {} },
        { id: "preview", type: "nodetool.workflows.base_node.Preview", data: {}, ui_properties: {} }
      ],
      edges: [
        { id: "e1", source: "hue", sourceHandle: "output", target: "grade", targetHandle: "hue" },
        { id: "e2", source: "img", sourceHandle: "output", target: "grade", targetHandle: "image" },
        { id: "e3", source: "grade", sourceHandle: "output", target: "preview", targetHandle: "value" }
      ]
    }
  }) as never;

const io: WorkflowIO = {
  inputs: [
    { nodeId: "hue", nodeType: "nodetool.input.FloatInput", name: "hue", label: "hue", kind: "float" },
    { nodeId: "img", nodeType: "nodetool.input.ImageInput", name: "image", label: "image", kind: "image" }
  ],
  outputs: [
    { nodeId: "preview", nodeType: "nodetool.workflows.base_node.Preview", name: "preview", label: "preview" }
  ]
};

beforeEach(() => {
  browserSupports = true;
});

describe("buildTriggerSubgraph", () => {
  it("returns the downstream closure of the trigger input, excluding sibling upstreams", () => {
    const sub = buildTriggerSubgraph(makeWorkflow(), io, { hue: 42 }, "hue");
    expect(sub).not.toBeNull();
    const ids = sub!.nodeIds;
    expect(ids.has("hue")).toBe(true);
    expect(ids.has("grade")).toBe(true);
    expect(ids.has("preview")).toBe(true);
    // The image input feeds grade but is upstream of the slider, not downstream.
    expect(ids.has("img")).toBe(false);
    expect(sub!.graph.nodes).toHaveLength(3);
  });

  it("injects the live UI value onto the trigger input node", () => {
    const sub = buildTriggerSubgraph(makeWorkflow(), io, { hue: 42 }, "hue");
    const hueNode = sub!.graph.nodes.find((n) => n.id === "hue");
    expect((hueNode?.data as Record<string, unknown>)?.value).toBe(42);
  });

  it("returns null for an unknown trigger input", () => {
    expect(buildTriggerSubgraph(makeWorkflow(), io, {}, "nope")).toBeNull();
  });

  it("returns null when nothing downstream runs in the browser", () => {
    browserSupports = undefined;
    expect(buildTriggerSubgraph(makeWorkflow(), io, { hue: 42 }, "hue")).toBeNull();
  });

  it("returns null when the browser prefix reaches no output node", () => {
    // Server-only compute (no output node browser-eligible) should fall back to
    // a full run rather than running a trivial input-only subgraph.
    const ioNoOutputs = { ...io, outputs: [] };
    expect(buildTriggerSubgraph(makeWorkflow(), ioNoOutputs, { hue: 42 }, "hue")).toBeNull();
  });
});
