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
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import CircleOutlinedIcon from "@mui/icons-material/CircleOutlined";
import { useReactFlow } from "@xyflow/react";
import { useSelectedNodesInfo } from "../../hooks/useSelectedNodesInfo";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const PrettyNamespace = memo<{ namespace: string }>(({ namespace }) => {
  const parts = namespace.split(".");
  let prefix = "";
  return (
    <div className="pretty-namespace">
      {parts.map((part) => {
        prefix = prefix ? `${prefix}.${part}` : part;
        const isLast = prefix === namespace;
        return (
          <Typography
            key={prefix}
            component="span"
            className={isLast ? "namespace-part-last" : undefined}
            sx={{
              fontWeight: isLast ? 500 : 300,
              color: isLast ? "var(--palette-grey-400)" : "inherit"
            }}
          >
            {part.replace("huggingface", "HF").replace("nodetool", "NT")}
            {!isLast && "."}
          </Typography>
        );
      })}
    </div>
  );
});

PrettyNamespace.displayName = "PrettyNamespace";

interface NodeConnectionInfo {
  totalInputs: number;
  connectedInputs: number;
  totalOutputs: number;
  connectedOutputs: number;
}

interface SelectedNodeInfo {
  id: string;
  label: string;
  type: string;
  namespace: string;
  description: string | undefined;
  position: { x: number; y: number };
  connections: NodeConnectionInfo;
  hasError: boolean;
  errorMessage: string | undefined;
  executionStatus: "pending" | "running" | "completed" | "error" | undefined;
  lastExecutedAt: string | undefined;
}

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
    },
    "& .namespace-button": {
      display: "block",
      margin: "0 -4px",
      padding: "2px 8px",
      borderRadius: "4px",
      backgroundColor: "transparent",
      color: "var(--palette-grey-400)",
      fontSize: "9px",
      textTransform: "uppercase",
      textAlign: "left",
      flexGrow: 1,
      overflow: "hidden",
      letterSpacing: "0.05em",
      fontWeight: 500,
      minWidth: 0,
      "& .pretty-namespace": { display: "inline-block" },
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.05)",
        color: "var(--palette-primary-main)"
      },
      "&:hover .pretty-namespace span": {
        color: "var(--palette-primary-main) !important"
      }
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

const getStatusIcon = (status: string | undefined) => {
  switch (status) {
    case "completed":
      return <CheckCircleIcon fontSize="small" className="status-icon completed" />;
    case "error":
      return <ErrorIcon fontSize="small" className="status-icon error" />;
    case "running":
      return <CircleOutlinedIcon fontSize="small" className="status-icon pending" />;
    default:
      return <CircleOutlinedIcon fontSize="small" className="status-icon pending" />;
  }
};

const NodeCard: React.FC<{ nodeInfo: SelectedNodeInfo }> = memo(({ nodeInfo }) => {
  const theme = useTheme();
  const { setCenter } = useReactFlow();

  const handleFocusNode = useCallback(() => {
    setCenter(nodeInfo.position.x, nodeInfo.position.y, { zoom: 1.5, duration: 300 });
  }, [setCenter, nodeInfo.position.x, nodeInfo.position.y]);

  return (
    <Box
      className="node-card"
      sx={{
        p: 2,
        mb: 1.5,
        bgcolor: "action.hover",
        borderRadius: 2,
        border: 1,
        borderColor: "divider",
        "&:last-child": { mb: 0 }
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography className="node-name" sx={{ fontSize: "14px", fontWeight: 600 }}>
          {nodeInfo.label}
        </Typography>
        {getStatusIcon(nodeInfo.executionStatus)}
      </Box>

      {nodeInfo.description && (
        <Typography className="node-description" sx={{ fontSize: "12px", mb: 1 }}>
          {nodeInfo.description}
        </Typography>
      )}

      {nodeInfo.hasError && (
        <Box className="error-message">
          <Typography className="error-text">{nodeInfo.errorMessage}</Typography>
        </Box>
      )}

      <Button
        size="small"
        startIcon={<OpenInNewIcon fontSize="small" />}
        onClick={handleFocusNode}
        sx={{ mt: 1, fontSize: "11px" }}
      >
        Focus
      </Button>
    </Box>
  );
});

NodeCard.displayName = "NodeCard";

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
          <Box>
            <Typography className="section-title" sx={{ mb: 2 }}>
              Selected Nodes ({totalSelected})
            </Typography>
            <Box sx={{ maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
              {nodesInfo.map((node) => (
                <NodeCard key={node.id} nodeInfo={node} />
              ))}
            </Box>
          </Box>
        ) : hasSingleNode ? (
          <>
            <Box className="node-info-section">
              <Typography className="node-name">{firstNode.label}</Typography>
              <Tooltip
                title={
                  <span>
                    <Typography
                      component="span"
                      sx={{ fontSize: "var(--fontSizeSmall)", fontWeight: 600 }}
                    >
                      {firstNode.namespace}
                    </Typography>
                    <Typography component="span" sx={{ display: "block" }}>
                      Click to show in NodeMenu
                    </Typography>
                  </span>
                }
                placement="bottom-start"
                enterDelay={TOOLTIP_ENTER_DELAY}
              >
                <Button
                  tabIndex={1}
                  className="namespace-button"
                  onClick={() => {
                    const metadata = { namespace: firstNode.namespace };
                    useNodeMenuStore.getState().openNodeMenu({
                      x: 500,
                      y: 200,
                      dropType: metadata.namespace,
                      selectedPath: metadata.namespace.split(".")
                    });
                  }}
                >
                  <PrettyNamespace namespace={firstNode.namespace} />
                </Button>
              </Tooltip>
              {firstNode.description && (
                <Typography className="node-description">
                  {firstNode.description}
                </Typography>
              )}
            </Box>
          </>
        ) : null}
      </Box>
    </Box>
  );
});

NodeInfoPanel.displayName = "NodeInfoPanel";

export default NodeInfoPanel;
