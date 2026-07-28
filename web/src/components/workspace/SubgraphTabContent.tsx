import { memo, useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import NodeEditor from "../node_editor/NodeEditor";
import SubgraphTabStrip from "./SubgraphTabStrip";
import { NodeContext } from "../../contexts/NodeContext";
import {
  useWorkflowManager,
  useWorkflowManagerStore
} from "../../contexts/WorkflowManagerContext";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { ConnectableNodesProvider } from "../../providers/ConnectableNodesProvider";
import KeyboardProvider from "../KeyboardProvider";
import NodeCreateBridge from "../editor/NodeCreateBridge";
import {
  useSubgraphTabsStore,
  type SubgraphTab
} from "../../stores/SubgraphTabsStore";
import type { NodeStore } from "../../stores/NodeStore";

/** How long the inner graph must be still before it is written back. */
const WRITE_BACK_DEBOUNCE_MS = 300;

interface SubgraphGraphSyncProps {
  tab: SubgraphTab;
  parentStore: NodeStore;
}

/**
 * Writes the subgraph canvas back onto the SubgraphNode that owns it.
 *
 * The tab's `NodeStore` is seeded from `data.properties.graph` when the tab
 * opens and is otherwise independent, so without this the inner graph would
 * live only as long as the tab: edits would not save, would not run, and
 * `SubgraphSync` would never see the new boundary ports.
 *
 * Debounced because a node drag updates the store on every pointer frame, and
 * each write re-renders the parent canvas.
 */
const SubgraphGraphSync = memo(
  ({ tab, parentStore }: SubgraphGraphSyncProps) => {
    useEffect(() => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let pending = false;

      const flush = () => {
        clearTimeout(timer);
        if (!pending) {
          return;
        }
        pending = false;
        const { nodes, edges } = tab.store.getState().getWorkflow().graph;
        const node = parentStore.getState().findNode(tab.nodeId);
        if (!node) {
          return;
        }
        parentStore.getState().updateNodeData(tab.nodeId, {
          properties: {
            ...(node.data.properties ?? {}),
            graph: { nodes, edges }
          }
        });
      };

      const unsubscribe = tab.store.subscribe((state, previous) => {
        if (state.nodes === previous.nodes && state.edges === previous.edges) {
          return;
        }
        pending = true;
        clearTimeout(timer);
        timer = setTimeout(flush, WRITE_BACK_DEBOUNCE_MS);
      });

      return () => {
        unsubscribe();
        // Flush rather than cancel: this unmounts when the tab is switched
        // away from or closed, which is exactly when an edit made in the last
        // few hundred milliseconds would otherwise be dropped.
        flush();
      };
    }, [tab, parentStore]);

    return null;
  }
);

SubgraphGraphSync.displayName = "SubgraphGraphSync";

interface SubgraphTabContentProps {
  tab: SubgraphTab;
}

/**
 * The editor canvas for one open subgraph.
 *
 * A second `NodeEditor` over the tab's own `NodeStore`, registered in the
 * WorkflowManager under the tab's synthetic id so `ReactFlowWrapper` treats it
 * as a workflow that already exists locally and skips the 404 fetch that id
 * would otherwise trigger.
 *
 * Renders its own strip and, when one of its subgraphs is open, itself — a
 * SubgraphNode created inside a subgraph opens the same way as one at the top
 * level.
 */
const SubgraphTabContent = ({ tab }: SubgraphTabContentProps) => {
  const workflowManagerStore = useWorkflowManagerStore();
  const parentStore = useWorkflowManager((state) =>
    state.getNodeStore(tab.workflowId)
  );
  const nested = useSubgraphTabsStore((state) =>
    state.tabs.find(
      (candidate) =>
        candidate.key === state.activeKey && candidate.workflowId === tab.key
    )
  );

  // Idempotent: `ReactFlowWrapper` registers the store synchronously when the
  // tab opens, and this re-registers on remount (a tab switched away from and
  // back, or StrictMode's double mount).
  useEffect(() => {
    workflowManagerStore.setState((state) =>
      state.nodeStores[tab.key] === tab.store
        ? state
        : { nodeStores: { ...state.nodeStores, [tab.key]: tab.store } }
    );
  }, [workflowManagerStore, tab]);

  return (
    <NodeContext.Provider value={tab.store}>
      <ReactFlowProvider>
        <ContextMenuProvider>
          <ConnectableNodesProvider>
            <KeyboardProvider>
              {parentStore && (
                <SubgraphGraphSync tab={tab} parentStore={parentStore} />
              )}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: "100%",
                  height: "100%"
                }}
              >
                <SubgraphTabStrip
                  hostId={tab.key}
                  hostActiveKey={tab.key}
                  hostLabel={tab.label}
                />
                <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                  <div
                    data-testid="subgraph-tab-content"
                    style={{
                      width: "100%",
                      height: "100%",
                      display: nested ? "none" : undefined
                    }}
                  >
                    <NodeEditor workflowId={tab.key} active />
                  </div>
                  {nested && (
                    <div style={{ position: "absolute", inset: 0 }}>
                      <SubgraphTabContent tab={nested} />
                    </div>
                  )}
                </div>
              </div>
              <NodeCreateBridge />
            </KeyboardProvider>
          </ConnectableNodesProvider>
        </ContextMenuProvider>
      </ReactFlowProvider>
    </NodeContext.Provider>
  );
};

export default memo(SubgraphTabContent);
