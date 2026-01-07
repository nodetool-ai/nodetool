import React, { useState, useCallback } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  Tooltip,
  Collapse,
  Divider,
  Button,
  Menu,
  MenuItem
} from "@mui/material";
import {
  ExpandMore,
  ExpandLess,
  Add,
  Description,
  History,
  Delete,
  OpenInNew,
  Chat,
  MoreVert,
  PlayArrow,
  CheckCircle,
  Error,
  Cancel
} from "@mui/icons-material";
import { useWorkflowDashboard } from "../../hooks/useWorkflowDashboard";
import { formatDistanceToNow } from "date-fns";
import type { RecentWorkflow, WorkflowActivity } from "../../stores/WorkflowDashboardStore";

interface WorkflowMiniDashboardProps {
  onOpenWorkflow?: (workflowId: string) => void;
  onCreateWorkflow?: () => void;
  onOpenTemplate?: () => void;
}

const getStatusIcon = (status?: string) => {
  switch (status) {
    case "success":
      return <CheckCircle sx={{ fontSize: 14, color: "success.main" }} />;
    case "error":
      return <Error sx={{ fontSize: 14, color: "error.main" }} />;
    case "running":
      return <PlayArrow sx={{ fontSize: 14, color: "info.main" }} />;
    case "cancelled":
      return <Cancel sx={{ fontSize: 14, color: "warning.main" }} />;
    default:
      return null;
  }
};

interface WorkflowMiniDashboardProps {
  onOpenWorkflow?: (workflowId: string) => void;
  onCreateWorkflow?: () => void;
}

