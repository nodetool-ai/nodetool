/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback } from "react";
import { Box, Typography, Chip } from "@mui/material";
import { useReactFlow } from "@xyflow/react";
import { useInspectedNodeStore } from "../../stores/InspectedNodeStore";
import type { LineageNode } from "../../hooks/useNodeLineage";

const styles = (theme: Theme) =>
  css({
    "&.node-breadcrumbs": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1),
      padding: theme.spacing(1.5, 2),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: `${theme.vars.palette.action.hover}30`
    },
    "& .breadcrumbs-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing(0.5)
    },
    "& .breadcrumbs-title": {
      fontSize: "11px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: theme.vars.palette.text.secondary
    },
    "& .breadcrumbs-count": {
      fontSize: "10px",
      color: theme.vars.palette.text.disabled,
      fontWeight: 500
    },
    "& .breadcrumbs-list": {
      display: "flex",
      flexWrap: "wrap",
      gap: theme.spacing(0.5),
      alignItems: "center"
    },
    "& .breadcrumb-chip": {
      fontSize: "11px",
      fontWeight: 500,
      height: "22px",
      borderRadius: "4px",
      transition: "all 0.15s ease",
      cursor: "pointer",
      "&:hover": {
        backgroundColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.contrastText
      }
    },
    "& .breadcrumb-chip-current": {
      backgroundColor: theme.vars.palette.primary.main + "20",
      color: theme.vars.palette.primary.main,
      fontWeight: 600,
      border: `1px solid ${theme.vars.palette.primary.main}40`
    },
    "& .breadcrumb-separator": {
      color: theme.vars.palette.text.disabled,
      fontSize: "14px",
      margin: "0 2px"
    },
    "& .breadcrumb-type": {
      fontSize: "9px",
      textTransform: "uppercase",
      opacity: 0.7,
      marginLeft: theme.spacing(0.5)
    },
    "& .breadcrumbs-empty": {
      fontSize: "11px",
      color: theme.vars.palette.text.disabled,
      fontStyle: "italic",
      padding: theme.spacing(0.5, 0)
    }
  });

interface NodeBreadcrumbsProps {
  /** The lineage path to display */
  path: LineageNode[];
  /** The current node ID (will be highlighted) */
  currentNodeId: string;
}

/**
 * NodeBreadcrumbs Component
 *
 * Displays a breadcrumb trail showing the data flow lineage from input nodes
 * to the currently inspected node. Users can click on any breadcrumb to
 * navigate to that node.
 *
 * @example
 * ```tsx
 * <NodeBreadcrumbs path={lineage.path} currentNodeId={inspectedNodeId} />
 * ```
 */
const NodeBreadcrumbs: React.FC<NodeBreadcrumbsProps> = memo(
  ({ path, currentNodeId }) => {
    const theme = useTheme();
    const { setCenter } = useReactFlow();
    const setInspectedNodeId = useInspectedNodeStore((state) => state.setInspectedNodeId);

    const handleBreadcrumbClick = useCallback(
      (node: LineageNode) => {
        // Set the inspected node
        setInspectedNodeId(node.id);

        // Center the view on the node
        setCenter(node.position.x, node.position.y, { zoom: 1.2, duration: 300 });
      },
      [setInspectedNodeId, setCenter]
    );

    // Don't render if there's only one node (no lineage to show)
    if (path.length <= 1) {
      return null;
    }

    // Truncate the path if it's too long
    const maxVisibleNodes = 5;
    let visiblePath = path;
    let hasEllipsis = false;

    if (path.length > maxVisibleNodes) {
      // Keep first 2, last 2, and add ellipsis
      const firstTwo = path.slice(0, 2);
      const lastTwo = path.slice(-2);
      visiblePath = [...firstTwo, lastTwo[0]]; // Will show ellipsis before this
      hasEllipsis = true;
    }

    // Get a short type label for display
    const getTypeLabel = (type: string): string => {
      if (type.includes("input")) {
        return "Input";
      }
      if (type.includes("output") || type.includes("preview")) {
        return "Output";
      }
      if (type.includes("text") || type.includes("string")) {
        return "Text";
      }
      if (type.includes("image") || type.includes("img")) {
        return "Image";
      }
      if (type.includes("audio")) {
        return "Audio";
      }
      if (type.includes("video")) {
        return "Video";
      }
      if (type.includes("model") || type.includes("ai")) {
        return "Model";
      }
      return "Node";
    };

    // Truncate long labels
    const truncateLabel = (label: string, maxLength = 20): string => {
      if (label.length <= maxLength) {
        return label;
      }
      return label.slice(0, maxLength - 3) + "...";
    };

    return (
      <Box className="node-breadcrumbs" css={styles(theme)}>
        <Box className="breadcrumbs-header">
          <Typography className="breadcrumbs-title">Data Flow</Typography>
          <Typography className="breadcrumbs-count">{path.length} nodes</Typography>
        </Box>

        <Box className="breadcrumbs-list">
          {visiblePath.map((node, index) => {
            const isCurrent = node.id === currentNodeId;

            // Show ellipsis if needed
            if (
              hasEllipsis &&
              index === 2 &&
              path.length > maxVisibleNodes
            ) {
              return (
                <Box
                  key="ellipsis"
                  className="breadcrumb-separator"
                  sx={{ px: 1 }}
                >
                  ···
                </Box>
              );
            }

            return (
              <Chip
                key={node.id}
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <span>{truncateLabel(node.label)}</span>
                    <span className="breadcrumb-type">
                      {getTypeLabel(node.type)}
                    </span>
                  </Box>
                }
                size="small"
                onClick={() => handleBreadcrumbClick(node)}
                className={`breadcrumb-chip ${
                  isCurrent ? "breadcrumb-chip-current" : ""
                }`}
                clickable={!isCurrent}
                tabIndex={1}
              />
            );
          })}
        </Box>
      </Box>
    );
  }
);

NodeBreadcrumbs.displayName = "NodeBreadcrumbs";

export default NodeBreadcrumbs;
