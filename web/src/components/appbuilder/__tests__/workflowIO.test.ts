import { extractWorkflowIO } from "../workflowIO";
import { Workflow } from "../../../stores/ApiTypes";

const makeWorkflow = (nodes: unknown[]): Workflow =>
  ({
    id: "wf1",
    name: "Test",
    access: "private",
    graph: { nodes, edges: [] }
  }) as unknown as Workflow;

describe("extractWorkflowIO", () => {
  it("returns empty IO for a workflow with no graph", () => {
    expect(extractWorkflowIO(undefined)).toEqual({ inputs: [], outputs: [] });
  });

  it("extracts input nodes keyed by name with defaults and ranges", () => {
    const io = extractWorkflowIO(
      makeWorkflow([
        {
          id: "n1",
          type: "nodetool.input.StringInput",
          data: { name: "prompt", label: "Prompt", value: "hi" }
        },
        {
          id: "n2",
          type: "nodetool.input.IntegerInput",
          data: { name: "count", min: 1, max: 10, value: 3 }
        }
      ])
    );
    expect(io.inputs).toHaveLength(2);
    const prompt = io.inputs.find((i) => i.name === "prompt");
    expect(prompt?.kind).toBe("string");
    expect(prompt?.defaultValue).toBe("hi");
    const count = io.inputs.find((i) => i.name === "count");
    expect(count?.min).toBe(1);
    expect(count?.max).toBe(10);
  });

  it("extracts output nodes", () => {
    const io = extractWorkflowIO(
      makeWorkflow([
        {
          id: "o1",
          type: "nodetool.output.StringOutput",
          data: { name: "result" }
        }
      ])
    );
    expect(io.outputs).toHaveLength(1);
    expect(io.outputs[0].name).toBe("result");
  });

  it("skips bypassed nodes", () => {
    const io = extractWorkflowIO(
      makeWorkflow([
        {
          id: "n1",
          type: "nodetool.input.StringInput",
          data: { name: "prompt" },
          ui_properties: { bypassed: true }
        }
      ])
    );
    expect(io.inputs).toHaveLength(0);
  });

  it("falls back to the node id when name is missing", () => {
    const io = extractWorkflowIO(
      makeWorkflow([
        { id: "n1", type: "nodetool.input.StringInput", data: {} }
      ])
    );
    expect(io.inputs[0].name).toBe("n1");
  });
});
