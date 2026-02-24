/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useMemo } from "react";
import { useTheme, type Theme } from "@mui/material/styles";
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip
} from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import { truncateString } from "../../utils/truncateString";
import { relativeTime } from "../../utils/formatDateAndTime";
import AddIcon from "@mui/icons-material/Add";
import { TOOLTIP_ENTER_DELAY, TOOLTIP_ENTER_NEXT_DELAY } from "../../config/constants";
import { sanitizeImageUrl } from "../../utils/urlValidation";

interface WorkflowsListProps {
  sortedWorkflows: Workflow[];
  isLoadingWorkflows: boolean;
  settings: { workflowOrder: string };
  handleOrderChange: (event: React.MouseEvent<HTMLElement>, value: string | null) => void;
  handleCreateNewWorkflow: () => void;
  handleWorkflowClick: (workflow: Workflow) => void;
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
      marginBottom: 0
    },
    ".workflow-controls": {
      height: "40px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    },
    ".sort-toggle .MuiToggleButton-root": {
      lineHeight: "1em",
      height: "1.75em",
      color: theme.vars.palette.grey[200],
      borderColor: theme.vars.palette.grey[500],
      "&.Mui-selected": {
        backgroundColor: theme.vars.palette.grey[500],
        color: theme.vars.palette.grey[0]
      }
    },
    ".create-button": {
      padding: ".3em 1em",
      backgroundColor: theme.vars.palette.grey[600],
      color: theme.vars.palette.grey[0],
      ":hover": {
        backgroundColor: theme.vars.palette.grey[500]
      }
    },
    ".content-scrollable": {
      flex: 1,
      overflow: "auto",
      paddingRight: theme.spacing(1)
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
      gap: theme.spacing(4),
      padding: theme.spacing(1),
      marginBottom: theme.spacing(1),
      cursor: "pointer",
      borderRadius: theme.shape.borderRadius,
      backgroundColor: "transparent",
      transition: "all 0.2s",
      ":hover": {
        backgroundColor: theme.vars.palette.grey[900]
      }
    },
    ".workflow-thumbnail": {
      width: "60px",
      height: "60px",
      borderRadius: theme.shape.borderRadius,
      backgroundColor: "transparent",
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      flexShrink: 0
    },
    ".workflow-info": {
      flex: 1,
      minWidth: 0
    },
    ".workflow-name": {
      color: theme.vars.palette.grey[0],
      fontWeight: 500,
      marginBottom: theme.spacing(0.5),
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".workflow-description": {
      color: theme.vars.palette.grey[200],
      fontSize: "0.875rem",
      lineHeight: "1.2em",
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: 2,
      overflow: "hidden"
    },
    ".workflow-date": {
      color: theme.vars.palette.grey[100],
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
  const theme = useTheme();

  // Memoize the workflow box sx prop to avoid creating new objects
  const workflowControlsBoxSx = useMemo(() => ({
    display: "flex",
    gap: 2,
    alignItems: "center"
  }), []);

  // Single click handler that uses the workflow from the event
  // This avoids creating N callback functions for N workflows on every render
  const handleWorkflowItemClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const workflowId = event.currentTarget.getAttribute('data-workflow-id');
    if (workflowId) {
      const workflow = sortedWorkflows.find(w => w.id === workflowId);
      if (workflow) {
        handleWorkflowClick(workflow);
      }
    }
  }, [sortedWorkflows, handleWorkflowClick]);

  return (
    <div className="workflows-list" css={styles(theme)}>
      <Box className="header-controls">
        <Typography variant="h3" className="section-title">
          Recent Workflows
        </Typography>
        <Box
          className="workflow-controls"
          sx={workflowControlsBoxSx}
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
          <Tooltip
          enterDelay={TOOLTIP_ENTER_DELAY}
          enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
          placement="top"
          title="Create New Workflow"
          arrow
          >
            <Button
              className="create-button"
              startIcon={<AddIcon />}
              onClick={handleCreateNewWorkflow}
              size="small"
            ></Button>
          </Tooltip>
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
              data-workflow-id={workflow.id}
              onClick={handleWorkflowItemClick}
            >
              <Box
                className="workflow-thumbnail"
                sx={{
                  backgroundImage: sanitizeImageUrl(workflow.thumbnail_url)
                    ? `url(${sanitizeImageUrl(workflow.thumbnail_url)})`
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

export default memo(WorkflowsList);
