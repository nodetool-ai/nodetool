/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Collapse,
  List,
  ListItem,
  ListItemButton,
  Chip,
  Tooltip
} from "@mui/material";
import ErrorIcon from "@mui/icons-material/Error";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { useReactFlow } from "@xyflow/react";
import useErrorStore from "../../stores/ErrorStore";
import { useNodes } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";

interface WorkflowErrorSummaryPanelProps {
  visible?: boolean;
  onClose?: () => void;
}

const styles = (theme: Theme) =>
  css({
    position: "fixed",
    top: 80,
    right: 20,
    width: 380,
    maxHeight: "calc(100vh - 120px)",
    zIndex: 14000,
    display: "flex",
    flexDirection: "column",
    backgroundColor: theme.vars.palette.background.paper,
    borderRadius: "12px",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
    border: `1px solid ${theme.vars.palette.error.main}40`,
    overflow: "hidden",
    animation: "slideIn 0.2s ease-out forwards",
    "@keyframes slideIn": {
      "0%": { opacity: 0, transform: "translateX(20px)" },
      "100%": { opacity: 1, transform: "translateX(0)" }
    },
    "& .panel-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      backgroundColor: theme.vars.palette.error.main + "15",
      borderBottom: `1px solid ${theme.vars.palette.error.main}30`
    },
    "& .panel-title": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: "14px",
      fontWeight: 600,
      color: theme.vars.palette.error.main
    },
    "& .panel-content": {
      flex: 1,
      overflowY: "auto",
      padding: "8px 0",
      "&::-webkit-scrollbar": {
        width: "6px"
      },
      "&::-webkit-scrollbar-track": {
        background: "transparent"
      },
      "&::-webkit-scrollbar-thumb": {
        backgroundColor: theme.vars.palette.action.disabledBackground,
        borderRadius: "8px"
      }
    },
    "& .error-list-item": {
      padding: "8px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "&:last-child": {
        borderBottom: "none"
      }
    },
    "& .error-list-button": {
      width: "100%",
      padding: "8px 12px",
      minHeight: "auto",
      borderRadius: 0,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    "& .error-item-content": {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      width: "100%"
    },
    "& .error-node-name": {
      fontSize: "13px",
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    "& .error-message": {
      fontSize: "12px",
      color: theme.vars.palette.error.main,
      lineHeight: 1.4,
      overflow: "hidden",
      textOverflow: "ellipsis",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      wordBreak: "break-word"
    },
    "& .error-severity-chip": {
      fontSize: "10px",
      height: "18px",
      textTransform: "uppercase"
    },
    "& .empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 16px",
      color: theme.vars.palette.text.secondary,
      textAlign: "center"
    },
    "& .summary-section": {
      padding: "12px 16px",
      backgroundColor: theme.vars.palette.action.hover,
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    }
  });

/**
 * WorkflowErrorSummaryPanel displays all errors in the current workflow
 * with quick navigation to problematic nodes.
 *
 * Features:
 * - Shows count of errors by severity
 * - Lists all errors with node names and messages
 * - Click to navigate to error node
 * - Expandable error details
 * - Clear all errors button
 */
