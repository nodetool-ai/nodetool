/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";
import Inspector from "../Inspector";
import { useResizeRightPanel } from "../../hooks/handlers/useResizeRightPanel";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import { memo, useCallback, useEffect } from "react";
import isEqual from "../../utils/isEqual";
import { NodeContext } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useShallow } from "zustand/react/shallow";
import { useLocation } from "react-router-dom";
import { useBottomPanelStore } from "../../stores/BottomPanelStore";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { ReactFlowProvider } from "@xyflow/react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import FrontendToolRuntimeSync from "./FrontendToolRuntimeSync";
import { WorkflowCostEstimatePanel } from "../costs/WorkflowCostEstimatePanel";
import type { NodeStore } from "../../stores/NodeStore";
import { useSubgraphTabsStore } from "../../stores/SubgraphTabsStore";

import { PANEL_RESIZE_HANDLE_WIDTH } from "../../config/constants";
import ContextMenus from "../context_menus/ContextMenus";
import {
  MobileBottomSheet,
  FlexColumn,
  MOTION,
  reducedMotion,
  Z_INDEX
} from "../ui_primitives";

const HEADER_AREA_HEIGHT = 77;
// Matches HEADER_HEIGHT in PanelBottom — the bar still occupies this when collapsed.
const BOTTOM_PANEL_HEADER_HEIGHT = 32;

