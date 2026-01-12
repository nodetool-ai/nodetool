/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  Divider,
  Button
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import CircleOutlinedIcon from "@mui/icons-material/CircleOutlined";
import { useReactFlow } from "@xyflow/react";
import { useSelectedNodesInfo } from "../../hooks/useSelectedNodesInfo";

const styles = (theme: Theme) =>
  css({
    "&.node-info-panel": {
      position: "fixed",
      top: "60px",
      right: "20px",
      width: "320px",
      maxHeight: "calc(100vh - 150px)",
      zIndex: 15000,
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden",
      animation: "slideIn 0.2s ease-out forwards",
      "& @keyframes slideIn": {
        "0%": { opacity: 0, transform: "translateX(20px)" },
        "100%": { opacity: 1, transform: "translateX(0)" }
      }
    },
    "& .panel-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover
    },
    "& .panel-title": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontWeight: 600,
      fontSize: "14px",
      color: theme.vars.palette.text.primary
    },
    "& .close-button": {
      padding: "4px",
      minWidth: "auto",
      height: "auto",
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: "transparent"
      }
    },
    "& .panel-content": {
      flex: 1,
      overflowY: "auto",
      padding: "12px 16px"
    },
    "& .node-info-section": {
      marginBottom: "16px",
      "&:last-child": {
        marginBottom: 0
      }
    },
    "& .section-title": {
      fontSize: "11px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      color: theme.vars.palette.text.secondary,
      marginBottom: "8px"
    },
    "& .node-name": {
      fontSize: "16px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      wordBreak: "break-word",
      marginBottom: "4px"
    },
    "& .node-type": {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      fontSize: "12px",
      color: theme.vars.palette.text.secondary,
      marginBottom: "8px"
    },
    "& .node-description": {
      fontSize: "13px",
      color: theme.vars.palette.text.secondary,
      lineHeight: 1.5,
      marginTop: "8px"
    },
    "& .connections-grid": {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "8px"
    },
    "& .connection-item": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 10px",
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "8px"
    },
    "& .connection-icon": {
      fontSize: "18px",
      color: theme.vars.palette.primary.main
    },
    "& .connection-text": {
      display: "flex",
      flexDirection: "column"
    },
    "& .connection-count": {
      fontSize: "14px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    "& .connection-label": {
      fontSize: "11px",
      color: theme.vars.palette.text.secondary
    },
    "& .actions-row": {
      display: "flex",
      gap: "8px",
      flexWrap: "wrap"
    },
    "& .action-button": {
      flex: 1,
      minWidth: "80px",
      fontSize: "12px",
      padding: "6px 10px",
      borderRadius: "6px",
      "& .MuiButton-startIcon": {
        marginRight: "4px"
      }
    },
    "& .status-row": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 10px",
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "8px"
    },
    "& .status-icon": {
      fontSize: "18px",
      "&.completed": {
        color: theme.vars.palette.success.main
      },
      "&.error": {
        color: theme.vars.palette.error.main
      },
      "&.pending": {
        color: theme.vars.palette.text.secondary
      }
    },
    "& .status-text": {
      fontSize: "13px",
      color: theme.vars.palette.text.primary
    },
    "& .error-message": {
      marginTop: "8px",
      padding: "8px 10px",
      backgroundColor: `${theme.vars.palette.error.main}15`,
      borderRadius: "8px",
      borderLeft: `3px solid ${theme.vars.palette.error.main}`
    },
    "& .error-text": {
      fontSize: "12px",
      color: theme.vars.palette.error.main,
      lineHeight: 1.4
    },
    "& .position-text": {
      fontSize: "11px",
      color: theme.vars.palette.text.disabled,
      fontFamily: "monospace"
    },
    "& .divider": {
      margin: "12px 0",
      borderColor: theme.vars.palette.divider
    },
    "& .empty-selection": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 16px",
      textAlign: "center",
      color: theme.vars.palette.text.secondary
    },
    "& .empty-icon": {
      fontSize: "40px",
      marginBottom: "12px",
      opacity: 0.4
    },
    "& .empty-text": {
      fontSize: "13px"
    }
  });

interface NodeInfoPanelProps {
  onClose?: () => void;
}

const formatNodeType = (type: string): string => {
  const parts = type.split(".");
  if (parts.length > 1) {
    return parts.slice(-1)[0];
  }
  return type;
};

const formatPosition = (x: number, y: number): string => {
  return `X: ${Math.round(x)}, Y: ${Math.round(y)}`;
};

const formatConnections = (connected: number, total: number): string => {
  if (total === 0) {
    return "N/A";
  }
  return `${connected}/${total}`;
};

