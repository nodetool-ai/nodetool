/** @jsxImportSource @emotion/react */
import { ReactFlowProvider } from "@xyflow/react";
import { Box } from "@mui/material";
import { useEffect, useRef } from "react";
import { NodeContext } from "../../contexts/NodeContext";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { ConnectableNodesProvider } from "../../providers/ConnectableNodesProvider";
import KeyboardProvider from "../KeyboardProvider";
import NodeEditor from "../node_editor/NodeEditor";
import FloatingToolBar from "../panels/FloatingToolBar";
import NodeCreateBridge from "./NodeCreateBridge";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import type { SubgraphTab } from "../../stores/SubgraphTabsStore";
import type { NodeStoreState } from "../../stores/NodeStore";

interface SubgraphTabContentProps {
  tab: SubgraphTab;
}

/**
 * Renders the canvas for a subgraph tab. The subgraph's isolated NodeStore is
 * provided via NodeContext, and changes are mirrored back to the parent
 * SubgraphNode's `graph` property in the owning workflow's store.
 */
const SubgraphTabContent = ({ tab }: SubgraphTabContentProps) => {
  const parentStore = useWorkflowManager(
    (state) => state.nodeStores[tab.workflowId]
  );

  // Mirror subgraph store changes back to the parent SubgraphNode's `graph`
  // property. We subscribe to nodes/edges changes and write the latest snapshot.
  const parentStoreRef = useRef(parentStore);
  parentStoreRef.current = parentStore;

  useEffect(() => {
    const subStore = tab.store;
    const writeBack = (state: NodeStoreState) => {
      const parent = parentStoreRef.current;
      if (!parent) return;
      const inner = state.getWorkflow().graph;
      const parentState = parent.getState();
      const parentNode = parentState.nodes.find((n) => n.id === tab.nodeId);
      if (!parentNode) return;
      parentState.updateNodeData(tab.nodeId, {
        properties: {
          ...parentNode.data.properties,
          graph: inner
        }
      });
    };

    const unsubscribe = subStore.subscribe((state, prev) => {
      if (state.nodes !== prev.nodes || state.edges !== prev.edges) {
        writeBack(state);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [tab.store, tab.nodeId]);

  return (
    <Box
      sx={{
        overflow: "hidden",
        position: "absolute",
        width: "100%",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: "column"
      }}
    >
      <NodeContext.Provider value={tab.store}>
        <ReactFlowProvider>
          <ContextMenuProvider>
            <ConnectableNodesProvider>
              <KeyboardProvider>
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    position: "relative",
                    width: "100%",
                    height: "100%"
                  }}
                >
                  <NodeEditor workflowId={tab.key} active />
                </div>
                <FloatingToolBar />
                <NodeCreateBridge />
              </KeyboardProvider>
            </ConnectableNodesProvider>
          </ContextMenuProvider>
        </ReactFlowProvider>
      </NodeContext.Provider>
    </Box>
  );
};

export default SubgraphTabContent;
