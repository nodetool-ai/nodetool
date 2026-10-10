import { memo, useCallback, useEffect } from "react";
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
  findActiveChildTab,
  useSubgraphTabsStore,
  type SubgraphGraph,
  type SubgraphTab
} from "../../stores/SubgraphTabsStore";
import type { NodeStore } from "../../stores/NodeStore";
import type { NodeData } from "../../stores/NodeData";

/** How long the inner graph must be still before it is written back. */
const WRITE_BACK_DEBOUNCE_MS = 300;

interface SubgraphGraphSyncProps {
  tab: SubgraphTab;
  parentStore: NodeStore;
  /** Drops the WorkflowManager entries of tabs closed while syncing. */
  onTabsClosed: (keys: string[]) => void;
}

/** The inner graph a SubgraphNode stores, with missing parts read as empty. */
const storedGraph = (data: NodeData): SubgraphGraph => {
  const graph = data.properties?.graph as
    | { nodes?: unknown; edges?: unknown }
    | undefined;
  return {
    nodes: Array.isArray(graph?.nodes) ? graph.nodes : [],
    edges: Array.isArray(graph?.edges) ? graph.edges : []
  };
};

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
 *
 * On mount (each time the tab is shown) it first reconciles the tab with the
 * node: a tab whose node was deleted closes, and a tab whose node's graph
 * changed while it was hidden (an undo in the parent) is rebuilt, so stale
 * content is never written back.
 */
const SubgraphGraphSync = memo(
  ({ tab, parentStore, onTabsClosed }: SubgraphGraphSyncProps) => {
    useEffect(() => {
      const tabs = useSubgraphTabsStore.getState();
      const owner = parentStore.getState().findNode(tab.nodeId);
      const closed = tabs.reconcileTab(
        tab.key,
        owner ? storedGraph(owner.data) : undefined
      );
      if (closed.length > 0) {
        onTabsClosed(closed);
      }
      if (useSubgraphTabsStore.getState().getTab(tab.key) !== tab) {
        // Closed or rebuilt: the re-render with the new tab syncs that one.
        return;
      }

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
        const graph = { nodes, edges };
        parentStore.getState().updateNodeData(tab.nodeId, {
          properties: {
            ...(node.data.properties ?? {}),
            graph
          }
        });
        useSubgraphTabsStore.getState().markSynced(tab.key, graph);
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
    }, [tab, parentStore, onTabsClosed]);

    return null;
  }
);

SubgraphGraphSync.displayName = "SubgraphGraphSync";

interface SubgraphTabContentProps {
  tab: SubgraphTab;
  /** Whether the workspace tab holding this subgraph is the one on screen. */
  active: boolean;
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
const SubgraphTabContent = ({ tab, active }: SubgraphTabContentProps) => {
  const workflowManagerStore = useWorkflowManagerStore();
  const parentStore = useWorkflowManager((state) =>
    state.getNodeStore(tab.workflowId)
  );
  // The subgraph opened from this one that is active or holds the active one,
  // however deep.
  const nested = useSubgraphTabsStore((state) =>
    findActiveChildTab(state.tabs, state.activeKey, tab.key)
  );

  const dropClosedTabs = useCallback(
    (keys: string[]) => {
      workflowManagerStore.setState((state) => {
        const nodeStores = { ...state.nodeStores };
        keys.forEach((key) => delete nodeStores[key]);
        return { nodeStores };
      });
    },
    [workflowManagerStore]
  );

  // Idempotent: `ReactFlowWrapper` registers the store synchronously when the
  // tab opens, and this re-registers on remount (a tab switched away from and
  // back, or StrictMode's double mount).
  useEffect(() => {
    // Mounting can close or rebuild the tab (SubgraphGraphSync); never
    // register a store the tab no longer owns.
    if (useSubgraphTabsStore.getState().getTab(tab.key) !== tab) {
      return;
    }
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
                <SubgraphGraphSync
                  tab={tab}
                  parentStore={parentStore}
                  onTabsClosed={dropClosedTabs}
                />
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
                    <NodeEditor workflowId={tab.key} active={active} />
                  </div>
                  {nested && (
                    <div style={{ position: "absolute", inset: 0 }}>
                      <SubgraphTabContent tab={nested} active={active} />
                    </div>
                  )}
                </div>
              </div>
              {/* Only the canvas on screen takes node-menu requests: a
                  background workspace tab or a parent of the open subgraph
                  would otherwise insert into a canvas the user cannot see. */}
              {active && !nested && <NodeCreateBridge />}
            </KeyboardProvider>
          </ConnectableNodesProvider>
        </ContextMenuProvider>
      </ReactFlowProvider>
    </NodeContext.Provider>
  );
};

export default memo(SubgraphTabContent);
