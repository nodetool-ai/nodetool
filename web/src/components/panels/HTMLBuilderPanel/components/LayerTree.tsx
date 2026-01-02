/**
 * LayerTree Component
 *
 * Hierarchical tree view of all elements in the builder.
 * Supports selection, reordering, and nested structure visualization.
 */

import React, { useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Collapse
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useHTMLBuilderStore } from "../../../../stores/useHTMLBuilderStore";
import type { BuilderElement } from "../types/builder.types";

/**
 * Props for LayerTree
 */
interface LayerTreeProps {
  /** Called when an element is selected */
  onElementSelect?: (elementId: string) => void;
}

/**
 * Get icon for element type
 */
const getElementTypeIcon = (element: BuilderElement): string => {
  switch (element.type) {
    case "container":
      return "📦";
    case "text":
      return "📝";
    case "heading":
      return "📋";
    case "image":
      return "🖼️";
    case "button":
      return "🔘";
    case "input":
      return "📥";
    case "media":
      return "🎬";
    case "form":
      return "📋";
    default:
      return "📄";
  }
};

/**
 * Props for a single layer item
 */
interface LayerItemProps {
  element: BuilderElement;
  elements: Record<string, BuilderElement>;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleExpand: (id: string) => void;
}

/**
 * Single layer item component
 */
const LayerItem: React.FC<LayerItemProps> = ({
  element,
  elements,
  depth,
  selectedId,
  onSelect,
  onDelete,
  onDuplicate,
  onToggleExpand
}) => {
  const theme = useTheme();
  const isSelected = selectedId === element.id;
  const hasChildren = element.children.length > 0;
  const isExpanded = element.expanded !== false; // Default to expanded

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onSelect(element.id);
    },
    [element.id, onSelect]
  );

  const handleExpandClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onToggleExpand(element.id);
    },
    [element.id, onToggleExpand]
  );

  const handleDeleteClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onDelete(element.id);
    },
    [element.id, onDelete]
  );

  const handleDuplicateClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onDuplicate(element.id);
    },
    [element.id, onDuplicate]
  );

  // Render children recursively
  const renderedChildren = useMemo(() => {
    if (!hasChildren || !isExpanded) {
      return null;
    }

    return element.children.map((childId) => {
      const child = elements[childId];
      if (!child) {
        return null;
      }
      return (
        <LayerItem
          key={childId}
          element={child}
          elements={elements}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onToggleExpand={onToggleExpand}
        />
      );
    });
  }, [
    hasChildren,
    isExpanded,
    element.children,
    elements,
    depth,
    selectedId,
    onSelect,
    onDelete,
    onDuplicate,
    onToggleExpand
  ]);

  return (
    <>
      <Box
        onClick={handleClick}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          py: 0.5,
          px: 1,
          pl: depth * 2 + 1,
          cursor: "pointer",
          backgroundColor: isSelected
            ? theme.palette.action.selected
            : "transparent",
          "&:hover": {
            backgroundColor: isSelected
              ? theme.palette.action.selected
              : theme.palette.action.hover
          },
          borderLeft: isSelected
            ? `2px solid ${theme.palette.primary.main}`
            : "2px solid transparent",
          transition: "all 0.15s ease"
        }}
      >
        {/* Expand/collapse button */}
        <IconButton
          size="small"
          onClick={handleExpandClick}
          sx={{
            p: 0,
            visibility: hasChildren ? "visible" : "hidden",
            width: 20,
            height: 20
          }}
        >
          {isExpanded ? (
            <ExpandMoreIcon sx={{ fontSize: 16 }} />
          ) : (
            <ChevronRightIcon sx={{ fontSize: 16 }} />
          )}
        </IconButton>

        {/* Element type icon */}
        <Typography
          component="span"
          sx={{ fontSize: "14px", lineHeight: 1, mr: 0.5 }}
        >
          {getElementTypeIcon(element)}
        </Typography>

        {/* Element name */}
        <Typography
          variant="body2"
          sx={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: isSelected ? 600 : 400
          }}
        >
          {element.displayName || element.tag}
        </Typography>

        {/* Tag indicator */}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: "10px" }}
        >
          {element.tag}
        </Typography>

        {/* Actions (show on hover) */}
        <Box
          className="layer-actions"
          sx={{
            display: "none",
            gap: 0.5,
            ".MuiBox-root:hover > &": { display: "flex" }
          }}
        >
          <Tooltip title="Duplicate">
            <IconButton size="small" onClick={handleDuplicateClick}>
              <ContentCopyIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton
              size="small"
              onClick={handleDeleteClick}
              color="error"
            >
              <DeleteIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Children */}
      <Collapse in={isExpanded}>{renderedChildren}</Collapse>
    </>
  );
};

/**
 * LayerTree component
 */
export const LayerTree: React.FC<LayerTreeProps> = ({ onElementSelect }) => {
  const theme = useTheme();

  // Get state from store
  const elements = useHTMLBuilderStore((state) => state.elements);
  const rootElementIds = useHTMLBuilderStore((state) => state.rootElementIds);
  const selectedElementId = useHTMLBuilderStore(
    (state) => state.selectedElementId
  );

  // Store actions
  const selectElement = useHTMLBuilderStore((state) => state.selectElement);
  const deleteElement = useHTMLBuilderStore((state) => state.deleteElement);
  const duplicateElement = useHTMLBuilderStore(
    (state) => state.duplicateElement
  );
  const updateElement = useHTMLBuilderStore((state) => state.updateElement);

  // Handle element selection
  const handleSelect = useCallback(
    (id: string) => {
      selectElement(id);
      onElementSelect?.(id);
    },
    [selectElement, onElementSelect]
  );

  // Handle delete
  const handleDelete = useCallback(
    (id: string) => {
      deleteElement(id);
    },
    [deleteElement]
  );

  // Handle duplicate
  const handleDuplicate = useCallback(
    (id: string) => {
      duplicateElement(id);
    },
    [duplicateElement]
  );

  // Handle expand/collapse toggle
  const handleToggleExpand = useCallback(
    (id: string) => {
      const element = elements[id];
      if (element) {
        updateElement(id, { expanded: element.expanded === false });
      }
    },
    [elements, updateElement]
  );

  // Render root elements
  const rootElements = useMemo(() => {
    return rootElementIds.map((id) => {
      const element = elements[id];
      if (!element) {
        return null;
      }
      return (
        <LayerItem
          key={id}
          element={element}
          elements={elements}
          depth={0}
          selectedId={selectedElementId}
          onSelect={handleSelect}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onToggleExpand={handleToggleExpand}
        />
      );
    });
  }, [
    rootElementIds,
    elements,
    selectedElementId,
    handleSelect,
    handleDelete,
    handleDuplicate,
    handleToggleExpand
  ]);

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: `1px solid ${theme.palette.divider}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <Typography variant="subtitle2" fontWeight="bold">
          Layers
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {Object.keys(elements).length} elements
        </Typography>
      </Box>

      {/* Tree content */}
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          py: 1,
          "& .MuiBox-root:hover .layer-actions": {
            display: "flex"
          }
        }}
      >
        {rootElementIds.length === 0 ? (
          <Box
            sx={{
              p: 3,
              textAlign: "center"
            }}
          >
            <Typography variant="body2" color="text.secondary">
              No elements yet
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Add components from the library
            </Typography>
          </Box>
        ) : (
          rootElements
        )}
      </Box>
    </Box>
  );
};

export default LayerTree;
