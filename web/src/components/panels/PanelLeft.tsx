/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { Drawer, IconButton, Tooltip } from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";
import "../../styles/panel.css";
import HelpChat from "../assistants/HelpChat";
import { useCombo } from "../../stores/KeyPressedStore";
import { isEqual } from "lodash";
import { memo } from "react";

const styles = (theme: any) =>
  css({
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
    },
    ".messages": {
      overflowY: "hidden"
    }
  });

const PanelLeft: React.FC = () => {
  const {
    ref: panelRef,
    size: panelSize,
    isDragging,
    handleMouseDown,
    handlePanelToggle
  } = useResizePanel("left");

  useCombo(["1"], handlePanelToggle, false);

  return (
    <div
      css={styles}
      className={`panel-container ${panelSize > 80 ? "open" : "closed"}`}
    >
      <Tooltip
        className="tooltip-1"
        title={
          <span className="tooltip-1">
            Drag to scale <br /> Click to open/close <br /> Keyboard shortcut: 1
          </span>
        }
        placement="right"
        enterDelay={TOOLTIP_ENTER_DELAY}
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
          onClick={handlePanelToggle}
          style={{ left: `${Math.max(panelSize + 10, 25)}px` }}
        >
          <CodeIcon />
        </IconButton>
      </Tooltip>
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
        {panelSize > 40 && <HelpChat />}
      </Drawer>
    </div>
  );
};

export default memo(PanelLeft, isEqual);
