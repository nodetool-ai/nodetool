/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import {
  Box,
  Tooltip,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText
} from "@mui/material";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import DeleteIcon from "@mui/icons-material/Delete";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import { useNodePresetsStore, NodePreset } from "../../stores/NodePresetsStore";

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
    ".preset-tile": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "12px 8px",
      borderRadius: "12px",
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
      border: "1px solid rgba(255, 255, 255, 0.06)",
      transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
      minHeight: "80px",
      background: "rgba(25, 118, 210, 0.08)",
      "&::before": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        background:
          "linear-gradient(180deg, rgba(25, 118, 210, 0.15), transparent 80%)",
        opacity: 0,
        transition: "opacity 0.3s ease",
        pointerEvents: "none"
      },
      "&:hover": {
        transform: "translateY(-3px)",
        borderColor: "rgba(25, 118, 210, 0.3)",
        background: "rgba(25, 118, 210, 0.12)",
        boxShadow: "0 8px 24px -6px rgba(25, 118, 210, 0.3)",
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
      fontSize: "0.7rem",
      fontWeight: 500,
      textAlign: "center",
      lineHeight: 1.3,
      color: theme.vars.palette.text.primary,
      opacity: 0.8,
      transition: "opacity 0.3s ease",
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical"
    },
    ".tile-description": {
      fontSize: "0.6rem",
      color: theme.vars.palette.text.secondary,
      textAlign: "center",
      opacity: 0.7,
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      display: "-webkit-box",
      WebkitLineClamp: 1,
      WebkitBoxOrient: "vertical",
      marginTop: "2px"
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
    ".preset-menu-btn": {
      position: "absolute",
      top: "4px",
      right: "4px",
      padding: "2px",
      minWidth: 0,
      opacity: 0,
      transition: "opacity 0.2s ease",
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".preset-tile:hover .preset-menu-btn": {
      opacity: 1
    }
  });

interface PresetsTilesProps {
  selectedNodeType?: string | null;
  _selectedNodeId?: string;
  selectedNodeProperties?: Record<string, unknown>;
  onSavePreset?: (nodeType: string, properties: Record<string, unknown>) => void;
}

