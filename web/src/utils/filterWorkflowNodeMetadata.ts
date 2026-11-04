import type { NodeMetadata } from "../stores/ApiTypes";

export type WorkflowExecutionKind = "workflow" | "torch";

export const filterWorkflowNodeMetadata = (
  nodes: readonly NodeMetadata[],
  executionKind: WorkflowExecutionKind
): NodeMetadata[] =>
  nodes.filter(
    (node) =>
      node.node_type.startsWith("nodetool.torch.") ===
      (executionKind === "torch")
  );
