/**
 * Component Tree Panel
 *
 * Displays a hierarchical view of the UI schema tree.
 * Supports selection, drag-and-drop reordering, and basic operations.
 */

import React, { useCallback, useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Collapse,
  Stack,
  Tooltip,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
  DragIndicator as DragIcon,
} from "@mui/icons-material";
import type { UISchemaNode } from "../types";
import { componentRegistry } from "../types/registry";
import { useWysiwygEditorStore } from "../hooks/useWysiwygEditorStore";

/**
 * Props for a tree item
 */
interface TreeItemProps {
  node: UISchemaNode;
  depth: number;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: (nodeId: string) => void;
  onToggleExpand: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
  isRoot?: boolean;
  onDragStart?: (nodeId: string, e: React.DragEvent) => void;
  onDragOver?: (nodeId: string, e: React.DragEvent) => void;
  onDrop?: (nodeId: string, e: React.DragEvent) => void;
}

/**
 * Single tree item component
 */
const TreeItem: React.FC<TreeItemProps> = ({
  node,
  depth,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
  onDelete,
  onDuplicate,
  isRoot = false,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const definition = componentRegistry[node.type];
  const canHaveChildren = definition.childPolicy !== "none";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(node.id);
  };

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(node.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(node.id);
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDuplicate(node.id);
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (isRoot) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("application/wysiwyg-node-id", node.id);
    e.dataTransfer.effectAllowed = "move";
    onDragStart?.(node.id, e);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!canHaveChildren) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
    onDragOver?.(node.id, e);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    onDrop?.(node.id, e);
  };

  // Get display name based on props
  const getDisplayName = () => {
    const type = node.type;
    const props = node.props;

    // Check for common text properties
    if (props.text && typeof props.text === "string") {
      const text = props.text as string;
      return text.length > 20 ? `${text.slice(0, 20)}...` : text;
    }
    if (props.label && typeof props.label === "string") {
      const label = props.label as string;
      return label.length > 20 ? `${label.slice(0, 20)}...` : label;
    }
    if (props.title && typeof props.title === "string") {
      const title = props.title as string;
      return title.length > 20 ? `${title.slice(0, 20)}...` : title;
    }

    return type;
  };

  return (
    <Box>
      {/* Tree item row */}
      <Box
        draggable={!isRoot}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        sx={{
          display: "flex",
          alignItems: "center",
          pl: depth * 2,
          py: 0.5,
          cursor: isRoot ? "pointer" : "grab",
          backgroundColor: isDragOver
            ? "rgba(96, 165, 250, 0.15)"
            : isSelected
              ? "action.selected"
              : isHovered
                ? "action.hover"
                : "transparent",
          borderRadius: 1,
          border: isDragOver ? "1px dashed" : "1px solid transparent",
          borderColor: isDragOver ? "primary.main" : "transparent",
          transition: "all 0.15s ease",
          "&:hover .tree-item-actions": {
            opacity: 1,
          },
          "&:active": {
            cursor: isRoot ? "pointer" : "grabbing",
          },
        }}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Drag handle */}
        {!isRoot && (
          <DragIcon
            sx={{
              fontSize: 14,
              color: "text.disabled",
              mr: 0.5,
              opacity: isHovered ? 1 : 0.3,
              transition: "opacity 0.15s ease",
            }}
          />
        )}

        {/* Expand/collapse toggle */}
        <IconButton
          size="small"
          onClick={handleToggleExpand}
          sx={{
            visibility: hasChildren || canHaveChildren ? "visible" : "hidden",
            width: 20,
            height: 20,
          }}
        >
          {isExpanded ? (
            <ExpandMoreIcon sx={{ fontSize: 14 }} />
          ) : (
            <ChevronRightIcon sx={{ fontSize: 14 }} />
          )}
        </IconButton>

        {/* Component type and name */}
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flex: 1, overflow: "hidden" }}>
          <Typography
            variant="caption"
            sx={{
              color: "primary.main",
              fontWeight: 500,
              fontSize: "0.65rem",
              textTransform: "uppercase",
            }}
          >
            {node.type}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "0.7rem",
            }}
          >
            {getDisplayName() !== node.type && getDisplayName()}
          </Typography>
        </Stack>

        {/* Action buttons (visible on hover) */}
        <Stack
          direction="row"
          spacing={0}
          className="tree-item-actions"
          sx={{
            opacity: 0,
            transition: "opacity 0.15s ease",
          }}
        >
          {!isRoot && (
            <>
              <Tooltip title="Duplicate (Ctrl+D)">
                <IconButton size="small" onClick={handleDuplicate} sx={{ p: 0.25 }}>
                  <CopyIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete (Del)">
                <IconButton size="small" onClick={handleDelete} color="error" sx={{ p: 0.25 }}>
                  <DeleteIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Stack>
      </Box>

      {/* Children */}
      {hasChildren && (
        <Collapse in={isExpanded} timeout="auto">
          {node.children!.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              isSelected={useWysiwygEditorStore.getState().selectedNodeId === child.id}
              isExpanded={useWysiwygEditorStore.getState().expandedNodeIds.has(child.id)}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
            />
          ))}
        </Collapse>
      )}
    </Box>
  );
};

/**
 * Component Tree Panel
 */
export const ComponentTree: React.FC = () => {
  const {
    schema,
    selectedNodeId,
    expandedNodeIds,
    selectNode,
    toggleNodeExpanded,
    deleteNode,
    duplicateNode,
    moveNodeTo,
  } = useWysiwygEditorStore();

  const handleSelect = useCallback(
    (nodeId: string) => {
      selectNode(nodeId);
    },
    [selectNode]
  );

  const handleToggleExpand = useCallback(
    (nodeId: string) => {
      toggleNodeExpanded(nodeId);
    },
    [toggleNodeExpanded]
  );

  const handleDelete = useCallback(
    (nodeId: string) => {
      deleteNode(nodeId);
    },
    [deleteNode]
  );

  const handleDuplicate = useCallback(
    (nodeId: string) => {
      duplicateNode(nodeId);
    },
    [duplicateNode]
  );

  const handleDragStart = useCallback((_nodeId: string, _e: React.DragEvent) => {
    // Could set a dragging state here if needed
  }, []);

  const handleDragOver = useCallback((_nodeId: string, _e: React.DragEvent) => {
    // Visual feedback handled by TreeItem
  }, []);

  const handleDrop = useCallback(
    (targetNodeId: string, e: React.DragEvent) => {
      const sourceNodeId = e.dataTransfer.getData("application/wysiwyg-node-id");
      if (sourceNodeId && sourceNodeId !== targetNodeId) {
        moveNodeTo(sourceNodeId, targetNodeId);
      }
    },
    [moveNodeTo]
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 1,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "rgba(255, 255, 255, 0.02)",
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            textTransform: "uppercase",
            color: "text.secondary",
            letterSpacing: "0.05em",
          }}
        >
          Component Tree
        </Typography>
      </Box>

      {/* Tree */}
      <Box sx={{ flex: 1, overflow: "auto", p: 1 }}>
        <TreeItem
          node={schema.root}
          depth={0}
          isSelected={selectedNodeId === schema.root.id}
          isExpanded={expandedNodeIds.has(schema.root.id) || true}
          onSelect={handleSelect}
          onToggleExpand={handleToggleExpand}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          isRoot
        />
      </Box>
    </Box>
  );
};

export default ComponentTree;