const styles = (theme: Theme, bottomOffset: number, isVisible: boolean) =>
  css({
    position: "fixed",
    right: 0,
    top: `var(--workspace-header-height, ${HEADER_AREA_HEIGHT}px)`,
    height: `calc(100vh - var(--workspace-header-height, ${HEADER_AREA_HEIGHT}px) - ${bottomOffset}px)`,
    display: "flex",
    flexDirection: "row",
    zIndex: theme.zIndex.appBar,
    // Slide off the right edge when hidden; the panel overlays (position:
    // fixed) so this is a purely visual transform, no layout reflow.
    transform: isVisible ? "translateX(0)" : "translateX(100%)",
    pointerEvents: isVisible ? "auto" : "none",
    transition: `transform ${MOTION.slow}`,
    ...reducedMotion({ transition: MOTION.none }),

    ".drawer-content": {
      height: "100%",
      backgroundColor: theme.vars.palette.background.default,
      borderLeft: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: "-4px 0 8px rgba(0, 0, 0, 0.05)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    },

    ".panel-button": {
      width: `${PANEL_RESIZE_HANDLE_WIDTH}px`,
      position: "absolute",
      left: 0,
      top: 0,
      height: "100%",
      backgroundColor: "transparent",
      border: 0,
      borderRadius: 0,
      cursor: "ew-resize",
      zIndex: Z_INDEX.dropdown,
      transition: MOTION.all,

      "&:hover": {
        backgroundColor: theme.vars.palette.primary.main,
        boxShadow: `0 0 8px ${theme.vars.palette.primary.main}40`,
        transform: "scaleX(1.5)"
      },
      "&:active": {
        backgroundColor: theme.vars.palette.primary.main,
        boxShadow: `0 0 12px ${theme.vars.palette.primary.main}60`,
        transform: "scaleX(2)"
      }
    },

    // Stack the inspector on top and the cost estimate panel underneath it.
    ".panel-inner-content": {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      height: "100%",
      overflow: "hidden"
    },
    ".inspector-region": {
      flex: "1 1 auto",
      minHeight: 0,
      display: "flex",
      overflow: "hidden"
    },
    ".cost-region": {
      flex: "0 1 auto",
      maxHeight: "45%",
      overflow: "auto",
      borderTop: `1px solid ${theme.vars.palette.divider}`
    }
  });


/**
 * Selection-driven visibility for the inspector. Subscribes to the active
 * workflow's node store and mirrors `selection > 0` onto the right panel's
 * visibility — selecting a node opens the panel, deselecting closes it.
 * Renders nothing.
 */
const InspectorVisibilitySync = memo(function InspectorVisibilitySync({
  activeNodeStore
}: {
  activeNodeStore: NodeStore;
}) {
  const hasSelection = useStoreWithEqualityFn(
    activeNodeStore,
    (state) => state.nodes.some((node) => node.selected)
  );
  const setVisibility = useRightPanelStore((state) => state.setVisibility);
  useEffect(() => {
    setVisibility(hasSelection);
  }, [hasSelection, setVisibility]);
  return null;
});

const PanelRight: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const {
    ref: panelRef,
    size: panelSize,
    isVisible,
    isDragging,
    handleMouseDown
  } = useResizeRightPanel("right");

  const setVisibility = useRightPanelStore((state) => state.setVisibility);

  const { pathname } = useLocation();
  const { bottomPanelSize, bottomPanelVisible } = useBottomPanelStore(
    useShallow((state) => ({
      bottomPanelSize: state.panel.panelSize,
      bottomPanelVisible: state.panel.isVisible
    }))
  );
  // Mirror PanelBottom: it mounts under /editor and /workspace, collapsing to
  // the header bar when not visible. Subtract whatever it actually occupies so
  // the inspector's bottom (Runs section) isn't covered.
  const editorChrome =
    pathname.startsWith("/editor") || pathname.startsWith("/workspace");
  const bottomOffset = !editorChrome
    ? 0
    : bottomPanelVisible
      ? bottomPanelSize
      : BOTTOM_PANEL_HEADER_HEIGHT;

  const activeSubgraphTab = useSubgraphTabsStore((state) =>
    state.activeKey
      ? state.tabs.find((t) => t.key === state.activeKey)
      : undefined
  );
  const workflowNodeStore = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? state.nodeStores[state.currentWorkflowId]
      : undefined
  );
  const activeNodeStore = activeSubgraphTab?.store ?? workflowNodeStore;

  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );

  const handleMobileSheetClose = useCallback(
    () => setVisibility(false),
    [setVisibility]
  );

  const inspectorBody = activeNodeStore ? (
    <ContextMenuProvider>
      <ReactFlowProvider>
        <NodeContext.Provider value={activeNodeStore}>
          <ContextMenus />
          <Inspector />
        </NodeContext.Provider>
      </ReactFlowProvider>
    </ContextMenuProvider>
  ) : null;

  if (isMobile) {
    return (
      <>
        <FrontendToolRuntimeSync />
        {activeNodeStore && (
          <InspectorVisibilitySync activeNodeStore={activeNodeStore} />
        )}
        <MobileBottomSheet
          open={isVisible}
          onClose={handleMobileSheetClose}
          title="Inspector"
          ariaLabel="Inspector panel"
        >
          <FlexColumn
            sx={{
              height: "65vh",
              overflow: "hidden"
            }}
          >
            {inspectorBody}
          </FlexColumn>
        </MobileBottomSheet>
      </>
    );
  }

  return (
    <>
      <FrontendToolRuntimeSync />
      {activeNodeStore && (
        <InspectorVisibilitySync activeNodeStore={activeNodeStore} />
      )}
      <div
        css={styles(theme, bottomOffset, isVisible)}
        className="panel-right-container"
        aria-hidden={!isVisible}
      >
        <div
          ref={panelRef}
          className={`drawer-content ${isDragging ? "dragging" : ""}`}
          style={{ width: `${panelSize}px` }}
        >
          <div
            className="panel-button"
            onMouseDown={handleMouseDown}
            role="slider"
            aria-label="Resize panel"
            aria-valuenow={panelSize}
            aria-valuemin={60}
            aria-valuemax={600}
            tabIndex={-1}
          />
          <div className="panel-inner-content">
            <div className="inspector-region">{inspectorBody}</div>
            {currentWorkflowId && (
              <div className="cost-region">
                <WorkflowCostEstimatePanel workflowId={currentWorkflowId} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

PanelRight.displayName = "PanelRight";

export default memo(PanelRight, isEqual);
