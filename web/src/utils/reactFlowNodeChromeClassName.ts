import type { NodeData } from "../stores/NodeData";

/**
 * React Flow attaches `className` to the outer `.react-flow__node` div.
 * Keep chrome flags (`bypassed`, `collapsed`) in sync with `node.data`
 * so global CSS can target handles and layout without `:has(...)`.
 */
export function reactFlowNodeChromeClassName(
  data: Pick<NodeData, "bypassed" | "collapsed">
): string | undefined {
  const parts: string[] = [];
  if (data.bypassed) {
    parts.push("bypassed");
  }
  if (data.collapsed) {
    parts.push("collapsed");
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}
