/**
 * useInputNodeAutoRun hook
 *
 * Triggers automatic workflow execution when input node properties change.
 * Only executes the downstream subgraph from the input node, similar to "Run from here".
 *
 * For slider/number inputs, waits for the user to finish dragging (via onChangeComplete)
 * instead of triggering on every intermediate value.
 */
import { useCallback, useRef } from "react";
import { useNodes } from "../../contexts/NodeContext";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { subgraph } from "../../core/graph";
import useResultsStore from "../../stores/ResultsStore";
import { NodeData } from "../../stores/NodeData";
import { Node } from "@xyflow/react";
import log from "loglevel";

// Debounce delay for non-slider inputs (ms)
const AUTO_RUN_DEBOUNCE_MS = 300;

interface UseInputNodeAutoRunOptions {
  nodeId: string;
  nodeType: string;
  propertyName: string;
}

interface UseInputNodeAutoRunReturn {
  /**
   * Call this when a property value changes.
   * For non-slider inputs, will debounce and trigger auto-run.
   */
  onPropertyChange: () => void;
  /**
   * Call this when a slider/number input finishes changing (on mouseup/blur).
   * Triggers auto-run immediately without additional debounce.
   */
  onPropertyChangeComplete: () => void;
}

/**
 * Checks if a node type is an input node that should trigger auto-run
 */
export const isAutoRunInputNode = (nodeType: string): boolean => {
  return nodeType.startsWith("nodetool.input.");
};

export const useInputNodeAutoRun = (
  options: UseInputNodeAutoRunOptions
): UseInputNodeAutoRunReturn => {
  const { nodeId, nodeType, propertyName } = options;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { nodes, edges, workflow, findNode } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    workflow: state.workflow,
    findNode: state.findNode
  }));

  const run = useWebsocketRunner((state) => state.run);
  const isWorkflowRunning = useWebsocketRunner(
    (state) => state.state === "running"
  );
  const getResult = useResultsStore((state) => state.getResult);

  /**
   * Execute the downstream subgraph starting from this input node.
   * Similar to "Run from here" feature in NodeContextMenu.
   */
  const executeDownstreamSubgraph = useCallback(() => {
    // Only auto-run for input nodes
    if (!isAutoRunInputNode(nodeType)) {
      return;
    }

    const node = findNode(nodeId);
    if (!node || isWorkflowRunning) {
      return;
    }

    // Get the downstream subgraph starting from this node
    const downstream = subgraph(edges, nodes, node as Node<NodeData>);

    // Find incoming edges to the start node that connect from nodes outside the subgraph
    const subgraphNodeIds = new Set(downstream.nodes.map((n) => n.id));
    const incomingEdges = edges.filter(
      (edge) => edge.target === nodeId && !subgraphNodeIds.has(edge.source)
    );

    // Build a map of property values from upstream results
    const propertyOverrides: Record<string, any> = {};
    for (const edge of incomingEdges) {
      const sourceNodeId = edge.source;
      const sourceHandle = edge.sourceHandle; // The output handle name
      const targetHandle = edge.targetHandle; // The property name on the start node

      if (!targetHandle) {
        continue;
      }

      // Get the result from the upstream node
      const result = getResult(workflow.id, sourceNodeId);
      if (result !== undefined) {
        // If the result is an object with multiple outputs, get the specific output
        // Otherwise use the whole result
        const value =
          sourceHandle && typeof result === "object" && result !== null
            ? result[sourceHandle] ?? result
            : result;
        propertyOverrides[targetHandle] = value;
        log.debug(
          `Input node auto-run: Setting property ${targetHandle} from upstream node ${sourceNodeId}`
        );
      }
    }

    // Update the start node's properties with the upstream results
    const startNode = downstream.nodes.find((n) => n.id === nodeId);
    if (startNode && Object.keys(propertyOverrides).length > 0) {
      // Clone the node and update its properties for the run
      const updatedStartNode = {
        ...startNode,
        data: {
          ...startNode.data,
          properties: {
            ...startNode.data.properties,
            ...propertyOverrides
          }
        }
      };
      // Replace the start node in the subgraph with the updated one
      const subgraphNodesWithUpdates = downstream.nodes.map((n) =>
        n.id === nodeId ? updatedStartNode : n
      );

      log.info("Input node auto-run: Running downstream subgraph", {
        startNodeId: nodeId,
        nodeCount: subgraphNodesWithUpdates.length,
        edgeCount: downstream.edges.length,
        propertyCount: Object.keys(propertyOverrides).length,
        changedProperty: propertyName
      });

      run({}, workflow, subgraphNodesWithUpdates, downstream.edges);
    } else {
      log.info("Input node auto-run: Running downstream subgraph", {
        startNodeId: nodeId,
        nodeCount: downstream.nodes.length,
        edgeCount: downstream.edges.length,
        changedProperty: propertyName
      });

      run({}, workflow, downstream.nodes, downstream.edges);
    }
  }, [
    nodeType,
    nodeId,
    findNode,
    isWorkflowRunning,
    edges,
    nodes,
    workflow,
    getResult,
    run,
    propertyName
  ]);

  /**
   * Called when a property value changes (for non-slider inputs).
   * Debounces to avoid triggering too many runs.
   */
  const onPropertyChange = useCallback(() => {
    // Only auto-run for input nodes
    if (!isAutoRunInputNode(nodeType)) {
      return;
    }

    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set a new debounce timer
    debounceTimerRef.current = setTimeout(() => {
      executeDownstreamSubgraph();
    }, AUTO_RUN_DEBOUNCE_MS);
  }, [nodeType, executeDownstreamSubgraph]);

  /**
   * Called when a slider/number input finishes changing (on mouseup/blur).
   * Triggers auto-run immediately without additional debounce.
   */
  const onPropertyChangeComplete = useCallback(() => {
    // Only auto-run for input nodes
    if (!isAutoRunInputNode(nodeType)) {
      return;
    }

    // Clear any existing debounce timer since we're executing immediately
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    executeDownstreamSubgraph();
  }, [nodeType, executeDownstreamSubgraph]);

  return {
    onPropertyChange,
    onPropertyChangeComplete
  };
};

export default useInputNodeAutoRun;
