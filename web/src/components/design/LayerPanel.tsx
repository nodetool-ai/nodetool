/**
 * LayerPanel - Displays and manages layers in the canvas
 */

import React, { useCallback, memo } from "react";
import {
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import ImageIcon from "@mui/icons-material/Image";
import RectangleIcon from "@mui/icons-material/Rectangle";
import FolderIcon from "@mui/icons-material/Folder";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { LayoutElement } from "./types";

interface LayerPanelProps {
  elements: LayoutElement[];
  selectedIds: string[];
  onSelect: (id: string, addToSelection: boolean) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

// Get icon for element type
const getElementIcon = (type: string): React.ReactNode => {
  switch (type) {
    case "text":
      return <TextFieldsIcon fontSize="small" />;
    case "image":
      return <ImageIcon fontSize="small" />;
    case "rectangle":
      return <RectangleIcon fontSize="small" />;
    case "group":
      return <FolderIcon fontSize="small" />;
    default:
      return <RectangleIcon fontSize="small" />;
  }
};

interface LayerItemProps {
  element: LayoutElement;
  isSelected: boolean;
  index: number;
  onSelect: (id: string, addToSelection: boolean) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  isDragOver: boolean;
}

const LayerItem: React.FC<LayerItemProps> = memo(({
  element,
  isSelected,
  index,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
  isDragOver
}) => {
  const theme = useTheme();

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onSelect(element.id, e.shiftKey || e.ctrlKey || e.metaKey);
    },
    [element.id, onSelect]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      onDragStart(index);
    },
    [index, onDragStart]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      onDragOver(index);
    },
    [index, onDragOver]
  );

  return (
    <ListItem
      className="layer-item"
      disablePadding
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={onDragEnd}
      sx={{
        opacity: isDragging ? 0.5 : 1,
        backgroundColor: isDragOver ? theme.vars.palette.action.hover : "transparent",
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        "&:last-child": {
          borderBottom: "none"
        }
      }}
    >
      <ListItemButton
        selected={isSelected}
        onClick={handleClick}
        sx={{
          py: 0.5,
          px: 1,
          minHeight: 36,
          opacity: element.visible ? 1 : 0.5
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            cursor: "grab",
            mr: 1,
            color: theme.vars.palette.text.secondary,
            "&:active": {
              cursor: "grabbing"
            }
          }}
        >
          <DragIndicatorIcon fontSize="small" />
        </Box>
        <ListItemIcon sx={{ minWidth: 28 }}>
          {getElementIcon(element.type)}
        </ListItemIcon>
        <ListItemText
          primary={element.name}
          primaryTypographyProps={{
            variant: "body2",
            noWrap: true,
            sx: {
              textDecoration: element.locked ? "line-through" : "none"
            }
          }}
        />
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title={element.visible ? "Hide" : "Show"}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility(element.id);
              }}
              sx={{ p: 0.5 }}
            >
              {element.visible ? (
                <VisibilityIcon fontSize="small" />
              ) : (
                <VisibilityOffIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          <Tooltip title={element.locked ? "Unlock" : "Lock"}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(element.id);
              }}
              sx={{ p: 0.5 }}
            >
              {element.locked ? (
                <LockIcon fontSize="small" />
              ) : (
                <LockOpenIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      </ListItemButton>
    </ListItem>
  );
});
LayerItem.displayName = "LayerItem";

const LayerPanel: React.FC<LayerPanelProps> = ({
  elements,
  selectedIds,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onReorder
}) => {
  const theme = useTheme();
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);

  // Sort elements by zIndex in reverse order (top layer first)
  const sortedElements = React.useMemo(
    () => [...elements].sort((a, b) => b.zIndex - a.zIndex),
    [elements]
  );

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((index: number) => {
    setDragOverIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      // Convert visual indices back to zIndex-based indices
      const fromElement = sortedElements[dragIndex];
      const toElement = sortedElements[dragOverIndex];
      
      // Find actual indices in original array
      const fromIdx = elements.findIndex((el) => el.id === fromElement.id);
      const toIdx = elements.findIndex((el) => el.id === toElement.id);
      
      onReorder(fromIdx, toIdx);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, dragOverIndex, elements, sortedElements, onReorder]);

  return (
    <Box
      className="layer-panel"
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderLeft: `1px solid ${theme.vars.palette.divider}`
      }}
    >
      <Box
        className="layer-panel-header"
        sx={{
          px: 1.5,
          py: 1,
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          backgroundColor: theme.vars.palette.background.paper
        }}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          Layers
        </Typography>
      </Box>
      <Box
        className="layer-panel-content"
        sx={{
          flexGrow: 1,
          overflow: "auto"
        }}
      >
        {sortedElements.length === 0 ? (
          <Box
            className="layer-panel-empty"
            sx={{
              p: 2,
              textAlign: "center",
              color: theme.vars.palette.text.secondary
            }}
          >
            <Typography variant="body2">No layers yet</Typography>
            <Typography variant="caption">
              Add elements using the toolbar
            </Typography>
          </Box>
        ) : (
          <List className="layer-list" disablePadding>
            {sortedElements.map((element, index) => (
              <LayerItem
                key={element.id}
                element={element}
                isSelected={selectedIds.includes(element.id)}
                index={index}
                onSelect={onSelect}
                onToggleVisibility={onToggleVisibility}
                onToggleLock={onToggleLock}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                isDragging={dragIndex === index}
                isDragOver={dragOverIndex === index}
              />
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
};

export default memo(LayerPanel);
