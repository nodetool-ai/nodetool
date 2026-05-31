import { isNodetoolWorkflowJson } from "../dropHandlerUtils";

describe("isNodetoolWorkflowJson", () => {
  it("returns true for valid NodeTool workflow", () => {
    const workflow = {
      name: "My Workflow",
      graph: {
        nodes: [{ id: "n1" }],
        edges: [{ source: "n1", target: "n2" }]
      }
    };
    expect(isNodetoolWorkflowJson(workflow)).toBe(true);
  });

  it("returns true without name field", () => {
    const workflow = {
      graph: {
        nodes: [],
        edges: []
      }
    };
    expect(isNodetoolWorkflowJson(workflow)).toBe(true);
  });

  it("returns false when graph is missing", () => {
    expect(isNodetoolWorkflowJson({ name: "test" })).toBe(false);
  });

  it("returns false when graph.nodes is not an array", () => {
    expect(
      isNodetoolWorkflowJson({
        graph: { nodes: "not-array", edges: [] }
      })
    ).toBe(false);
  });

  it("returns false when graph.edges is not an array", () => {
    expect(
      isNodetoolWorkflowJson({
        graph: { nodes: [], edges: "not-array" }
      })
    ).toBe(false);
  });

  it("returns false for null", () => {
    expect(isNodetoolWorkflowJson(null)).toBe(false);
  });

  it("returns false for a primitive", () => {
    expect(isNodetoolWorkflowJson(42)).toBe(false);
  });
});
