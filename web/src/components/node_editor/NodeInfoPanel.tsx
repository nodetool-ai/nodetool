/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useCallback, useEffect, useState } from "react";
import { shallow } from "zustand/shallow";
import { Tooltip, Text, EditorButton, FlexRow, CloseButton, Box, MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useReactFlow, useViewport } from "@xyflow/react";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useInspectedNodeStore } from "../../stores/InspectedNodeStore";
import { useNodes } from "../../contexts/NodeContext";
import { formatNodeDocumentation } from "../../stores/formatNodeDocumentation";

const PrettyNamespace = memo<{ namespace: string }>(({ namespace }) => {
  const parts = namespace.split(".");
  let prefix = "";
  return (
    <div className="pretty-namespace">
      {parts.map((part) => {
        prefix = prefix ? `${prefix}.${part}` : part;
        const isLast = prefix === namespace;
        return (
          <Text
            key={prefix}
            component="span"
            className={isLast ? "namespace-part-last" : undefined}
            sx={{
              fontWeight: isLast ? 500 : 400,
              color: isLast ? "var(--palette-grey-400)" : "inherit"
            }}
          >
            {part.replace("huggingface", "HF").replace("nodetool", "NT")}
            {!isLast && "."}
          </Text>
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

const PANEL_WIDTH = 320;
const PANEL_GAP = 16;
const VIEWPORT_MARGIN = 16;
const MIN_PANEL_HEIGHT = 200;

const styles = (theme: Theme) =>
  css({
    "&.node-info-panel": {
      position: "fixed",
      width: `${PANEL_WIDTH}px`,
      zIndex: 15000,
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: BORDER_RADIUS.xl,
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden",
      animation: `slideIn ${MOTION.normal} forwards`,
      "& @keyframes slideIn": {
        "0%": { opacity: 0, transform: "translateX(20px)" },
        "100%": { opacity: 1, transform: "translateX(0)" }
      }
    },
    "& .panel-content": {
      flex: 1,
      overflowY: "auto",
      padding: `${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xl)}`
    },
    "& .node-name": {
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      wordBreak: "break-word",
      marginBottom: getSpacingPx(SPACING.xs)
    },
    "& .node-description": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary,
      lineHeight: 1.5,
      marginTop: getSpacingPx(SPACING.md)
    },
    "& .node-tags": {
      display: "flex",
      flexWrap: "wrap",
      gap: getSpacingPx(SPACING.xs),
      marginTop: getSpacingPx(SPACING.md)
    },
    "& .node-tags span": {
      fontWeight: 500,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      backgroundColor: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.sm,
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.sm)}`,
      textTransform: "uppercase",
      display: "inline-block",
      cursor: "pointer",
      transition: `background-color ${MOTION.normal}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected,
        color: theme.vars.palette.primary.main
      }
    },
    "& .node-use-cases": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary,
      lineHeight: 1.5,
      marginTop: getSpacingPx(SPACING.md),
      "& h5": {
        fontSize: "var(--fontSizeSmaller)",
        fontWeight: 600,
        color: theme.vars.palette.text.primary,
        marginBottom: getSpacingPx(SPACING.xs),
        textTransform: "uppercase"
      },
      "& ul": {
        margin: 0,
        paddingLeft: "1em",
        "& li": {
          marginBottom: getSpacingPx(SPACING.micro)
        }
      }
    },
    "& .error-message": {
      marginTop: getSpacingPx(SPACING.md),
      padding: `${theme.spacing(2)} ${theme.spacing(3)}`,
      backgroundColor: `${theme.vars.palette.error.main}15`,
      borderRadius: BORDER_RADIUS.lg,
      borderLeft: `3px solid ${theme.vars.palette.error.main}`
    },
    "& .error-text": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.error.main,
      lineHeight: 1.4
    },
    "& .position-text": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled,
      fontFamily: "monospace",
      marginTop: getSpacingPx(SPACING.md)
    },
    "& .namespace-button": {
      display: "block",
      margin: `0 -${getSpacingPx(SPACING.xs)}`,
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.md)}`,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: "transparent",
      color: "var(--palette-grey-400)",
      fontSize: "var(--fontSizeSmaller)",
      textTransform: "uppercase",
      textAlign: "left",
      flexGrow: 1,
      overflow: "hidden",
      letterSpacing: "0.05em",
      fontWeight: 500,
      minWidth: 0,
      "& .pretty-namespace": { display: "inline-block" },
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected,
        color: "var(--palette-primary-main)"
      },
      "&:hover .pretty-namespace span": {
        color: "var(--palette-primary-main) !important"
      }
    },
    "& .action-button": {
      flex: 1,
      minWidth: "80px",
      fontSize: "var(--fontSizeSmall)",
      padding: `${theme.spacing(1.5)} ${theme.spacing(3)}`,
      borderRadius: BORDER_RADIUS.md,
      marginTop: getSpacingPx(SPACING.lg),
      "& .MuiButton-startIcon": {
        marginRight: getSpacingPx(SPACING.xs)
      }
    }
  });

/**
 * Renders the panel body for the currently inspected node. Mounted only
 * while a node is inspected, so the `useViewport` subscription (needed to
 * reposition the panel while panning/zooming) doesn't re-render anything
 * when the panel is hidden.
 */
const NodeInfoPanelContent: React.FC<{ inspectedNodeId: string }> = memo(
  ({ inspectedNodeId }) => {
  const theme = useTheme();
  const { getNode, setCenter, flowToScreenPosition } = useReactFlow();
  const { x: viewportX, y: viewportY, zoom } = useViewport();
  const setInspectedNodeId = useInspectedNodeStore((state) => state.setInspectedNodeId);
  const panelStyles = useMemo(() => styles(theme), [theme]);
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const inspectedNodeBounds = useNodes((state) => {
    if (!inspectedNodeId) {
      return null;
    }
    const node = state.findNode(inspectedNodeId);
    if (!node) {
      return null;
    }
    return {
      x: node.position.x,
      y: node.position.y,
      width: node.measured?.width ?? node.width ?? 200,
      height: node.measured?.height ?? node.height ?? 100
    };
  }, shallow);

  const [windowSize, setWindowSize] = useState(() => ({
    width: typeof window === "undefined" ? 1920 : window.innerWidth,
    height: typeof window === "undefined" ? 1080 : window.innerHeight
  }));

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const panelStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!inspectedNodeBounds) {
      return undefined;
    }
    const { x, y, width } = inspectedNodeBounds;
    const topRight = flowToScreenPosition({ x: x + width, y });
    const topLeft = flowToScreenPosition({ x, y });
    const { width: vw, height: vh } = windowSize;

    let left = topRight.x + PANEL_GAP;
    if (left + PANEL_WIDTH + VIEWPORT_MARGIN > vw) {
      left = topLeft.x - PANEL_GAP - PANEL_WIDTH;
    }
    left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(left, vw - PANEL_WIDTH - VIEWPORT_MARGIN)
    );

    let top = topRight.y;
    top = Math.max(
      VIEWPORT_MARGIN,
      Math.min(top, vh - MIN_PANEL_HEIGHT - VIEWPORT_MARGIN)
    );
    const maxHeight = vh - top - VIEWPORT_MARGIN;

    return {
      left: `${left}px`,
      top: `${top}px`,
      maxHeight: `${maxHeight}px`
    };
  }, [
    inspectedNodeBounds,
    flowToScreenPosition,
    viewportX,
    viewportY,
    zoom,
    windowSize
  ]);

  const nodeInfo = useMemo((): NodeInfo | null => {
    if (!inspectedNodeId) {
      return null;
    }
    const node = getNode(inspectedNodeId);
    if (!node) {
      return null;
    }

    const nodeType = node.type || "unknown";
    const metadata = getMetadata(nodeType);

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
  }, [getNode, inspectedNodeId, getMetadata]);

  const parsedDescription = useMemo(() => {
    if (!nodeInfo?.description) {
      return null;
    }
    return formatNodeDocumentation(nodeInfo.description);
  }, [nodeInfo?.description]);

  const handleClose = useCallback(() => {
    setInspectedNodeId(null);
  }, [setInspectedNodeId]);

  const handleNamespaceClick = useCallback(() => {
    if (!nodeInfo) {
      return;
    }
    useNodeMenuStore.getState().openNodeMenu({
      x: 500,
      y: 200,
      dropType: nodeInfo.namespace,
      selectedPath: nodeInfo.namespace.split(".")
    });
  }, [nodeInfo]);

  const handleTagClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const tag = event.currentTarget.dataset.tag;
    if (!tag) {
      return;
    }
    useNodeMenuStore.getState().openNodeMenu({
      x: 500,
      y: 200
    });
    useNodeMenuStore.getState().setSearchTerm(tag.trim());
  }, []);

  const handleFocusClick = useCallback(() => {
    if (!nodeInfo) {
      return;
    }
    setCenter(nodeInfo.position.x, nodeInfo.position.y, { zoom: 1.5, duration: 300 });
  }, [nodeInfo, setCenter]);

  if (!nodeInfo) {
    return null;
  }

  return (
    <Box className="node-info-panel" css={panelStyles} style={panelStyle}>
      <Box className="panel-content">
        <FlexRow align="center" justify="space-between" sx={{ mb: 1 }}>
          <Text className="node-name">{nodeInfo.label}</Text>
          <CloseButton
            onClick={handleClose}
            sx={{ color: "text.secondary" }}
            nodrag={false}
          />
        </FlexRow>

        <Tooltip
          title={
            <span>
              <Text
                component="span"
                sx={{ fontSize: "var(--fontSizeSmall)", fontWeight: 600 }}
              >
                {nodeInfo.namespace}
              </Text>
              <Text component="span" sx={{ display: "block" }}>
                Click to show in NodeMenu
              </Text>
            </span>
          }
          placement="bottom-start"
          delay={TOOLTIP_ENTER_DELAY}
        >
          <EditorButton
            tabIndex={0}
            className="namespace-button"
            onClick={handleNamespaceClick}
          >
            <PrettyNamespace namespace={nodeInfo.namespace} />
          </EditorButton>
        </Tooltip>

        {parsedDescription && (
          <>
            <Text className="node-description">
              {parsedDescription.description}
            </Text>
            {parsedDescription.tags.length > 0 && (
              <div className="node-tags">
                {parsedDescription.tags.map((tag) => (
                  <span
                    key={tag}
                    data-tag={tag}
                    role="button"
                    tabIndex={0}
                    onClick={handleTagClick}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        const t = (e.currentTarget as HTMLElement).dataset.tag;
                        if (t) {
                          useNodeMenuStore.getState().openNodeMenu({ x: 500, y: 200 });
                          useNodeMenuStore.getState().setSearchTerm(t.trim());
                        }
                      }
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {parsedDescription.useCases.raw && (
              <div className="node-use-cases">
                <h5>Use cases</h5>
                <ul>
                  {parsedDescription.useCases.raw.split("\n").map((useCase) => (
                    <li key={useCase}>{useCase}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {nodeInfo.hasError && (
          <Box className="error-message">
            <Text className="error-text">{nodeInfo.errorMessage}</Text>
          </Box>
        )}

        <EditorButton
          className="action-button"
          size="small"
          startIcon={<OpenInNewIcon fontSize="small" />}
          onClick={handleFocusClick}
        >
          Focus
        </EditorButton>
      </Box>
    </Box >
  );
  }
);

NodeInfoPanelContent.displayName = "NodeInfoPanelContent";

/**
 * Gate component: subscribes only to `inspectedNodeId` (no viewport hook),
 * so it stays inert while nothing is inspected. Mounts `NodeInfoPanelContent`
 * — which owns the `useViewport` subscription needed to reposition the panel
 * while panning/zooming — only once a node is actually inspected.
 */
const NodeInfoPanel: React.FC = memo(() => {
  const inspectedNodeId = useInspectedNodeStore(
    (state) => state.inspectedNodeId
  );

  if (!inspectedNodeId) {
    return null;
  }

  return <NodeInfoPanelContent inspectedNodeId={inspectedNodeId} />;
});

NodeInfoPanel.displayName = "NodeInfoPanel";

export default NodeInfoPanel;
