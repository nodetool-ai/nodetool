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
  Add as AddIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
} from "@mui/icons-material";
import type { UISchemaNode, MuiComponentType } from "../types";
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
  onAddChild: (parentId: string) => void;
  isRoot?: boolean;
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
  onAddChild,
  isRoot = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);
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

  const handleAddChild = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddChild(node.id);
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
        sx={{
          display: "flex",
          alignItems: "center",
          pl: depth * 2,
          py: 0.5,
          cursor: "pointer",
          backgroundColor: isSelected
            ? "action.selected"
            : isHovered
              ? "action.hover"
              : "transparent",
          borderRadius: 1,
          transition: "background-color 0.15s ease",
          "&:hover .tree-item-actions": {
            opacity: 1,
          },
        }}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Expand/collapse toggle */}
        <IconButton
          size="small"
          onClick={handleToggleExpand}
          sx={{
            visibility: hasChildren || canHaveChildren ? "visible" : "hidden",
            width: 24,
            height: 24,
          }}
        >
          {isExpanded ? (
            <ExpandMoreIcon fontSize="small" />
          ) : (
            <ChevronRightIcon fontSize="small" />
          )}
        </IconButton>

        {/* Component type and name */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, overflow: "hidden" }}>
          <Typography
            variant="caption"
            sx={{
              color: "primary.main",
              fontWeight: 500,
              fontSize: "0.7rem",
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
              fontSize: "0.8rem",
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
          {canHaveChildren && (
            <Tooltip title="Add child">
              <IconButton size="small" onClick={handleAddChild}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {!isRoot && (
            <>
              <Tooltip title="Duplicate">
                <IconButton size="small" onClick={handleDuplicate}>
                  <CopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" onClick={handleDelete} color="error">
                  <DeleteIcon fontSize="small" />
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
              onAddChild={onAddChild}
            />
          ))}
        </Collapse>
      )}
    </Box>
  );
};

/**
 * Component palette for adding new components
 */
interface ComponentPaletteProps {
  parentId: string | null;
  onSelectComponent: (type: MuiComponentType) => void;
  onClose: () => void;
}

const ComponentPalette: React.FC<ComponentPaletteProps> = ({
  parentId,
  onSelectComponent,
  onClose,
}) => {
  const categories = [
    { key: "layout", label: "Layout" },
    { key: "typography", label: "Typography" },
    { key: "inputs", label: "Inputs" },
    { key: "actions", label: "Actions" },
    { key: "dataDisplay", label: "Data Display" },
    { key: "navigation", label: "Navigation" },
  ] as const;

  // Get parent definition to filter allowed children
  const parentDef = parentId ? componentRegistry[useWysiwygEditorStore.getState().getNode(parentId)?.type || "Box"] : null;

  const isAllowed = (type: MuiComponentType) => {
    if (!parentDef) {
      return true;
    }
    if (parentDef.childPolicy === "any") {
      return true;
    }
    if (parentDef.childPolicy === "none") {
      return false;
    }
    if (parentDef.childPolicy === "specific" && parentDef.allowedChildren) {
      return parentDef.allowedChildren.includes(type);
    }
    return true;
  };

  return (
    <Box
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        bgcolor: "background.paper",
        zIndex: 10,
        overflow: "auto",
        p: 1,
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle2">Add Component</Typography>
        <IconButton size="small" onClick={onClose}>
          ✕
        </IconButton>
      </Stack>

      {categories.map(({ key, label }) => {
        const components = Object.values(componentRegistry).filter(
          (c) => c.category === key && isAllowed(c.type)
        );
        if (components.length === 0) {
          return null;
        }

        return (
          <Box key={key} sx={{ mb: 1 }}>
            <Typography
              variant="caption"
              sx={{ color: "text.secondary", textTransform: "uppercase", fontWeight: 600 }}
            >
              {label}
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
              {components.map((comp) => (
                <Box
                  key={comp.type}
                  onClick={() => onSelectComponent(comp.type)}
                  sx={{
                    px: 1,
                    py: 0.5,
                    bgcolor: "action.hover",
                    borderRadius: 1,
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    "&:hover": {
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                    },
                  }}
                >
                  {comp.label}
                </Box>
              ))}
            </Stack>
          </Box>
        );
      })}
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
    addNode,
  } = useWysiwygEditorStore();

  const [showPalette, setShowPalette] = useState(false);
  const [paletteParentId, setPaletteParentId] = useState<string | null>(null);

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

  const handleAddChild = useCallback((parentId: string) => {
    setPaletteParentId(parentId);
    setShowPalette(true);
  }, []);

  const handleSelectComponent = useCallback(
    (type: MuiComponentType) => {
      if (paletteParentId) {
        addNode(paletteParentId, type);
      }
      setShowPalette(false);
      setPaletteParentId(null);
    },
    [paletteParentId, addNode]
  );

  const handleClosePalette = useCallback(() => {
    setShowPalette(false);
    setPaletteParentId(null);
  }, []);

  return (
    <Box
      sx={{
        height: "100%",
        overflow: "auto",
        position: "relative",
        borderRight: 1,
        borderColor: "divider",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 1,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="subtitle2">Component Tree</Typography>
        <Tooltip title="Add to root">
          <IconButton size="small" onClick={() => handleAddChild(schema.root.id)}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Tree */}
      <Box sx={{ p: 1 }}>
        <TreeItem
          node={schema.root}
          depth={0}
          isSelected={selectedNodeId === schema.root.id}
          isExpanded={expandedNodeIds.has(schema.root.id) || true}
          onSelect={handleSelect}
          onToggleExpand={handleToggleExpand}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onAddChild={handleAddChild}
          isRoot
        />
      </Box>

      {/* Component palette overlay */}
      {showPalette && (
        <ComponentPalette
          parentId={paletteParentId}
          onSelectComponent={handleSelectComponent}
          onClose={handleClosePalette}
        />
      )}
    </Box>
  );
};

export default ComponentTree;
