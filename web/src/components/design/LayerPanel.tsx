/**
 * LayerPanel - Displays and manages layers in the canvas
 * 
 * Drag behavior:
 * - Drag by the grip handle
 * - While dragging, a line appears between items to show drop position
 * - For groups, hovering in the center shows a border (drop inside)
 * - Item only moves on drop, not during drag
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
  Tooltip,
  Menu,
  MenuItem,
  Divider
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import ImageIcon from "@mui/icons-material/Image";
import RectangleIcon from "@mui/icons-material/Rectangle";
import FolderIcon from "@mui/icons-material/Folder";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { LayoutElement } from "./types";

interface LayerPanelProps {
  elements: LayoutElement[];
  selectedIds: string[];
  onSelect: (id: string, addToSelection: boolean) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onMoveLayer: (id: string, targetId: string | null, position: "before" | "after" | "inside" | "root") => void;
  onSetAllVisibility: (visible: boolean) => void;
  onSetAllLock: (locked: boolean) => void;
  onGroup: (ids: string[]) => void;
  onUngroup: (ids: string[]) => void;
  onFlatten: (ids: string[]) => void;
}

// Get icon for element type
const getElementIcon = (type: string): React.ReactNode => {
  const iconSx = { fontSize: 14 };
  switch (type) {
    case "text":
      return <TextFieldsIcon sx={iconSx} />;
    case "image":
      return <ImageIcon sx={iconSx} />;
    case "rectangle":
      return <RectangleIcon sx={iconSx} />;
    case "group":
      return <FolderIcon sx={iconSx} />;
    default:
      return <RectangleIcon sx={iconSx} />;
  }
};

// Drop zone - receives drag events directly for reliable hit detection
interface DropZoneProps {
  active: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
}

const DropZone: React.FC<DropZoneProps> = memo(({ active, onDragEnter, onDragLeave, onDrop }) => {
  const theme = useTheme();
  return (
    <Box
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDragEnter();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDragLeave();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop();
      }}
      sx={{
        height: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <Box
        sx={{
          width: "100%",
          height: active ? 3 : 1,
          borderRadius: 1,
          backgroundColor: active ? theme.vars.palette.primary.main : theme.vars.palette.divider,
          opacity: active ? 1 : 0.3,
          transition: "all 0.1s ease"
        }}
      />
    </Box>
  );
});
DropZone.displayName = "DropZone";

interface LayerItemProps {
  element: LayoutElement;
  isSelected: boolean;
  depth: number;
  isGroup: boolean;
  isCollapsed: boolean;
  descendantCount: number;
  visibilityState: "on" | "off" | "mixed";
  lockState: "on" | "off" | "mixed";
  showDropBefore: boolean;
  showDropInside: boolean;
  onSelect: (id: string, addToSelection: boolean) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onDragStart: (id: string) => void;
  onSetDropTarget: (targetId: string | null, position: "before" | "after" | "inside" | null) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onContextMenu: (event: React.MouseEvent, id: string) => void;
  isDragging: boolean;
  isBeingDragged: boolean;
}

const LayerItem: React.FC<LayerItemProps> = memo(({
  element,
  isSelected,
  depth,
  isGroup,
  isCollapsed,
  descendantCount,
  visibilityState,
  lockState,
  showDropBefore,
  showDropInside,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onToggleCollapse,
  onDragStart,
  onSetDropTarget,
  onDrop,
  onDragEnd,
  onContextMenu,
  isDragging,
  isBeingDragged
}) => {
  const theme = useTheme();

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onSelect(element.id, e.shiftKey || e.ctrlKey || e.metaKey);
    },
    [element.id, onSelect]
  );

  // For groups: handle drag over the item itself (for "inside" drop)
  const handleItemDragEnter = useCallback(() => {
    if (isGroup && isDragging && !isBeingDragged) {
      onSetDropTarget(element.id, "inside");
    }
  }, [element.id, isGroup, isDragging, isBeingDragged, onSetDropTarget]);

  const handleItemDragLeave = useCallback(() => {
    // Only clear if we're currently the target
  }, []);

  const handleItemDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isGroup) {
        onSetDropTarget(element.id, "inside");
        onDrop();
      }
    },
    [element.id, isGroup, onDrop, onSetDropTarget]
  );

  return (
    <>
      {/* Drop zone before this item */}
      <DropZone
        active={showDropBefore}
        onDragEnter={() => onSetDropTarget(element.id, "before")}
        onDragLeave={() => {}}
        onDrop={onDrop}
      />
      
      <ListItem
        className="layer-item"
        disablePadding
        draggable={!isBeingDragged}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", element.id);
          onDragStart(element.id);
        }}
        onDragEnd={onDragEnd}
        sx={{
          opacity: isBeingDragged ? 0.4 : 1,
          cursor: isDragging ? "grabbing" : "grab",
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          // Show border when this is a group and drop target is "inside"
          ...(showDropInside && {
            outline: `2px solid ${theme.vars.palette.primary.main}`,
            outlineOffset: -2,
            borderRadius: 1
          }),
          "&:last-child": {
            borderBottom: "none"
          }
        }}
      >
        <ListItemButton
          selected={isSelected}
          disableRipple
          onClick={handleClick}
          onDragEnter={isGroup ? handleItemDragEnter : undefined}
          onDragLeave={handleItemDragLeave}
          onDragOver={(e) => e.preventDefault()}
          onDrop={isGroup ? handleItemDrop : undefined}
          onDoubleClick={(e) => {
            if (!isGroup) {
              return;
            }
            e.stopPropagation();
            onToggleCollapse(element.id);
          }}
          onContextMenu={(event) => onContextMenu(event, element.id)}
          sx={{
            py: 0.5,
            px: 1,
            minHeight: 32,
            opacity: element.visible ? 1 : 0.6,
            pl: 1 + depth * 1.5,
            position: "relative",
            backgroundColor: isGroup ? "rgba(128, 128, 128, 0.05)" : "transparent",
            "&:hover": {
              backgroundColor: "rgba(128, 128, 128, 0.12)"
            },
            "&.Mui-selected": {
              backgroundColor: "rgba(100, 150, 255, 0.15)"
            },
            "&.Mui-selected:hover": {
              backgroundColor: "rgba(100, 150, 255, 0.20)"
            },
            "&.Mui-selected:after": {
              content: '""',
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 2,
              backgroundColor: theme.vars.palette.primary.main
            }
          }}
        >
          {/* Indent line for nested items */}
          {depth > 0 && (
            <Box
              sx={{
                width: depth * 12,
                alignSelf: "stretch",
                borderLeft: `1px solid ${theme.vars.palette.divider}`,
                mr: 0.5
              }}
            />
          )}
          
          {/* Collapse/expand button for groups */}
          <Box sx={{ width: 20, display: "flex", alignItems: "center" }}>
            {isGroup && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollapse(element.id);
                }}
                sx={{ p: 0.25, color: theme.vars.palette.text.secondary }}
              >
                {isCollapsed ? (
                  <ChevronRightIcon sx={{ fontSize: 14 }} />
                ) : (
                  <ExpandMoreIcon sx={{ fontSize: 14 }} />
                )}
              </IconButton>
            )}
          </Box>
          
          {/* Element icon */}
          <ListItemIcon sx={{ minWidth: 22 }}>
            {getElementIcon(element.type)}
          </ListItemIcon>
          
          {/* Element name */}
          <ListItemText
            primary={
              isGroup && descendantCount > 0
                ? `${element.name} (${descendantCount})`
                : element.name
            }
            primaryTypographyProps={{
              variant: "caption",
              noWrap: true,
              sx: {
                textDecoration: element.locked ? "line-through" : "none",
                fontWeight: isGroup ? 500 : 300
              }
            }}
          />
          
          {/* Visibility and lock buttons */}
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Tooltip title={visibilityState === "on" ? "Hide" : "Show"}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(element.id);
                }}
                sx={{ p: 0.5 }}
              >
                {visibilityState === "mixed" ? (
                  <VisibilityOutlinedIcon sx={{ fontSize: 14 }} />
                ) : visibilityState === "on" ? (
                  <VisibilityIcon sx={{ fontSize: 14 }} />
                ) : (
                  <VisibilityOffIcon sx={{ fontSize: 14 }} />
                )}
              </IconButton>
            </Tooltip>
            <Tooltip title={lockState === "on" ? "Unlock" : "Lock"}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLock(element.id);
                }}
                sx={{ p: 0.5 }}
              >
                {lockState === "mixed" ? (
                  <LockOutlinedIcon sx={{ fontSize: 14 }} />
                ) : lockState === "on" ? (
                  <LockIcon sx={{ fontSize: 14 }} />
                ) : (
                  <LockOpenIcon sx={{ fontSize: 14 }} />
                )}
              </IconButton>
            </Tooltip>
          </Box>
        </ListItemButton>
      </ListItem>
    </>
  );
});
LayerItem.displayName = "LayerItem";

