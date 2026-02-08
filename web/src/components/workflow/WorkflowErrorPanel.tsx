/** @jsxImportSource @emotion/react */
import { memo, useMemo, useState, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack
} from "@mui/material";
import {
  ExpandMore,
  Close,
  Search,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  CheckCircle
} from "@mui/icons-material";
import { ErrorSeverity } from "../node/ErrorBadge";
import useErrorStore from "../../stores/ErrorStore";
import { CopyButton } from "../ui_primitives";

const getSeverityColor = (severity: ErrorSeverity, theme: Theme): string => {
  switch (severity) {
    case ErrorSeverity.CRITICAL:
      return theme.vars.palette.error.main;
    case ErrorSeverity.WARNING:
      return theme.vars.palette.warning.main;
    case ErrorSeverity.INFO:
    default:
      return theme.vars.palette.info.main;
  }
};

const getSeverityIcon = (severity: ErrorSeverity) => {
  switch (severity) {
    case ErrorSeverity.CRITICAL:
      return <ErrorIcon fontSize="small" />;
    case ErrorSeverity.WARNING:
      return <WarningIcon fontSize="small" />;
    case ErrorSeverity.INFO:
    default:
      return <InfoIcon fontSize="small" />;
  }
};

const getSeverityLabel = (severity: ErrorSeverity): string => {
  switch (severity) {
    case ErrorSeverity.CRITICAL:
      return "Critical";
    case ErrorSeverity.WARNING:
      return "Warning";
    case ErrorSeverity.INFO:
      return "Info";
  }
};

interface WorkflowError {
  nodeId: string;
  nodeName: string;
  error: Error | string | Record<string, unknown>;
  severity: ErrorSeverity;
  errorText: string;
}

type FilterType = "all" | ErrorSeverity;

interface WorkflowErrorPanelProps {
  workflowId: string;
  onClose?: () => void;
}

/**
 * WorkflowErrorPanel displays all errors in a workflow with filtering and search.
 *
 * Features:
 * - Shows all errors across all nodes in the workflow
 * - Filter by severity (critical, warning, info)
 * - Search errors by text content
 * - Expandable error details
 * - Copy error to clipboard
 * - Clear individual or all errors
 *
 * @param props - Component props
 * @returns Workflow error panel component
 */
