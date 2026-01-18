/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import StarIcon from "@mui/icons-material/Star";
import HistoryIcon from "@mui/icons-material/History";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useQuickAccessPanelStore } from "../../stores/QuickAccessPanelStore";
import { useFavoriteNodesStore } from "../../stores/FavoriteNodesStore";
import { useRecentNodesStore } from "../../stores/RecentNodesStore";
import { useNodeMenuStore } from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { useReactFlow } from "@xyflow/react";

const panelStyles = (theme: Theme, isCollapsed: boolean) =>
  css({
    position: "fixed",
    left: 0,
    top: "50%",
    transform: "translateY(-50%)",
    width: isCollapsed ? "48px" : "280px",
    maxHeight: "60vh",
    backgroundColor: theme.vars.palette.background.paper,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderLeft: "none",
    borderRadius: "0 12px 12px 0",
    boxShadow: theme.shadows[3],
    zIndex: 1500,
    display: "flex",
    flexDirection: "column",
    transition: "width 0.2s ease-in-out",
    overflow: "hidden",
    ".panel-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.spacing(1),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      minHeight: "48px"
    },
    ".section-title": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      padding: theme.spacing(0.75, 1),
      fontSize: "11px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: theme.vars.palette.text.secondary,
      backgroundColor: theme.vars.palette.action.hover
    },
    ".node-list": {
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      padding: theme.spacing(0.5),
      overflowY: "auto",
      flex: 1
    },
    ".node-item": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.75),
      padding: theme.spacing(0.5, 0.75),
      borderRadius: "6px",
      cursor: "pointer",
      transition: "background-color 0.15s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".node-icon": {
      width: "28px",
      height: "28px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "6px",
      backgroundColor: theme.vars.palette.primary.light,
      color: theme.vars.palette.primary.contrastText,
      fontSize: "12px",
      fontWeight: 600
    },
    ".node-name": {
      fontSize: "13px",
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    ".action-buttons": {
      display: "flex",
      gap: "2px",
      opacity: 0,
      transition: "opacity 0.15s ease",
      "&:hover": {
        opacity: 1
      }
    },
    ".node-item:hover .action-buttons": {
      opacity: 1
    },
    ".collapse-toggle": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      padding: theme.spacing(0.5),
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      cursor: "pointer",
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    }
  });