const PresetsTiles = memo(function PresetsTiles({
  selectedNodeType,
  _selectedNodeId,
  selectedNodeProperties,
  onSavePreset
}: PresetsTilesProps) {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => tileStyles(theme), [theme]);

  const { presets, removePreset, incrementUsage, getPresetsForNodeType } =
    useNodePresetsStore((state) => ({
      presets: state.presets,
      removePreset: state.removePreset,
      clearPresets: state.clearPresets,
      incrementUsage: state.incrementUsage,
      getPresetsForNodeType: state.getPresetsForNodeType
    }));

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuPreset, setMenuPreset] = useState<NodePreset | null>(null);

  const { setDragToCreate, setHoveredNode } = useNodeMenuStore((state) => ({
    setDragToCreate: state.setDragToCreate,
    setHoveredNode: state.setHoveredNode
  }));

  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  const createNodeFn = useCreateNode();

  const handleDragStart = useCallback(
    (preset: NodePreset) => (event: ReactDragEvent<HTMLDivElement>) => {
      const metadata = getMetadata(preset.nodeType);
      if (!metadata) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      setDragToCreate(true);
      serializeDragData(
        { type: "create-node", payload: metadata },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "copyMove";
      setActiveDrag({ type: "create-node", payload: metadata });
    },
    [getMetadata, setDragToCreate, setActiveDrag]
  );

  const handleDragEnd = useCallback(() => {
    setDragToCreate(false);
    clearDrag();
  }, [setDragToCreate, clearDrag]);

  const onTileClick = useCallback(
    (preset: NodePreset) => {
      const metadata = getMetadata(preset.nodeType);

      if (!metadata) {
        addNotification({
          type: "warning",
          content: `Unable to find metadata for ${preset.nodeType}.`,
          timeout: 4000
        });
        return;
      }

      createNodeFn(metadata, { presetId: preset.id, properties: preset.properties });
      incrementUsage(preset.id);
    },
    [getMetadata, addNotification, createNodeFn, incrementUsage]
  );

  const onTileMouseEnter = useCallback(
    (preset: NodePreset) => {
      const metadata = getMetadata(preset.nodeType);
      if (metadata) {
        setHoveredNode(metadata);
      }
    },
    [getMetadata, setHoveredNode]
  );

  const handleOpenMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, preset: NodePreset) => {
      event.stopPropagation();
      setMenuAnchor(event.currentTarget);
      setMenuPreset(preset);
    },
    []
  );

  const handleCloseMenu = useCallback(() => {
    setMenuAnchor(null);
    setMenuPreset(null);
  }, []);

  const handleDeletePreset = useCallback(() => {
    if (menuPreset) {
      removePreset(menuPreset.id);
      addNotification({
        type: "info",
        content: `Preset "${menuPreset.name}" deleted`,
        timeout: 2000
      });
    }
    handleCloseMenu();
  }, [menuPreset, removePreset, addNotification, handleCloseMenu]);

  const handleDuplicatePreset = useCallback(() => {
    if (menuPreset) {
      useNodePresetsStore.getState().addPreset({
        nodeType: menuPreset.nodeType,
        name: `${menuPreset.name} (copy)`,
        description: menuPreset.description,
        properties: { ...menuPreset.properties }
      });
      addNotification({
        type: "success",
        content: `Preset duplicated as "${menuPreset.name} (copy)"`,
        timeout: 2000
      });
    }
    handleCloseMenu();
  }, [menuPreset, addNotification, handleCloseMenu]);

  const getNodeDisplayName = useCallback(
    (nodeType: string) => {
      const metadata = getMetadata(nodeType);
      if (metadata) {
        return (
          metadata.title || metadata.node_type.split(".").pop() || nodeType
        );
      }
      return nodeType.split(".").pop() || nodeType;
    },
    [getMetadata]
  );

  const canSavePreset = selectedNodeType && selectedNodeProperties;
  const displayedPresets = selectedNodeType
    ? getPresetsForNodeType(selectedNodeType)
    : presets;

  const handleSavePresetClick = useCallback(() => {
    if (onSavePreset && selectedNodeType && selectedNodeProperties) {
      onSavePreset(selectedNodeType, selectedNodeProperties);
    }
  }, [onSavePreset, selectedNodeType, selectedNodeProperties]);

  if (presets.length === 0) {
    return null;
  }

  return (
    <Box css={memoizedStyles}>
      <div className="tiles-header">
        <Typography variant="h5">
          <BookmarkIcon
            fontSize="small"
            sx={{ opacity: 0.8, color: "primary.main" }}
          />
          Presets
        </Typography>
        {canSavePreset && (
          <Tooltip title="Save current node as preset" placement="top">
            <IconButton
              size="small"
              className="clear-button"
              onClick={handleSavePresetClick}
              aria-label="Save node as preset"
            >
              <BookmarkBorderIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </div>
      <div className="tiles-container">
        {displayedPresets.map((preset) => {
          const displayName = preset.name;
          const nodeName = getNodeDisplayName(preset.nodeType);

          return (
            <Tooltip
              key={preset.id}
              title={
                <div>
                  <div>{displayName}</div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      opacity: 0.75,
                      marginTop: "4px"
                    }}
                  >
                    {nodeName} · Click to place · Drag to canvas
                  </div>
                  {preset.description && (
                    <div
                      style={{
                        fontSize: "0.65rem",
                        opacity: 0.6,
                        marginTop: "4px",
                        fontStyle: "italic"
                      }}
                    >
                      {preset.description}
                    </div>
                  )}
                </div>
              }
              placement="top"
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className="preset-tile"
                draggable
                onDragStart={handleDragStart(preset)}
                onDragEnd={handleDragEnd}
                onClick={() => onTileClick(preset)}
                onMouseEnter={() => onTileMouseEnter(preset)}
              >
                <IconButton
                  size="small"
                  className="preset-menu-btn"
                  onClick={(e) => handleOpenMenu(e, preset)}
                  aria-label={`Menu for ${displayName}`}
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>
                <Typography className="tile-label">{displayName}</Typography>
                {preset.description && (
                  <Typography className="tile-description">
                    {preset.description}
                  </Typography>
                )}
              </div>
            </Tooltip>
          );
        })}
      </div>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleCloseMenu}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      >
        <MenuItem onClick={handleDuplicatePreset}>
          <ListItemIcon>
            <ContentCopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Duplicate</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDeletePreset} sx={{ color: "error.main" }}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
});

export default PresetsTiles;
