/**
 * WorkflowErrorSummary
 *
 * Panel component for viewing and navigating all errors in a workflow.
 * Displays a consolidated list of node errors with filtering and navigation.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  Tooltip,
  Chip,
  TextField,
  InputAdornment,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Badge,
  Collapse,
  Divider
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import DeleteIcon from "@mui/icons-material/Delete";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ErrorIcon from "@mui/icons-material/Error";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useErrorStore from "../../stores/ErrorStore";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import PanelHeadline from "../ui/PanelHeadline";
import type { Node } from "@xyflow/react";
import type { NodeData } from "../../stores/NodeData";
import isEqual from "lodash/isEqual";
import { useTheme } from "@mui/material/styles";

export interface WorkflowErrorSummaryProps {
  /** Optional className for styling */
  className?: string;
}

interface NodeErrorEntry {
  nodeId: string;
  nodeTitle: string;
  nodeType: string;
  error: string | Error | Record<string, unknown>;
  errorType: "runtime" | "validation" | "execution" | "unknown";
}

/**
 * Categorize error based on content
 */
const categorizeError = (
  error: string | Error | Record<string, unknown> | null
): NodeErrorEntry["errorType"] => {
  if (!error) {
    return "unknown";
  }

  const errorStr =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "message" in error
          ? String(error.message)
          : JSON.stringify(error);

  const lowerStr = errorStr.toLowerCase();

  if (
    lowerStr.includes("validation") ||
    lowerStr.includes("invalid") ||
    lowerStr.includes("required") ||
    lowerStr.includes("missing")
  ) {
    return "validation";
  }

  if (
    lowerStr.includes("execution") ||
    lowerStr.includes("failed to execute") ||
    lowerStr.includes("runtime")
  ) {
    return "runtime";
  }

  if (lowerStr.includes("timeout") || lowerStr.includes("memory")) {
    return "execution";
  }

  return "unknown";
};

/**
 * Format error for display
 */
const formatErrorDisplay = (
  error: string | Error | Record<string, unknown>
): string => {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if ("message" in error) {
    return String(error.message);
  }
  return JSON.stringify(error);
};

/**
 * Get error type display properties
 */
interface ErrorTypeConfig {
  label: string;
  color: string;
  icon: React.ReactElement;
}

const getErrorTypeConfig = (
  errorType: NodeErrorEntry["errorType"],
  theme: any
): ErrorTypeConfig => {
  const configs: Record<NodeErrorEntry["errorType"], ErrorTypeConfig> = {
    runtime: {
      label: "Runtime",
      color: theme.vars.palette.error.main,
      icon: <ErrorIcon fontSize="small" />
    },
    validation: {
      label: "Validation",
      color: theme.vars.palette.warning.main,
      icon: <ErrorIcon fontSize="small" />
    },
    execution: {
      label: "Execution",
      color: theme.vars.palette.error.main,
      icon: <ErrorIcon fontSize="small" />
    },
    unknown: {
      label: "Error",
      color: theme.vars.palette.grey[500],
      icon: <ErrorIcon fontSize="small" />
    }
  };
  return configs[errorType];
};

/**
 * Panel for viewing and managing workflow errors
 */
