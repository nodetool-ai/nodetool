import type { Node, Workflow } from "../../../types/workflow";
import {
  extractVariableNames,
  extractWorkflowIO,
  seedInputValue,
} from "../workflowIO";

const workflow = (nodes: Node[]): Workflow =>
  ({
    id: "wf1",
    name: "Test",
    description: "",
    graph: { nodes, edges: [] },
    access: "private",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });

describe("extractWorkflowIO", () => {
  it("collects input nodes with their kind and metadata", () => {
    const io = extractWorkflowIO(
      workflow([
        {
          id: "n1",
          type: "nodetool.input.StringInput",
          data: { name: "prompt", label: "Prompt", value: "hi" },
        },
        {
          id: "n2",
          type: "nodetool.input.FloatInput",
          data: { name: "strength", min: 0, max: 1 },
        },
      ])
    );

    expect(io.inputs).toEqual([
      expect.objectContaining({
        nodeId: "n1",
        name: "prompt",
        label: "Prompt",
        kind: "string",
        defaultValue: "hi",
      }),
      expect.objectContaining({
        nodeId: "n2",
        name: "strength",
        label: "strength",
        kind: "float",
        min: 0,
        max: 1,
      }),
    ]);
  });

  it("collects output and preview nodes", () => {
    const io = extractWorkflowIO(
      workflow([
        {
          id: "o1",
          type: "nodetool.output.StringOutput",
          data: { name: "result" },
        },
        {
          id: "o2",
          type: "nodetool.workflows.base_node.Preview",
          data: { name: "preview" },
        },
      ])
    );

    expect(io.outputs.map((o) => o.nodeId)).toEqual(["o1", "o2"]);
  });

  it("skips bypassed nodes", () => {
    const io = extractWorkflowIO(
      workflow([
        {
          id: "n1",
          type: "nodetool.input.StringInput",
          data: { name: "prompt" },
          ui_properties: { bypassed: true },
        },
      ])
    );

    expect(io.inputs).toEqual([]);
  });

  it("falls back to the node id when the node has no name", () => {
    const io = extractWorkflowIO(
      workflow([{ id: "n1", type: "nodetool.input.StringInput", data: {} }])
    );

    expect(io.inputs[0]).toMatchObject({ name: "n1", label: "n1" });
  });

  it("returns empty io for a workflow with no graph", () => {
    expect(extractWorkflowIO(undefined)).toEqual({ inputs: [], outputs: [] });
  });
});

describe("extractVariableNames", () => {
  it("collects SetVariable channel names, sorted and deduped", () => {
    const names = extractVariableNames(
      workflow([
        {
          id: "v1",
          type: "nodetool.workflows.base_node.SetVariable",
          data: { name: "theme" },
        },
        {
          id: "v2",
          type: "nodetool.workflows.base_node.SetVariable",
          data: { properties: { name: "count" } },
        },
        {
          id: "v3",
          type: "nodetool.workflows.base_node.SetVariable",
          data: { name: "theme" },
        },
      ])
    );

    expect(names).toEqual(["count", "theme"]);
  });
});

describe("seedInputValue", () => {
  const base = {
    nodeId: "n",
    nodeType: "t",
    name: "n",
    label: "n",
  };

  it("prefers the node's saved default", () => {
    expect(
      seedInputValue({ ...base, kind: "string", defaultValue: "hello" })
    ).toBe("hello");
  });

  it("falls back to the value the control displays", () => {
    expect(seedInputValue({ ...base, kind: "boolean" })).toBe(false);
    expect(seedInputValue({ ...base, kind: "integer", min: 5 })).toBe(5);
    expect(seedInputValue({ ...base, kind: "float" })).toBe(0);
    expect(
      seedInputValue({ ...base, kind: "select", options: ["a", "b"] })
    ).toBe("a");
  });

  it("leaves a free-text input unseeded", () => {
    expect(seedInputValue({ ...base, kind: "string" })).toBeUndefined();
  });
});
