/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Tooltip, Typography, IconButton } from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import ClearIcon from "@mui/icons-material/Clear";
import WorkflowIcon from "@mui/icons-material/AccountTree";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useRecentWorkflowsStore } from "../../stores/RecentWorkflowsStore";
import { useNotificationStore } from "../../stores/NotificationStore";

const tileStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "fit-content",
      padding: "0.5em 1em 0.5em 0.5em",
      boxSizing: "border-box"
    },
    ".tiles-header": {
      marginBottom: "0.5em",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 4px",
      "& h5": {
        margin: 0,
        fontSize: "0.85rem",
        fontWeight: 600,
        color: theme.vars.palette.text.secondary,
        textTransform: "uppercase",
        letterSpacing: "1px",
        opacity: 0.8,
        display: "flex",
        alignItems: "center",
        gap: "0.5em"
      }
    },
    ".tiles-container": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
      gridAutoRows: "1fr",
      gap: "8px",
      alignContent: "start",
      overflowY: "auto",
      padding: "2px",
      "&::-webkit-scrollbar": {
        width: "6px"
      },
      "&::-webkit-scrollbar-track": {
        background: "transparent"
      },
      "&::-webkit-scrollbar-thumb": {
        backgroundColor: theme.vars.palette.action.disabledBackground,
        borderRadius: "8px"
      },
      "&::-webkit-scrollbar-thumb:hover": {
        backgroundColor: theme.vars.palette.action.disabled
      }
    },
    ".workflow-tile": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "12px 16px",
      borderRadius: "12px",
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
      border: "1px solid rgba(255, 255, 255, 0.06)",
      transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
      minHeight: "70px",
      background: "rgba(255, 255, 255, 0.02)",
      "&::before": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.06), transparent 80%)",
        opacity: 0,
        transition: "opacity 0.3s ease",
        pointerEvents: "none"
      },
      "&:hover": {
        transform: "translateY(-3px)",
        borderColor: "rgba(255, 255, 255, 0.15)",
        background: "rgba(255, 255, 255, 0.05)",
        boxShadow: "0 8px 24px -6px rgba(0, 0, 0, 0.5)",
        "&::before": {
          opacity: 1
        },
        "& .tile-name": {
          opacity: 1
        }
      },
      "&:active": {
        transform: "scale(0.97) translateY(0)",
        transition: "all 0.1s ease"
      }
    },
    ".tile-icon": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: "8px",
      opacity: 0.7,
      "& svg": {
        fontSize: "1.25rem",
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))"
      }
    },
    ".tile-name": {
      fontSize: "0.8rem",
      fontWeight: 500,
      textAlign: "left",
      lineHeight: 1.3,
      color: theme.vars.palette.text.primary,
      opacity: 0.9,
      transition: "opacity 0.3s ease",
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical"
    },
    ".tile-timestamp": {
      fontSize: "0.65rem",
      color: theme.vars.palette.text.secondary,
      opacity: 0.6,
      marginTop: "4px"
    },
    ".empty-state": {
      padding: "1em",
      textAlign: "center",
      color: theme.vars.palette.text.secondary,
      fontSize: "0.85rem",
      opacity: 0.6
    },
    ".clear-button": {
      padding: "4px",
      minWidth: 0,
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.action.hover
      }
    }
  });

function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return "Just now";
  } else if (minutes < 60) {
    return `${minutes}m ago`;
  } else if (hours < 24) {
    return `${hours}h ago`;
  } else if (days < 7) {
    return `${days}d ago`;
  } else {
    return new Date(timestamp).toLocaleDateString();
  }
}

const RecentWorkflowsTiles = memo(function RecentWorkflowsTiles() {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => tileStyles(theme), [theme]);

  const navigate = useNavigate();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const { recentWorkflows, clearRecentWorkflows } = useRecentWorkflowsStore(
    (state) => ({
      recentWorkflows: state.recentWorkflows,
      clearRecentWorkflows: state.clearRecentWorkflows
    })
  );

  const handleClearRecent = useCallback(() => {
    clearRecentWorkflows();
    addNotification({
      type: "info",
      content: "Recent workflows cleared",
      timeout: 2000
    });
  }, [clearRecentWorkflows, addNotification]);

  const handleWorkflowClick = useCallback(
    (workflowId: string) => {
      navigate(`/editor/${workflowId}`);
    },
    [navigate]
  );

  if (recentWorkflows.length === 0) {
    return null;
  }

  return (
    <Box css={memoizedStyles}>
      <div className="tiles-header">
        <Typography variant="h5">
          <HistoryIcon fontSize="small" sx={{ opacity: 0.8 }} />
          Recent Workflows
        </Typography>
        <Tooltip title="Clear recent workflows" placement="top">
          <IconButton
            size="small"
            className="clear-button"
            onClick={handleClearRecent}
            aria-label="Clear recent workflows"
          >
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>
      <div className="tiles-container">
        {recentWorkflows.map((workflow) => (
          <Tooltip
            key={workflow.id}
            title={
              <div>
                <div>{workflow.name}</div>
                <div
                  style={{
                    fontSize: "0.7rem",
                    opacity: 0.75,
                    marginTop: "4px"
                  }}
                >
                  Click to open workflow
                </div>
              </div>
            }
            placement="top"
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <div
              className="workflow-tile"
              onClick={() => handleWorkflowClick(workflow.id)}
              style={
                {
                  background: theme.vars.palette.action.selected
                } as React.CSSProperties
              }
            >
              <div className="tile-icon">
                <WorkflowIcon />
              </div>
              <Typography className="tile-name">{workflow.name}</Typography>
              <Typography className="tile-timestamp">
                {formatTimestamp(workflow.timestamp)}
              </Typography>
            </div>
          </Tooltip>
        ))}
      </div>
    </Box>
  );
});

export default RecentWorkflowsTiles;
