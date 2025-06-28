/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Drawer, IconButton, Tooltip } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import Inspector from "../Inspector";
import { useResizeRightPanel } from "../../hooks/handlers/useResizeRightPanel";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import { memo } from "react";
import { isEqual } from "lodash";
import { NodeContext } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { ReactFlowProvider } from "@xyflow/react";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import ThemeNodes from "../themes/ThemeNodes";
// icons
import CodeIcon from "@mui/icons-material/Code";
import CenterFocusWeakIcon from "@mui/icons-material/CenterFocusWeak";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import WorkflowAssistantChat from "./WorkflowAssistantChat";

const PANEL_WIDTH_COLLAPSED = "52px";

const styles = (theme: any) =>
  css({
    position: "absolute",
    right: "0",
    ".panel-container": {
      flexShrink: 0,
      position: "absolute",
      backgroundColor: theme.palette.c_gray1
    },
    ".panel-right": {
      boxShadow: "0 4px 10px rgba(0, 0, 0, 0.3)",
      borderLeft: "none",
      backgroundColor: "var(--c_gray1)",
      position: "absolute",
      overflow: "hidden",
      width: "100%",
      padding: "0",
      top: "72px",
      height: "calc(-72px + 100vh)"
    },

    ".panel-button": {
      width: "30px",
      position: "absolute",
      zIndex: 1200,
      height: "calc(100vh - 75px)",
      backgroundColor: "transparent",
      border: 0,
      borderRadius: 0,
      top: "72px",
      cursor: "e-resize",
      transition: "background-color 0.3s ease",

      "& svg": {
        fontSize: "0.8em !important",
        color: "var(--c_gray5)",
        opacity: 0,
        marginLeft: "1px",
        transition: "all 0.5s ease"
      },

      "&:hover": {
        backgroundColor: "var(--c_gray1)",
        "& svg": {
          opacity: 1,
          fontSize: "1em !important"
        }
      }
    },
    ".vertical-toolbar": {
      width: "50px",
      display: "flex",
      flexDirection: "column",
      gap: "1em",
      backgroundColor: "transparent",
      "& .MuiIconButton-root": {
        padding: "5px 4px 0 5px",
        borderRadius: "5px",
        position: "relative",
        transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
      }
    },
    ".panel-content": {
      display: "flex",
      flex: 1,
      height: "100%",
      marginTop: "10px",
      border: "0"
    }
  });

const VerticalToolbar = memo(function VerticalToolbar({
  handleInspectorToggle,
  handleAssistantToggle,
  activeView,
  panelVisible
}: {
  handleInspectorToggle: () => void;
  handleAssistantToggle: () => void;
  activeView: "inspector" | "assistant";
  panelVisible: boolean;
}) {
  return (
    <div className="vertical-toolbar">
      {/* Inspector Button */}
      <Tooltip
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Inspector</div>
            <div className="tooltip-key">Key&nbsp;i</div>
          </div>
        }
        placement="left-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={handleInspectorToggle}
          className={
            activeView === "inspector" && panelVisible
              ? "inspector active"
              : "inspector"
          }
        >
          <CenterFocusWeakIcon />
        </IconButton>
      </Tooltip>

      {/* Assistant Button */}
      <Tooltip
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Workflow Assistant</div>
            <div className="tooltip-key">A</div>
          </div>
        }
        placement="left-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={handleAssistantToggle}
          className={
            activeView === "assistant" && panelVisible
              ? "assistant active"
              : "assistant "
          }
        >
          <SmartToyIcon />
        </IconButton>
      </Tooltip>
    </div>
  );
});

const PanelRight: React.FC = () => {
  const {
    ref: panelRef,
    size: panelSize,
    isVisible,
    isDragging,
    handleMouseDown,
    handlePanelToggle
  } = useResizeRightPanel("right");

  const activeView = useRightPanelStore((state) => state.panel.activeView);

  const activeNodeStore = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? state.nodeStores[state.currentWorkflowId]
      : undefined
  );

  return (
    <div
      css={styles}
      className="panel-container"
      style={{ width: isVisible ? `${panelSize}px` : "60px" }}
    >
      <IconButton
        disableRipple={true}
        className={"panel-button panel-button-right"}
        edge="end"
        color="inherit"
        tabIndex={-1}
        onMouseDown={(e) => {
          e.stopPropagation();
          handleMouseDown(e);
        }}
        style={{
          padding: isVisible ? "6px" : "2px",
          right: isVisible ? `${Math.max(panelSize + 12, 30)}px` : "12px"
        }}
      >
        {/* <InfoOutlinedIcon /> */}
        <CodeIcon />
      </IconButton>
      <Drawer
        className="panel-right-drawer"
        PaperProps={{
          ref: panelRef,
          className: `panel panel-right ${isDragging ? "dragging" : ""}`,
          style: {
            width: isVisible ? `${panelSize}px` : PANEL_WIDTH_COLLAPSED,
            height: isVisible ? "calc(100vh - 72px)" : "150px",
            borderWidth: isVisible ? "1px" : "0px",
            backgroundColor: isVisible ? "var(--c_gray1)" : "transparent"
          }
        }}
        variant="persistent"
        anchor="right"
        open={true}
      >
        <div className="panel-content">
          <VerticalToolbar
            handleInspectorToggle={() => handlePanelToggle("inspector")}
            handleAssistantToggle={() => handlePanelToggle("assistant")}
            activeView={activeView}
            panelVisible={isVisible}
          />
          {isVisible && activeView === "inspector" && activeNodeStore && (
            <ContextMenuProvider>
              <ReactFlowProvider>
                <NodeContext.Provider value={activeNodeStore}>
                  <MuiThemeProvider theme={ThemeNodes}>
                    <Inspector />
                  </MuiThemeProvider>
                </NodeContext.Provider>
              </ReactFlowProvider>
            </ContextMenuProvider>
          )}
          {isVisible && activeView === "assistant" && <WorkflowAssistantChat />}
        </div>
      </Drawer>
    </div>
  );
};

export default memo(PanelRight, isEqual);