const WorkflowErrorSummary: React.FC<WorkflowErrorSummaryProps> = memo(
  ({ className }) => {
    const theme = useTheme();
    const { nodes } = useNodes((state) => ({ nodes: state.nodes }));
    const currentWorkflowId = useWorkflowManager(
      (state) => state.currentWorkflowId
    );
    const clearErrors = useErrorStore((state) => state.clearErrors);
    const clearNodeErrors = useErrorStore((state) => state.clearNodeErrors);
    const getError = useErrorStore((state) => state.getError);
    const setPanelVisible = useRightPanelStore((state) => state.setVisibility);
    const setActiveView = useRightPanelStore((state) => state.setActiveView);

    const [searchQuery, setSearchQuery] = useState("");
    const [filterType, setFilterType] = useState<
      "all" | NodeErrorEntry["errorType"]
    >("all");
    const [expandedErrors, setExpandedErrors] = useState<Set<string>>(
      new Set()
    );

    // Collect all errors from nodes
    const errorEntries = useMemo<NodeErrorEntry[]>(() => {
      if (!currentWorkflowId) {
        return [];
      }

      const entries: NodeErrorEntry[] = [];

      nodes.forEach((node: Node<NodeData>) => {
        const error = getError(currentWorkflowId, node.id);
        if (!error) {
          return;
        }

        const metadata = node.data;
        const nodeTitle =
          metadata?.title?.trim() ||
          (metadata?.properties?.name as string | undefined) ||
          node.id;

        entries.push({
          nodeId: node.id,
          nodeTitle,
          nodeType: node.type || "unknown",
          error,
          errorType: categorizeError(error)
        });
      });

      return entries;
    }, [nodes, currentWorkflowId, getError]);

    // Filter errors by search and type
    const filteredErrors = useMemo(() => {
      let filtered = errorEntries;

      // Filter by type
      if (filterType !== "all") {
        filtered = filtered.filter((e) => e.errorType === filterType);
      }

      // Filter by search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (e) =>
            e.nodeTitle.toLowerCase().includes(query) ||
            e.nodeType.toLowerCase().includes(query) ||
            formatErrorDisplay(e.error).toLowerCase().includes(query)
        );
      }

      return filtered;
    }, [errorEntries, filterType, searchQuery]);

    // Error counts by type
    const errorCounts = useMemo(() => {
      const counts: Record<string, number> = {
        all: errorEntries.length
      };

      errorEntries.forEach((entry) => {
        counts[entry.errorType] = (counts[entry.errorType] || 0) + 1;
      });

      return counts;
    }, [errorEntries]);

    // Handle navigating to a node
    const handleNavigateToNode = useCallback(
      (nodeId: string) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) {
          return;
        }

        // Dispatch custom event to focus on node
        requestAnimationFrame(() => {
          window.dispatchEvent(
            new CustomEvent("nodetool:fit-node", {
              detail: { nodeId, node }
            })
          );
        });

        // Switch to inspector view for this node
        setActiveView("inspector");
        setPanelVisible(true);
      },
      [nodes, setActiveView, setPanelVisible]
    );

    // Handle clearing all errors
    const handleClearAllErrors = useCallback(() => {
      if (currentWorkflowId) {
        clearErrors(currentWorkflowId);
      }
    }, [currentWorkflowId, clearErrors]);

    // Handle clearing a specific error
    const handleClearError = useCallback(
      (nodeId: string) => {
        if (currentWorkflowId) {
          clearNodeErrors(currentWorkflowId, nodeId);
        }
      },
      [currentWorkflowId, clearNodeErrors]
    );

    // Toggle error expansion
    const toggleExpansion = useCallback((nodeId: string) => {
      setExpandedErrors((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
        }
        return next;
      });
    }, []);

    // Pre-compute error type configs for all errors
    const errorTypeConfigs = useMemo(() => {
      const configs: Record<string, ErrorTypeConfig> = {};
      filteredErrors.forEach((entry) => {
        if (!configs[entry.errorType]) {
          configs[entry.errorType] = getErrorTypeConfig(entry.errorType, theme);
        }
      });
      return configs;
    }, [filteredErrors, theme]);

    return (
      <Box className={className} sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <PanelHeadline
          title="Workflow Errors"
          actions={
            <Tooltip title="Clear all errors">
              <IconButton
                size="small"
                onClick={handleClearAllErrors}
                disabled={errorEntries.length === 0}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          }
        />

        {/* Summary alert */}
        {errorEntries.length > 0 && (
          <Alert
            severity={errorEntries.length > 5 ? "error" : "warning"}
            sx={{ mx: 2, mt: 1 }}
          >
            <Typography variant="body2">
              {errorEntries.length} error{errorEntries.length !== 1 ? "s" : ""}{" "}
              found in workflow
            </Typography>
          </Alert>
        )}

        {/* Empty state */}
        {errorEntries.length === 0 && (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              p: 3,
              textAlign: "center"
            }}
          >
            <CheckCircleIcon
              sx={{
                fontSize: 64,
                color: "success.main",
                mb: 2
              }}
            />
            <Typography variant="h6" gutterBottom>
              No Errors
            </Typography>
            <Typography variant="body2" color="text.secondary">
              All nodes are running without errors
            </Typography>
          </Box>
        )}

        {/* Filters */}
        {errorEntries.length > 0 && (
          <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            {/* Search */}
            <TextField
              fullWidth
              size="small"
              placeholder="Search errors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                )
              }}
            />

            {/* Type filter */}
            <FormControl size="small" fullWidth>
              <InputLabel id="error-type-filter-label">Error Type</InputLabel>
              <Select
                labelId="error-type-filter-label"
                value={filterType}
                label="Error Type"
                onChange={(e) =>
                  setFilterType(
                    e.target.value as "all" | NodeErrorEntry["errorType"]
                  )
                }
              >
                <MenuItem value="all">
                  All Types ({errorCounts.all || 0})
                </MenuItem>
                <MenuItem value="validation">
                  <Badge
                    badgeContent={errorCounts.validation || 0}
                    color="warning"
                    sx={{ mr: 1 }}
                  >
                    Validation
                  </Badge>
                </MenuItem>
                <MenuItem value="runtime">
                  <Badge
                    badgeContent={errorCounts.runtime || 0}
                    color="error"
                    sx={{ mr: 1 }}
                  >
                    Runtime
                  </Badge>
                </MenuItem>
                <MenuItem value="execution">
                  <Badge
                    badgeContent={errorCounts.execution || 0}
                    color="error"
                    sx={{ mr: 1 }}
                  >
                    Execution
                  </Badge>
                </MenuItem>
              </Select>
            </FormControl>
          </Box>
        )}

        {/* Errors list */}
        {filteredErrors.length === 0 && errorEntries.length > 0 && (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              p: 3,
              textAlign: "center"
            }}
          >
            <Typography variant="body2" color="text.secondary">
              No errors match your filters
            </Typography>
          </Box>
        )}

        <Box sx={{ flexGrow: 1, overflow: "auto" }}>
          {filteredErrors.length > 0 && (
            <List dense disablePadding>
              {filteredErrors.map((entry, index) => {
                const errorTypeConfig = errorTypeConfigs[entry.errorType];
                const errorDisplay = formatErrorDisplay(entry.error);
                const isExpanded = expandedErrors.has(entry.nodeId);

                return (
                  <React.Fragment key={entry.nodeId}>
                    <ListItem
                      disablePadding
                      secondaryAction={
                        <ListItemSecondaryAction>
                          <Tooltip title="Clear error">
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={() => handleClearError(entry.nodeId)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Go to node">
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={() => handleNavigateToNode(entry.nodeId)}
                            >
                              <NavigateNextIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </ListItemSecondaryAction>
                      }
                    >
                      <ListItemButton
                        onClick={() => toggleExpansion(entry.nodeId)}
                        sx={{ py: 1.5 }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            mr: 1
                          }}
                        >
                          <ExpandMoreIcon
                            fontSize="small"
                            sx={{
                              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                              transition: "transform 0.2s"
                            }}
                          />
                          {errorTypeConfig.icon}
                        </Box>
                        <ListItemText
                          primary={
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                flexWrap: "wrap"
                              }}
                            >
                              <Typography variant="subtitle2" noWrap>
                                {entry.nodeTitle}
                              </Typography>
                              <Chip
                                label={entry.nodeType}
                                size="small"
                                variant="outlined"
                                sx={{ height: 20, fontSize: "0.7rem" }}
                              />
                              <Chip
                                label={errorTypeConfig.label}
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: "0.7rem",
                                  backgroundColor: errorTypeConfig.color,
                                  color: "white"
                                }}
                              />
                            </Box>
                          }
                          secondary={
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                display: "block",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                mt: 0.5
                              }}
                            >
                              {errorDisplay}
                            </Typography>
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                    {isExpanded && (
                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box
                          sx={{
                            p: 2,
                            pl: 6,
                            bgcolor: (theme as any).vars.palette.action.hover
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word"
                            }}
                          >
                            {errorDisplay}
                          </Typography>
                        </Box>
                      </Collapse>
                    )}
                    {index < filteredErrors.length - 1 && (
                      <Divider variant="middle" />
                    )}
                  </React.Fragment>
                );
              })}
            </List>
          )}
        </Box>
      </Box>
    );
  },
  isEqual
);

WorkflowErrorSummary.displayName = "WorkflowErrorSummary";

export default WorkflowErrorSummary;
