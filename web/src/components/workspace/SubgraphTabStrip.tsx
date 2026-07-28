/** @jsxImportSource @emotion/react */
import { memo, useCallback, type MouseEvent } from "react";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";

import { useWorkflowManagerStore } from "../../contexts/WorkflowManagerContext";
import { useSubgraphTabsStore } from "../../stores/SubgraphTabsStore";
import { SUBGRAPH_ACCENT_COLOR } from "../../constants/nodeTypes";
import {
  SPACING_PX,
  TYPOGRAPHY,
  BORDER_RADIUS,
  MOTION,
  reducedMotion
} from "../ui_primitives";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    gap: SPACING_PX.xs,
    padding: `0 ${SPACING_PX.sm}px`,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    backgroundColor: theme.vars.palette.background.paper,
    ".graph-tab": {
      display: "flex",
      alignItems: "center",
      gap: SPACING_PX.xs,
      padding: `${SPACING_PX.xs}px ${SPACING_PX.sm}px`,
      border: "none",
      borderBottom: "2px solid transparent",
      background: "none",
      color: theme.vars.palette.text.secondary,
      ...TYPOGRAPHY.sans.label,
      cursor: "pointer",
      transition: MOTION.fast,
      "&:hover": { color: theme.vars.palette.text.primary },
      "&.active": {
        color: theme.vars.palette.text.primary,
        // Violet, matching the SubgraphNode accent, so a subgraph canvas is
        // never mistaken for the parent workflow's.
        borderBottomColor: SUBGRAPH_ACCENT_COLOR
      },
      ...reducedMotion({ transition: MOTION.none })
    },
    // The host's own tab is not a subgraph tab — it carries neither the
    // `subgraph-tab` class nor a close control.
    ".parent-tab.active": {
      borderBottomColor: theme.vars.palette.primary.main
    },
    ".close-icon": {
      width: 14,
      height: 14,
      borderRadius: BORDER_RADIUS.sm,
      "&:hover": { color: theme.vars.palette.error.main }
    }
  });

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
  const theme = useTheme();
  const workflowManagerStore = useWorkflowManagerStore();
  const tabs = useSubgraphTabsStore((state) => state.tabs);
  const activeKey = useSubgraphTabsStore((state) => state.activeKey);
  const setActive = useSubgraphTabsStore((state) => state.setActive);
  const closeTab = useSubgraphTabsStore((state) => state.closeTab);

  const handleClose = useCallback(
    (event: MouseEvent<Element>, key: string) => {
      // The close icon sits inside the tab button; without this the click also
      // selects the tab it just removed.
      event.stopPropagation();
      closeTab(key);
      // Drop the synthetic workflow the subgraph canvas was registered under,
      // so reopening the tab rebuilds it from the parent node's graph rather
      // than resurrecting the stale store.
      workflowManagerStore.setState((state) => {
        const nodeStores = { ...state.nodeStores };
        delete nodeStores[key];
        return { nodeStores };
      });
    },
    [closeTab, workflowManagerStore]
  );

  const ownTabs = tabs.filter((tab) => tab.workflowId === hostId);
  if (ownTabs.length === 0) {
    return null;
  }

  return (
    <div css={styles(theme)} role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={activeKey === hostActiveKey}
        className={`graph-tab parent-tab ${
          activeKey === hostActiveKey ? "active" : ""
        }`}
        onClick={() => setActive(hostActiveKey)}
      >
        {hostLabel}
      </button>
      {ownTabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeKey === tab.key}
          className={`graph-tab subgraph-tab ${
            activeKey === tab.key ? "active" : ""
          }`}
          onClick={() => setActive(tab.key)}
        >
          {tab.label}
          <CloseIcon
            className="close-icon"
            aria-label={`Close ${tab.label}`}
            onClick={(event) => handleClose(event, tab.key)}
          />
        </button>
      ))}
    </div>
  );
};

export default memo(SubgraphTabStrip);
