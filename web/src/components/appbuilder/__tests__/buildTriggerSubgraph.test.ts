/**
 * buildTriggerSubgraph turns a trigger input into the minimal browser-runnable
 * downstream subgraph, with live UI values injected onto input nodes.
 */
import type { AppInstanceState, BindingRef } from "@nodetool-ai/app-runtime";

import { buildTriggerSubgraph } from "../runtime/buildTriggerSubgraph";
import type { AppRuntimeState } from "../runtime/appRuntimeStore";
import { WorkflowIO } from "../workflowIO";
import { stub } from "../../../test-utils/doubles";

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

const HUE_TRIGGER: BindingRef = {
  kind: "input",
  operationId: "main",
  nodeId: "hue"
};

/** State with the slider at 42, in the runtime's namespaced input slots. */
const stateWith = (values: Record<string, unknown> = {}): AppRuntimeState =>
  stub<AppRuntimeState>({
    inputs: Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        { value, dirty: true, revision: 1 }
      ])
    ),
    outputs: {},
    variables: {},
    view: {},
    invocations: {},
    activeInvocation: {},
    activity: {},
    variableWriters: {},
    dispatchEvent: () => {}
  });

// Every node in the fixture is pure, so the reactive effect gate lets the
// subgraph run; the gate itself is covered by its own case below.
const allPure = () => "pure";

beforeEach(() => {
  browserSupports = true;
});

describe("buildTriggerSubgraph", () => {
  it("returns the downstream closure of the trigger input, excluding sibling upstreams", () => {
    const sub = buildTriggerSubgraph(makeWorkflow(), io, stateWith({ "main:hue": 42 }), HUE_TRIGGER, allPure);
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
    const sub = buildTriggerSubgraph(makeWorkflow(), io, stateWith({ "main:hue": 42 }), HUE_TRIGGER, allPure);
    const hueNode = sub!.graph.nodes.find((n) => n.id === "hue");
    expect((hueNode?.data as Record<string, unknown>)?.value).toBe(42);
  });

  it("returns null for a trigger that addresses no graph node", () => {
    expect(buildTriggerSubgraph(makeWorkflow(), io, stateWith(), {
      kind: "variable",
      variableId: "nope"
    }, allPure)).toBeNull();
  });

  it("returns null when nothing downstream runs in the browser", () => {
    browserSupports = undefined;
    expect(buildTriggerSubgraph(makeWorkflow(), io, stateWith({ "main:hue": 42 }), HUE_TRIGGER, allPure)).toBeNull();
  });

  it("returns null when the browser prefix reaches no output node", () => {
    // Server-only compute (no output node browser-eligible) should fall back to
    // a full run rather than running a trivial input-only subgraph.
    const ioNoOutputs = { ...io, outputs: [] };
    expect(buildTriggerSubgraph(
        makeWorkflow(),
        ioNoOutputs,
        stateWith({ "main:hue": 42 }),
        HUE_TRIGGER,
        allPure
      )).toBeNull();
  });

  it("refuses to run a node that is not pure or read", () => {
    // A slider must not resend an email: anything effectful falls back to an
    // explicit full run.
    expect(
      buildTriggerSubgraph(
        makeWorkflow(),
        io,
        stateWith({ "main:hue": 42 }),
        HUE_TRIGGER,
        (type) => (type === "nodetool.fake.ColorGrade" ? "external" : "pure")
      )
    ).toBeNull();
  });

  it("treats unclassified nodes as effectful", () => {
    expect(
      buildTriggerSubgraph(
        makeWorkflow(),
        io,
        stateWith({ "main:hue": 42 }),
        HUE_TRIGGER,
        () => undefined
      )
    ).toBeNull();
  });
});