const WorkflowMiniDashboard: React.FC<WorkflowMiniDashboardProps> = ({
  onOpenWorkflow,
  onCreateWorkflow
}) => {
  const {
    recentWorkflows,
    recentActivity,
    isExpanded,
    toggleExpanded,
    openRecentWorkflow,
    createQuickChat,
    removeRecentWorkflow
  } = useWorkflowDashboard();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

  const handleMenuOpen = useCallback(
    (event: React.MouseEvent<HTMLElement>, workflowId: string) => {
      setAnchorEl(event.currentTarget);
      setSelectedWorkflowId(workflowId);
    },
    []
  );

  const handleMenuClose = useCallback(() => {
    setAnchorEl(null);
    setSelectedWorkflowId(null);
  }, []);

  const handleOpenWorkflow = useCallback(
    (workflowId: string) => {
      openRecentWorkflow(workflowId);
      onOpenWorkflow?.(workflowId);
      handleMenuClose();
    },
    [openRecentWorkflow, onOpenWorkflow, handleMenuClose]
  );

  const handleChatWithWorkflow = useCallback(
    async (workflowId: string, workflowName: string) => {
      await createQuickChat(workflowId, workflowName);
      handleMenuClose();
    },
    [createQuickChat, handleMenuClose]
  );

  const handleDeleteWorkflow = useCallback(
    (workflowId: string) => {
      removeRecentWorkflow(workflowId);
      handleMenuClose();
    },
    [removeRecentWorkflow, handleMenuClose]
  );

  return (
    <Card
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
        borderRadius: 2,
        overflow: "hidden"
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          cursor: "pointer",
          "&:hover": {
            bgcolor: "action.hover"
          }
        }}
        onClick={toggleExpanded}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <History sx={{ fontSize: 20, color: "primary.main" }} />
          <Typography variant="subtitle1" fontWeight={600}>
            Recent Workflows
          </Typography>
          {recentWorkflows.length > 0 && (
            <Chip
              label={recentWorkflows.length}
              size="small"
              sx={{ height: 20, fontSize: "0.75rem" }}
            />
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Tooltip title="Create New">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onCreateWorkflow?.();
              }}
            >
              <Add sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
          <IconButton size="small">
            {isExpanded ? <ExpandLess sx={{ fontSize: 20 }} /> : <ExpandMore sx={{ fontSize: 20 }} />}
          </IconButton>
        </Box>
      </Box>

      <Collapse in={isExpanded}>
        <CardContent sx={{ flex: 1, overflow: "auto", p: 1.5, pt: 1 }}>
          {recentWorkflows.length === 0 ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                py: 3,
                textAlign: "center"
              }}
            >
              <Description sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                No recent workflows yet
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Add />}
                onClick={onCreateWorkflow}
              >
                Create Your First Workflow
              </Button>
            </Box>
          ) : (
            <>
              <List dense sx={{ py: 0 }}>
                      {recentWorkflows.slice(0, 5).map((workflow: RecentWorkflow) => (
                  <ListItem
                    key={workflow.id}
                    disablePadding
                    sx={{
                      borderRadius: 1,
                      mb: 0.5,
                      "&:hover": {
                        bgcolor: "action.hover"
                      }
                    }}
                  >
                    <ListItemButton
                      dense
                      onClick={() => handleOpenWorkflow(workflow.id)}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        {getStatusIcon(workflow.lastRunStatus)}
                      </ListItemIcon>
                      <ListItemText
                        primary={workflow.name}
                        secondary={
                          workflow.lastOpened
                            ? formatDistanceToNow(workflow.lastOpened, { addSuffix: true })
                            : "Never opened"
                        }
                        primaryTypographyProps={{
                          noWrap: true,
                          sx: { fontWeight: 500 }
                        }}
                        secondaryTypographyProps={{
                          noWrap: true,
                          sx: { fontSize: "0.75rem" }
                        }}
                      />
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        {workflow.nodeCount > 0 && (
                          <Chip
                            label={`${workflow.nodeCount} nodes`}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: "0.7rem",
                              "& .MuiChip-label": { px: 0.75 }
                            }}
                          />
                        )}
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMenuOpen(e, workflow.id);
                          }}
                        >
                          <MoreVert sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Box>
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>

              {recentActivity.length > 0 && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ px: 1, display: "block", mb: 1 }}
                  >
                    Recent Activity
                  </Typography>
                  <List dense sx={{ py: 0 }}>
                    {recentActivity.slice(0, 5).map((activity: WorkflowActivity) => (
                      <ListItem key={activity.id} disablePadding sx={{ py: 0.25 }}>
                        <ListItemText
                          primary={activity.workflowName}
                          secondary={
                            <>
                              {activity.type === "created" && "Created"}
                              {activity.type === "opened" && "Opened"}
                              {activity.type === "run" && `Ran (${activity.details})`}
                              {activity.type === "deleted" && "Deleted"}
                              {" · "}
                              {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                            </>
                          }
                          primaryTypographyProps={{
                            noWrap: true,
                            sx: { fontSize: "0.8rem", fontWeight: 500 }
                          }}
                          secondaryTypographyProps={{
                            noWrap: true,
                            sx: { fontSize: "0.7rem" }
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </>
              )}
            </>
          )}
        </CardContent>
      </Collapse>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{
          vertical: "top",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
      >
        {selectedWorkflowId && (
          <>
            <MenuItem
              onClick={() => handleOpenWorkflow(selectedWorkflowId)}
            >
              <ListItemIcon>
                <OpenInNew fontSize="small" />
              </ListItemIcon>
              Open
            </MenuItem>
            <MenuItem
              onClick={() => {
                const workflow = recentWorkflows.find(
                  (w: RecentWorkflow) => w.id === selectedWorkflowId
                );
                if (workflow) {
                  handleChatWithWorkflow(selectedWorkflowId, workflow.name);
                }
              }}
            >
              <ListItemIcon>
                <Chat fontSize="small" />
              </ListItemIcon>
              Discuss in Chat
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => handleDeleteWorkflow(selectedWorkflowId)}
              sx={{ color: "error.main" }}
            >
              <ListItemIcon>
                <Delete fontSize="small" color="error" />
              </ListItemIcon>
              Remove from Recent
            </MenuItem>
          </>
        )}
      </Menu>
    </Card>
  );
};

export default WorkflowMiniDashboard;
