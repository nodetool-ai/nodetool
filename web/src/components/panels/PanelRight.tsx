/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { memo, useCallback, useState } from "react";
import AssetGrid from "../assets/AssetGrid";
import { IconButton, Box, Tooltip, Drawer } from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
// import Inspector from "../Inspector";
// hooks
import WorkflowForm from "../workflows/WorkflowForm";
import { useCombo } from "../../stores/KeyPressedStore";
import { isEqual } from "lodash";
import ImageIcon from "@mui/icons-material/Image";
import AccountTreeIcon from "@mui/icons-material/AccountTree";

const styles = (theme: any) =>
  css({
    ".vertical-toolbar": {
      display: "flex",
      flexDirection: "column",
      borderRight: `1px solid ${theme.palette.divider}`,
      backgroundColor: theme.palette.background.paper,
      "& .MuiIconButton-root": {
        padding: "12px",
        borderRadius: 0,
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
    },
    ".panel-tabs ": {
      minHeight: "2em"
    },
    ".panel-tabs button": {
      display: "flex",
      alignItems: "flex-start",
      padding: "0 0 0 .5em",
      minWidth: "unset",
      minHeight: "unset",
      marginRight: "4px",
      textAlign: "left",
      fontSize: theme.fontSizeSmaller
    },
    ".panel-tabs button:hover:not(.Mui-selected)": {
      color: theme.palette.c_gray6
    }
  });

const PanelRight: React.FC = () => {
  const {
    ref: panelRef,
    size: panelSize,
    isDragging,
    handleMouseDown,
    handlePanelToggle
  } = useResizePanel("right");

  useCombo(["2"], handlePanelToggle, false);

  const [activeView, setActiveView] = useState<"assets" | "workflow">("assets");

  const handleViewChange = useCallback(
    (view: "assets" | "workflow") => {
      if (view === activeView) {
        handlePanelToggle();
      } else {
        setActiveView(view);
      }
    },
    [activeView, handlePanelToggle]
  );

  return (
    <div
      css={styles}
      className={`panel-container ${panelSize > 48 ? "open" : "closed"}`}
    >
      <Tooltip
        className="tooltip-1"
        title={
          <span className="tooltip-1">
            Drag to scale <br /> Click to open/close <br /> Keyboard shortcut: 2
          </span>
        }
        placement="left"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          disableRipple={true}
          className={"panel-button panel-button-right"}
          edge="start"
          color="inherit"
          aria-label="menu"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.stopPropagation();
            handleMouseDown(e);
          }}
          onClick={handlePanelToggle}
          style={{ right: `${panelSize + 0}px` }}
        >
          <CodeIcon />
        </IconButton>
      </Tooltip>
      <Drawer
        PaperProps={{
          ref: panelRef,
          className: `panel panel-right ${isDragging ? "dragging" : ""}`,
          style: { width: `${panelSize}px`, padding: "0px" }
        }}
        variant="persistent"
        anchor="left"
        open={true}
      >
        <div className="panel-content">
          <div className="vertical-toolbar">
            <Tooltip title="Assets" placement="right">
              <IconButton
                onClick={() => handleViewChange("assets")}
                className={activeView === "assets" ? "active" : ""}
              >
                <ImageIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Workflow" placement="right">
              <IconButton
                onClick={() => handleViewChange("workflow")}
                className={activeView === "workflow" ? "active" : ""}
              >
                <AccountTreeIcon />
              </IconButton>
            </Tooltip>
          </div>

          {activeView === "assets" && (
            <Box
              className="assets-container"
              sx={{ width: "100%", height: "100%" }}
            >
              <AssetGrid maxItemSize={5} />
            </Box>
          )}
          {activeView === "workflow" && <WorkflowForm />}
        </div>
      </Drawer>
    </div>
  );
};

export default memo(PanelRight, isEqual);