const QuickAccessPanel = memo(function QuickAccessPanel() {
  const theme = useTheme();
  const handleCreateNode = useCreateNode();
  const { screenToFlowPosition } = useReactFlow();
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const isOpen = useQuickAccessPanelStore((state) => state.isOpen);
  const isCollapsed = useQuickAccessPanelStore((state) => state.isCollapsed);
  const closePanel = useQuickAccessPanelStore((state) => state.closePanel);
  const toggleCollapse = useQuickAccessPanelStore((state) => state.toggleCollapse);

  const favorites = useFavoriteNodesStore((state) => state.favorites);
  const removeFavorite = useFavoriteNodesStore((state) => state.removeFavorite);

  const recentNodes = useRecentNodesStore((state) => state.recentNodes);
  const clearRecentNodes = useRecentNodesStore((state) => state.clearRecentNodes);

  const setMenuPosition = useNodeMenuStore((state) => state.setMenuPosition);
  const setSearchTerm = useNodeMenuStore((state) => state.setSearchTerm);

  const handleNodeClick = useCallback(
    (nodeType: string, _event: React.MouseEvent) => {
      const metadata = getMetadata(nodeType);
      if (!metadata) {return;}

      const viewport = document.body.getBoundingClientRect();
      const centerX = viewport.width / 2;
      const centerY = viewport.height / 2;

      screenToFlowPosition({ x: centerX, y: centerY });

      setMenuPosition(centerX, centerY);
      handleCreateNode(metadata);
    },
    [getMetadata, handleCreateNode, screenToFlowPosition, setMenuPosition]
  );

  const handleFavoriteClick = useCallback(
    (nodeType: string, event: React.MouseEvent) => {
      event.stopPropagation();
      handleNodeClick(nodeType, event);
    },
    [handleNodeClick]
  );

  const handleRemoveFavorite = useCallback(
    (nodeType: string, event: React.MouseEvent) => {
      event.stopPropagation();
      removeFavorite(nodeType);
    },
    [removeFavorite]
  );

  const handleClearRecent = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      clearRecentNodes();
    },
    [clearRecentNodes]
  );

  const handleOpenNodeMenu = useCallback(
    (nodeType: string, event: React.MouseEvent) => {
      event.stopPropagation();
      const metadata = getMetadata(nodeType);
      if (!metadata) {return;}

      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      setMenuPosition(rect.right + 10, rect.top);
      setSearchTerm(nodeType.split(".").pop() || "");
    },
    [getMetadata, setMenuPosition, setSearchTerm]
  );

  const getNodeDisplayName = useCallback((nodeType: string) => {
    const parts = nodeType.split(".");
    return parts[parts.length - 1] || nodeType;
  }, []);

  const getNodeInitials = useCallback((nodeType: string) => {
    const name = getNodeDisplayName(nodeType);
    return name.substring(0, 2).toUpperCase();
  }, [getNodeDisplayName]);

  const styles = useMemo(() => panelStyles(theme, isCollapsed), [theme, isCollapsed]);

  if (!isOpen) {return null;}

  if (isCollapsed) {
    return (
      <Box css={styles}>
        <div className="panel-header">
          <Tooltip title="Quick Access" placement="right">
            <StarIcon sx={{ color: theme.vars.palette.primary.main }} />
          </Tooltip>
        </div>
        <div className="collapse-toggle" onClick={toggleCollapse}>
          <ExpandMoreIcon />
        </div>
      </Box>
    );
  }

  return (
    <Box css={styles}>
      <div className="panel-header">
        <Typography variant="body2" fontWeight={600}>
          Quick Access
        </Typography>
        <IconButton size="small" onClick={closePanel}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </div>

      <div className="section-title">
        <StarIcon sx={{ fontSize: "14px" }} />
        <span>Favorites</span>
        <span style={{ marginLeft: "auto", opacity: 0.6 }}>{favorites.length}</span>
      </div>

      <div className="node-list">
        {favorites.length === 0 ? (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ padding: theme.spacing(1), textAlign: "center" }}
          >
            No favorites yet. Star nodes in the menu to add them here.
          </Typography>
        ) : (
          favorites.map((favorite) => (
            <div
              key={favorite.nodeType}
              className="node-item"
              onClick={(e) => handleFavoriteClick(favorite.nodeType, e)}
              onContextMenu={(e) => handleOpenNodeMenu(favorite.nodeType, e)}
            >
              <div className="node-icon">{getNodeInitials(favorite.nodeType)}</div>
              <span className="node-name">{getNodeDisplayName(favorite.nodeType)}</span>
              <div className="action-buttons">
                <Tooltip title="Remove favorite" placement="top">
                  <IconButton
                    size="small"
                    sx={{ width: "24px", height: "24px" }}
                    onClick={(e) => handleRemoveFavorite(favorite.nodeType, e)}
                  >
                    <CloseIcon sx={{ fontSize: "14px" }} />
                  </IconButton>
                </Tooltip>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="section-title">
        <HistoryIcon sx={{ fontSize: "14px" }} />
        <span>Recent</span>
        {recentNodes.length > 0 && (
          <Tooltip title="Clear history" placement="top">
            <IconButton
              size="small"
              sx={{ marginLeft: "auto", width: "20px", height: "20px" }}
              onClick={handleClearRecent}
            >
              <DeleteOutlineIcon sx={{ fontSize: "14px" }} />
            </IconButton>
          </Tooltip>
        )}
      </div>

      <Box className="node-list" sx={{ borderTop: `1px solid ${theme.vars.palette.divider}` }}>
        {recentNodes.length === 0 ? (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ padding: theme.spacing(1), textAlign: "center" }}
          >
            No recent nodes. Create nodes to see them here.
          </Typography>
        ) : (
          recentNodes.map((recent) => (
            <div
              key={`${recent.nodeType}-${recent.timestamp}`}
              className="node-item"
              onClick={(e) => handleNodeClick(recent.nodeType, e)}
              onContextMenu={(e) => handleOpenNodeMenu(recent.nodeType, e)}
            >
              <div className="node-icon" style={{ backgroundColor: theme.vars.palette.secondary.light }}>
                {getNodeInitials(recent.nodeType)}
              </div>
              <span className="node-name">{getNodeDisplayName(recent.nodeType)}</span>
            </div>
          ))
        )}
      </Box>

      <div className="collapse-toggle" onClick={toggleCollapse}>
        <ExpandLessIcon />
        <Typography variant="caption" sx={{ ml: 0.5 }}>
          Collapse
        </Typography>
      </div>
    </Box>
  );
});

export default QuickAccessPanel;
