/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  TextField,
  Chip,
  Collapse
} from "@mui/material";
import {
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Close as CloseIcon,
  ExpandLess as ExpandLessIcon,
  ChevronRight as ChevronRightIcon
} from "@mui/icons-material";
import useErrorStore from "../../stores/ErrorStore";
import { useNodes } from "../../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";
import isEqual from "lodash/isEqual";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.default,
    ".error-panel-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.spacing(1.5, 2),
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`,
      backgroundColor: theme.vars.palette.background.paper
    },
    ".error-panel-title": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1)
    },
    ".error-panel-content": {
      flex: 1,
      overflowY: "auto",
      padding: theme.spacing(1)
    },
    ".error-panel-filters": {
      display: "flex",
      gap: theme.spacing(1),
      padding: theme.spacing(1, 2),
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`,
      backgroundColor: theme.vars.palette.background.paper
    },
    ".error-panel-search": {
      padding: theme.spacing(1, 2)
    },
    ".error-item": {
      marginBottom: theme.spacing(1),
      borderRadius: theme.vars.shape.borderRadius,
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      backgroundColor: theme.vars.palette.background.paper,
      transition: "all 150ms ease",
      cursor: "pointer",
      "&:hover": {
        borderColor: theme.vars.palette.primary.main,
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".error-item-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: theme.spacing(1, 1.5),
      cursor: "pointer",
      userSelect: "none"
    },
    ".error-item-icon": {
      flexShrink: 0
    },
    ".error-item-info": {
      flex: 1,
      minWidth: 0
    },
    ".error-item-node": {
      fontWeight: 500,
      fontSize: theme.typography.fontSize,
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".error-item-type": {
      fontSize: theme.typography.body2.fontSize,
      color: theme.vars.palette.text.secondary
    },
    ".error-item-body": {
      padding: theme.spacing(0, 1.5, 1.5, 4.5)
    },
    ".error-message": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.typography.body2.fontSize,
      color: theme.vars.palette.text.primary,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      wordBreak: "break-word",
      maxHeight: "200px",
      overflowY: "auto",
      padding: theme.spacing(1),
      backgroundColor: theme.vars.palette.grey[900],
      borderRadius: theme.vars.shape.borderRadiusSm
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: theme.vars.palette.text.secondary,
      gap: theme.spacing(1)
    },
    ".error-icon-error": {
      color: theme.vars.palette.error.main
    },
    ".error-icon-warning": {
      color: theme.vars.palette.warning.main
    },
    ".error-icon-info": {
      color: theme.vars.palette.info.main
    },
    ".severity-chip": {
      height: "20px",
      fontSize: "0.7rem"
    }
  });

/**
 * Error severity levels
 */
export type ErrorSeverity = "error" | "warning" | "info";

/**
 * Determine error severity from error content
 */
const getErrorSeverity = (error: Error | string | Record<string, unknown> | null): ErrorSeverity => {
  if (!error) {
    return "info";
  }

  const errorStr = typeof error === "string" ? error.toLowerCase() :
    error instanceof Error ? error.message.toLowerCase() :
    typeof error === "object" && "message" in error ?
      String(error.message).toLowerCase() : "";

  if (errorStr.includes("warning") || errorStr.includes("deprecated")) {
    return "warning";
  }
  if (errorStr.includes("info") || errorStr.includes("note")) {
    return "info";
  }
  return "error";
};

/**
 * Get icon for error severity
 */
const getSeverityIcon = (severity: ErrorSeverity) => {
  switch (severity) {
    case "error":
      return <ErrorIcon fontSize="small" className="error-icon-error" />;
    case "warning":
      return <WarningIcon fontSize="small" className="error-icon-warning" />;
    case "info":
      return <InfoIcon fontSize="small" className="error-icon-info" />;
    default:
      return <ErrorIcon fontSize="small" />;
  }
};

/**
 * Format error for display
 */
const formatError = (error: Error | string | Record<string, unknown> | null): string => {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return JSON.stringify(error);
};

/**
 * Error item data structure
 */
interface ErrorItem {
  workflowId: string;
  nodeId: string;
  error: Error | string | Record<string, unknown> | null;
  severity: ErrorSeverity;
  nodeName: string;
  errorType: string;
}

interface ErrorPanelProps {
  workflowId: string;
  onClose?: () => void;
}

/**
 * ErrorPanel component
 *
 * Displays a centralized view of all workflow errors with:
 * - Error grouping by severity
 * - Search and filtering
 * - Quick navigation to error locations
 * - Expandable error details
 */
