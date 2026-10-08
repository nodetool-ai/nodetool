/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import LightModeIcon from "@mui/icons-material/LightMode";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import FlashlightOnIcon from "@mui/icons-material/FlashlightOn";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import VerticalAlignTopIcon from "@mui/icons-material/VerticalAlignTop";

import {
  Box,
  ContextMenu,
  FlexColumn,
  FlexRow,
  IconButton,
  InlineEditableText,
  MenuItemPrimitive,
  ScrollArea,
  SearchInput,
  Text,
  TreeRow,
  BORDER_RADIUS,
  MOTION,
  SPACING
} from "../ui_primitives";
import type { SceneTreeNode } from "./sceneTree";
import { shortcutKeys } from "./editorShortcuts";

export type OutlinerAction =
  | "rename"
  | "duplicate"
  | "focus"
  | "toggleVisible"
  | "unparent"
  | "delete";

const ICON_SX = { fontSize: "var(--fontSizeNormal)", flexShrink: 0 } as const;

const TypeIcon = ({ type, hasChildren }: { type: string; hasChildren: boolean }) => {
  if (type === "DirectionalLight") {
    return <LightModeIcon sx={{ ...ICON_SX, color: "warning.main" }} />;
  }
  if (type === "SpotLight") {
    return <FlashlightOnIcon sx={{ ...ICON_SX, color: "warning.main" }} />;
  }
  if (type.includes("Light")) {
    return <LightbulbIcon sx={{ ...ICON_SX, color: "warning.main" }} />;
  }
  if (type.includes("Camera")) {
    return <CameraAltIcon sx={{ ...ICON_SX, color: "secondary.main" }} />;
  }
  if (type === "Mesh" || type === "SkinnedMesh") {
    return <ViewInArIcon sx={{ ...ICON_SX, color: "info.main" }} />;
  }
  if (type === "Bone") {
    return <AccountTreeOutlinedIcon sx={{ ...ICON_SX, color: "text.secondary" }} />;
  }
  return (
    <FolderOutlinedIcon
      sx={{ ...ICON_SX, color: hasChildren ? "text.primary" : "text.secondary" }}
    />
  );
};

interface FlatRow {
  node: SceneTreeNode;
  /** Hidden by an ancestor, so the row is dimmed even if its own flag is on. */
  inheritedHidden: boolean;
}

/**
 * Flatten the tree into the rows on screen. A search shows matches with their
 * ancestors and ignores collapsed state, so a match is never hidden.
 */
const flattenRows = (
  nodes: SceneTreeNode[],
  collapsed: ReadonlySet<string>,
  query: string
): FlatRow[] => {
  const needle = query.trim().toLowerCase();
  const rows: FlatRow[] = [];
  const matches = (node: SceneTreeNode): boolean =>
    node.name.toLowerCase().includes(needle) ||
    node.children.some(matches);
  const walk = (list: SceneTreeNode[], hiddenAbove: boolean) => {
    for (const node of list) {
      if (needle && !matches(node)) {
        continue;
      }
      rows.push({ node, inheritedHidden: hiddenAbove });
      if (needle || !collapsed.has(node.uuid)) {
        walk(node.children, hiddenAbove || !node.visible);
      }
    }
  };
  walk(nodes, false);
  return rows;
};

const DRAG_TYPE = "application/x-nodetool-scene-node";

interface OutlinerRowProps {
  row: FlatRow;
  selected: boolean;
  expanded: boolean;
  editing: boolean;
  dropTarget: boolean;
  onSelect: (uuid: string) => void;
  onToggleVisible: (uuid: string) => void;
  onToggleExpanded: (uuid: string) => void;
  onEditingChange: (uuid: string | null) => void;
  onRename: (uuid: string, name: string) => void;
  onContextMenu: (uuid: string, x: number, y: number) => void;
  onDragTarget: (uuid: string | null) => void;
  onDropOn: (draggedUuid: string, targetUuid: string | null) => void;
  onKeyNavigate: (uuid: string, key: string) => void;
}

