/**
 * useNodeAutoRun hook
 *
 * Triggers automatic workflow execution when node properties change.
 * Only executes the downstream subgraph from the node, similar to "Run from here".
 *
 * Behavior:
 * - When instantUpdate is enabled in settings: triggers for ALL node types
 * - When instantUpdate is disabled: only triggers for input nodes (nodetool.input.*)
 *
 * For slider/number inputs, waits for the user to finish dragging (via onChangeComplete)
 * instead of triggering on every intermediate value.
 */
import { useCallback, useRef, useEffect } from "react";
import { useNodes } from "../../contexts/NodeContext";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { subgraph } from "../../core/graph";
import useResultsStore from "../../stores/ResultsStore";
import { NodeData } from "../../stores/NodeData";
import { Node, Edge } from "@xyflow/react";
import log from "loglevel";
import { resolveExternalEdgeValue } from "../../utils/edgeValue";
import { useSettingsStore } from "../../stores/SettingsStore";

// Debounce delay for non-slider inputs (ms)
const AUTO_RUN_DEBOUNCE_MS = 300;

interface UseNodeAutoRunOptions {
  nodeId: string;
  nodeType: string;
  propertyName: string;
}

interface UseNodeAutoRunReturn {
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
 * Checks if a node type is an input node (nodetool.input.*)
 */
export const isAutoRunInputNode = (nodeType: string): boolean => {
  return nodeType.startsWith("nodetool.input.");
};

/**
 * Checks if auto-run should be enabled for a node based on settings and node type.
 * - If instantUpdate is enabled: returns true for ALL nodes
 * - If instantUpdate is disabled: returns true only for input nodes
 */
const shouldAutoRun = (nodeType: string, instantUpdate: boolean): boolean => {
  if (instantUpdate) {
    return true; // All nodes trigger auto-run when instantUpdate is enabled
  }
  return isAutoRunInputNode(nodeType); // Only input nodes trigger when disabled
};

/**
 * Finds all edges that cross the boundary into a subgraph (from outside to inside).
 * These represent dependencies that need cached values injected.
 */
const findExternalInputEdges = (
  allEdges: Edge[],
  subgraphNodeIds: Set<string>
): Edge[] => {
  return allEdges.filter(
    (edge) =>
      subgraphNodeIds.has(edge.target) && !subgraphNodeIds.has(edge.source)
  );
};

/**
 * Collects cached results from upstream nodes and builds property overrides
 * for all nodes in the subgraph that have external dependencies.
 */
const collectCachedValuesForSubgraph = (
  externalEdges: Edge[],
  workflowId: string,
  getResult: (workflowId: string, nodeId: string) => any,
  findNode: (nodeId: string) => Node<NodeData> | undefined
): Map<string, Record<string, any>> => {
  // Map of nodeId -> { propertyName: value }
  const nodePropertyOverrides = new Map<string, Record<string, any>>();

  for (const edge of externalEdges) {
    const sourceNodeId = edge.source;
    const sourceHandle = edge.sourceHandle;
    const targetNodeId = edge.target;
    const targetHandle = edge.targetHandle;

    if (!targetHandle) {
      continue;
    }

    const { value, hasValue, isFallback } = resolveExternalEdgeValue(
      edge,
      workflowId,
      getResult,
      findNode
    );
    if (!hasValue) {
      continue;
    }

    // Add to the overrides for this target node
    const existing = nodePropertyOverrides.get(targetNodeId) || {};
    existing[targetHandle] = value;
    nodePropertyOverrides.set(targetNodeId, existing);

    log.debug(
      `Auto-run: Caching property ${targetHandle} on node ${targetNodeId} from upstream node ${sourceNodeId}`,
      {
        sourceHandle,
        valueSource: isFallback ? "node" : "cached_result"
      }
    );
  }

  return nodePropertyOverrides;
};

/**
 * Applies property overrides to nodes in the subgraph.
 */
const applyPropertyOverrides = (
  subgraphNodes: Node<NodeData>[],
  propertyOverrides: Map<string, Record<string, any>>
): Node<NodeData>[] => {
  return subgraphNodes.map((node) => {
    const overrides = propertyOverrides.get(node.id);
    if (overrides && Object.keys(overrides).length > 0) {
      const dynamicProps = node.data?.dynamic_properties || {};
      const staticProps = node.data?.properties || {};
      const updatedDynamicProps = { ...dynamicProps };
      const updatedStaticProps = { ...staticProps };

      for (const [key, value] of Object.entries(overrides)) {
        if (Object.prototype.hasOwnProperty.call(dynamicProps, key)) {
          updatedDynamicProps[key] = value;
        } else {
          updatedStaticProps[key] = value;
        }
      }

      return {
        ...node,
        data: {
          ...node.data,
          properties: {
            ...updatedStaticProps
          },
          dynamic_properties: {
            ...updatedDynamicProps
          }
        }
      };
    }
    return node;
  });
};

export const useNodeAutoRun = (
  options: UseNodeAutoRunOptions
): UseNodeAutoRunReturn => {
  const { nodeId, nodeType, propertyName } = options;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nodesState = useNodes((state) => ({
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
  const instantUpdate = useSettingsStore(
    (state) => state.settings.instantUpdate
  );

  // Store the latest nodesState in a ref so debounce can access current state
  const nodesStateRef = useRef(nodesState);
  useEffect(() => {
    nodesStateRef.current = nodesState;
  }, [nodesState]);

  // Store the latest instantUpdate in a ref for debounced callback
  const instantUpdateRef = useRef(instantUpdate);
  useEffect(() => {
    instantUpdateRef.current = instantUpdate;
  }, [instantUpdate]);

  /**
   * Execute the downstream subgraph starting from this node.
   * Performs comprehensive dependency analysis to ensure all nodes in the
   * subgraph have their external dependencies (cached results) injected.
   */
  const executeDownstreamSubgraph = useCallback(() => {
    // Check if auto-run should be enabled based on settings and node type
    if (!shouldAutoRun(nodeType, instantUpdateRef.current)) {
      return;
    }

    const { nodes, edges, workflow, findNode } = nodesStateRef.current;
    const node = findNode(nodeId);
    if (!node || isWorkflowRunning) {
      return;
    }

    // Get the downstream subgraph starting from this node
    const downstream = subgraph(edges, nodes, node as Node<NodeData>);
    const subgraphNodeIds = new Set(downstream.nodes.map((n) => n.id));

    // Find ALL edges that come from outside the subgraph into the subgraph
    // This includes edges to ANY node in the subgraph, not just the start node
    const externalInputEdges = findExternalInputEdges(edges, subgraphNodeIds);

    // Collect cached values for all external dependencies
    const propertyOverrides = collectCachedValuesForSubgraph(
      externalInputEdges,
      workflow.id,
      getResult,
      findNode
    );

    // Apply property overrides to all affected nodes in the subgraph
    const nodesWithCachedValues = applyPropertyOverrides(
      downstream.nodes,
      propertyOverrides
    );

    // Count how many nodes had properties injected
    const nodesWithOverrides = Array.from(propertyOverrides.keys()).length;
    const totalPropertiesInjected = Array.from(
      propertyOverrides.values()
    ).reduce((sum, props) => sum + Object.keys(props).length, 0);

    log.info("Auto-run: Running downstream subgraph", {
      startNodeId: nodeId,
      nodeCount: nodesWithCachedValues.length,
      edgeCount: downstream.edges.length,
      nodesWithCachedDependencies: nodesWithOverrides,
      totalCachedPropertiesInjected: totalPropertiesInjected,
      changedProperty: propertyName,
      instantUpdate: instantUpdateRef.current
    });

    run({}, workflow, nodesWithCachedValues, downstream.edges);
  }, [
    nodeType,
    nodeId,
    isWorkflowRunning,
    getResult,
    run,
    propertyName
  ]);

  /**
   * Called when a property value changes (for non-slider inputs).
   * Debounces to avoid triggering too many runs.
   */
  const onPropertyChange = useCallback(() => {
    // Check if auto-run should be enabled based on settings and node type
    if (!shouldAutoRun(nodeType, instantUpdateRef.current)) {
      return;
    }

    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
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
    // Check if auto-run should be enabled based on settings and node type
    if (!shouldAutoRun(nodeType, instantUpdateRef.current)) {
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

// Export as both the new name and original name for backward compatibility
export const useInputNodeAutoRun = useNodeAutoRun;

export default useNodeAutoRun;
