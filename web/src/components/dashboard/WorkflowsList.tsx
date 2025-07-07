/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  ToggleButton,
  ToggleButtonGroup
} from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import { truncateString } from "../../utils/truncateString";
import { relativeTime } from "../../utils/formatDateAndTime";
import AddIcon from "@mui/icons-material/Add";

interface WorkflowsListProps {
  sortedWorkflows: Workflow[];
  isLoadingWorkflows: boolean;
  settings: { workflowOrder: string };
  handleOrderChange: (event: any, newOrder: any) => void;
  handleCreateNewWorkflow: () => void;
  handleWorkflowClick: (workflow: Workflow) => void;
}

const styles = (theme: any) =>
  css({
    backgroundColor: theme?.palette?.grey[800] || "#222",
    borderRadius: theme?.spacing?.(1) || 8,
    padding: theme?.spacing?.(4) || 32,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
    ".header-controls": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: theme?.spacing?.(3) || 24
    },
    ".section-title": {
      color: theme?.palette?.grey[100] || "#eee",
      marginBottom: 0
    },
    ".workflow-controls": {
      height: "40px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    },
    ".sort-toggle .MuiToggleButton-root": {
      lineHeight: "1.2em",
      color: theme?.palette?.grey[200] || "#ccc",
      borderColor: theme?.palette?.grey[500] || "#888",
      "&.Mui-selected": {
        backgroundColor: theme?.palette?.grey[500] || "#888",
        color: theme?.palette?.grey[0] || "#fff"
      }
    },
    ".create-button": {
      padding: ".3em 1em",
      backgroundColor: theme?.palette?.grey[600] || "#444",
      color: theme?.palette?.grey[0] || "#fff",
      ":hover": {
        backgroundColor: theme?.palette?.grey[500] || "#888"
      }
    },
    ".content-scrollable": {
      flex: 1,
      overflow: "auto",
      paddingRight: theme?.spacing?.(1) || 8
    },
    ".loading-container": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "300px"
    },
    ".workflow-item": {
      display: "flex",
      alignItems: "center",
      gap: theme?.spacing?.(4) || 32,
      padding: theme?.spacing?.(1) || 8,
      marginBottom: theme?.spacing?.(1) || 8,
      cursor: "pointer",
      borderRadius: theme?.shape?.borderRadius || 8,
      backgroundColor: theme?.palette?.grey[800] || "#222",
      transition: "all 0.2s",
      ":hover": {
        backgroundColor: theme?.palette?.grey[600] || "#444"
      }
    },
    ".workflow-thumbnail": {
      width: "60px",
      height: "60px",
      borderRadius: theme?.shape?.borderRadius || 8,
      backgroundColor: "transparent",
      border: `1px solid ${theme?.palette?.grey[600] || "#444"}`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      flexShrink: 0
    },
    ".workflow-info": {
      flex: 1,
      minWidth: 0
    },
    ".workflow-name": {
      color: theme?.palette?.grey[0] || "#fff",
      fontWeight: 500,
      marginBottom: theme?.spacing?.(0.5) || 4,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".workflow-description": {
      color: theme?.palette?.grey[200] || "#ccc",
      fontSize: "0.875rem",
      lineHeight: "1.2em",
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: 2,
      overflow: "hidden"
    },
    ".workflow-date": {
      color: theme?.palette?.grey[100] || "#eee",
      fontSize: "0.75rem",
      marginLeft: "auto",
      flexShrink: 0
    }
  });

const WorkflowsList: React.FC<WorkflowsListProps> = ({
  sortedWorkflows,
  isLoadingWorkflows,
  settings,
  handleOrderChange,
  handleCreateNewWorkflow,
  handleWorkflowClick
}) => {
  // Try to get theme from MUI, fallback to undefined
  const theme = (window as any).muiTheme || undefined;
  return (
    <div css={styles(theme)}>
      <Box className="header-controls">
        <Typography variant="h2" className="section-title">
          Recent Workflows
        </Typography>
        <Box
          className="workflow-controls"
          sx={{ display: "flex", gap: 2, alignItems: "center" }}
        >
          <ToggleButtonGroup
            className="sort-toggle"
            value={settings.workflowOrder}
            onChange={handleOrderChange}
            exclusive
            size="small"
          >
            <ToggleButton value="name">Name</ToggleButton>
            <ToggleButton value="updated_at">Date</ToggleButton>
          </ToggleButtonGroup>
          <Button
            className="create-button"
            startIcon={<AddIcon />}
            onClick={handleCreateNewWorkflow}
            size="small"
          >
            Create New
          </Button>
        </Box>
      </Box>
      <Box className="content-scrollable">
        {isLoadingWorkflows ? (
          <Box className="loading-container">
            <CircularProgress />
          </Box>
        ) : (
          sortedWorkflows.map((workflow) => (
            <Box
              key={workflow.id}
              className="workflow-item"
              onClick={() => handleWorkflowClick(workflow)}
            >
              <Box
                className="workflow-thumbnail"
                sx={{
                  backgroundImage: workflow.thumbnail_url
                    ? `url(${workflow.thumbnail_url})`
                    : undefined
                }}
              />
              <Box className="workflow-info">
                <Typography className="workflow-name">
                  {workflow.name}
                </Typography>
                <Typography className="workflow-description">
                  {truncateString(workflow.description, 100)}
                </Typography>
              </Box>
              <Typography className="workflow-date">
                {relativeTime(workflow.updated_at)}
              </Typography>
            </Box>
          ))
        )}
      </Box>
    </div>
  );
};

export default WorkflowsList;
