import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { NodeMetadata } from "../stores/ApiTypes";
import { SEARCH_PROVIDER_TOOL_NAMES } from "./searchProviders";

export interface SearchToolNode {
  nodeId: string;
  nodeTitle: string;
}

/**
 * True when any of the node's tool-list properties selects a search tool that
 * needs a configured search provider. Tool values are stored as
 * `{ type: "tool_name", name }` objects.
 */
const nodeUsesSearchTool = (node: Node<NodeData>): boolean => {
  const properties = node.data?.properties ?? {};
  for (const value of Object.values(properties)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const name = (item as { name?: unknown } | null)?.name;
      if (typeof name === "string" && SEARCH_PROVIDER_TOOL_NAMES.has(name)) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Scan the graph for nodes that run a web-search tool, so we can prompt the
 * user to set up a search provider before a run fails on the server. Skips
 * bypassed nodes (they don't execute).
 */
export const findSearchToolNodes = (
  nodes: Node<NodeData>[],
  getMetadata: (nodeType: string) => NodeMetadata | undefined
): SearchToolNode[] => {
  const result: SearchToolNode[] = [];

  for (const node of nodes) {
    if (node.data?.bypassed) continue;
    if (!nodeUsesSearchTool(node)) continue;

    const metadata = node.type ? getMetadata(node.type) : undefined;
    const title =
      metadata?.title ||
      node.type?.split(".").pop() ||
      node.type ||
      node.id;
    result.push({ nodeId: node.id, nodeTitle: title });
  }

  return result;
};
