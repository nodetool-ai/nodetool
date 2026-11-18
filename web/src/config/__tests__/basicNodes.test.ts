import { BASIC_NODES, matchBasicNodes } from "../basicNodes";
import { QUICK_ACTION_NODE_TYPES } from "../quickActionNodeTypes";

const labels = (query: string): string[] =>
  matchBasicNodes(query).map((basic) => basic.label);

describe("matchBasicNodes", () => {
  it("names the plain Text node first for a search for text", () => {
    expect(labels("text")).toEqual(["Text", "Generate text"]);
  });

  it("matches every word of the query", () => {
    expect(labels("edit image")).toEqual(["Edit image"]);
    expect(labels("generate video")).toEqual(["Generate video"]);
    expect(labels("video")).toEqual(["Generate video", "Edit video"]);
  });

  it("matches word forms and prefixes", () => {
    expect(labels("video editing")).toEqual(["Edit video"]);
    expect(labels("images")).toEqual(["Generate image", "Edit image"]);
    expect(labels("gen")).toEqual([
      "Generate text",
      "Generate image",
      "Generate video"
    ]);
  });

  it("pins nothing for specialized or one-letter searches", () => {
    expect(labels("upscale")).toEqual([]);
    expect(labels("agent")).toEqual([]);
    expect(labels("t")).toEqual([]);
    expect(labels("text t")).toEqual([]);
    expect(labels("   ")).toEqual([]);
  });

  it("binds every basic to a curated node type", () => {
    for (const basic of BASIC_NODES) {
      expect(QUICK_ACTION_NODE_TYPES).toContain(basic.nodeType);
    }
  });
});
