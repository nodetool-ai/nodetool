import React, { useMemo, useState } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  Menu,
  MenuItem,
  alpha
} from "@mui/material";
import {
  History as HistoryIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Cancel as CancelIcon,
  RadioButtonUnchecked as RunningIcon,
  Delete as DeleteIcon,
  FilterList as FilterIcon,
  Search as SearchIcon
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { useWorkflowActivityStore, type WorkflowExecution } from "../../stores/WorkflowActivityStore";
import { formatDistanceToNow } from "date-fns";
import type { SxProps } from "@mui/system";

export interface WorkflowActivityLogProps {
  /** Filter to show only executions for this workflow */
  workflowId?: string;
  /** Maximum number of executions to display */
  limit?: number;
  /** Height of the log container */
  height?: number | string;
  /** Optional sx prop for custom styling */
  sx?: SxProps;
}

/**
 * Status icon component for execution status.
 */
const StatusIcon: React.FC<{ status: WorkflowExecution["status"] }> = ({ status }) => {
  const theme = useTheme();

  const icons = {
    running: <RunningIcon sx={{ color: theme.vars.palette.info.main }} />,
    completed: <CheckCircleIcon sx={{ color: theme.vars.palette.success.main }} />,
    failed: <ErrorIcon sx={{ color: theme.vars.palette.error.main }} />,
    cancelled: <CancelIcon sx={{ color: theme.vars.palette.warning.main }} />
  };

  return icons[status];
};

/**
 * Format duration in human-readable format.
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * WorkflowActivityLog displays a list of workflow executions with status,
 * timing, and ability to remove entries. Supports search and filtering.
 *
 * @example
 * ```tsx
 * <WorkflowActivityLog
 *   workflowId="wf-123"
 *   limit={20}
 *   height={400}
 * />
 * ```
 */
export const WorkflowActivityLog: React.FC<WorkflowActivityLogProps> = ({
  workflowId,
  limit,
  height = 400,
  sx
}) => {
  const theme = useTheme();
  const executions = useWorkflowActivityStore((state) => state.executions);
  const removeExecution = useWorkflowActivityStore((state) => state.removeExecution);
  const clearHistory = useWorkflowActivityStore((state) => state.clearHistory);
  const searchExecutions = useWorkflowActivityStore((state) => state.searchExecutions);
  const getExecutionsByWorkflow = useWorkflowActivityStore(
    (state) => state.getExecutionsByWorkflow
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [filterAnchorEl, setFilterAnchorEl] = useState<null | HTMLElement>(null);
  const [statusFilter, setStatusFilter] = useState<WorkflowExecution["status"] | "all">(
    "all"
  );

  // Filter and search executions
  const filteredExecutions = useMemo(() => {
    let results = workflowId
      ? getExecutionsByWorkflow(workflowId)
      : executions;

    // Apply status filter
    if (statusFilter !== "all") {
      results = results.filter((e) => e.status === statusFilter);
    }

    // Apply search
    if (searchQuery.trim()) {
      results = searchExecutions(searchQuery);
      // Re-apply workflow filter if set
      if (workflowId) {
        results = results.filter((e) => e.workflowId === workflowId);
      }
      // Re-apply status filter if set
      if (statusFilter !== "all") {
        results = results.filter((e) => e.status === statusFilter);
      }
    }

    // Apply limit
    return limit ? results.slice(0, limit) : results;
  }, [executions, workflowId, limit, statusFilter, searchQuery, getExecutionsByWorkflow, searchExecutions]);

  const handleFilterClick = (event: React.MouseEvent<HTMLElement>) => {
    setFilterAnchorEl(event.currentTarget);
  };

  const handleFilterClose = () => {
    setFilterAnchorEl(null);
  };

  const handleFilterChange = (newFilter: typeof statusFilter) => {
    setStatusFilter(newFilter);
    handleFilterClose();
  };

  const handleClearAll = () => {
    // eslint-disable-next-line no-alert
    if (confirm("Are you sure you want to clear all execution history?")) {
      clearHistory();
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height,
        ...sx
      }}
    >
      {/* Header with search and filter */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          p: 1,
          borderBottom: `1px solid ${alpha(theme.vars.palette.common.black, 0.12)}`
        }}
      >
        <SearchIcon sx={{ color: theme.vars.palette.action.active }} />
        <TextField
          placeholder="Search executions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          variant="standard"
          size="small"
          fullWidth
          InputProps={{
            disableUnderline: true
          }}
        />
        <IconButton onClick={handleFilterClick} size="small">
          <FilterIcon />
        </IconButton>
        <Menu
          anchorEl={filterAnchorEl}
          open={Boolean(filterAnchorEl)}
          onClose={handleFilterClose}
        >
          <MenuItem
            selected={statusFilter === "all"}
            onClick={() => handleFilterChange("all")}
          >
            All Status
          </MenuItem>
          <MenuItem
            selected={statusFilter === "completed"}
            onClick={() => handleFilterChange("completed")}
          >
            Completed
          </MenuItem>
          <MenuItem
            selected={statusFilter === "failed"}
            onClick={() => handleFilterChange("failed")}
          >
            Failed
          </MenuItem>
          <MenuItem
            selected={statusFilter === "cancelled"}
            onClick={() => handleFilterChange("cancelled")}
          >
            Cancelled
          </MenuItem>
          <MenuItem
            selected={statusFilter === "running"}
            onClick={() => handleFilterChange("running")}
          >
            Running
          </MenuItem>
        </Menu>
      </Box>

      {/* Execution list */}
      <List
        sx={{
          flex: 1,
          overflow: "auto",
          p: 0
        }}
      >
        {filteredExecutions.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: theme.vars.palette.text.secondary,
              gap: 1
            }}
          >
            <HistoryIcon sx={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant="body2" color="text.secondary">
              {searchQuery || statusFilter !== "all"
                ? "No executions match your filters"
                : "No execution history yet"}
            </Typography>
          </Box>
        ) : (
          filteredExecutions.map((execution) => (
            <ListItem
              key={execution.id}
              disablePadding
              secondaryAction={
                <Tooltip title="Remove from history">
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={() => removeExecution(execution.id)}
                    sx={{ color: theme.vars.palette.action.active }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              }
              sx={{
                borderBottom: `1px solid ${alpha(theme.vars.palette.common.black, 0.06)}`
              }}
            >
              <ListItemButton>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mr: 1
                  }}
                >
                  <StatusIcon status={execution.status} />
                  <Box>
                    <ListItemText
                      primary={execution.workflowName}
                      primaryTypographyProps={{
                        variant: "body2",
                        fontWeight: 500
                      }}
                      secondary={
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            mt: 0.25
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            {formatDistanceToNow(execution.startTime, {
                              addSuffix: true
                            })}
                          </Typography>
                          {execution.nodeCount > 0 && (
                            <Chip
                              label={`${execution.nodeCount} nodes`}
                              size="small"
                              variant="outlined"
                              sx={{ height: 20, fontSize: "0.7rem" }}
                            />
                          )}
                          {execution.duration !== undefined && (
                            <Chip
                              label={formatDuration(execution.duration)}
                              size="small"
                              variant="outlined"
                              sx={{ height: 20, fontSize: "0.7rem" }}
                            />
                          )}
                          {execution.errorMessage && (
                            <Typography
                              variant="caption"
                              color="error"
                              sx={{
                                maxWidth: 200,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap"
                              }}
                            >
                              {execution.errorMessage}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </Box>
                </Box>
              </ListItemButton>
            </ListItem>
          ))
        )}
      </List>

      {/* Footer with clear all */}
      {executions.length > 0 && (
        <Box
          sx={{
            p: 1,
            borderTop: `1px solid ${alpha(theme.vars.palette.common.black, 0.12)}`
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
            onClick={handleClearAll}
          >
            Clear all history
          </Typography>
        </Box>
      )}
    </Box>
  );
};
