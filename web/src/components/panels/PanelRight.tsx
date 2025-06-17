/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Drawer, IconButton, Tooltip } from "@mui/material";
import Inspector from "../Inspector";
import { useResizeRightPanel } from "../../hooks/handlers/useResizeRightPanel";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import { memo } from "react";
import { isEqual } from "lodash";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { NodeProvider } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { ReactFlowProvider } from "@xyflow/react";

const PANEL_WIDTH_COLLAPSED = "52px";

const styles = (theme: any) =>
  css({
    ".panel-container": {
      flexShrink: 0,
      position: "absolute",
      backgroundColor: theme.palette.c_gray1
    },
    ".panel-right": {
      boxShadow: "0 4px 10px rgba(0, 0, 0, 0.3)",
      borderLeft: "1px solid var(--c_gray2)",
      backgroundColor: "var(--c_gray1)",
      position: "absolute",
      overflow: "hidden",
      width: "100%",
      padding: "0",
      top: "72px",
      height: "calc(-72px + 100vh)"
    },

    ".panel-button": {
      position: "absolute",
      zIndex: 1200,
      width: "40px",
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
        backgroundColor: "#33333344",
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
      backgroundColor: "transparent",
      "& .MuiIconButton-root": {
        padding: "14px",
        borderRadius: "5px",
        position: "relative",
        transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",

        "&.active": {
          backgroundColor: `${theme.palette.action.selected}88`,
          boxShadow: `0 0 15px ${theme.palette.primary.main}40`,
          "&::before": {
            content: '""',
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: "3px",
            backgroundColor: theme.palette.primary.main,
            boxShadow: `0 0 10px ${theme.palette.primary.main}`
          },
          "&::after": {
            content: '""',
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            background: `linear-gradient(135deg, ${theme.palette.primary.main}40, transparent)`,
            borderRadius: "5px"
          }
        },
        "&:hover": {
          backgroundColor: `${theme.palette.action.hover}88`,
          boxShadow: `0 0 15px ${theme.palette.action.hover}40`,
          "&::after": {
            content: '""',
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            background: `linear-gradient(135deg, ${theme.palette.primary.main}20, transparent)`,
            borderRadius: "2px"
          }
        }
      }
    },
    ".panel-content": {
      display: "flex",
      flex: 1,
      height: "100%",
      border: "0"
    }
  });

const VerticalToolbar = memo(function VerticalToolbar({
  handlePanelToggle
}: {
  handlePanelToggle: () => void;
}) {
  const panelVisible = useRightPanelStore((state) => state.panel.isVisible);
  return (
    <div className="vertical-toolbar">
      <Tooltip title="Inspector" placement="left">
        <IconButton
          tabIndex={-1}
          onClick={handlePanelToggle}
          className={panelVisible ? "active" : ""}
        >
          <InfoOutlinedIcon />
        </IconButton>
      </Tooltip>
    </div>
  );
});

const PanelRight: React.FC = () => {
  const { currentWorkflowId } = useWorkflowManager((state) => ({
    currentWorkflowId: state.currentWorkflowId
  }));
  const {
    ref: panelRef,
    size: panelSize,
    isVisible,
    isDragging,
    handleMouseDown,
    handlePanelToggle
  } = useResizeRightPanel("right");

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
          right: isVisible ? `${Math.max(panelSize + 14, 25)}px` : "0px"
        }}
      >
        <InfoOutlinedIcon />
      </IconButton>
      <Drawer
        PaperProps={{
          ref: panelRef,
          className: `panel panel-right ${isDragging ? "dragging" : ""}`,
          style: { width: isVisible ? `${panelSize}px` : PANEL_WIDTH_COLLAPSED }
        }}
        variant="persistent"
        anchor="right"
        open={true}
      >
        <div className="panel-content panel-right">
          <VerticalToolbar
            handlePanelToggle={() => handlePanelToggle("inspector")}
          />
          {isVisible && currentWorkflowId && (
            <ContextMenuProvider active={isVisible}>
              <ReactFlowProvider>
                <NodeProvider workflowId={currentWorkflowId}>
                  <Inspector />
                </NodeProvider>
              </ReactFlowProvider>
            </ContextMenuProvider>
          )}
        </div>
      </Drawer>
    </div>
  );
};

export default memo(PanelRight, isEqual);
