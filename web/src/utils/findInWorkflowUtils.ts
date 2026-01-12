import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { FindResult, MatchType } from "../stores/FindInWorkflowStore";

export const COMMENT_NODE_TYPE = "nodetool.workflows.base_node.Comment";

export function isCommentNode(node: Node<NodeData>): boolean {
  return node.type === COMMENT_NODE_TYPE;
}

export function getCommentContent(node: Node<NodeData>): string {
  const comment = node.data?.properties?.comment;

  if (typeof comment === "string") {
    return comment;
  }

  if (
    comment &&
    typeof comment === "object" &&
    comment.root &&
    typeof comment.root === "object"
  ) {
    return extractTextFromLexicalState(comment);
  }

  return "";
}

function extractTextFromLexicalState(state: Record<string, unknown>): string {
  const root = state.root;
  if (!root || typeof root !== "object") {
    return "";
  }

  const children = (root as { children?: unknown[] }).children;
  if (!Array.isArray(children)) {
    return "";
  }

  const textParts: string[] = [];

  function extractTextFromChildren(childList: unknown[]): void {
    for (const child of childList) {
      if (child && typeof child === "object") {
        const childObj = child as { text?: string; children?: unknown[]; type?: string };
        if (childObj.text !== undefined) {
          textParts.push(childObj.text);
        }
        if (childObj.children && Array.isArray(childObj.children)) {
          extractTextFromChildren(childObj.children);
        }
      }
    }
  }

  extractTextFromChildren(children);

  return textParts.join(" ");
}

export function getNodeDisplayName(
  node: Node<NodeData>,
  metadataStore: { getMetadata: (type: string) => { title?: string } | undefined }
): string {
  const title = node.data?.properties?.name;
  if (title && typeof title === "string" && title.trim()) {
    return title;
  }
  const nodeType = node.type ?? "";
  const metadata = metadataStore.getMetadata(nodeType);
  if (metadata?.title) {
    return metadata.title;
  }
  return nodeType.split(".").pop() || node.id;
}

export function searchNodes(
  term: string,
  nodeList: Node<NodeData>[],
  getDisplayName: (node: Node<NodeData>) => string
): FindResult[] {
  if (!term.trim()) {
    return [];
  }

  const normalizedTerm = term.toLowerCase().trim();
  const results: FindResult[] = [];

  for (const node of nodeList) {
    const displayName = getDisplayName(node).toLowerCase();
    const nodeType = (node.type ?? "").toLowerCase();
    const nodeId = node.id.toLowerCase();

    let matchType: MatchType | undefined;
    let matchContext: string | undefined;

    if (displayName.includes(normalizedTerm)) {
      matchType = "name";
    } else if (nodeType.includes(normalizedTerm)) {
      matchType = "type";
    } else if (nodeId.includes(normalizedTerm)) {
      matchType = "id";
    } else {
      const commentContent = getCommentContent(node);
      if (commentContent.toLowerCase().includes(normalizedTerm)) {
        matchType = "comment";
        const index = commentContent.toLowerCase().indexOf(normalizedTerm);
        const start = Math.max(0, index - 15);
        const end = Math.min(commentContent.length, index + normalizedTerm.length + 15);
        let context = commentContent.substring(start, end);
        if (start > 0) {
          context = "..." + context;
        }
        if (end < commentContent.length) {
          context = context + "...";
        }
        matchContext = context;
      }
    }

    if (matchType) {
      results.push({ node, matchIndex: results.length, matchType, matchContext });
    }
  }

  return results;
}

export type SearchResult = FindResult;