const WorkflowErrorSummaryPanel: React.FC<WorkflowErrorSummaryPanelProps> = memo(
  ({ visible = true, onClose }) => {
    const theme = useTheme();
    const memoizedStyles = useMemo(() => styles(theme), [theme]);
    const { setCenter } = useReactFlow();
    const { nodes } = useNodes((state) => ({ nodes: state.nodes }));
    const getMetadata = useMetadataStore((state) => state.getMetadata);
    const errors = useErrorStore((state) => state.errors);
    const clearErrors = useErrorStore((state) => state.clearErrors);

    const [expandedError, setExpandedError] = useState<string | null>(null);

    // Get current workflow ID from the first node
    const workflowId = useMemo(() => {
      if (nodes.length > 0) {
        const firstNodeData = nodes[0].data as { workflow_id?: string };
        return firstNodeData.workflow_id || "";
      }
      return "";
    }, [nodes]);

    // Extract errors for current workflow
    const workflowErrors = useMemo(() => {
      const entries = Object.entries(errors);
      return entries
        .filter(([key]) => key.startsWith(workflowId + ":"))
        .map(([key, error]) => {
          const [, nodeId] = key.split(":");
          const node = nodes.find((n) => n.id === nodeId);
          const metadata = node ? getMetadata(node.type || "") : null;
          return {
            nodeId,
            node,
            nodeName: metadata?.title || node?.data?.title || nodeId,
            error,
            position: node?.position
          };
        })
        .filter((item) => item.node !== undefined);
    }, [errors, workflowId, nodes, getMetadata]);

    const errorCount = workflowErrors.length;

    const handleClose = useCallback(() => {
      onClose?.();
    }, [onClose]);

    const handleClearAll = useCallback(() => {
      clearErrors(workflowId);
    }, [workflowId, clearErrors]);

    const handleNavigateToError = useCallback(
      (nodeId: string, position?: { x: number; y: number }) => () => {
        const node = nodes.find((n) => n.id === nodeId);
        if (node && position) {
          setCenter(position.x, position.y, { zoom: 1.2, duration: 300 });
        }
      },
      [nodes, setCenter]
    );

    const handleToggleExpand = useCallback(
      (nodeId: string) => () => {
        setExpandedError((prev) => (prev === nodeId ? null : nodeId));
      },
      []
    );

    const formatErrorMessage = useCallback((error: unknown): string => {
      if (typeof error === "string") {
        return error;
      }
      if (error instanceof Error) {
        return error.message;
      }
      if (error && typeof error === "object" && "message" in error) {
        return String(error.message);
      }
      return JSON.stringify(error);
    }, []);

    if (!visible) {
      return null;
    }

    return (
      <Box css={memoizedStyles} className="workflow-error-summary-panel">
        <Box className="panel-header">
          <Box className="panel-title">
            <ErrorIcon fontSize="small" />
            <Typography variant="inherit">
              {errorCount} Error{errorCount !== 1 ? "s" : ""}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Tooltip title="Clear all errors" placement="top">
              <IconButton
                size="small"
                onClick={handleClearAll}
                disabled={errorCount === 0}
                sx={{ color: "text.secondary" }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {onClose && (
              <Tooltip title="Close panel" placement="top">
                <IconButton
                  size="small"
                  onClick={handleClose}
                  sx={{ color: "text.secondary" }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        {errorCount === 0 ? (
          <Box className="empty-state">
            <ErrorIcon
              sx={{ fontSize: 32, marginBottom: 1, opacity: 0.3, color: "success.main" }}
            />
            <Typography variant="body2">No errors in workflow</Typography>
          </Box>
        ) : (
          <List className="panel-content" disablePadding>
            {workflowErrors.map((item) => {
              const errorMessage = formatErrorMessage(item.error);
              const isExpanded = expandedError === item.nodeId;

              return (
                <ListItem key={item.nodeId} disablePadding className="error-list-item">
                  <ListItemButton
                    className="error-list-button"
                    onClick={handleNavigateToError(item.nodeId, item.position)}
                  >
                    <Box
                      className="error-item-content"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNavigateToError(item.nodeId, item.position)();
                      }}
                    >
                      <Box className="error-node-name">
                        <Typography variant="inherit">{item.nodeName}</Typography>
                        <Chip
                          label="Error"
                          color="error"
                          size="small"
                          className="error-severity-chip"
                        />
                        <Tooltip
                          title={isExpanded ? "Collapse" : "Expand"}
                          placement="top"
                        >
                          <IconButton
                            size="small"
                            onClick={handleToggleExpand(item.nodeId)}
                            sx={{ padding: "2px", marginLeft: "auto" }}
                          >
                            {isExpanded ? (
                              <ExpandLessIcon fontSize="small" />
                            ) : (
                              <ExpandMoreIcon fontSize="small" />
                            )}
                          </IconButton>
                        </Tooltip>
                      </Box>
                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Typography className="error-message">
                          {errorMessage}
                        </Typography>
                      </Collapse>
                      {!isExpanded && (
                        <Typography className="error-message">
                          {errorMessage}
                        </Typography>
                      )}
                    </Box>
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </Box>
    );
  }
);

WorkflowErrorSummaryPanel.displayName = "WorkflowErrorSummaryPanel";

export default WorkflowErrorSummaryPanel;