const OutlinerRow = memo(
  ({
    row,
    selected,
    expanded,
    editing,
    dropTarget,
    onSelect,
    onToggleVisible,
    onToggleExpanded,
    onEditingChange,
    onRename,
    onContextMenu,
    onDragTarget,
    onDropOn,
    onKeyNavigate
  }: OutlinerRowProps) => {
    const { node, inheritedHidden } = row;
    const hasChildren = node.children.length > 0;
    const dimmed = !node.visible || inheritedHidden;

    return (
      <TreeRow
        role="treeitem"
        tabIndex={selected ? 0 : -1}
        aria-selected={selected}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-label={`${node.name} (${node.type})`}
        data-uuid={node.uuid}
        selected={selected}
        interactive
        depth={node.depth}
        draggable={!editing}
        onClick={() => onSelect(node.uuid)}
        onDoubleClick={() => onEditingChange(node.uuid)}
        onContextMenu={(e: React.MouseEvent) => {
          e.preventDefault();
          onSelect(node.uuid);
          onContextMenu(node.uuid, e.clientX, e.clientY);
        }}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.target !== e.currentTarget || editing) {
            return;
          }
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(node.uuid);
          } else if (e.key === "F2") {
            e.preventDefault();
            onEditingChange(node.uuid);
          } else if (
            e.key === "ArrowUp" ||
            e.key === "ArrowDown" ||
            e.key === "ArrowLeft" ||
            e.key === "ArrowRight"
          ) {
            e.preventDefault();
            onKeyNavigate(node.uuid, e.key);
          }
        }}
        onDragStart={(e: React.DragEvent) => {
          e.dataTransfer.setData(DRAG_TYPE, node.uuid);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e: React.DragEvent) => {
          if (e.dataTransfer.types.includes(DRAG_TYPE)) {
            e.preventDefault();
            e.stopPropagation();
            onDragTarget(node.uuid);
          }
        }}
        onDragLeave={() => onDragTarget(null)}
        onDrop={(e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const dragged = e.dataTransfer.getData(DRAG_TYPE);
          onDragTarget(null);
          if (dragged && dragged !== node.uuid) {
            onDropOn(dragged, node.uuid);
          }
        }}
        sx={{
          minHeight: 26,
          opacity: dimmed ? 0.5 : 1,
          outline: dropTarget ? "1px dashed" : "none",
          outlineColor: "primary.main",
          outlineOffset: "-1px",
          "& .outliner-eye": { opacity: node.visible ? 0 : 0.8, transition: MOTION.opacity },
          "&:hover .outliner-eye, &:focus-within .outliner-eye": { opacity: 0.8 }
        }}
      >
        <Box
          component="span"
          aria-hidden
          onClick={(e: React.MouseEvent) => {
            if (hasChildren) {
              e.stopPropagation();
              onToggleExpanded(node.uuid);
            }
          }}
          sx={{
            display: "inline-grid",
            placeItems: "center",
            flexShrink: 0,
            width: 16,
            visibility: hasChildren ? "visible" : "hidden",
            color: "text.secondary",
            cursor: "pointer",
            borderRadius: BORDER_RADIUS.xs,
            "&:hover": { color: "text.primary" }
          }}
        >
          <ChevronRightIcon
            sx={{
              ...ICON_SX,
              transition: MOTION.transform,
              transform: expanded ? "rotate(90deg)" : "none"
            }}
          />
        </Box>
        <TypeIcon type={node.type} hasChildren={hasChildren} />
        <FlexRow sx={{ flex: 1, minWidth: 0 }}>
          <InlineEditableText
            value={node.name}
            editing={editing}
            onEditingChange={(next) => onEditingChange(next ? node.uuid : null)}
            onCommit={(name) => onRename(node.uuid, name)}
            ariaLabel={`Rename ${node.name}`}
            selectOnFocus
            stopPropagation
            title={`${node.name} (${node.type})`}
            displaySx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "var(--fontSizeSmall)",
              color: selected ? "text.primary" : "inherit"
            }}
          />
        </FlexRow>
        <IconButton
          className="outliner-eye"
          size="small"
          aria-label={node.visible ? "Hide object" : "Show object"}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onToggleVisible(node.uuid);
          }}
          sx={{ padding: SPACING.micro, "& svg": { fontSize: "var(--fontSizeNormal)" } }}
        >
          {node.visible ? <VisibilityIcon /> : <VisibilityOffIcon />}
        </IconButton>
      </TreeRow>
    );
  }
);
OutlinerRow.displayName = "OutlinerRow";

