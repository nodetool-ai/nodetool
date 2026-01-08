/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { useTheme, type Theme } from "@mui/material/styles";
import { Box, Typography, List, ListItem, ListItemButton, IconButton, Tooltip } from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useRecentWorkflowsStore } from "../../stores/RecentWorkflowsStore";
import { relativeTime } from "../../utils/formatDateAndTime";

interface RecentWorkflowsPanelProps {
  onOpenWorkflow: (workflowId: string) => void;
}

const styles = (theme: Theme) =>
  css({
    borderRadius: theme.spacing(1),
    padding: "1em",
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    height: "100%",
    boxShadow: `0 2px 8px ${theme.vars.palette.grey[900]}1a`,
    ".header-controls": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "1em"
    },
    ".section-title": {
      color: theme.vars.palette.grey[100],
      marginBottom: 0,
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1)
    },
    ".header-actions": {
      display: "flex",
      gap: theme.spacing(0.5)
    },
    ".content-scrollable": {
      flex: 1,
      overflow: "auto",
      paddingRight: theme.spacing(1)
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: theme.vars.palette.grey[400],
      textAlign: "center",
      padding: theme.spacing(2)
    },
    ".empty-icon": {
      fontSize: "48px",
      marginBottom: theme.spacing(1),
      opacity: 0.5
    },
    ".recent-item": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: theme.spacing(1),
      marginBottom: theme.spacing(0.5),
      cursor: "pointer",
      borderRadius: theme.shape.borderRadius,
      backgroundColor: "transparent",
      transition: "all 0.2s",
      ":hover": {
        backgroundColor: theme.vars.palette.grey[900]
      }
    },
    ".recent-info": {
      flex: 1,
      minWidth: 0
    },
    ".recent-name": {
      color: theme.vars.palette.grey[0],
      fontWeight: 500,
      fontSize: "0.875rem",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".recent-time": {
      color: theme.vars.palette.grey[400],
      fontSize: "0.75rem"
    },
    ".action-buttons": {
      display: "flex",
      opacity: 0,
      transition: "opacity 0.2s",
      ".recent-item:hover &": {
        opacity: 1
      }
    }
  });

const RecentWorkflowsPanel: React.FC<RecentWorkflowsPanelProps> = ({ onOpenWorkflow }) => {
  const theme = useTheme();
  const recentWorkflows = useRecentWorkflowsStore((state) => state.recentWorkflows);
  const removeRecentWorkflow = useRecentWorkflowsStore((state) => state.removeRecentWorkflow);
  const clearRecentWorkflows = useRecentWorkflowsStore((state) => state.clearRecentWorkflows);

  const handleOpenWorkflow = (workflowId: string) => {
    onOpenWorkflow(workflowId);
  };

  const handleRemoveWorkflow = (_e: React.MouseEvent, workflowId: string) => {
    e.stopPropagation();
    removeRecentWorkflow(workflowId);
  };

  const handleClearAll = () => {
    clearRecentWorkflows();
  };

  return (
    <div className="recent-workflows-panel" css={styles(theme)}>
      <Box className="header-controls">
        <Typography variant="h3" className="section-title">
          <HistoryIcon fontSize="small" />
          Recent Workflows
        </Typography>
        {recentWorkflows.length > 0 && (
          <Box className="header-actions">
            <Tooltip title="Clear all recent workflows">
              <IconButton size="small" onClick={handleClearAll} sx={{ color: theme.vars.palette.grey[400] }}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>
      <Box className="content-scrollable">
        {recentWorkflows.length === 0 ? (
          <Box className="empty-state">
            <HistoryIcon className="empty-icon" />
            <Typography variant="body2" gutterBottom>
              No recent workflows
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Open a workflow to see it here
            </Typography>
          </Box>
        ) : (
          <List dense disablePadding>
            {recentWorkflows.map((workflow) => (
              <ListItem key={workflow.id} disablePadding>
                <ListItemButton
                  className="recent-item"
                  onClick={() => handleOpenWorkflow(workflow.id)}
                  sx={{ borderRadius: theme.shape.borderRadius }}
                >
                  <Box className="recent-info">
                    <Typography className="recent-name">
                      {workflow.name}
                    </Typography>
                    <Typography className="recent-time">
                      {relativeTime(new Date(workflow.timestamp).toISOString())}
                    </Typography>
                  </Box>
                  <Box className="action-buttons">
                    <Tooltip title="Open workflow">
                      <IconButton
                        size="small"
                        onClick={(e) => handleOpenWorkflow(workflow.id)}
                        sx={{ color: theme.vars.palette.grey[400] }}
                      >
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remove from recent">
                      <IconButton
                        size="small"
                        onClick={(e) => handleRemoveWorkflow(e, workflow.id)}
                        sx={{ color: theme.vars.palette.grey[400] }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </div>
  );
};

export default RecentWorkflowsPanel;
