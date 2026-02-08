import { useMemo } from "react";
import { useNodes } from "../contexts/NodeContext";
import { useEdges } from "@xyflow/react";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import useMetadataStore from "../stores/MetadataStore";
import { NodeMetadata } from "../stores/ApiTypes";
import useResultsStore from "../stores/ResultsStore";
import useErrorStore from "../stores/ErrorStore";
import { shallow } from "zustand/shallow";

interface NodeConnectionInfo {
  totalInputs: number;
  connectedInputs: number;
  totalOutputs: number;
  connectedOutputs: number;
}

interface SelectedNodeInfo {
  id: string;
  label: string;
  type: string;
  namespace: string;
  description: string | undefined;
  position: { x: number; y: number };
  connections: NodeConnectionInfo;
  hasError: boolean;
  errorMessage: string | undefined;
  executionStatus: "pending" | "running" | "completed" | "error" | undefined;
  lastExecutedAt: string | undefined;
}

interface UseSelectedNodesInfoReturn {
  nodesInfo: SelectedNodeInfo[];
  totalSelected: number;
  hasSingleNode: boolean;
  hasMultipleNodes: boolean;
}

/**
 * Custom hook for gathering information about selected nodes.
 * 
 * Provides detailed information for each selected node including type,
 * connections, execution status, and error state. Used by the Node
 * Info Panel to display node details.
 * 
 * @returns Object containing node info arrays and selection state
 * 
 * @example
 * ```typescript
 * const { nodesInfo, totalSelected, hasSingleNode } = useSelectedNodesInfo();
 * ```
 */
const getNodeDisplayName = (
  node: Node<NodeData>,
  getMetadata: (nodeType: string) => NodeMetadata | undefined
): string => {
  const title = node.data?.properties?.name;
  if (title && typeof title === "string" && title.trim()) {
    return title;
  }
  const nodeType = node.type ?? "";
  const metadata = getMetadata(nodeType);
  if (metadata?.title) {
    return metadata.title;
  }
  return nodeType.split(".").pop() || node.id;
};

export const useSelectedNodesInfo = (): UseSelectedNodesInfoReturn => {
  const selectedNodes = useNodes((state) => state.getSelectedNodes());
  const edges = useEdges();
  // Subscribe to getMetadata method only - this is a stable reference
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const currentWorkflowId = useNodes((state) => state.workflow?.id ?? "");

  // Subscribe to entire results/errors but filter in useMemo
  // This is acceptable because the useMemo will prevent re-computation
  // when irrelevant results/errors change
  const results = useResultsStore((state) => state.results);
  const errors = useErrorStore((state) => state.errors);

  const nodesInfo = useMemo(() => {
    return selectedNodes.map((node) => {
      const nodeType = node.type ?? "";
      const metadata = getMetadata(nodeType);
      const nodeEdges = edges.filter(
        (edge: { source: string; target: string }) =>
          edge.source === node.id || edge.target === node.id
      );

      const connectedInputs = nodeEdges.filter(
        (edge: { target: string }) => edge.target === node.id
      ).length;
      const connectedOutputs = nodeEdges.filter(
        (edge: { source: string }) => edge.source === node.id
      ).length;

      const totalInputs = metadata?.properties?.length ?? 0;
      const totalOutputs = metadata?.outputs?.length ?? 0;

      const nodeResult = results[node.id];
      const errorKey = currentWorkflowId ? `${currentWorkflowId}:${node.id}` : "";
      const nodeError = errorKey ? errors[errorKey] : undefined;

      let executionStatus: "pending" | "running" | "completed" | "error" | undefined;
      if (nodeResult) {
        executionStatus = "completed";
      } else if (nodeError) {
        executionStatus = "error";
      } else {
        executionStatus = undefined;
      }

      return {
        id: node.id,
        label: getNodeDisplayName(node, getMetadata),
        type: node.type ?? "unknown",
        namespace: metadata?.namespace ?? node.type ?? "",
        description: metadata?.description,
        position: node.position,
        connections: {
          totalInputs,
          connectedInputs,
          totalOutputs,
          connectedOutputs
        },
        hasError: !!nodeError,
        errorMessage: typeof nodeError === 'string' ? nodeError : nodeError && 'message' in nodeError ? String(nodeError.message) : undefined,
        executionStatus,
        lastExecutedAt: typeof nodeResult === "object" && nodeResult !== null ? (nodeResult as { timestamp?: string }).timestamp : undefined
      };
    });
  }, [selectedNodes, edges, getMetadata, results, errors, currentWorkflowId]);

  return {
    nodesInfo,
    totalSelected: selectedNodes.length,
    hasSingleNode: selectedNodes.length === 1,
    hasMultipleNodes: selectedNodes.length > 1
  };
};

export default useSelectedNodesInfo;