export const ErrorPanel: React.FC<ErrorPanelProps> = memo(({ workflowId, onClose }) => {
  const theme = useTheme();
  const reactFlow = useReactFlow();
  const nodes = useNodes((state) => state.nodes);

  // Get all errors for the current workflow
  const errors = useErrorStore((state) => {
    const workflowErrors: ErrorItem[] = [];

    Object.entries(state.errors).forEach(([key, error]) => {
      const [wfId, nodeId] = key.split(":");
      if (wfId === workflowId) {
        const node = nodes.find((n) => n.id === nodeId);
        const severity = getErrorSeverity(error);
        // Use node.name if available (standard ReactFlow), fallback to node id
        const nodeName = (node as { data?: { name?: string } })?.data?.name || nodeId;
        // Use node.type for the node type
        const errorType = node?.type || "Unknown";

        workflowErrors.push({
          workflowId: wfId,
          nodeId,
          error,
          severity,
          nodeName,
          errorType
        });
      }
    });

    return workflowErrors;
  }, isEqual);

  // Sort errors by severity (error > warning > info)
  const sortedErrors = useMemo(() => {
    const severityOrder = { error: 0, warning: 1, info: 2 };
    return [...errors].sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) {
        return severityDiff;
      }
      return a.nodeName.localeCompare(b.nodeName);
    });
  }, [errors]);

  // State for filters and expanded items
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<ErrorSeverity | "all">("all");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Filter errors based on search and severity
  const filteredErrors = useMemo(() => {
    return sortedErrors.filter((item) => {
      const matchesSearch =
        searchQuery === "" ||
        item.nodeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        formatError(item.error).toLowerCase().includes(searchQuery.toLowerCase());

      const matchesSeverity = severityFilter === "all" || item.severity === severityFilter;

      return matchesSearch && matchesSeverity;
    });
  }, [sortedErrors, searchQuery, severityFilter]);

  // Toggle expand state for an error item
  const toggleExpanded = useCallback((nodeId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Navigate to node with error
  const handleNodeClick = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node && node.position) {
        reactFlow.setCenter(node.position.x, node.position.y, { zoom: 1, duration: 300 });
      }
    },
    [nodes, reactFlow]
  );

  // Toggle severity filter

  // Toggle severity filter
  const toggleSeverityFilter = useCallback((severity: ErrorSeverity | "all") => {
    setSeverityFilter((prev) => (prev === severity ? "all" : severity));
  }, []);

  // Count errors by severity
  const errorCounts = useMemo(() => {
    return errors.reduce(
      (acc, item) => {
        acc[item.severity]++;
        return acc;
      },
      { error: 0, warning: 0, info: 0 }
    );
  }, [errors]);

  return (
    <Box css={styles(theme)} className="error-panel">
      {/* Header */}
      <Box className="error-panel-header">
        <Box className="error-panel-title">
          <ErrorIcon color="error" />
          <Typography variant="subtitle2" fontWeight="medium">
            Errors ({filteredErrors.length})
          </Typography>
        </Box>
        {onClose && (
          <Tooltip title="Close error panel" enterDelay={TOOLTIP_ENTER_DELAY}>
            <IconButton size="small" onClick={onClose} aria-label="Close error panel">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Severity Filters */}
      <Box className="error-panel-filters">
        <Chip
          label={`All (${errors.length})`}
          size="small"
          color={severityFilter === "all" ? "primary" : "default"}
          onClick={() => toggleSeverityFilter("all")}
          className="severity-chip"
        />
        <Chip
          icon={<ErrorIcon fontSize="small" />}
          label={`Errors (${errorCounts.error})`}
          size="small"
          color={severityFilter === "error" ? "error" : "default"}
          onClick={() => toggleSeverityFilter("error")}
          className="severity-chip"
        />
        <Chip
          icon={<WarningIcon fontSize="small" />}
          label={`Warnings (${errorCounts.warning})`}
          size="small"
          color={severityFilter === "warning" ? "warning" : "default"}
          onClick={() => toggleSeverityFilter("warning")}
          className="severity-chip"
        />
        <Chip
          icon={<InfoIcon fontSize="small" />}
          label={`Info (${errorCounts.info})`}
          size="small"
          color={severityFilter === "info" ? "info" : "default"}
          onClick={() => toggleSeverityFilter("info")}
          className="severity-chip"
        />
      </Box>

      {/* Search */}
      <Box className="error-panel-search">
        <TextField
          fullWidth
          size="small"
          placeholder="Search errors..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoComplete="off"
        />
      </Box>

      {/* Content */}
      <Box className="error-panel-content">
        {filteredErrors.length === 0 ? (
          <Box className="empty-state">
            <InfoIcon fontSize="large" />
            <Typography variant="body2">
              {errors.length === 0
                ? "No errors in this workflow"
                : "No errors match your filters"}
            </Typography>
          </Box>
        ) : (
          filteredErrors.map((item) => (
            <Box
              key={item.nodeId}
              className="error-item"
              onClick={() => handleNodeClick(item.nodeId)}
            >
              <Box
                className="error-item-header"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(item.nodeId);
                }}
              >
                <Box className="error-item-icon">{getSeverityIcon(item.severity)}</Box>
                <Box className="error-item-info">
                  <Box className="error-item-node" title={item.nodeName}>
                    {item.nodeName}
                  </Box>
                  <Box className="error-item-type">{item.errorType}</Box>
                </Box>
                <Box>
                  {expandedItems.has(item.nodeId) ? (
                    <ExpandLessIcon fontSize="small" />
                  ) : (
                    <ChevronRightIcon fontSize="small" />
                  )}
                </Box>
              </Box>
              <Collapse in={expandedItems.has(item.nodeId)}>
                <Box className="error-item-body">
                  <Box className="error-message">{formatError(item.error)}</Box>
                </Box>
              </Collapse>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
});

ErrorPanel.displayName = "ErrorPanel";

export default memo(ErrorPanel, isEqual);
