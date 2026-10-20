import { readImportedWorkflow } from "../readImportedWorkflow";

const read = (value: unknown) => readImportedWorkflow(JSON.stringify(value));

describe("readImportedWorkflow", () => {
  it("keeps well-formed fields", () => {
    const graph = { nodes: [], edges: [] };
    expect(
      read({
        name: "Flow",
        description: "d",
        graph,
        tags: ["a", "b"],
        settings: { retries: 2, fast: true, label: "x", none: null },
        run_mode: "workflow",
        html_app: "<p/>"
      })
    ).toEqual({
      name: "Flow",
      description: "d",
      graph,
      tags: ["a", "b"],
      settings: { retries: 2, fast: true, label: "x", none: null },
      run_mode: "workflow",
      html_app: "<p/>"
    });
  });

  it("defaults the name to an empty string", () => {
    expect(read({ name: 5 }).name).toBe("");
  });

  it("drops a graph without node and edge arrays", () => {
    expect(read({ graph: { nodes: [] } }).graph).toBeUndefined();
    expect(read({ graph: "x" }).graph).toBeUndefined();
  });

  it("filters non-string tags and rejects a non-array", () => {
    expect(read({ tags: ["a", 1, null] }).tags).toEqual(["a"]);
    expect(read({ tags: "a" }).tags).toBeUndefined();
  });

  it("drops settings holding nested values or arrays", () => {
    expect(read({ settings: { a: { b: 1 } } }).settings).toBeUndefined();
    expect(read({ settings: [1] }).settings).toBeUndefined();
  });

  it("throws on a non-object file", () => {
    expect(() => readImportedWorkflow("42")).toThrow(
      "Workflow file must contain a JSON object"
    );
  });

  it("throws on invalid JSON", () => {
    expect(() => readImportedWorkflow("{")).toThrow();
  });
});
