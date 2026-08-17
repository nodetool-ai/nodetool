import { useCallback } from "react";

import { useWorkflowManagerStore } from "../../contexts/WorkflowManagerContext";
import { useSubgraphTabsStore } from "../../stores/SubgraphTabsStore";
import useMetadataStore from "../../stores/MetadataStore";
import { SUBGRAPH_NODE_TYPE } from "../../constants/nodeTypes";

export interface SubgraphNodeData {
  title?: string;
  properties?: { graph?: { nodes?: unknown[]; edges?: unknown[] } };
}

/**
 * Opens a SubgraphNode's inner graph in its own editor tab.
 *
 * Both entry points call this: the "Open" button on the node body and the
 * canvas double-click in ReactFlowWrapper.
 */
export const useOpenSubgraph = (): ((
  workflowId: string,
  nodeId: string,
  data: SubgraphNodeData
) => void) => {
  const workflowManagerStore = useWorkflowManagerStore();
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  return useCallback(
    (workflowId: string, nodeId: string, data: SubgraphNodeData) => {
      const innerGraph = data.properties?.graph ?? { nodes: [], edges: [] };
      const key = useSubgraphTabsStore.getState().openTab({
        workflowId,
        nodeId,
        // Same fallback chain as the node's own header, so the tab is labelled
        // with what the user sees on the canvas.
        label:
          data.title || getMetadata(SUBGRAPH_NODE_TYPE)?.title || "Subgraph",
        initialGraph: {
          nodes: Array.isArray(innerGraph.nodes) ? innerGraph.nodes : [],
          edges: Array.isArray(innerGraph.edges) ? innerGraph.edges : []
        }
      });
      const tab = useSubgraphTabsStore.getState().getTab(key);
      if (tab) {
        // Register the subgraph store synchronously so the upcoming
        // SubgraphTabContent → ReactFlowWrapper render sees
        // workflowExistsLocally === true and skips the 404 fetch for the
        // synthetic id. SubgraphTabContent's useEffect also re-registers
        // (idempotent) to survive StrictMode double-mount.
        workflowManagerStore.setState((state) => ({
          nodeStores: { ...state.nodeStores, [key]: tab.store }
        }));
      }
    },
    [workflowManagerStore, getMetadata]
  );
};

export default useOpenSubgraph;
