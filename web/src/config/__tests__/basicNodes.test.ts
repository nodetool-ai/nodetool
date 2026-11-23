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

  it("matches a Chinese search written without spaces", () => {
    expect(labels("文本")).toEqual(["Text", "Generate text"]);
    expect(labels("图像")).toEqual(["Generate image", "Edit image"]);
    expect(labels("生成图片")).toEqual(["Generate image"]);
    expect(labels("生成图")).toEqual(["Generate image"]);
    expect(labels("编辑视频")).toEqual(["Edit video"]);
    expect(labels("生成")).toEqual([
      "Generate text",
      "Generate image",
      "Generate video"
    ]);
  });

  it("pins nothing for a Chinese search no keyword covers", () => {
    expect(labels("放大图片")).toEqual([]);
    expect(labels("图")).toEqual([]);
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
