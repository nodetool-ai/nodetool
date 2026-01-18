import { useMemo } from "react";
import { useNodes } from "../contexts/NodeContext";
import { useEdges } from "@xyflow/react";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import useMetadataStore from "../stores/MetadataStore";
import useResultsStore from "../stores/ResultsStore";
import useErrorStore from "../stores/ErrorStore";

/**
 * Hook to gather detailed information about currently selected nodes.
 * 
 * Provides metadata, connection status, execution state, and error information
 * for all selected nodes. Used by the Node Info Panel to display node details.
 * 
 * @returns Object containing nodes info array and selection state helpers
 * 
 * @example
 * ```typescript
 * const { nodesInfo, totalSelected, hasSingleNode } = useSelectedNodesInfo();
 * 
 * nodesInfo.forEach(node => {
 *   console.log(`${node.label}: ${node.type}`);
 *   console.log(`Connections: ${node.connections.connectedInputs}/${node.connections.totalInputs} inputs`);
 * });
 * ```
 */
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

const getNodeDisplayName = (
  node: Node<NodeData>,
  metadataStore: ReturnType<typeof useMetadataStore.getState>
): string => {
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
};

export const useSelectedNodesInfo = (): UseSelectedNodesInfoReturn => {
  const selectedNodes = useNodes((state) => state.getSelectedNodes());
  const edges = useEdges();
  const metadataStore = useMetadataStore();
  const results = useResultsStore((state) => state.results);
  const errors = useErrorStore((state) => state.errors);
  const currentWorkflowId = useNodes((state) => state.workflow?.id ?? "");

  const nodesInfo = useMemo(() => {
    return selectedNodes.map((node) => {
      const nodeType = node.type ?? "";
      const metadata = metadataStore.getMetadata(nodeType);
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
        label: getNodeDisplayName(node, metadataStore),
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
  }, [selectedNodes, edges, metadataStore, results, errors, currentWorkflowId]);

  return {
    nodesInfo,
    totalSelected: selectedNodes.length,
    hasSingleNode: selectedNodes.length === 1,
    hasMultipleNodes: selectedNodes.length > 1
  };
};

export default useSelectedNodesInfo;
