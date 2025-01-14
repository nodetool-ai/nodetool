/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Drawer, IconButton, Tooltip, Box, Button } from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import ChatIcon from "@mui/icons-material/Chat";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";
import "../../styles/panel.css";
import HelpChat from "../assistants/HelpChat";
import { useCombo } from "../../stores/KeyPressedStore";
import { isEqual } from "lodash";
import { memo, useState, useCallback } from "react";
import AssetGrid from "../assets/AssetGrid";
import WorkflowForm from "../workflows/WorkflowForm";
import GridViewIcon from "@mui/icons-material/GridView";
import WorkflowList from "../workflows/WorkflowList";
import StaticNodeMenu from "../node_menu/StaticNodeMenu";
import { IconForType } from "../../config/data_types";
import TuneIcon from "@mui/icons-material/Tune";
import ControlPointIcon from "@mui/icons-material/ControlPoint";
import CollectionsIcon from "@mui/icons-material/Collections";
import CollectionList from "../collections/CollectionList";

const styles = (theme: any) =>
  css({
    ".MuiDrawer-paper": {
      boxShadow: "4px 0 6px -1px rgba(0, 0, 0, 0.2)"
    },
    ".panel-tabs ": {
      minHeight: "2em"
    },
    ".vertical-toolbar button": {
      marginRight: "10px"
    },
    ".panel-tabs button:hover:not(.Mui-selected)": {
      color: theme.palette.c_gray6
    },
    ".messages": {
      overflowY: "auto"
    },
    ".vertical-toolbar": {
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.palette.background.paper,
      "& .MuiIconButton-root, .MuiButton-root": {
        padding: "12px",
        borderRadius: "6px",
        "&.active": {
          backgroundColor: theme.palette.action.selected
        },
        "&:hover": {
          backgroundColor: theme.palette.action.hover
        }
      }
    },
    ".panel-content": {
      display: "flex",
      flex: 1,
      height: "100%"
    }
  });

const PanelLeft: React.FC = () => {
  const {
    ref: panelRef,
    size: panelSize,
    collapsed,
    isDragging,
    handleMouseDown,
    handlePanelToggle
  } = useResizePanel("left");

  useCombo(["1"], handlePanelToggle, false);

  const [activeView, setActiveView] = useState<
    "chat" | "assets" | "workflow" | "workflowGrid" | "nodes" | "collections"
  >("chat");

  const handleViewChange = useCallback(
    (
      view:
        | "chat"
        | "assets"
        | "workflow"
        | "workflowGrid"
        | "nodes"
        | "collections"
    ) => {
      if (view === activeView) {
        handlePanelToggle();
      } else {
        if (collapsed) {
          handlePanelToggle();
        }
        setActiveView(view);
      }
    },
    [activeView, handlePanelToggle]
  );

  return (
    <div
      css={styles}
      className={`panel-container ${panelSize > 80 ? "open" : "closed"}`}
    >
      <IconButton
        disableRipple={true}
        className={"panel-button panel-button-left"}
        edge="start"
        color="inherit"
        aria-label="menu"
        tabIndex={-1}
        onMouseDown={(e) => {
          e.stopPropagation();
          handleMouseDown(e);
        }}
        style={{ left: `${Math.max(panelSize + 10, 25)}px` }}
      >
        <CodeIcon />
      </IconButton>
      <Drawer
        PaperProps={{
          ref: panelRef,
          className: `panel panel-left ${isDragging ? "dragging" : ""}`,
          style: { width: `${panelSize}px` }
        }}
        variant="persistent"
        anchor="left"
        open={true}
      >
        <div className="panel-content">
          <div className="vertical-toolbar">
            <Tooltip title="Chat" placement="right">
              <IconButton
                onClick={() => handleViewChange("chat")}
                className={activeView === "chat" ? "active" : ""}
              >
                <ChatIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Assets" placement="right">
              <Button
                onClick={() => handleViewChange("assets")}
                className={activeView === "assets" ? "active" : ""}
              >
                <IconForType
                  iconName="asset"
                  showTooltip={false}
                  containerStyle={{
                    borderRadius: "0 0 3px 0",
                    marginLeft: "0.1em",
                    marginTop: "0",
                    color: "white"
                  }}
                  bgStyle={{
                    backgroundColor: "transparent",
                    width: "20px",
                    height: "20px"
                  }}
                />
              </Button>
            </Tooltip>
            <Tooltip title="Workflow Properties" placement="right">
              <IconButton
                onClick={() => handleViewChange("workflow")}
                className={activeView === "workflow" ? "active" : ""}
              >
                <TuneIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Workflows" placement="right">
              <IconButton
                onClick={() => handleViewChange("workflowGrid")}
                className={activeView === "workflowGrid" ? "active" : ""}
              >
                <GridViewIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Nodes" placement="right">
              <IconButton
                onClick={() => handleViewChange("nodes")}
                className={activeView === "nodes" ? "active" : ""}
              >
                <ControlPointIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Collections" placement="right">
              <IconButton
                onClick={() => handleViewChange("collections")}
                className={activeView === "collections" ? "active" : ""}
              >
                {/* <CollectionsIcon /> */}
                <IconForType
                  iconName="database"
                  showTooltip={false}
                  containerStyle={{
                    color: "white"
                  }}
                />
              </IconButton>
            </Tooltip>
          </div>

          {activeView === "chat" && panelSize > 40 && <HelpChat />}
          {activeView === "assets" && (
            <Box
              className="assets-container"
              sx={{ width: "100%", height: "100%" }}
            >
              <AssetGrid maxItemSize={5} />
            </Box>
          )}
          {activeView === "workflow" && <WorkflowForm />}
          {activeView === "workflowGrid" && (
            <Box sx={{ width: "100%", height: "100%", overflow: "auto" }}>
              <WorkflowList />
            </Box>
          )}
          {activeView === "nodes" && (
            <Box sx={{ width: "100%", height: "100%", overflow: "hidden" }}>
              <StaticNodeMenu />
            </Box>
          )}
          {activeView === "collections" && (
            <Box
              sx={{
                width: "100%",
                height: "100%",
                overflow: "hidden auto",
                padding: 5
              }}
            >
              <CollectionList />
            </Box>
          )}
        </div>
      </Drawer>
    </div>
  );
};

export default memo(PanelLeft, isEqual);