const LayerPanel: React.FC<LayerPanelProps> = ({
  elements,
  selectedIds,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onMoveLayer,
  onSetAllVisibility,
  onSetAllLock,
  onGroup,
  onUngroup,
  onFlatten
}) => {
  const theme = useTheme();
  
  // Drag state - stored in ref to avoid re-renders during drag
  const dragStateRef = React.useRef<{
    draggedId: string | null;
    targetId: string | null;
    position: "before" | "after" | "inside" | null;
  }>({ draggedId: null, targetId: null, position: null });
  
  // Only this state triggers re-renders for visual feedback
  const [dropIndicator, setDropIndicator] = React.useState<{
    targetId: string;
    position: "before" | "after" | "inside";
  } | null>(null);
  
  const [isDragging, setIsDragging] = React.useState(false);
  const [draggedId, setDraggedId] = React.useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = React.useState<{
    mouseX: number;
    mouseY: number;
    targetId: string;
  } | null>(null);

  const elementById = React.useMemo(
    () => new Map(elements.map((el) => [el.id, el])),
    [elements]
  );

  const childrenByParent = React.useMemo(() => {
    const map = new Map<string, LayoutElement[]>();
    elements.forEach((element) => {
      const parentKey = element.parentId ?? "__root__";
      const list = map.get(parentKey) ?? [];
      list.push(element);
      map.set(parentKey, list);
    });
    return map;
  }, [elements]);

  const getSortedChildren = useCallback(
    (parentId: string) =>
      [...(childrenByParent.get(parentId) ?? [])].sort(
        (a, b) => b.zIndex - a.zIndex
      ),
    [childrenByParent]
  );

  const getDescendantIds = useCallback(
    (parentId: string): string[] => {
      const result: string[] = [];
      const walk = (id: string) => {
        const children = childrenByParent.get(id) ?? [];
        children.forEach((child) => {
          result.push(child.id);
          walk(child.id);
        });
      };
      walk(parentId);
      return result;
    },
    [childrenByParent]
  );

  const getEffectiveState = useCallback(
    (elementId: string) => {
      let current = elementById.get(elementId);
      let visible = true;
      let locked = false;
      while (current) {
        if (!current.visible) {
          visible = false;
        }
        if (current.locked) {
          locked = true;
        }
        current = current.parentId ? elementById.get(current.parentId) : undefined;
      }
      return { visible, locked };
    },
    [elementById]
  );

  const getGroupState = useCallback(
    (elementId: string): {
      visibilityState: "on" | "off" | "mixed";
      lockState: "on" | "off" | "mixed";
      descendantCount: number;
    } => {
      const descendants = getDescendantIds(elementId);
      const idsToCheck = [elementId, ...descendants];
      const visibleValues = idsToCheck.map((id) => elementById.get(id)?.visible);
      const lockValues = idsToCheck.map((id) => elementById.get(id)?.locked);
      const allVisible = visibleValues.every((v) => v === true);
      const allHidden = visibleValues.every((v) => v === false);
      const allLocked = lockValues.every((v) => v === true);
      const allUnlocked = lockValues.every((v) => v === false);
      return {
        visibilityState: allVisible ? "on" : allHidden ? "off" : "mixed",
        lockState: allLocked ? "on" : allUnlocked ? "off" : "mixed",
        descendantCount: descendants.length
      };
    },
    [elementById, getDescendantIds]
  );

  const handleToggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleDragStart = useCallback((id: string) => {
    dragStateRef.current = { draggedId: id, targetId: null, position: null };
    setDraggedId(id);
    setIsDragging(true);
  }, []);

  const handleSetDropTarget = useCallback((targetId: string | null, position: "before" | "after" | "inside" | null) => {
    const state = dragStateRef.current;
    
    // Clear if null
    if (!targetId || !position) {
      state.targetId = null;
      state.position = null;
      setDropIndicator(null);
      return;
    }
    
    // Don't allow dropping on itself or its descendants
    if (state.draggedId === targetId) {
      return;
    }
    if (state.draggedId) {
      const descendants = getDescendantIds(state.draggedId);
      if (descendants.includes(targetId)) {
        return;
      }
    }
    
    // Update ref immediately
    state.targetId = targetId;
    state.position = position;
    
    // Update visual state
    setDropIndicator((prev) => {
      if (prev?.targetId === targetId && prev?.position === position) {
        return prev;
      }
      return { targetId, position };
    });
  }, [getDescendantIds]);

  const handleDrop = useCallback(() => {
    const state = dragStateRef.current;
    if (state.draggedId && state.targetId && state.position) {
      onMoveLayer(state.draggedId, state.targetId, state.position);
    }
    // Reset state
    dragStateRef.current = { draggedId: null, targetId: null, position: null };
    setDropIndicator(null);
    setDraggedId(null);
    setIsDragging(false);
  }, [onMoveLayer]);

  const handleDragEnd = useCallback(() => {
    dragStateRef.current = { draggedId: null, targetId: null, position: null };
    setDropIndicator(null);
    setDraggedId(null);
    setIsDragging(false);
  }, []);

  const handleDropOnRoot = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const state = dragStateRef.current;
      if (state.draggedId) {
        onMoveLayer(state.draggedId, null, "root");
      }
      dragStateRef.current = { draggedId: null, targetId: null, position: null };
      setDropIndicator(null);
      setDraggedId(null);
      setIsDragging(false);
    },
    [onMoveLayer]
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, id: string) => {
      event.preventDefault();
      if (!selectedIds.includes(id)) {
        onSelect(id, false);
      }
      setContextMenu({
        mouseX: event.clientX - 2,
        mouseY: event.clientY - 4,
        targetId: id
      });
    },
    [onSelect, selectedIds]
  );

  const handleCloseMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const menuSelection = contextMenu
    ? selectedIds.includes(contextMenu.targetId)
      ? selectedIds
      : [contextMenu.targetId]
    : [];
  const hasGroupInSelection = menuSelection.some(
    (id) => elementById.get(id)?.type === "group"
  );
  const canGroup = menuSelection.length > 1;

  // Render items recursively, tracking which need drop indicators
  const renderItems = useCallback(
    (parentId: string, depth: number): React.ReactNode[] => {
      const items: React.ReactNode[] = [];
      const children = getSortedChildren(parentId);
      
      children.forEach((child, index) => {
        const isGroup = child.type === "group";
        const isCollapsed = collapsedIds.has(child.id);
        const { visibilityState, lockState, descendantCount } = getGroupState(child.id);
        const effective = getEffectiveState(child.id);
        
        // Determine if this item should show drop indicators
        const showDropBefore = dropIndicator?.targetId === child.id && dropIndicator?.position === "before";
        const showDropInside = dropIndicator?.targetId === child.id && dropIndicator?.position === "inside" && isGroup;
        
        items.push(
          <LayerItem
            key={child.id}
            element={{ ...child, visible: effective.visible, locked: effective.locked }}
            isSelected={selectedIds.includes(child.id)}
            depth={depth}
            isGroup={isGroup}
            isCollapsed={isCollapsed}
            descendantCount={descendantCount}
            visibilityState={visibilityState}
            lockState={lockState}
            showDropBefore={showDropBefore}
            showDropInside={showDropInside}
            onSelect={onSelect}
            onToggleVisibility={onToggleVisibility}
            onToggleLock={onToggleLock}
            onToggleCollapse={handleToggleCollapse}
            onDragStart={handleDragStart}
            onSetDropTarget={handleSetDropTarget}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onContextMenu={handleContextMenu}
            isDragging={isDragging}
            isBeingDragged={draggedId === child.id}
          />
        );
        
        // Render children if group is expanded
        if (isGroup && !isCollapsed) {
          items.push(...renderItems(child.id, depth + 1));
        }
        
        // Show drop zone after last item
        if (index === children.length - 1) {
          const isActive = dropIndicator?.targetId === child.id && dropIndicator?.position === "after";
          items.push(
            <DropZone
              key={`drop-after-${child.id}`}
              active={isActive}
              onDragEnter={() => handleSetDropTarget(child.id, "after")}
              onDragLeave={() => {}}
              onDrop={handleDrop}
            />
          );
        }
      });
      
      return items;
    },
    [
      collapsedIds,
      draggedId,
      dropIndicator,
      getEffectiveState,
      getGroupState,
      getSortedChildren,
      handleContextMenu,
      handleDragEnd,
      handleSetDropTarget,
      handleDragStart,
      handleDrop,
      handleToggleCollapse,
      isDragging,
      onSelect,
      onToggleLock,
      onToggleVisibility,
      selectedIds
    ]
  );

  return (
    <Box
      className="layer-panel"
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        // borderLeft removed as container handles the divider
      }}
    >
      {/* Header */}
      <Box
        className="layer-panel-header"
        sx={{
          px: 2,
          py: 0.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          backgroundColor: theme.vars.palette.background.paper,
          minHeight: 40
        }}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          Layers
        </Typography>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title="Show all">
            <IconButton size="small" onClick={() => onSetAllVisibility(true)}>
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Hide all">
            <IconButton size="small" onClick={() => onSetAllVisibility(false)}>
              <VisibilityOffIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Lock all">
            <IconButton size="small" onClick={() => onSetAllLock(true)}>
              <LockIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Unlock all">
            <IconButton size="small" onClick={() => onSetAllLock(false)}>
              <LockOpenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      
      {/* Layer list */}
      <Box
        className="layer-panel-content"
        sx={{
          flexGrow: 1,
          overflow: "auto",
          px: 1
        }}
        onDragOver={(e) => {
          e.preventDefault();
          // Clear indicator when dragging outside items
          if (dropIndicator !== null) {
            setDropIndicator(null);
          }
        }}
        onDrop={handleDropOnRoot}
      >
        {elements.length === 0 ? (
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
            {renderItems("__root__", 0)}
          </List>
        )}
      </Box>
      
      {/* Context menu */}
      <Menu
        open={Boolean(contextMenu)}
        onClose={handleCloseMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined
        }
      >
        <MenuItem
          onClick={() => {
            onGroup(menuSelection);
            handleCloseMenu();
          }}
          disabled={!canGroup}
        >
          Group
        </MenuItem>
        <MenuItem
          onClick={() => {
            onUngroup(menuSelection);
            handleCloseMenu();
          }}
          disabled={!hasGroupInSelection}
        >
          Ungroup
        </MenuItem>
        <MenuItem
          onClick={() => {
            onFlatten(menuSelection);
            handleCloseMenu();
          }}
          disabled={!hasGroupInSelection}
        >
          Flatten
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            onSetAllVisibility(true);
            handleCloseMenu();
          }}
        >
          Show all
        </MenuItem>
        <MenuItem
          onClick={() => {
            onSetAllVisibility(false);
            handleCloseMenu();
          }}
        >
          Hide all
        </MenuItem>
        <MenuItem
          onClick={() => {
            onSetAllLock(true);
            handleCloseMenu();
          }}
        >
          Lock all
        </MenuItem>
        <MenuItem
          onClick={() => {
            onSetAllLock(false);
            handleCloseMenu();
          }}
        >
          Unlock all
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default memo(LayerPanel);