interface SceneOutlinerProps {
  nodes: SceneTreeNode[];
  selectedUuid: string | null;
  onSelect: (uuid: string | null) => void;
  onToggleVisible: (uuid: string) => void;
  onRename?: (uuid: string, name: string) => void;
  /** Move `uuid` under `parentUuid`, or to the scene root when null. */
  onReparent?: (uuid: string, parentUuid: string | null) => void;
  onAction?: (action: OutlinerAction, uuid: string) => void;
}

const findNode = (
  nodes: SceneTreeNode[],
  uuid: string
): SceneTreeNode | null => {
  for (const node of nodes) {
    if (node.uuid === uuid) {
      return node;
    }
    const inner = findNode(node.children, uuid);
    if (inner) {
      return inner;
    }
  }
  return null;
};

const SceneOutliner = ({
  nodes,
  selectedUuid,
  onSelect,
  onToggleVisible,
  onRename,
  onReparent,
  onAction
}: SceneOutlinerProps) => {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [editingUuid, setEditingUuid] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [rootDropActive, setRootDropActive] = useState(false);
  const [menu, setMenu] = useState<{ uuid: string; x: number; y: number } | null>(
    null
  );

  const rows = useMemo(
    () => flattenRows(nodes, collapsed, query),
    [nodes, collapsed, query]
  );

  const toggleExpanded = useCallback((uuid: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  }, []);

  const handleRename = useCallback(
    (uuid: string, name: string) => onRename?.(uuid, name),
    [onRename]
  );

  const handleDropOn = useCallback(
    (dragged: string, target: string | null) => onReparent?.(dragged, target),
    [onReparent]
  );

  const handleContextMenu = useCallback((uuid: string, x: number, y: number) => {
    setMenu({ uuid, x, y });
  }, []);

  const focusRow = useCallback((uuid: string) => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `.scene-outliner [data-uuid="${uuid}"]`
      );
      el?.focus();
    });
  }, []);

  const handleKeyNavigate = useCallback(
    (uuid: string, key: string) => {
      const index = rows.findIndex((r) => r.node.uuid === uuid);
      if (index < 0) {
        return;
      }
      const row = rows[index];
      let next: string | null = null;
      if (key === "ArrowUp" && index > 0) {
        next = rows[index - 1].node.uuid;
      } else if (key === "ArrowDown" && index < rows.length - 1) {
        next = rows[index + 1].node.uuid;
      } else if (key === "ArrowRight" && row.node.children.length > 0) {
        if (collapsed.has(uuid)) {
          toggleExpanded(uuid);
        } else {
          next = row.node.children[0].uuid;
        }
      } else if (key === "ArrowLeft") {
        if (row.node.children.length > 0 && !collapsed.has(uuid)) {
          toggleExpanded(uuid);
        } else {
          const parent = rows
            .slice(0, index)
            .reverse()
            .find((r) => r.node.depth < row.node.depth);
          next = parent?.node.uuid ?? null;
        }
      }
      if (next) {
        onSelect(next);
        focusRow(next);
      }
    },
    [rows, collapsed, toggleExpanded, onSelect, focusRow]
  );

  const menuNode = menu ? findNode(nodes, menu.uuid) : null;
  const runAction = (action: OutlinerAction) => {
    if (!menu) {
      return;
    }
    const uuid = menu.uuid;
    setMenu(null);
    if (action === "rename") {
      setEditingUuid(uuid);
    } else {
      onAction?.(action, uuid);
    }
  };

  const hasNodes = nodes.length > 0;

  return (
    <FlexColumn
      className="scene-outliner"
      fullHeight
      sx={{ width: "100%", minHeight: 0 }}
    >
      {hasNodes && (
        <Box sx={{ px: SPACING.md, py: SPACING.sm, flexShrink: 0 }}>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Filter objects"
            ariaLabel="Filter scene objects"
            size="small"
            fullWidth
          />
        </Box>
      )}
      <ScrollArea>
        <Box
          role="tree"
          aria-label="Scene objects"
          onDragOver={(e: React.DragEvent) => {
            if (e.dataTransfer.types.includes(DRAG_TYPE)) {
              e.preventDefault();
              setRootDropActive(true);
            }
          }}
          onDragLeave={() => setRootDropActive(false)}
          onDrop={(e: React.DragEvent) => {
            e.preventDefault();
            setRootDropActive(false);
            const dragged = e.dataTransfer.getData(DRAG_TYPE);
            if (dragged) {
              handleDropOn(dragged, null);
            }
          }}
          onClick={(e: React.MouseEvent) => {
            if (e.target === e.currentTarget) {
              onSelect(null);
            }
          }}
          sx={{
            minHeight: "100%",
            px: SPACING.xs,
            pb: SPACING.xl,
            boxSizing: "border-box",
            background: rootDropActive && !dragTarget
              ? theme.vars.palette.action.hover
              : "transparent"
          }}
        >
          {!hasNodes ? (
            <Text size="small" color="secondary" sx={{ py: SPACING.lg, px: SPACING.md }}>
              Scene is empty. Use Add to create an object.
            </Text>
          ) : rows.length === 0 ? (
            <Text size="small" color="secondary" sx={{ py: SPACING.lg, px: SPACING.md }}>
              No objects match “{query}”.
            </Text>
          ) : (
            rows.map((row) => (
              <OutlinerRow
                key={row.node.uuid}
                row={row}
                selected={row.node.uuid === selectedUuid}
                expanded={!collapsed.has(row.node.uuid) || query.trim() !== ""}
                editing={editingUuid === row.node.uuid}
                dropTarget={dragTarget === row.node.uuid}
                onSelect={onSelect}
                onToggleVisible={onToggleVisible}
                onToggleExpanded={toggleExpanded}
                onEditingChange={setEditingUuid}
                onRename={handleRename}
                onContextMenu={handleContextMenu}
                onDragTarget={setDragTarget}
                onDropOn={handleDropOn}
                onKeyNavigate={handleKeyNavigate}
              />
            ))
          )}
        </Box>
      </ScrollArea>
      <ContextMenu
        open={menu !== null}
        position={menu}
        onClose={() => setMenu(null)}
        compact
        minWidth={200}
      >
        <MenuItemPrimitive
          label="Rename"
          icon={<DriveFileRenameOutlineIcon fontSize="small" />}
          shortcut="F2"
          onClick={() => runAction("rename")}
        />
        <MenuItemPrimitive
          label="Duplicate"
          icon={<ContentCopyIcon fontSize="small" />}
          shortcut={shortcutKeys("duplicate").join("+")}
          onClick={() => runAction("duplicate")}
        />
        <MenuItemPrimitive
          label="Focus in viewport"
          icon={<CenterFocusStrongIcon fontSize="small" />}
          shortcut={shortcutKeys("focusSelection").join("+")}
          onClick={() => runAction("focus")}
        />
        <MenuItemPrimitive
          label={menuNode?.visible === false ? "Show" : "Hide"}
          icon={
            menuNode?.visible === false ? (
              <VisibilityIcon fontSize="small" />
            ) : (
              <VisibilityOffIcon fontSize="small" />
            )
          }
          shortcut={shortcutKeys("hide").join("+")}
          onClick={() => runAction("toggleVisible")}
        />
        {menuNode && menuNode.depth > 0 && (
          <MenuItemPrimitive
            label="Move to scene root"
            icon={<VerticalAlignTopIcon fontSize="small" />}
            onClick={() => runAction("unparent")}
          />
        )}
        <MenuItemPrimitive
          label="Delete"
          color="error"
          dividerBefore
          icon={<DeleteOutlineIcon fontSize="small" />}
          shortcut="Del"
          onClick={() => runAction("delete")}
        />
      </ContextMenu>
    </FlexColumn>
  );
};

export default memo(SceneOutliner);
