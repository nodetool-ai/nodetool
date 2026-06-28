import { findSearchToolNodes, nodeUsesSearchTool } from "../findSearchToolNodes";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { NodeMetadata } from "../../stores/ApiTypes";

const makeNode = (
  id: string,
  type: string,
  properties: Record<string, unknown>,
  extra: Partial<NodeData> = {}
): Node<NodeData> =>
  ({
    id,
    type,
    position: { x: 0, y: 0 },
    data: { properties, ...extra } as NodeData
  }) as Node<NodeData>;

const meta =
  (title: string) =>
  (nodeType: string): NodeMetadata | undefined =>
    ({ title: nodeType === "nodetool.agents.Agent" ? title : nodeType }) as NodeMetadata;

const tool = (name: string) => ({ type: "tool_name", name });

describe("nodeUsesSearchTool", () => {
  it("detects google_search in a tools list", () => {
    const node = makeNode("n1", "nodetool.agents.Agent", {
      tools: [tool("read_file"), tool("google_search")]
    });
    expect(nodeUsesSearchTool(node)).toBe(true);
  });

  it("detects google_news and google_images", () => {
    expect(
      nodeUsesSearchTool(
        makeNode("n1", "x", { tools: [tool("google_news")] })
      )
    ).toBe(true);
    expect(
      nodeUsesSearchTool(
        makeNode("n2", "x", { tools: [tool("google_images")] })
      )
    ).toBe(true);
  });

  it("ignores non-search tools (browser, sandbox, file tools)", () => {
    const node = makeNode("n1", "nodetool.agents.Agent", {
      tools: [tool("browser_navigate"), tool("write_file"), tool("sandbox_shell_exec")]
    });
    expect(nodeUsesSearchTool(node)).toBe(false);
  });

  it("ignores nodes without tool lists", () => {
    expect(nodeUsesSearchTool(makeNode("n1", "x", { prompt: "hi" }))).toBe(false);
    expect(nodeUsesSearchTool(makeNode("n2", "x", {}))).toBe(false);
  });
});

describe("findSearchToolNodes", () => {
  it("returns nodes that use a search tool, with their display title", () => {
    const nodes = [
      makeNode("n1", "nodetool.agents.Agent", { tools: [tool("google_search")] }),
      makeNode("n2", "nodetool.text.Concat", { a: "x" })
    ];
    expect(findSearchToolNodes(nodes, meta("Agent"))).toEqual([
      { nodeId: "n1", nodeTitle: "Agent" }
    ]);
  });

  it("skips bypassed nodes", () => {
    const nodes = [
      makeNode(
        "n1",
        "nodetool.agents.Agent",
        { tools: [tool("google_search")] },
        { bypassed: true }
      )
    ];
    expect(findSearchToolNodes(nodes, meta("Agent"))).toEqual([]);
  });

  it("returns an empty array when no node searches", () => {
    const nodes = [makeNode("n1", "x", { tools: [tool("browser_navigate")] })];
    expect(findSearchToolNodes(nodes, meta("Agent"))).toEqual([]);
  });
});
