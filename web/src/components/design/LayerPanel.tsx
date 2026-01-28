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
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
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
  depth: number;
  isGroup: boolean;
  isCollapsed: boolean;
  descendantCount: number;
  visibilityState: "on" | "off" | "mixed";
  lockState: "on" | "off" | "mixed";
  dragOverPosition: "before" | "after" | "inside" | null;
  showDropHint: boolean;
  onSelect: (id: string, addToSelection: boolean) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onDragStart: (id: string, e: React.DragEvent) => void;
  onDragOver: (id: string, e: React.DragEvent) => void;
  onDrop: (id: string, e: React.DragEvent) => void;
  onDragEnd: () => void;
  onContextMenu: (event: React.MouseEvent, id: string) => void;
  isDragging: boolean;
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
  dragOverPosition,
  showDropHint,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onToggleCollapse,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onContextMenu,
  isDragging
}) => {
  const theme = useTheme();

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onSelect(element.id, e.shiftKey || e.ctrlKey || e.metaKey);
    },
    [element.id, onSelect]
  );

  return (
    <ListItem
      className="layer-item"
      disablePadding
      draggable
      onDragStart={(e) => onDragStart(element.id, e)}
      onDragOver={(e) => onDragOver(element.id, e)}
      onDrop={(e) => onDrop(element.id, e)}
      onDragEnd={onDragEnd}
      sx={{
        opacity: isDragging ? 0.5 : 1,
        backgroundColor: dragOverPosition === "inside"
          ? `${theme.vars.palette.primary.main}14`
          : isGroup
            ? `${theme.vars.palette.action.selected}0d`
            : "transparent",
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        borderTop: dragOverPosition === "before" ? `2px solid ${theme.vars.palette.primary.main}` : "none",
        borderBottomColor: dragOverPosition === "after" ? theme.vars.palette.primary.main : theme.vars.palette.divider,
        boxShadow: dragOverPosition === "inside"
          ? `inset 0 0 0 1px ${theme.vars.palette.primary.main}`
          : "none",
        "&:last-child": {
          borderBottom: "none"
        }
      }}
    >
      <ListItemButton
        selected={isSelected}
        onClick={handleClick}
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
          minHeight: 30,
          opacity: element.visible ? 1 : 0.6,
          pl: 1 + depth * 1.5,
          position: "relative",
          backgroundColor: isGroup ? `${theme.vars.palette.action.selected}0d` : "transparent",
          "&.Mui-selected": {
            backgroundColor: `${theme.vars.palette.primary.main}1a`
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
        {dragOverPosition === "before" && (
          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: theme.vars.palette.primary.main
            }}
          />
        )}
        {dragOverPosition === "after" && (
          <Box
            sx={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: theme.vars.palette.primary.main
            }}
          />
        )}
        {dragOverPosition === "inside" && (
          <Box
            sx={{
              position: "absolute",
              inset: 2,
              borderRadius: 1,
              border: `1px dashed ${theme.vars.palette.primary.main}`,
              pointerEvents: "none"
            }}
          />
        )}
        {depth > 0 && (
          <Box
            sx={{
              width: depth * 10,
              alignSelf: "stretch",
              borderLeft: `1px solid ${theme.vars.palette.divider}`,
              mr: 0.5
            }}
          />
        )}
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
                <ChevronRightIcon fontSize="small" />
              ) : (
                <ExpandMoreIcon fontSize="small" />
              )}
            </IconButton>
          )}
        </Box>
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
          primary={
            isGroup && descendantCount > 0
              ? `${element.name} (${descendantCount})`
              : element.name
          }
          primaryTypographyProps={{
            variant: "body2",
            noWrap: true,
            sx: {
              textDecoration: element.locked ? "line-through" : "none",
              fontWeight: isGroup ? 600 : 400
            }
          }}
        />
        {showDropHint && (
          <Box
            sx={{
              px: 0.75,
              py: 0.25,
              borderRadius: 1,
              backgroundColor: `${theme.vars.palette.primary.main}22`,
              color: theme.vars.palette.primary.main,
              fontSize: 11,
              fontWeight: 600,
              mr: 0.5
            }}
          >
            Drop inside
          </Box>
        )}
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
                <VisibilityOutlinedIcon fontSize="small" />
              ) : visibilityState === "on" ? (
                <VisibilityIcon fontSize="small" />
              ) : (
                <VisibilityOffIcon fontSize="small" />
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
                <LockOutlinedIcon fontSize="small" />
              ) : lockState === "on" ? (
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
  onMoveLayer,
  onSetAllVisibility,
  onSetAllLock,
  onGroup,
  onUngroup,
  onFlatten
}) => {
  const theme = useTheme();
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState<{
    targetId: string;
    position: "before" | "after" | "inside";
  } | null>(null);
  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = React.useState<{
    mouseX: number;
    mouseY: number;
    targetId: string;
  } | null>(null);
  const hoverExpandTimeoutRef = React.useRef<number | null>(null);

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

  const getDropPosition = useCallback(
    (element: LayoutElement, e: React.DragEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / rect.height;
      if (element.type !== "group") {
        return ratio < 0.5 ? "before" : "after";
      }
      if (ratio > 0.15 && ratio < 0.85) {
        return "inside";
      }
      return ratio < 0.2 ? "before" : "after";
    },
    []
  );

  const clearHoverExpand = useCallback(() => {
    if (hoverExpandTimeoutRef.current !== null) {
      window.clearTimeout(hoverExpandTimeoutRef.current);
      hoverExpandTimeoutRef.current = null;
    }
  }, []);

  const handleDragStart = useCallback((id: string, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setDraggingId(id);
    clearHoverExpand();
  }, [clearHoverExpand]);

  const handleDragOver = useCallback(
    (id: string, e: React.DragEvent) => {
      e.preventDefault();
      const target = elementById.get(id);
      if (!target) {
        return;
      }
      const position = getDropPosition(target, e);
      setDragOver({ targetId: id, position });
      if (
        target.type === "group" &&
        position === "inside" &&
        collapsedIds.has(target.id)
      ) {
        clearHoverExpand();
        hoverExpandTimeoutRef.current = window.setTimeout(() => {
          setCollapsedIds((prev) => {
            const next = new Set(prev);
            next.delete(target.id);
            return next;
          });
        }, 350);
      } else {
        clearHoverExpand();
      }
    },
    [clearHoverExpand, collapsedIds, elementById, getDropPosition]
  );

  const handleDrop = useCallback(
    (id: string, e: React.DragEvent) => {
      e.preventDefault();
      const dragId = draggingId ?? e.dataTransfer.getData("text/plain");
      if (!dragId) {
        return;
      }
      const target = elementById.get(id);
      if (!target) {
        return;
      }
      const position = getDropPosition(target, e);
      const isGroup = target.type === "group";
      const finalPosition = position === "inside" && !isGroup ? "after" : position;
      onMoveLayer(dragId, id, finalPosition);
      setDragOver(null);
      setDraggingId(null);
      clearHoverExpand();
    },
    [clearHoverExpand, draggingId, elementById, getDropPosition, onMoveLayer]
  );

  const handleDropOnRoot = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const dragId = draggingId ?? e.dataTransfer.getData("text/plain");
      if (!dragId) {
        return;
      }
      onMoveLayer(dragId, null, "root");
      setDragOver(null);
      setDraggingId(null);
      clearHoverExpand();
    },
    [clearHoverExpand, draggingId, onMoveLayer]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOver(null);
    clearHoverExpand();
  }, [clearHoverExpand]);

  const dragOverRoot = Boolean(draggingId) && dragOver === null;

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

  const renderItems = useCallback(
    (parentId: string, depth: number): React.ReactNode[] => {
      const items: React.ReactNode[] = [];
      const children = getSortedChildren(parentId);
      children.forEach((child) => {
        const isGroup = child.type === "group";
        const isCollapsed = collapsedIds.has(child.id);
        const { visibilityState, lockState, descendantCount } = getGroupState(child.id);
        const effective = getEffectiveState(child.id);
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
            dragOverPosition={
              dragOver?.targetId === child.id ? dragOver.position : null
            }
            showDropHint={
              dragOver?.targetId === child.id &&
              dragOver.position === "inside" &&
              isGroup
            }
            onSelect={onSelect}
            onToggleVisibility={onToggleVisibility}
            onToggleLock={onToggleLock}
            onToggleCollapse={handleToggleCollapse}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onContextMenu={handleContextMenu}
            isDragging={draggingId === child.id}
          />
        );
        if (isGroup && !isCollapsed) {
          items.push(...renderItems(child.id, depth + 1));
        }
      });
      return items;
    },
    [
      collapsedIds,
      dragOver,
      draggingId,
      getEffectiveState,
      getGroupState,
      getSortedChildren,
      handleDragEnd,
      handleDragOver,
      handleDragStart,
      handleDrop,
      handleContextMenu,
      handleToggleCollapse,
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
        borderLeft: `1px solid ${theme.vars.palette.divider}`
      }}
    >
      <Box
        className="layer-panel-header"
        sx={{
          px: 1.5,
          py: 0.75,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          backgroundColor: theme.vars.palette.background.paper
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
      <Box
        className="layer-panel-content"
        sx={{
          flexGrow: 1,
          overflow: "auto"
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (dragOver !== null) {
            setDragOver(null);
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
            {dragOverRoot && (
              <Box
                sx={{
                  px: 1,
                  py: 0.5,
                  color: theme.vars.palette.primary.main,
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em"
                }}
              >
                Drop at root
              </Box>
            )}
            {renderItems("__root__", 0)}
          </List>
        )}
      </Box>
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
