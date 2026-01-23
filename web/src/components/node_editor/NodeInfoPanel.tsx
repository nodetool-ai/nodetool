/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  Tooltip,
  Button,
  IconButton
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useReactFlow } from "@xyflow/react";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useInspectedNodeStore } from "../../stores/InspectedNodeStore";

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
    }
  });

const NodeInfoPanel: React.FC = memo(() => {
  const theme = useTheme();
  const { getNode, setCenter } = useReactFlow();
  const inspectedNodeId = useInspectedNodeStore((state) => state.inspectedNodeId);
  const setInspectedNodeId = useInspectedNodeStore((state) => state.setInspectedNodeId);

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

  const handleClose = useCallback(() => {
    setInspectedNodeId(null);
  }, [setInspectedNodeId]);

  const handleNamespaceClick = useCallback(() => {
    if (!nodeInfo) return;
    useNodeMenuStore.getState().openNodeMenu({
      x: 500,
      y: 200,
      dropType: nodeInfo.namespace,
      selectedPath: nodeInfo.namespace.split(".")
    });
  }, [nodeInfo]);

  const handleFocusClick = useCallback(() => {
    if (!nodeInfo) return;
    setCenter(nodeInfo.position.x, nodeInfo.position.y, { zoom: 1.5, duration: 300 });
  }, [nodeInfo, setCenter]);

  if (!nodeInfo) {
    return null;
  }

  return (
    <Box className="node-info-panel" css={styles(theme)}>
      <Box className="panel-content">
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
          <Typography className="node-name">{nodeInfo.label}</Typography>
          <Tooltip title="Close" arrow>
            <IconButton
              size="small"
              onClick={handleClose}
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
            onClick={handleNamespaceClick}
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
          onClick={handleFocusClick}
        >
          Focus
        </Button>
      </Box>
    </Box >
  );
});

NodeInfoPanel.displayName = "NodeInfoPanel";

export default NodeInfoPanel;
