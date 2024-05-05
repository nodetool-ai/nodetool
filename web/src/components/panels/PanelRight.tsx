/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useState } from "react";
import AssetGrid from "../assets/AssetGrid";
import { IconButton, Box, Tooltip, Drawer, Tabs, Tab } from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import useKeyListener from "../../utils/KeyListener";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";
// import Inspector from "../Inspector";
// import AssetRenameConfirmation from "../assets/AssetRenameConfirmation";
// import AssetItemContextMenu from "../context_menus/AssetItemContextMenu";
// import AssetDeleteConfirmation from "../assets/AssetDeleteConfirmation";

const styles = (theme: any) =>
  css({
    ".panel-tabs ": {
      minHeight: "2em"
    },
    ".panel-tabs button": {
      padding: "0 .5em",
      minWidth: "unset",
      minHeight: "unset"
    }
  });

function PanelRight() {
  const {
    ref: panelRef,
    size: panelSize,
    isDragging,
    handleMouseDown,
    handlePanelToggle
  } = useResizePanel(10, 1200, 300, "horizontal", "right");

  useKeyListener("2", () => {
    if (document.activeElement === document.body) {
      handlePanelToggle();
    }
  });

  const [tabIndex, setTabIndex] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue);
  };

  return (
    <div
      css={styles}
      className={`panel-container ${panelSize > 80 ? "open" : "closed"}`}
    >
      <Tooltip
        className="tooltip-1"
        title={
          <span className="tooltip-1">
            Drag to scale <br /> Click to open/close
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
          style: { width: `${panelSize}px` }
        }}
        variant="persistent"
        anchor="left"
        open={true}
      >
        <Tabs
          className="panel-tabs"
          value={tabIndex}
          onChange={handleTabChange}
          aria-label="Panel tabs"
        >
          <Tab label="Assets" />
          {/* <Tab label="Inspector" /> */}
        </Tabs>
        {tabIndex === 0 && (
          <Box
            className="assets-container"
            sx={{ width: "100%", height: "100%" }}
          >
            <AssetGrid maxItemSize={5} />
          </Box>
        )}
        {/* {tabIndex === 1 && <Inspector />} */}
      </Drawer>
    </div>
  );
}

export default PanelRight;