export const WorkflowErrorPanel: React.FC<WorkflowErrorPanelProps> = memo(
  ({ workflowId, onClose }: WorkflowErrorPanelProps) => {
    const theme = useTheme();
    const allErrors = useErrorStore((state) => state.errors);
    const clearErrors = useErrorStore((state) => state.clearErrors);
    const clearNodeErrors = useErrorStore((state) => state.clearNodeErrors);

    const [filter, setFilter] = useState<FilterType>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedPanels, setExpandedPanels] = useState<Set<string>>(new Set());

    // Get all errors for this workflow
    const workflowErrors: WorkflowError[] = useMemo(() => {
      const errors: WorkflowError[] = [];

      for (const [key, error] of Object.entries(allErrors)) {
        if (!key.startsWith(`${workflowId}:`) || !error) {
          continue;
        }

        const nodeId = key.split(":")[1];
        const nodeName = nodeId; // Use node ID as name for now

        // Determine severity
        const severity = getSeverityFromError(error);

        // Extract error text
        let errorText = "";
        if (typeof error === "string") {
          errorText = error;
        } else if (error instanceof Error) {
          errorText = error.message;
        } else if (typeof error === "object" && "message" in error) {
          errorText = String((error as { message: string }).message);
        } else {
          errorText = JSON.stringify(error);
        }

        errors.push({
          nodeId,
          nodeName,
          error,
          severity,
          errorText
        });
      }

      return errors;
    }, [allErrors, workflowId]);

    // Filter errors by severity and search query
    const filteredErrors = useMemo(() => {
      return workflowErrors.filter((error) => {
        // Filter by severity
        if (filter !== "all" && error.severity !== filter) {
          return false;
        }

        // Filter by search query
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return (
            error.errorText.toLowerCase().includes(query) ||
            error.nodeName.toLowerCase().includes(query) ||
            error.nodeId.toLowerCase().includes(query)
          );
        }

        return true;
      });
    }, [workflowErrors, filter, searchQuery]);

    // Calculate error counts by severity
    const errorCounts = useMemo(() => {
      const counts = {
        critical: 0,
        warning: 0,
        info: 0,
        total: workflowErrors.length
      };

      for (const error of workflowErrors) {
        switch (error.severity) {
          case ErrorSeverity.CRITICAL:
            counts.critical++;
            break;
          case ErrorSeverity.WARNING:
            counts.warning++;
            break;
          case ErrorSeverity.INFO:
            counts.info++;
            break;
        }
      }

      return counts;
    }, [workflowErrors]);

    const handleClearAllErrors = useCallback(() => {
      clearErrors(workflowId);
    }, [workflowId, clearErrors]);

    const handleClearNodeError = useCallback(
      (nodeId: string) => {
        clearNodeErrors(workflowId, nodeId);
      },
      [workflowId, clearNodeErrors]
    );

    const handleTogglePanel = useCallback((nodeId: string) => {
      setExpandedPanels((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(nodeId)) {
          newSet.delete(nodeId);
        } else {
          newSet.add(nodeId);
        }
        return newSet;
      });
    }, []);

    const handleExpandAll = useCallback(() => {
      setExpandedPanels(new Set(filteredErrors.map((e) => e.nodeId)));
    }, [filteredErrors]);

    const handleCollapseAll = useCallback(() => {
      setExpandedPanels(new Set());
    }, []);

    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          backgroundColor: theme.vars.palette.background.paper,
          borderLeft: `1px solid ${theme.vars.palette.divider}`,
          overflow: "hidden"
        }}
      >
        {/* Header */}
        <Box
          sx={{
            padding: theme.spacing(2),
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: theme.vars.palette.background.default
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <ErrorIcon color="error" />
            <Typography variant="h6" component="div">
              Workflow Errors
            </Typography>
            <Chip
              label={`${errorCounts.total} total`}
              size="small"
              color={errorCounts.critical > 0 ? "error" : "default"}
            />
          </Box>
          <Box sx={{ display: "flex", gap: 0.5 }}>
            {onClose && (
              <IconButton size="small" onClick={onClose}>
                <Close fontSize="small" />
              </IconButton>
            )}
          </Box>
        </Box>

        {/* Filters and Search */}
        <Box
          sx={{
            p: 2,
            borderBottom: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <Stack direction="row" spacing={1} mb={1}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search errors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                )
              }}
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Filter</InputLabel>
              <Select
                value={filter}
                label="Filter"
                onChange={(e) => setFilter(e.target.value as FilterType)}
              >
                <MenuItem value="all">All ({errorCounts.total})</MenuItem>
                <MenuItem value={ErrorSeverity.CRITICAL}>
                  Critical ({errorCounts.critical})
                </MenuItem>
                <MenuItem value={ErrorSeverity.WARNING}>
                  Warning ({errorCounts.warning})
                </MenuItem>
                <MenuItem value={ErrorSeverity.INFO}>
                  Info ({errorCounts.info})
                </MenuItem>
              </Select>
            </FormControl>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={handleExpandAll} disabled={filteredErrors.length === 0}>
              Expand All
            </Button>
            <Button size="small" onClick={handleCollapseAll} disabled={filteredErrors.length === 0}>
              Collapse All
            </Button>
            <Button
              size="small"
              color="error"
              onClick={handleClearAllErrors}
              disabled={errorCounts.total === 0}
            >
              Clear All
            </Button>
          </Stack>
        </Box>

        {/* Error List */}
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            p: 1
          }}
        >
          {filteredErrors.length === 0 ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "text.secondary",
                gap: 1
              }}
            >
              {searchQuery || filter !== "all" ? (
                <>
                  <Search fontSize="large" />
                  <Typography>No errors match your filters</Typography>
                </>
              ) : (
                <>
                  <CheckCircle fontSize="large" color="success" />
                  <Typography>No errors in workflow</Typography>
                </>
              )}
            </Box>
          ) : (
            filteredErrors.map((error) => (
              <Accordion
                key={error.nodeId}
                expanded={expandedPanels.has(error.nodeId)}
                onChange={() => handleTogglePanel(error.nodeId)}
                elevation={0}
                sx={{
                  mb: 1,
                  borderLeft: `4px solid ${getSeverityColor(error.severity, theme)}`,
                  "&:before": { display: "none" },
                  backgroundColor: theme.vars.palette.background.default
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMore />}
                  sx={{
                    "& .MuiAccordionSummary-content": {
                      margin: "12px 0"
                    },
                    "& .MuiAccordionSummary-content.Mui-expanded": {
                      margin: "12px 0"
                    }
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: 1 }}>
                    <Box sx={{ color: getSeverityColor(error.severity, theme) }}>
                      {getSeverityIcon(error.severity)}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" noWrap>
                        {error.nodeName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {error.nodeId}
                      </Typography>
                    </Box>
                    <Chip
                      label={getSeverityLabel(error.severity)}
                      size="small"
                      sx={{
                        backgroundColor: getSeverityColor(error.severity, theme),
                        color: "common.white"
                      }}
                    />
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearNodeError(error.nodeId);
                      }}
                    >
                      <Close fontSize="small" />
                    </IconButton>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ position: "relative" }}>
                    <Box
                      sx={{
                        position: "absolute",
                        top: 0,
                        right: 0,
                        zIndex: 1
                      }}
                    >
                      <CopyButton value={error.errorText} tooltip="Copy error" />
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontSize: "0.875rem",
                        fontFamily: "monospace",
                        backgroundColor: theme.vars.palette.background.paper,
                        p: 1.5,
                        borderRadius: 1,
                        border: `1px solid ${theme.vars.palette.divider}`,
                        maxHeight: 200,
                        overflowY: "auto"
                      }}
                    >
                      {error.errorText}
                    </Typography>
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))
          )}
        </Box>

        {/* Footer with summary */}
        {errorCounts.total > 0 && (
          <Box
            sx={{
              p: 2,
              borderTop: `1px solid ${theme.vars.palette.divider}`,
              backgroundColor: theme.vars.palette.background.default
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Showing {filteredErrors.length} of {errorCounts.total} errors
            </Typography>
          </Box>
        )}
      </Box>
    );
  }
);

WorkflowErrorPanel.displayName = "WorkflowErrorPanel";

/**
 * Helper function to determine error severity
 */
const getSeverityFromError = (
  error: Error | string | null | Record<string, unknown>
): ErrorSeverity => {
  if (!error) {
    return ErrorSeverity.INFO;
  }

  let errorText = "";
  if (typeof error === "string") {
    errorText = error.toLowerCase();
  } else if (error instanceof Error) {
    errorText = error.message.toLowerCase();
  } else if (typeof error === "object" && "message" in error) {
    errorText = String((error as { message: string }).message).toLowerCase();
  }

  // Critical errors: failures, crashes, exceptions
  if (errorText.match(/failed|error|exception|crash|timeout|denied|forbidden/)) {
    return ErrorSeverity.CRITICAL;
  }

  // Warnings: deprecations, issues that don't block execution
  if (errorText.match(/warning|deprecated|retry|slow|large/)) {
    return ErrorSeverity.WARNING;
  }

  // Info: everything else
  return ErrorSeverity.INFO;
};

export default WorkflowErrorPanel;
