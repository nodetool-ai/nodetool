import { useMemo } from "react";
import { useNodes } from "../contexts/NodeContext";
import { useEdges } from "@xyflow/react";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import useMetadataStore from "../stores/MetadataStore";
import useResultsStore from "../stores/ResultsStore";
import useErrorStore from "../stores/ErrorStore";

/**
 * Information about node connections.
 */
interface NodeConnectionInfo {
  /** Total number of input ports on the node */
  totalInputs: number;
  /** Number of input ports that are connected */
  connectedInputs: number;
  /** Total number of output ports on the node */
  totalOutputs: number;
  /** Number of output ports that are connected */
  connectedOutputs: number;
}

/**
 * Detailed information about a selected node.
 */
interface SelectedNodeInfo {
  /** The node's unique identifier */
  id: string;
  /** The display label for the node */
  label: string;
  /** The node type (e.g., "nodetool.input.TextInput") */
  type: string;
  /** The node's namespace */
  namespace: string;
  /** The node's description from metadata */
  description: string | undefined;
  /** The node's position in the canvas */
  position: { x: number; y: number };
  /** Connection information for the node */
  connections: NodeConnectionInfo;
  /** Whether the node has an error */
  hasError: boolean;
  /** The error message if the node has an error */
  errorMessage: string | undefined;
  /** The execution status of the node */
  executionStatus: "pending" | "running" | "completed" | "error" | undefined;
  /** Timestamp of last execution */
  lastExecutedAt: string | undefined;
}

/**
 * Result interface for the useSelectedNodesInfo hook.
 */
interface UseSelectedNodesInfoReturn {
  /** Array of information about each selected node */
  nodesInfo: SelectedNodeInfo[];
  /** Total number of selected nodes */
  totalSelected: number;
  /** Whether exactly one node is selected */
  hasSingleNode: boolean;
  /** Whether more than one node is selected */
  hasMultipleNodes: boolean;
}

/**
 * Helper function to get the display name for a node.
 * Prefers custom name from properties, then metadata title, then type name.
 */
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
