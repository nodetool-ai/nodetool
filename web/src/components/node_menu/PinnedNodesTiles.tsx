/** @jsxImportSource @emotion/react */
/**
 * PinnedNodesTiles
 *
 * Displays pinned nodes as clickable tiles in the node menu.
 * Users can click to navigate to a pinned node or unpin it directly.
 *
 * Pinned nodes are workflow-specific and persist across sessions.
 */

import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import { Box, Tooltip, Typography, IconButton } from "@mui/material";
import PushPinIcon from "@mui/icons-material/PushPin";
import ClearIcon from "@mui/icons-material/Clear";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { usePinnedNodesStore } from "../../stores/PinnedNodesStore";
import { useNodeStoreRef } from "../../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";

const tileStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "fit-content",
      padding: "0.5em 1em 0.5em 0.5em",
      boxSizing: "border-box"
    },
    ".tiles-header": {
      marginBottom: "0.5em",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 4px",
      "& h5": {
        margin: 0,
        fontSize: "0.85rem",
        fontWeight: 600,
        color: theme.vars.palette.text.secondary,
        textTransform: "uppercase",
        letterSpacing: "1px",
        opacity: 0.8,
        display: "flex",
        alignItems: "center",
        gap: "0.5em"
      }
    },
    ".tiles-container": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
      gridAutoRows: "1fr",
      gap: "8px",
      alignContent: "start",
      overflowY: "auto",
      padding: "2px",
      "&::-webkit-scrollbar": {
        width: "6px"
      },
      "&::-webkit-scrollbar-track": {
        background: "transparent"
      },
      "&::-webkit-scrollbar-thumb": {
        backgroundColor: theme.vars.palette.action.disabledBackground,
        borderRadius: "8px"
      },
      "&::-webkit-scrollbar-thumb:hover": {
        backgroundColor: theme.vars.palette.action.disabled
      }
    },
    ".pinned-tile": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "12px 8px",
      borderRadius: "12px",
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.primary.main}`,
      transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
      minHeight: "30px",
      background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.08)`,
      "&::before": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.06), transparent 80%)",
        opacity: 0,
        transition: "opacity 0.3s ease",
        pointerEvents: "none"
      },
      "&:hover": {
        transform: "translateY(-3px)",
        borderColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.5)`,
        background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
        boxShadow: `0 8px 24px -6px rgba(${theme.vars.palette.primary.mainChannel} / 0.4)`,
        "&::before": {
          opacity: 1
        },
        "& .tile-label": {
          opacity: 1
        }
      },
      "&:active": {
        transform: "scale(0.97) translateY(0)",
        transition: "all 0.1s ease"
      }
    },
    ".tile-label": {
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 500,
      textAlign: "center",
      lineHeight: 1.3,
      color: theme.vars.palette.text.primary,
      opacity: 0.9,
      transition: "opacity 0.3s ease",
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical"
    },
    ".tile-workflow": {
      fontSize: "0.7rem",
      color: theme.vars.palette.text.secondary,
      marginTop: "4px",
      opacity: 0.7
    },
    ".empty-state": {
      padding: "1em",
      textAlign: "center",
      color: theme.vars.palette.text.secondary,
      fontSize: "0.85rem",
      opacity: 0.6
    },
    ".clear-button": {
      padding: "4px",
      minWidth: 0,
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".unpin-btn": {
      position: "absolute",
      top: "4px",
      right: "4px",
      padding: "2px",
      minWidth: 0,
      opacity: 0,
      transition: "opacity 0.2s ease",
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      color: theme.vars.palette.common.white,
      "&:hover": {
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        color: theme.vars.palette.error.main
      }
    },
    ".pinned-tile:hover .unpin-btn": {
      opacity: 1
    }
  });

interface PinnedNodesTilesProps {
  /** Current workflow ID */
  workflowId: string;
}

const PinnedNodesTiles = memo(function PinnedNodesTiles({
  workflowId
}: PinnedNodesTilesProps) {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => tileStyles(theme), [theme]);

  const { pinnedNodes } = usePinnedNodesStore((state) => ({
    pinnedNodes: state.getPinnedNodesForWorkflow(workflowId)
  }));

  const { unpinNode } = usePinnedNodesStore();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const store = useNodeStoreRef();
  const { fitView } = useReactFlow();

  const handleTileClick = useCallback(
    (nodeId: string) => {
      // Navigate to and focus the pinned node
      const node = store.getState().nodes.find((n) => n.id === nodeId);
      if (node) {
        // Fit view to show the node
        fitView({
          padding: 0.3,
          duration: 300,
          maxZoom: 1.5,
          minZoom: 0.5
        });

        addNotification({
          type: "info",
          content: `Navigated to pinned node`,
          timeout: 2000
        });
      } else {
        addNotification({
          type: "warning",
          content: `Node not found in current workflow`,
          timeout: 3000
        });
      }
    },
    [store, fitView, addNotification]
  );

  const handleUnpin = useCallback(
    (nodeId: string) => {
      unpinNode(workflowId, nodeId);
      addNotification({
        type: "info",
        content: "Node unpinned",
        timeout: 2000
      });
    },
    [workflowId, unpinNode, addNotification]
  );

  const handleClearAll = useCallback(() => {
    const workflowPins = pinnedNodes;
    workflowPins.forEach((pin) => {
      unpinNode(pin.workflowId, pin.nodeId);
    });
    addNotification({
      type: "info",
      content: "All pinned nodes cleared",
      timeout: 2000
    });
  }, [pinnedNodes, unpinNode, addNotification]);

  // Get node display names
  const nodeDisplayNames = useMemo(() => {
    const names = new Map<string, { title: string; nodeName: string }>();
    pinnedNodes.forEach((pin) => {
      const metadata = getMetadata(pin.nodeType);
      const title = metadata?.title || pin.nodeType.split(".").pop() || pin.nodeType;
      names.set(pin.nodeId, {
        title,
        nodeName: pin.label || title
      });
    });
    return names;
  }, [pinnedNodes, getMetadata]);

  if (pinnedNodes.length === 0) {
    return null;
  }

  return (
    <Box css={memoizedStyles}>
      <div className="tiles-header">
        <Typography variant="h5">
          <PushPinIcon fontSize="small" sx={{ opacity: 0.8 }} />
          Pinned Nodes
        </Typography>
        <Tooltip title="Clear all pinned nodes" placement="top">
          <IconButton
            size="small"
            className="clear-button"
            onClick={handleClearAll}
            aria-label="Clear all pinned nodes"
          >
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>
      <div className="tiles-container">
        {pinnedNodes.map((pin) => {
          const displayName = nodeDisplayNames.get(pin.nodeId);

          if (!displayName) {
            return null;
          }

          return (
            <Tooltip
              key={pin.nodeId}
              title={
                <div>
                  <div>{displayName.nodeName}</div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      opacity: 0.75,
                      marginTop: "4px"
                    }}
                  >
                    Click to navigate · Hover to unpin
                  </div>
                </div>
              }
              placement="top"
              enterDelay={TOOLTIP_ENTER_DELAY}
              enterNextDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className="pinned-tile"
                onClick={() => handleTileClick(pin.nodeId)}
              >
                <IconButton
                  className="unpin-btn"
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnpin(pin.nodeId);
                  }}
                  aria-label="Unpin node"
                >
                  <PushPinIcon sx={{ fontSize: "1rem" }} />
                </IconButton>
                <Typography className="tile-label">
                  {displayName.nodeName}
                </Typography>
                <Typography className="tile-workflow">
                  {displayName.title}
                </Typography>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </Box>
  );
});

export default PinnedNodesTiles;
