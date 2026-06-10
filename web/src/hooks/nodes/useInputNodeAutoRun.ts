/**
 * useNodeAutoRun hook
 *
 * Triggers automatic workflow execution when node properties change.
 * Only executes the downstream subgraph from the node, similar to "Run from here".
 *
 * Behavior:
 * - When instantUpdate is enabled in settings: triggers for ALL node types
 * - When instantUpdate is disabled: NO nodes trigger auto-run (graph execution only on manual run)
 *
 * For slider/number inputs, waits for the user to finish dragging (via onChangeComplete)
 * instead of triggering on every intermediate value.
 */
import { useCallback, useRef, useEffect } from "react";
import { useNodeStoreRef } from "../../contexts/NodeContext";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { useSettingsStore } from "../../stores/SettingsStore";
import { buildDownstreamRunGraph } from "./buildDownstreamRunGraph";

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
 * Checks if auto-run should be enabled for a node based on settings and node type.
 * - If instantUpdate is enabled: returns true for ALL nodes
 * - If instantUpdate is disabled: returns false (no auto-run)
 */
const shouldAutoRun = (nodeType: string, instantUpdate: boolean): boolean => {
  if (instantUpdate) {
    return true; // All nodes trigger auto-run when instantUpdate is enabled
  }
  return false; // No auto-run when instantUpdate is disabled
};


export const useNodeAutoRun = (
  options: UseNodeAutoRunOptions
): UseNodeAutoRunReturn => {
  const { nodeId, nodeType, propertyName } = options;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get store reference without subscribing to state changes
  const nodeStore = useNodeStoreRef();
  const run = useWebsocketRunner((state) => state.run);
  const isWorkflowRunning = useWebsocketRunner(
    (state) => state.state === "running"
  );
  const instantUpdate = useSettingsStore(
    (state) => state.settings.instantUpdate
  );

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

    // Get current state without subscribing - avoids re-renders during drag
    const { nodes, edges, workflow, findNode } = nodeStore.getState();
    const node = findNode(nodeId);
    if (!node || isWorkflowRunning) {
      return;
    }

    // Downstream subgraph with each external upstream's cached result injected.
    const built = buildDownstreamRunGraph({
      nodeId,
      nodes,
      edges,
      workflowId: workflow.id,
      findNode
    });
    if (!built) {
      return;
    }

    console.info("Auto-run: Running downstream subgraph", {
      startNodeId: nodeId,
      nodeCount: built.nodes.length,
      edgeCount: built.edges.length,
      nodesWithCachedDependencies: built.nodesWithOverrides,
      totalCachedPropertiesInjected: built.totalPropertiesInjected,
      changedProperty: propertyName,
      instantUpdate: instantUpdateRef.current
    });

    run({}, workflow, built.nodes, built.edges);
    // Generation accessors read from stores at call time, no need to include in deps
  }, [
    nodeType,
    nodeId,
    nodeStore,
    isWorkflowRunning,
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
