/** @jsxImportSource @emotion/react */
import React, { useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { Box, IconButton, Tooltip, Typography, Collapse } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

import ThemeToggle from "../../ui/ThemeToggle";
import MiniWorkflowGraph from "./MiniWorkflowGraph";
import { Workflow } from "../../../stores/ApiTypes";

interface MiniAppSidePanelProps {
  workflow: Workflow;
  isRunning?: boolean;
}

const MiniAppSidePanel: React.FC<MiniAppSidePanelProps> = ({
  workflow,
  isRunning = false
}) => {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [showGraph, setShowGraph] = useState(true);

  const panelWidth = 360;

  const styles = css({
    // Toggle button (always visible)
    ".side-panel-toggle": {
      position: "fixed",
      top: 80,
      right: 12,
      zIndex: 1100,
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: 8,
      boxShadow: theme.shadows[2],
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },

    // Panel container
    ".side-panel": {
      position: "fixed",
      top: 60,
      right: 0,
      bottom: 0,
      width: panelWidth,
      backgroundColor: theme.vars.palette.background.paper,
      borderLeft: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: theme.shadows[8],
      zIndex: 1050,
      transform: isOpen ? "translateX(0)" : `translateX(${panelWidth}px)`,
      transition: "transform 0.25s ease-out",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden"
    },

    // Panel header
    ".side-panel-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      padding: theme.spacing(1.5, 2),
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },

    ".side-panel-actions": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%"
    },

    ".theme-toggle-wrapper": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1)
    },

    // Panel content
    ".side-panel-content": {
      flex: 1,
      overflow: "auto",
      padding: theme.spacing(2),
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(2)
    },

    // Section styling
    ".panel-section": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1)
    },

    ".panel-section-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      cursor: "pointer",
      padding: theme.spacing(0.5, 0),
      "&:hover": {
        opacity: 0.8
      }
    },

    ".panel-section-title": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      fontSize: "0.75rem",
      fontWeight: 500,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: theme.vars.palette.text.secondary
    },

    ".graph-wrapper": {
      borderRadius: 8,
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.divider}`
    },

    // Backdrop for mobile
    ".side-panel-backdrop": {
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      zIndex: 1040,
      opacity: isOpen ? 1 : 0,
      pointerEvents: isOpen ? "auto" : "none",
      transition: "opacity 0.25s ease-out",

      [theme.breakpoints.up("lg")]: {
        display: "none"
      }
    }
  });

  return (
    <Box css={styles}>
      {/* Toggle button - hidden when panel is open */}
      {!isOpen && (
        <Tooltip title="Open settings" placement="left">
          <IconButton
            className="side-panel-toggle"
            onClick={() => setIsOpen(true)}
            size="small"
          >
            <MenuIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      {/* Backdrop */}
      <div
        className="side-panel-backdrop"
        onClick={() => setIsOpen(false)}
      />

      {/* Panel */}
      <div className="side-panel">
        <div className="side-panel-header">
          <div className="side-panel-actions">
            <div className="theme-toggle-wrapper">
              <Typography variant="caption" color="text.secondary">
                Theme
              </Typography>
              <ThemeToggle />
            </div>
            <IconButton size="small" onClick={() => setIsOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </div>
        </div>

        <div className="side-panel-content">
          {/* Description */}
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            App Mode provides a simplified interface for running workflows. 
            Configure inputs, run the workflow, and view results without 
            the full editor complexity.
          </Typography>

          {/* Workflow Graph Section */}
          <div className="panel-section">
            <div
              className="panel-section-header"
              onClick={() => setShowGraph(!showGraph)}
            >
              <span className="panel-section-title">
                <AccountTreeIcon sx={{ fontSize: 16 }} />
                Workflow Graph
              </span>
              {showGraph ? (
                <ExpandLessIcon fontSize="small" color="action" />
              ) : (
                <ExpandMoreIcon fontSize="small" color="action" />
              )}
            </div>
            <Collapse in={showGraph}>
              <div className="graph-wrapper">
                <MiniWorkflowGraph workflow={workflow} isRunning={isRunning} />
              </div>
            </Collapse>
          </div>
        </div>
      </div>
    </Box>
  );
};

export default MiniAppSidePanel;
