import {
  collectVariableNames,
  inferVariableTypes,
  readVariableName,
  ANY_TYPE,
  type VariableGraphEdge,
  type VariableGraphNode
} from "../variableGraph";
import type { TypeMetadata } from "../../../../stores/ApiTypes";
import { SET_VARIABLE_NODE_TYPE } from "../../../../constants/nodeTypes";

const typeMeta = (type: string): TypeMetadata => ({
  type,
  optional: false,
  type_args: []
});

const setNode = (id: string, name: string): VariableGraphNode => ({
  id,
  type: SET_VARIABLE_NODE_TYPE,
  data: { properties: { name } }
});

const plain = (
  id: string,
  type = "nodetool.text.ToUppercase"
): VariableGraphNode => ({
  id,
  type,
  data: { properties: {} }
});

describe("readVariableName", () => {
  it("reads and trims the name property", () => {
    expect(readVariableName(setNode("s1", "  topic  "))).toBe("topic");
  });

  it("returns empty string when missing or non-string", () => {
    expect(readVariableName(undefined)).toBe("");
    expect(readVariableName({ id: "x", data: { properties: {} } })).toBe("");
    expect(
      readVariableName({ id: "x", data: { properties: { name: 42 } } })
    ).toBe("");
  });
});

describe("collectVariableNames", () => {
  it("collects names from every Set Variable node, regardless of position", () => {
    const nodes = [setNode("s1", "subject"), plain("p1"), plain("target")];
    expect(collectVariableNames(nodes)).toEqual(["subject"]);
  });

  it("includes variables whether they are upstream or downstream", () => {
    // "target" is a plain node; both setters are present anywhere in the graph.
    const nodes = [
      setNode("s1", "before"),
      plain("target"),
      setNode("s2", "after")
    ];
    expect(collectVariableNames(nodes)).toEqual(["after", "before"]);
  });

  it("de-duplicates and sorts names", () => {
    const nodes = [
      setNode("s1", "zeta"),
      setNode("s2", "zeta"),
      setNode("s3", "alpha")
    ];
    expect(collectVariableNames(nodes)).toEqual(["alpha", "zeta"]);
  });

  it("ignores Set Variable nodes with empty names", () => {
    const nodes = [setNode("s1", "   "), plain("target")];
    expect(collectVariableNames(nodes)).toEqual([]);
  });

  it("ignores non-Set-Variable nodes", () => {
    const nodes = [
      plain("g1", "nodetool.variable.GetVariable"),
      plain("p1"),
      setNode("s1", "subject")
    ];
    expect(collectVariableNames(nodes)).toEqual(["subject"]);
  });

  it("returns an empty list when there are no Set Variable nodes", () => {
    expect(collectVariableNames([plain("a"), plain("b")])).toEqual([]);
  });
});

describe("inferVariableTypes", () => {
  const edge = (
    source: string,
    target: string,
    targetHandle = "value",
    sourceHandle = "output"
  ): VariableGraphEdge => ({ source, target, sourceHandle, targetHandle });

  it("infers a variable's type from the source feeding its value input", () => {
    const nodes = [plain("src"), setNode("s1", "subject")];
    const edges = [edge("src", "s1")];
    const types = inferVariableTypes(nodes, edges, () => typeMeta("image"));
    expect(types.get("subject")).toEqual(typeMeta("image"));
  });

  it("falls back to any when the value input is unconnected", () => {
    const nodes = [setNode("s1", "subject")];
    const types = inferVariableTypes(nodes, [], () => typeMeta("str"));
    expect(types.get("subject")).toEqual(ANY_TYPE);
  });

  it("only resolves from the value input handle", () => {
    const nodes = [plain("src"), setNode("s1", "subject")];
    // Edge targets the trigger handle, not value → no type to infer.
    const edges = [edge("src", "s1", "trigger")];
    const types = inferVariableTypes(nodes, edges, () => typeMeta("str"));
    expect(types.get("subject")).toEqual(ANY_TYPE);
  });

  it("collapses conflicting types for the same name to any", () => {
    const nodes = [
      plain("a"),
      setNode("s1", "x"),
      plain("b"),
      setNode("s2", "x")
    ];
    const edges = [edge("a", "s1"), edge("b", "s2")];
    const types = inferVariableTypes(nodes, edges, (sourceId) =>
      sourceId === "a" ? typeMeta("str") : typeMeta("int")
    );
    expect(types.get("x")).toEqual(ANY_TYPE);
  });

  it("keeps the type when two setters agree", () => {
    const nodes = [plain("a"), setNode("s1", "x"), plain("b"), setNode("s2", "x")];
    const edges = [edge("a", "s1"), edge("b", "s2")];
    const types = inferVariableTypes(nodes, edges, () => typeMeta("str"));
    expect(types.get("x")).toEqual(typeMeta("str"));
  });
});
