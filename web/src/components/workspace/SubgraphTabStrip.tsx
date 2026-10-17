import { memo, useCallback, useMemo } from "react";

import { useWorkflowManagerStore } from "../../contexts/WorkflowManagerContext";
import {
  findActiveChildTab,
  useSubgraphTabsStore
} from "../../stores/SubgraphTabsStore";
import { SUBGRAPH_ACCENT_COLOR } from "../../constants/nodeTypes";
import { DockTabStrip, type DockTab } from "../ui_primitives";

/** Tab id of the host canvas itself; subgraph keys never take this form. */
const HOST_TAB_ID = "subgraph-host";

interface SubgraphTabStripProps {
  /** The canvas these tabs belong to: a workflow id, or a subgraph tab key. */
  hostId: string;
  /**
   * The `activeKey` that means "show the host itself" — `null` for a workflow
   * (no subgraph active), the host's own key for a nested subgraph.
   */
  hostActiveKey: string | null;
  /** Label for the host's own tab. */
  hostLabel: string;
}

/**
 * Tabs for the subgraphs opened from one canvas, plus that canvas itself.
 *
 * Subgraph tabs are scoped to their parent workflow and hold a live in-memory
 * `NodeStore`, so they are not workspace tabs: those persist to localStorage
 * and would restore pointing at a store that no longer exists. The strip sits
 * inside the workflow's own editor surface instead, and closing the workflow
 * takes its subgraph tabs with it (`WorkflowManagerStore.removeWorkflow`).
 */
const SubgraphTabStrip = ({
  hostId,
  hostActiveKey,
  hostLabel
}: SubgraphTabStripProps) => {
  const workflowManagerStore = useWorkflowManagerStore();
  const tabs = useSubgraphTabsStore((state) => state.tabs);
  const activeKey = useSubgraphTabsStore((state) => state.activeKey);
  const setActive = useSubgraphTabsStore((state) => state.setActive);
  const closeTab = useSubgraphTabsStore((state) => state.closeTab);

  const handleClose = useCallback(
    (key: string) => {
      const closed = closeTab(key);
      // Drop the synthetic workflows the closed canvases were registered
      // under (the tab and any subgraph opened inside it), so reopening
      // rebuilds from the parent node's graph rather than resurrecting a
      // stale store.
      workflowManagerStore.setState((state) => {
        const nodeStores = { ...state.nodeStores };
        closed.forEach((closedKey) => delete nodeStores[closedKey]);
        return { nodeStores };
      });
    },
    [closeTab, workflowManagerStore]
  );

  const ownTabs = useMemo(
    () => tabs.filter((tab) => tab.workflowId === hostId),
    [tabs, hostId]
  );
  const stripTabs = useMemo<DockTab[]>(
    () => [
      // The host's own tab is not a subgraph tab: it cannot be closed.
      { id: HOST_TAB_ID, label: hostLabel, closable: false },
      ...ownTabs.map((tab) => ({ id: tab.key, label: tab.label }))
    ],
    [hostLabel, ownTabs]
  );

  const handleActivate = useCallback(
    (id: string) => setActive(id === HOST_TAB_ID ? hostActiveKey : id),
    [setActive, hostActiveKey]
  );

  if (ownTabs.length === 0) {
    return null;
  }
  // A tab stays marked while a subgraph opened inside it is the one shown.
  const shownKey =
    findActiveChildTab(tabs, activeKey, hostId)?.key ?? hostActiveKey;

  return (
    <DockTabStrip
      ariaLabel="Workflow and subgraph canvases"
      tabs={stripTabs}
      activeId={shownKey === hostActiveKey ? HOST_TAB_ID : (shownKey ?? HOST_TAB_ID)}
      onActivate={handleActivate}
      onClose={handleClose}
      focused
      sx={{
        // Violet, matching the SubgraphNode accent, so a subgraph canvas is
        // never mistaken for the parent workflow's.
        [`& [data-dock-tab]:not([data-dock-tab="${HOST_TAB_ID}"])[aria-selected="true"]::before`]:
          { bgcolor: SUBGRAPH_ACCENT_COLOR }
      }}
    />
  );
};

export default memo(SubgraphTabStrip);
