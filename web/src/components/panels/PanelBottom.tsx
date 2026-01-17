/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Drawer, IconButton, Tooltip, Tabs, Tab } from "@mui/material";
import { useResizeBottomPanel } from "../../hooks/handlers/useResizeBottomPanel";
import { useBottomPanelStore } from "../../stores/BottomPanelStore";
import { memo } from "react";
import isEqual from "lodash/isEqual";
import Terminal from "../terminal/Terminal";
import { useCombo } from "../../stores/KeyPressedStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

// icons
import CloseIcon from "@mui/icons-material/Close";
import TerminalIcon from "@mui/icons-material/Terminal";
import SpeedIcon from "@mui/icons-material/Speed";
import PerformanceProfilerPanel from "../node_editor/PerformanceProfilerPanel";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNodes } from "../../contexts/NodeContext";

const PANEL_HEIGHT_COLLAPSED = "0px";

const styles = (theme: Theme) =>
  css({
    position: "fixed",
    bottom: "0",
    left: "0",
    right: "0",
    zIndex: 1100,
    ".panel-container": {
      flexShrink: 0,
      position: "relative",
      backgroundColor: theme.vars.palette.background.default
    },
    ".panel-resize-button": {
      height: "8px",
      width: "100%",
      position: "absolute",
      zIndex: 1200,
      top: "0",
      left: "0",
      backgroundColor: "transparent",
      border: 0,
      borderRadius: 0,
      cursor: "ns-resize",
      transition: "background-color 0.3s ease",
      "&::before": {
        content: '""',
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "40px",
        height: "4px",
        borderRadius: "2px",
        backgroundColor: theme.vars.palette.grey[600],
        opacity: 0.5
      },
      "&:hover": {
        backgroundColor: `${theme.vars.palette.action.hover}55`,
        "&::before": {
          opacity: 0.8
        }
      }
    },
    ".panel-content": {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      height: "100%",
      border: "0",
      minHeight: 0
    },
    ".panel-header": {
      height: "40px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      padding: "0 12px",
      backgroundColor: theme.vars.palette.background.default,
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`,
      "& .left": {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        color: theme.vars.palette.text.secondary
      }
    },
    ".terminal-wrapper": {
      flex: 1,
      minHeight: 0,
      display: "flex",
      overflow: "auto",
      width: "100%",
      ".terminal-container": {
        width: "100%"
      }
    },
    ".panel-tabs": {
      minWidth: 0,
      "& .MuiTab-root": {
        minWidth: "auto",
        padding: "0 12px",
        minHeight: "40px"
      }
    }
  });

const PanelBottom: React.FC = () => {
  const theme = useTheme();
  const {
    ref: panelRef,
    size: panelSize,
    isVisible,
    isDragging,
    handleMouseDown,
    handlePanelToggle
  } = useResizeBottomPanel();

  const activeView = useBottomPanelStore((state) => state.panel.activeView);
  const setActiveView = useBottomPanelStore((state) => state.setActiveView);
  const currentWorkflowId = useWorkflowManager((state) => state.currentWorkflowId);
  const nodes = useNodes((state) => state.nodes);
  const nodeStore = useWorkflowManager((state) =>
    currentWorkflowId ? state.getNodeStore(currentWorkflowId) : undefined
  );
  const storeNodes: any = nodeStore ? nodeStore.getState().nodes : [];

  const allNodes = nodes.length > 0 ? nodes : storeNodes;

  useCombo(["Control", "`"], () => handlePanelToggle("terminal"), false);

  const openHeight = isVisible
    ? Math.min(
        panelSize,
        typeof window !== "undefined" ? Math.max(200, window.innerHeight * 0.6) : panelSize
      )
    : 0;

  const handleTabChange = (_: React.SyntheticEvent, newValue: "terminal" | "profiler") => {
    setActiveView(newValue);
  };

  return (
    <div
      css={styles(theme)}
      className="panel-container"
      style={{
        height: isVisible ? `${openHeight}px` : PANEL_HEIGHT_COLLAPSED
      }}
    >
      <Drawer
        className="panel-bottom-drawer"
        PaperProps={{
          ref: panelRef,
          className: `panel panel-bottom ${isDragging ? "dragging" : ""}`,
          style: {
            height: isVisible ? `${openHeight}px` : PANEL_HEIGHT_COLLAPSED,
            left: "50px",
            right: "50px",
            width: "calc(100% - 100px)",
            borderWidth: isVisible ? "1px" : "0px",
            borderTop: isVisible
              ? `1px solid ${theme.vars.palette.grey[800]}`
              : "none",
            backgroundColor: theme.vars.palette.background.default,
            boxShadow: isVisible ? "0 -4px 10px rgba(0, 0, 0, 0.3)" : "none",
            overflow: "hidden",
            transition: "height 200ms ease"
          }
        }}
        variant="persistent"
        anchor="bottom"
        open={true}
      >
        <div
          className="panel-resize-button"
          onMouseDown={handleMouseDown}
          style={{ cursor: isDragging ? "ns-resize" : "ns-resize" }}
        />
        <div className="panel-content">
          {isVisible && (
            <div className="panel-header">
              <div className="left">
                <Tabs
                  value={activeView}
                  onChange={handleTabChange}
                  className="panel-tabs"
                  aria-label="Bottom panel tabs"
                >
                  <Tab
                    icon={<TerminalIcon fontSize="small" />}
                    iconPosition="start"
                    value="terminal"
                    label="Terminal"
                    aria-label="Terminal"
                  />
                  <Tab
                    icon={<SpeedIcon fontSize="small" />}
                    iconPosition="start"
                    value="profiler"
                    label="Profiler"
                    aria-label="Profiler"
                  />
                </Tabs>
              </div>
              <Tooltip
                title={
                  <div className="tooltip-span">
                    <div className="tooltip-title">Hide panel</div>
                    <div className="tooltip-key">
                      <kbd>Ctrl</kbd> + <kbd>`</kbd>
                    </div>
                  </div>
                }
                placement="top-start"
                enterDelay={TOOLTIP_ENTER_DELAY}
              >
                <IconButton
                  size="small"
                  onClick={() => handlePanelToggle(activeView)}
                  aria-label="Hide panel"
                >
                  <CloseIcon />
                </IconButton>
              </Tooltip>
            </div>
          )}
          <div
            className="terminal-wrapper"
            style={{
              display: activeView === "terminal" && isVisible ? "flex" : "none"
            }}
          >
            <Terminal />
          </div>
          <div
            style={{
              display: activeView === "profiler" && isVisible ? "flex" : "none",
              flex: 1,
              minHeight: 0,
              overflow: "auto"
            }}
          >
            {currentWorkflowId && (
              <PerformanceProfilerPanel
                workflowId={currentWorkflowId}
                nodes={allNodes}
              />
            )}
          </div>
        </div>
      </Drawer>
    </div>
  );
};

export default memo(PanelBottom, isEqual);