const NodeInfoPanel: React.FC<NodeInfoPanelProps> = memo(({ onClose }) => {
  const theme = useTheme();
  const { nodesInfo, totalSelected, hasSingleNode, hasMultipleNodes } =
    useSelectedNodesInfo();
  const { setCenter } = useReactFlow();

  const handleCopyNodeId = useCallback((nodeId: string) => {
    void navigator.clipboard.writeText(nodeId);
  }, []);

  const handleFocusNode = useCallback(
    (x: number, y: number) => {
      setCenter(x, y, { zoom: 1.5, duration: 300 });
    },
    [setCenter]
  );

  if (totalSelected === 0) {
    return null;
  }

  const firstNode = nodesInfo[0];

  return (
    <Box className="node-info-panel" css={styles(theme)}>
      <Box className="panel-header">
        <Typography className="panel-title">
          Node Information
          {hasMultipleNodes && (
            <Chip
              label={totalSelected}
              size="small"
              sx={{ height: 20, fontSize: "11px" }}
            />
          )}
        </Typography>
        <Tooltip title="Close" arrow>
          <IconButton
            className="close-button"
            size="small"
            onClick={onClose}
            aria-label="Close node info panel"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box className="panel-content">
        {hasMultipleNodes ? (
          <Box className="node-info-section">
            <Typography className="section-title">Selected Nodes</Typography>
            <Typography variant="body2" color="text.secondary">
              {totalSelected} nodes selected
            </Typography>
            <Box sx={{ mt: 1, maxHeight: 200, overflowY: "auto" }}>
              {nodesInfo.map((node) => (
                <Box
                  key={node.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    py: 0.5,
                    px: 1,
                    borderRadius: 1,
                    "&:hover": { bgcolor: "action.hover" }
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {node.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatNodeType(node.type)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        ) : hasSingleNode ? (
          <>
            <Box className="node-info-section">
              <Typography className="section-title">Node Name</Typography>
              <Typography className="node-name">{firstNode.label}</Typography>
              <Typography className="node-type">
                {formatNodeType(firstNode.type)}
              </Typography>
              {firstNode.description && (
                <Typography className="node-description">
                  {firstNode.description}
                </Typography>
              )}
              <Typography
                className="position-text"
                sx={{ mt: 1 }}
              >{`Position: ${formatPosition(firstNode.position.x, firstNode.position.y)}`}</Typography>
            </Box>

            <Divider className="divider" />

            <Box className="node-info-section">
              <Typography className="section-title">Connections</Typography>
              <Box className="connections-grid">
                <Box className="connection-item">
                  <Box className="connection-text">
                    <Typography className="connection-count">
                      {formatConnections(
                        firstNode.connections.connectedInputs,
                        firstNode.connections.totalInputs
                      )}
                    </Typography>
                    <Typography className="connection-label">Inputs</Typography>
                  </Box>
                </Box>
                <Box className="connection-item">
                  <Box className="connection-text">
                    <Typography className="connection-count">
                      {formatConnections(
                        firstNode.connections.connectedOutputs,
                        firstNode.connections.totalOutputs
                      )}
                    </Typography>
                    <Typography className="connection-label">Outputs</Typography>
                  </Box>
                </Box>
              </Box>
            </Box>

            <Divider className="divider" />

            <Box className="node-info-section">
              <Typography className="section-title">Status</Typography>
              <Box className="status-row">
                {firstNode.executionStatus === "completed" && (
                  <CheckCircleIcon className="status-icon completed" />
                )}
                {firstNode.executionStatus === "error" && (
                  <ErrorIcon className="status-icon error" />
                )}
                {!firstNode.executionStatus && (
                  <CircleOutlinedIcon className="status-icon pending" />
                )}
                <Typography className="status-text">
                  {firstNode.executionStatus === "completed"
                    ? "Executed successfully"
                    : firstNode.executionStatus === "error"
                    ? "Execution failed"
                    : "Not yet executed"}
                </Typography>
              </Box>
              {firstNode.hasError && firstNode.errorMessage && (
                <Box className="error-message">
                  <Typography className="error-text">
                    {firstNode.errorMessage}
                  </Typography>
                </Box>
              )}
            </Box>

            <Divider className="divider" />

            <Box className="node-info-section">
              <Typography className="section-title">Actions</Typography>
              <Box className="actions-row">
                <Tooltip title="Copy Node ID" arrow>
                  <Button
                    className="action-button"
                    variant="outlined"
                    size="small"
                    startIcon={<ContentCopyIcon fontSize="small" />}
                    onClick={() => handleCopyNodeId(firstNode.id)}
                  >
                    Copy ID
                  </Button>
                </Tooltip>
                <Tooltip title="Focus on Node" arrow>
                  <Button
                    className="action-button"
                    variant="outlined"
                    size="small"
                    startIcon={<OpenInNewIcon fontSize="small" />}
                    onClick={() =>
                      handleFocusNode(firstNode.position.x, firstNode.position.y)
                    }
                  >
                    Focus
                  </Button>
                </Tooltip>
              </Box>
            </Box>
          </>
        ) : null}
      </Box>
    </Box>
  );
});

NodeInfoPanel.displayName = "NodeInfoPanel";

export default NodeInfoPanel;
