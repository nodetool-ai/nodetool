/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useState, useCallback } from "react";
import {
  Box,
  Typography,
  Tooltip,
  Button,
  IconButton,
  Chip
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LabelIcon from "@mui/icons-material/Label";
import AddIcon from "@mui/icons-material/Add";
import { useReactFlow } from "@xyflow/react";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useInspectedNodeStore } from "../../stores/InspectedNodeStore";
import { useNodeLabelStore } from "../../components/node/NodeLabel";
import NodeLabelDialog from "../../components/node/NodeLabel/NodeLabelDialog";

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

interface NodeInfo {
  id: string;
  label: string;
  type: string;
  namespace: string;
  description: string | undefined;
  position: { x: number; y: number };
  hasError: boolean;
  errorMessage: string | undefined;
  executionStatus: "pending" | "running" | "completed" | "error" | undefined;
}

const styles = (theme: Theme) =>
  css({
    "&.node-info-panel": {
      position: "fixed",
      top: "80px",
      right: "50px",
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
    "& .panel-content": {
      flex: 1,
      overflowY: "auto",
      padding: "12px 16px"
    },
    "& .node-name": {
      fontSize: "16px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      wordBreak: "break-word",
      marginBottom: "4px"
    },
    "& .node-description": {
      fontSize: "13px",
      color: theme.vars.palette.text.secondary,
      lineHeight: 1.5,
      marginTop: "8px"
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
      fontFamily: "monospace",
      marginTop: "8px"
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
    },
    "& .action-button": {
      flex: 1,
      minWidth: "80px",
      fontSize: "12px",
      padding: "6px 10px",
      borderRadius: "6px",
      marginTop: "12px",
      "& .MuiButton-startIcon": {
        marginRight: "4px"
      }
    },
    "& .labels-section": {
      marginTop: "12px",
      paddingTop: "12px",
      borderTop: `1px solid ${theme.vars.palette.divider}`
    },
    "& .labels-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "8px"
    },
    "& .labels-title": {
      fontSize: "12px",
      fontWeight: 600,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      display: "flex",
      alignItems: "center",
      gap: "4px"
    },
    "& .labels-list": {
      display: "flex",
      flexWrap: "wrap",
      gap: "4px"
    },
    "& .add-label-button": {
      fontSize: "11px",
      padding: "2px 8px",
      minWidth: "unset",
      "& .MuiButton-startIcon": {
        marginRight: "2px",
        fontSize: "14px"
      }
    }
  });

const NodeInfoPanel: React.FC = memo(() => {
  const theme = useTheme();
  const { getNode, setCenter } = useReactFlow();
  const inspectedNodeId = useInspectedNodeStore((state) => state.inspectedNodeId);
  const setInspectedNodeId = useInspectedNodeStore((state) => state.setInspectedNodeId);

  const [labelDialogOpen, setLabelDialogOpen] = useState(false);

  const nodeInfo = useMemo((): NodeInfo | null => {
    if (!inspectedNodeId) {
      return null;
    }
    const node = getNode(inspectedNodeId);
    if (!node) {
      return null;
    }

    const nodeType = node.type || "unknown";
    const metadata = useMetadataStore.getState().getMetadata(nodeType);

    return {
      id: node.id,
      label: metadata?.title || "",
      type: nodeType,
      namespace: metadata?.namespace || "",
      description: metadata?.description || undefined,
      position: node.position,
      hasError: (node.data.hasError as boolean) || false,
      errorMessage: node.data.errorMessage as string | undefined,
      executionStatus: node.data.executionStatus as "pending" | "running" | "completed" | "error" | undefined
    };
  }, [getNode, inspectedNodeId]);

  const labels = useNodeLabelStore((state) =>
    inspectedNodeId ? state.getLabels(inspectedNodeId) : []
  );

  const handleOpenLabelDialog = useCallback(() => {
    setLabelDialogOpen(true);
  }, []);

  const handleCloseLabelDialog = useCallback(() => {
    setLabelDialogOpen(false);
  }, []);

  if (!nodeInfo) {
    return null;
  }

  return (
    <>
      <Box className="node-info-panel" css={styles(theme)}>
        <Box className="panel-content">
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
            <Typography className="node-name">{nodeInfo.label}</Typography>
            <Tooltip title="Close" arrow>
              <IconButton
                size="small"
                onClick={() => setInspectedNodeId(null)}
                sx={{ color: "text.secondary" }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          <Tooltip
            title={
              <span>
                <Typography
                  component="span"
                  sx={{ fontSize: "var(--fontSizeSmall)", fontWeight: 600 }}
                >
                  {nodeInfo.namespace}
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
                useNodeMenuStore.getState().openNodeMenu({
                  x: 500,
                  y: 200,
                  dropType: nodeInfo.namespace,
                  selectedPath: nodeInfo.namespace.split(".")
                });
              }}
            >
              <PrettyNamespace namespace={nodeInfo.namespace} />
            </Button>
          </Tooltip>

          {nodeInfo.description && (
            <Typography className="node-description">
              {nodeInfo.description}
            </Typography>
          )}

          {nodeInfo.hasError && (
            <Box className="error-message">
              <Typography className="error-text">{nodeInfo.errorMessage}</Typography>
            </Box>
          )}

          <Button
            className="action-button"
            size="small"
            startIcon={<OpenInNewIcon fontSize="small" />}
            onClick={() => setCenter(nodeInfo.position.x, nodeInfo.position.y, { zoom: 1.5, duration: 300 })}
          >
            Focus
          </Button>

          <Box className="labels-section">
            <Box className="labels-header">
              <Typography className="labels-title">
                <LabelIcon fontSize="small" />
                Labels
              </Typography>
              <Button
                className="add-label-button"
                size="small"
                startIcon={<AddIcon fontSize="small" />}
                onClick={handleOpenLabelDialog}
              >
                Add
              </Button>
            </Box>
            {labels.length > 0 ? (
              <Box className="labels-list">
                {labels.map((label) => (
                  <Chip
                    key={label.id}
                    label={label.text}
                    size="small"
                    sx={{
                      backgroundColor: label.color,
                      color: getContrastColor(label.color),
                      fontSize: "10px",
                      height: "20px",
                    }}
                  />
                ))}
              </Box>
            ) : (
              <Typography sx={{ fontSize: "11px", color: "text.disabled", fontStyle: "italic" }}>
                No labels added
              </Typography>
            )}
          </Box>
        </Box>
      </Box>

      <NodeLabelDialog
        open={labelDialogOpen}
        onClose={handleCloseLabelDialog}
        nodeId={nodeInfo.id}
        nodeName={nodeInfo.label}
      />
    </>
  );
});

NodeInfoPanel.displayName = "NodeInfoPanel";

function getContrastColor(hexColor: string): string {
  if (!hexColor) {
    return "#000000";
  }

  let hex = hexColor.replace("#", "");

  if (hex.length === 3) {
    hex = hex.split("").map((char) => char + char).join("");
  }

  if (hex.length !== 6) {
    return "#000000";
  }

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return "#000000";
  }

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

export default NodeInfoPanel;
