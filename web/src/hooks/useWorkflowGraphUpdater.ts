/**
 * Hook that handles workflow graph updates from GlobalChatStore messages
 * This ensures updates happen within the React component lifecycle with proper context access
 */

import { useEffect, useRef } from "react";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import useGlobalChatStore from "../stores/GlobalChatStore";
import { graphNodeToReactFlowNode } from "../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../stores/graphEdgeToReactFlowEdge";
import { Node as GraphNode, Edge as GraphEdge } from "../stores/ApiTypes";

/**
 * Hook that subscribes to workflow graph updates from the GlobalChatStore
 * and applies them to the current workflow using React context
 */
export const useWorkflowGraphUpdater = () => {
  const { getCurrentWorkflow, getNodeStore } = useWorkflowManager((state) => ({
    getCurrentWorkflow: state.getCurrentWorkflow,
    getNodeStore: state.getNodeStore,
  }));

  // Keep track of the last processed update to avoid duplicate processing
  const lastProcessedUpdate = useRef<any>(null);

  useEffect(() => {
    let layoutTimeout: ReturnType<typeof setTimeout> | null = null;
    // Subscribe to the GlobalChatStore for workflow graph updates
    const unsubscribe = useGlobalChatStore.subscribe((state, prevState) => {
      const update = state.lastWorkflowGraphUpdate;
      const prevUpdate = prevState.lastWorkflowGraphUpdate;
      
      // Only process if there's a new update
      if (!update || update === prevUpdate) {return;}
      
      // Check if this is a new update (not the same as last processed)
      if (lastProcessedUpdate.current === update) {return;}
      lastProcessedUpdate.current = update;

      // Get current workflow within the React component context
      const currentWorkflow = getCurrentWorkflow();
      
      if (!currentWorkflow) {
        console.warn("No current workflow found to update");
        return;
      }

      const nodeStore = getNodeStore(currentWorkflow.id);
      
      if (!nodeStore) {
        console.warn(`No node store found for workflow ${currentWorkflow.id}`);
        return;
      }

      try {
        // Convert graph nodes and edges to ReactFlow format
        const reactFlowNodes = (update.graph.nodes || []).map((graphNode: GraphNode) =>
          graphNodeToReactFlowNode(currentWorkflow, graphNode)
        );
        
        const reactFlowEdges = (update.graph.edges || []).map((graphEdge: GraphEdge) =>
          graphEdgeToReactFlowEdge(graphEdge)
        );

        // Update the node store with the new graph
        // These updates will trigger React re-renders properly
        nodeStore.getState().setNodes(reactFlowNodes);
        nodeStore.getState().setEdges(reactFlowEdges);

        layoutTimeout = setTimeout(() => {
          nodeStore.getState().autoLayout();
        }, 100);

        // Mark the workflow as clean since this is an update from the server
        nodeStore.getState().setWorkflowDirty(false);
        
      } catch (error) {
        console.error("Error updating workflow graph:", error);
      }
    });

// Cleanup subscription on unmount
    return () => {
      unsubscribe();
      if (layoutTimeout) {
        clearTimeout(layoutTimeout);
      }
    };
  }, [getCurrentWorkflow, getNodeStore]);
};