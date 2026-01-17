/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Drawer, IconButton, Tooltip, Typography } from "@mui/material";
import { useResizeBottomPanel } from "../../hooks/handlers/useResizeBottomPanel";
import { useBottomPanelStore } from "../../stores/BottomPanelStore";
import { memo } from "react";
import isEqual from "lodash/isEqual";
import { WorkflowProfiler } from "./WorkflowProfiler";

import CloseIcon from "@mui/icons-material/Close";
import SpeedIcon from "@mui/icons-material/Speed";

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
    ".profiler-wrapper": {
      flex: 1,
      minHeight: 0,
      display: "flex",
      overflow: "auto",
      width: "100%"
    }
  });

const PanelProfiler: React.FC = () => {
  const theme = useTheme();
  const {
    ref: panelRef,
    size: panelSize,
    isVisible,
    isDragging,
    handleMouseDown,
    handlePanelToggle,
  } = useResizeBottomPanel();

  const isProfilerVisible = useBottomPanelStore(
    (state) => state.panel.activeView === "profiler" && isVisible
  );

  const openHeight = isProfilerVisible
    ? Math.min(
        panelSize,
        typeof window !== "undefined" ? Math.max(200, window.innerHeight * 0.6) : panelSize
      )
    : 0;

  return (
    <div
      css={styles(theme)}
      className="panel-container"
      style={{
        height: isProfilerVisible ? `${openHeight}px` : PANEL_HEIGHT_COLLAPSED,
      }}
    >
      <Drawer
        className="panel-profiler-drawer"
        PaperProps={{
          ref: panelRef,
          className: `panel panel-profiler ${isDragging ? "dragging" : ""}`,
          style: {
            height: isProfilerVisible ? `${openHeight}px` : PANEL_HEIGHT_COLLAPSED,
            left: "50px",
            right: "50px",
            width: "calc(100% - 100px)",
            borderWidth: isProfilerVisible ? "1px" : "0px",
            borderTop: isProfilerVisible
              ? `1px solid ${theme.vars.palette.grey[800]}`
              : "none",
            backgroundColor: theme.vars.palette.background.default,
            boxShadow: isProfilerVisible ? "0 -4px 10px rgba(0, 0, 0, 0.3)" : "none",
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
          {isProfilerVisible && (
            <div className="panel-header">
              <div className="left">
                <SpeedIcon fontSize="small" />
                <Typography variant="body2">Profiler</Typography>
              </div>
              <Tooltip
                title={
                  <div className="tooltip-span">
                    <div className="tooltip-title">Hide profiler</div>
                  </div>
                }
                placement="top-start"
              >
                <IconButton
                  size="small"
                  onClick={() => handlePanelToggle("profiler")}
                  aria-label="Hide profiler"
                >
                  <CloseIcon />
                </IconButton>
              </Tooltip>
            </div>
          )}
          <div
            className="profiler-wrapper"
            style={{
              display: isProfilerVisible ? "flex" : "none"
            }}
          >
            <WorkflowProfiler />
          </div>
        </div>
      </Drawer>
    </div>
  );
};

export default memo(PanelProfiler, isEqual);
