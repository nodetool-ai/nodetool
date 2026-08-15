import {
  inferredCodeInputNames,
  inferredCodeOutputNames,
  isCodeNodeType
} from "../codeNodeHandles";

describe("codeNodeHandles", () => {
  it("only infers handles on the Code node type", () => {
    expect(isCodeNodeType("nodetool.code.Code")).toBe(true);
    expect(isCodeNodeType("nodetool.other.Thing")).toBe(false);
    expect(
      inferredCodeInputNames("return { out: inputs.a };", "nodetool.other.Thing")
    ).toEqual([]);
  });

  it("returns input and output names the body already uses", () => {
    const code = "return { sum: inputs.a + inputs.b };";
    expect(inferredCodeInputNames(code, "nodetool.code.Code")).toEqual(
      expect.arrayContaining(["a", "b"])
    );
    expect(inferredCodeOutputNames(code, "nodetool.code.Code")).toEqual(["sum"]);
  });
});
