import {
  collectUpstreamVariableNames,
  readVariableName,
  type VariableGraphEdge,
  type VariableGraphNode
} from "../variableGraph";
import {
  SET_VARIABLE_NODE_TYPE,
  GET_VARIABLE_NODE_TYPE
} from "../../../../constants/nodeTypes";

const setNode = (id: string, name: string): VariableGraphNode => ({
  id,
  type: SET_VARIABLE_NODE_TYPE,
  data: { properties: { name } }
});

const plain = (id: string, type = "nodetool.text.ToUppercase"): VariableGraphNode => ({
  id,
  type,
  data: { properties: {} }
});

const edge = (source: string, target: string): VariableGraphEdge => ({
  source,
  target
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

describe("collectUpstreamVariableNames", () => {
  it("returns names of Set Variable nodes directly upstream", () => {
    const nodes = [setNode("s1", "subject"), plain("p1"), plain("target")];
    const edges = [edge("s1", "p1"), edge("p1", "target")];
    expect(collectUpstreamVariableNames("target", nodes, edges)).toEqual([
      "subject"
    ]);
  });

  it("does not include Set Variable nodes that are downstream", () => {
    const nodes = [plain("target"), setNode("s1", "subject")];
    const edges = [edge("target", "s1")];
    expect(collectUpstreamVariableNames("target", nodes, edges)).toEqual([]);
  });

  it("collects from multiple, chained Set Variable nodes upstream", () => {
    const nodes = [
      setNode("s1", "alpha"),
      setNode("s2", "beta"),
      plain("mid"),
      plain("target")
    ];
    const edges = [
      edge("s1", "s2"),
      edge("s2", "mid"),
      edge("mid", "target")
    ];
    expect(collectUpstreamVariableNames("target", nodes, edges)).toEqual([
      "alpha",
      "beta"
    ]);
  });

  it("de-duplicates and sorts names", () => {
    const nodes = [
      setNode("s1", "zeta"),
      setNode("s2", "zeta"),
      setNode("s3", "alpha"),
      plain("target")
    ];
    const edges = [
      edge("s1", "target"),
      edge("s2", "target"),
      edge("s3", "target")
    ];
    expect(collectUpstreamVariableNames("target", nodes, edges)).toEqual([
      "alpha",
      "zeta"
    ]);
  });

  it("ignores Set Variable nodes with empty names", () => {
    const nodes = [setNode("s1", "   "), plain("target")];
    const edges = [edge("s1", "target")];
    expect(collectUpstreamVariableNames("target", nodes, edges)).toEqual([]);
  });

  it("handles cycles without infinite looping", () => {
    const nodes = [setNode("s1", "subject"), plain("a"), plain("b")];
    const edges = [
      edge("s1", "a"),
      edge("a", "b"),
      edge("b", "a"),
      edge("b", "target"),
      ...[edge("a", "target")]
    ];
    expect(collectUpstreamVariableNames("target", nodes, edges)).toEqual([
      "subject"
    ]);
  });

  it("treats a Get Variable node as a normal node during traversal", () => {
    const nodes = [
      setNode("s1", "subject"),
      { id: "g1", type: GET_VARIABLE_NODE_TYPE, data: { properties: {} } },
      plain("target")
    ];
    const edges = [edge("s1", "g1"), edge("g1", "target")];
    expect(collectUpstreamVariableNames("target", nodes, edges)).toEqual([
      "subject"
    ]);
  });
});
