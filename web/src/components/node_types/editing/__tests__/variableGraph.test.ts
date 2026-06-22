import {
  collectVariableNames,
  readVariableName,
  type VariableGraphNode
} from "../variableGraph";
import { SET_VARIABLE_NODE_TYPE } from "../../../../constants/nodeTypes";

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
