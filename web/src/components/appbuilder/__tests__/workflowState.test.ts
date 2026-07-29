import { extractVariableNames, extractWorkflowState } from "../workflowState";
import { Workflow } from "../../../stores/ApiTypes";

const makeWorkflow = (nodes: unknown[]): Workflow =>
  ({
    id: "wf1",
    name: "Test",
    access: "private",
    graph: { nodes, edges: [] }
  }) as unknown as Workflow;

describe("workflowState", () => {
  it("extracts variable names from SetVariable nodes (flat shape)", () => {
    const names = extractVariableNames(
      makeWorkflow([
        { id: "v1", type: "nodetool.variable.SetVariable", data: { name: "count" } },
        { id: "v2", type: "nodetool.variable.SetVariable", data: { name: "open" } },
        { id: "x", type: "nodetool.input.StringInput", data: { name: "prompt" } }
      ])
    );
    expect(names).toEqual(["count", "open"]);
  });

  it("reads the nested editor shape (data.properties.name)", () => {
    const names = extractVariableNames(
      makeWorkflow([
        {
          id: "v1",
          type: "nodetool.variable.SetVariable",
          data: { properties: { name: "theme" } }
        }
      ])
    );
    expect(names).toEqual(["theme"]);
  });

  it("dedupes and sorts variable names", () => {
    const names = extractVariableNames(
      makeWorkflow([
        { id: "v1", type: "nodetool.variable.SetVariable", data: { name: "b" } },
        { id: "v2", type: "nodetool.variable.SetVariable", data: { name: "a" } },
        { id: "v3", type: "nodetool.variable.SetVariable", data: { name: "a" } }
      ])
    );
    expect(names).toEqual(["a", "b"]);
  });

  it("combines inputs, outputs, and variables", () => {
    const state = extractWorkflowState(
      makeWorkflow([
        { id: "i1", type: "nodetool.input.StringInput", data: { name: "prompt" } },
        { id: "o1", type: "nodetool.output.StringOutput", data: { name: "result" } },
        { id: "v1", type: "nodetool.variable.SetVariable", data: { name: "count" } }
      ])
    );
    expect(state.inputs.map((i) => i.name)).toEqual(["prompt"]);
    expect(state.outputs.map((o) => o.name)).toEqual(["result"]);
    expect(state.variables).toEqual(["count"]);
  });
});
