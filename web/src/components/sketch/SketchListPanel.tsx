/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { DragEvent, FocusEvent, KeyboardEvent, MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { usePanelStore } from "../../stores/PanelStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { serializeDragData, useDragDropStore } from "../../lib/dragdrop";
import useContextMenuStore from "../../stores/ContextMenuStore";
import {
  useSidebarDocumentActionsStore,
  type SidebarDocumentItem
} from "../../stores/SidebarDocumentActionsStore";
import { trpc } from "../../trpc/client";
import { groupByDate } from "../../utils/groupByDate";
import ConfirmDialog from "../dialogs/ConfirmDialog";
import CategorySearchBar from "../node_menu/CategorySearchBar";
import {
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Text,
  ToolbarIconButton,
  TruncatedText,
  Tooltip,
  MOTION,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { newDocumentId } from "../../lib/newDocumentId";

const styles = (theme: Theme) =>
  css({
    height: "100%",
    minHeight: 0,
    ".sketch-search": {
      paddingBottom: theme.spacing(1)
    },
    ".sketch-list": {
      minHeight: 0,
      overflowY: "auto",
      paddingRight: theme.spacing(0.5)
    },
    ".sketch-item": {
      width: "100%",
      border: 0,
      borderRadius: theme.rounded.md,
      backgroundColor: "transparent",
      color: theme.vars.palette.text.primary,
      cursor: "pointer",
      padding: theme.spacing(1),
      textAlign: "left",
      transition: `background-color ${MOTION.fast}, color ${MOTION.fast}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: -2
      },
      "&.active": {
        backgroundColor: theme.vars.palette.action.selected
      }
    },
    ".sketch-icon": {
      flexShrink: 0,
      color: theme.vars.palette.text.secondary,
      fontSize: 20
    },
    ".rename-input": {
      width: "100%",
      background: "transparent",
      border: `1px solid ${theme.vars.palette.primary.main}`,
      borderRadius: theme.rounded.sm,
      color: "inherit",
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 600,
      outline: "none"
    },
    ".date-header-row": {
      width: "100%",
      padding: `0 ${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xs)} 0`,
      display: "flex",
      alignItems: "flex-end",
      borderBottom: "1px solid var(--palette-divider)"
    },
    ".date-header": {
      fontSize: theme.fontSizeSmaller,
      flexShrink: 0,
      padding: 0,
      lineHeight: 1.1,
      width: "100%",
      textAlign: "right",
      letterSpacing: "0.02em",
      textTransform: "uppercase",
      whiteSpace: "nowrap"
    }
  });

function createSketchDragImage(name: string): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
    position: absolute;
    top: -9999px;
    left: -9999px;
    width: 240px;
    height: 64px;
    background: var(--palette-background-paper);
    border: 1px solid var(--palette-divider);
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: ${getSpacingPx(SPACING.lg)};
    padding: ${getSpacingPx(SPACING.md)};
    box-sizing: border-box;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    color: var(--palette-text-primary);
    font-family: Inter, sans-serif;
    pointer-events: none;
    z-index: 9999;
  `;

  const icon = document.createElement("div");
  icon.textContent = "✎";
  icon.style.cssText = `
    width: 48px;
    height: 48px;
    border-radius: 4px;
    flex-shrink: 0;
    background-color: var(--palette-grey-800);
    color: var(--palette-text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--fontSizeBig);
    font-weight: 600;
  `;
  container.appendChild(icon);

  const label = document.createElement("div");
  label.textContent = name || "Untitled sketch";
  label.style.cssText = `
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--fontSizeSmall);
    font-weight: 500;
  `;
  container.appendChild(label);

  return container;
}

interface SketchListItemProps {
  id: string;
  name: string;
  updatedAt: string;
  active: boolean;
  editing: boolean;
  onOpen: (id: string, name: string) => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>, id: string, name: string) => void;
  onCommitRename: (id: string, newName: string) => void;
  onCancelRename: () => void;
}

const SketchListItem = memo(function SketchListItem({
  id,
  name,
  updatedAt,
  active,
  editing,
  onOpen,
  onContextMenu,
  onCommitRename,
  onCancelRename
}: SketchListItemProps) {
  const setActiveDrag = useDragDropStore((state) => state.setActiveDrag);
  const clearDrag = useDragDropStore((state) => state.clearDrag);
  const handleClick = useCallback(() => onOpen(id, name), [id, name, onOpen]);
  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => onContextMenu(event, id, name),
    [id, name, onContextMenu]
  );
  const handleRenameKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        onCommitRename(id, event.currentTarget.value);
      } else if (event.key === "Escape") {
        onCancelRename();
      }
    },
    [id, onCommitRename, onCancelRename]
  );
  const handleRenameBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      onCommitRename(id, event.currentTarget.value);
    },
    [id, onCommitRename]
  );
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen(id, name);
      }
    },
    [id, name, onOpen]
  );
  const handleDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      const payload = { id, name, updatedAt };
      serializeDragData(
        {
          type: "sketch",
          payload,
          metadata: { sourceId: id, sourceName: name || "Untitled sketch" }
        },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "copyMove";
      const dragImage = createSketchDragImage(name);
      document.body.appendChild(dragImage);
      event.dataTransfer.setDragImage(dragImage, 10, 10);
      window.setTimeout(() => document.body.removeChild(dragImage), 0);
      setActiveDrag({
        type: "sketch",
        payload,
        metadata: { sourceId: id, sourceName: name || "Untitled sketch" }
      });
    },
    [id, name, updatedAt, setActiveDrag]
  );
  const handleDragEnd = useCallback(() => {
    clearDrag();
  }, [clearDrag]);

  if (editing) {
    return (
      <div className={`sketch-item ${active ? "active" : ""}`}>
        <FlexRow align="center" gap={1} fullWidth>
          <BrushOutlinedIcon className="sketch-icon" />
          <FlexColumn gap={0.5} sx={{ minWidth: 0, flex: 1 }}>
            <input
              className="rename-input"
              type="text"
              defaultValue={name}
              aria-label="Sketch name"
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRenameBlur}
            />
          </FlexColumn>
        </FlexRow>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`sketch-item ${active ? "active" : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      aria-current={active ? "page" : undefined}
    >
      <FlexRow align="center" gap={1} fullWidth>
        <BrushOutlinedIcon className="sketch-icon" />
        <FlexColumn gap={0.5} sx={{ minWidth: 0, flex: 1 }}>
          <TruncatedText
            component="span"
            sx={{ fontSize: "var(--fontSizeSmall)", fontWeight: 600 }}
          >
            {name || "Untitled sketch"}
          </TruncatedText>
        </FlexColumn>
      </FlexRow>
    </button>
  );
});

export const CreateSketchButton = memo(function CreateSketchButton() {
  const utils = trpc.useUtils();
  const createSketch = trpc.sketch.create.useMutation({
    onSuccess: () => {
      void utils.sketch.list.invalidate();
    }
  });
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const handleCreate = useCallback(async () => {
    try {
      const sketch = await createSketch.mutateAsync({
        id: newDocumentId(),
        name: "Untitled sketch",
        projectId: "default"
      });
      if (location.pathname.startsWith("/workspace")) {
        openTab({
          type: "sketch",
          ref: sketch.id,
          mode: "edit",
          title: sketch.name || "Untitled sketch"
        });
      } else {
        navigate(`/sketch/${sketch.id}`);
      }
      setVisibility(false);
    } catch (error) {
      console.error("Failed to create sketch", error);
    }
  }, [createSketch, location.pathname, navigate, openTab, setVisibility]);

  return (
    <Tooltip title="New sketch" placement="right-start">
      <ToolbarIconButton
        ariaLabel="New sketch"
        onClick={() => void handleCreate()}
        disabled={createSketch.isPending}
        tabIndex={-1}
        icon={<AddIcon />}
      />
    </Tooltip>
  );
});

const SketchListPanel = () => {
  const theme = useTheme();
  const [filterValue, setFilterValue] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus the filter on open so users can immediately type to search,
  // matching the workflows list panel.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);
  const { data, isLoading, isError, error } = trpc.sketch.list.useQuery(
    {},
    { staleTime: 30_000 }
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const activeSketchId = activeTabId?.startsWith("sketch:")
    ? activeTabId.slice("sketch:".length)
    : location.pathname.startsWith("/sketch/")
      ? location.pathname.split("/")[2]
      : null;

  const sketches = useMemo(() => {
    const all = data ?? [];
    const needle = filterValue.trim().toLowerCase();
    const filtered = needle
      ? all.filter((sketch) => sketch.name.toLowerCase().includes(needle))
      : all;
    return [...filtered].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [data, filterValue]);

  const handleOpen = useCallback(
    (id: string, name: string) => {
      if (location.pathname.startsWith("/workspace")) {
        openTab({
          type: "sketch",
          ref: id,
          mode: "edit",
          title: name || "Untitled sketch"
        });
      } else {
        navigate(`/sketch/${id}`);
      }
      setVisibility(false);
    },
    [location.pathname, navigate, openTab, setVisibility]
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<SidebarDocumentItem | null>(
    null
  );
  const utils = trpc.useUtils();
  const createSketch = trpc.sketch.create.useMutation({
    onSuccess: () => {
      void utils.sketch.list.invalidate();
    }
  });
  const updateSketch = trpc.sketch.update.useMutation({
    onSuccess: () => {
      void utils.sketch.list.invalidate();
    }
  });
  const deleteSketch = trpc.sketch.delete.useMutation({
    onSuccess: () => {
      void utils.sketch.list.invalidate();
    }
  });
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const setActions = useSidebarDocumentActionsStore((state) => state.setActions);
  const clearActions = useSidebarDocumentActionsStore(
    (state) => state.clearActions
  );

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLButtonElement>, id: string, name: string) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu(
        "sidebar-document-context-menu",
        id,
        event.clientX,
        event.clientY,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { id, name }
      );
    },
    [openContextMenu]
  );

  const handleCommitRename = useCallback(
    (id: string, newName: string) => {
      const trimmed = newName.trim();
      const current = (data ?? []).find((s) => s.id === id);
      setEditingId(null);
      if (trimmed && current && trimmed !== current.name) {
        updateSketch.mutate({ id, name: trimmed });
      }
    },
    [data, updateSketch]
  );

  const handleDuplicate = useCallback(
    async (item: SidebarDocumentItem) => {
      try {
        const source = await utils.sketch.get.fetch({ id: item.id });
        const copy = await createSketch.mutateAsync({
          id: newDocumentId(),
          name: `${source.name} (copy)`.substring(0, 200),
          projectId: source.projectId,
          width: source.width,
          height: source.height,
          backgroundColor: source.backgroundColor
        });
        await updateSketch.mutateAsync({
          id: copy.id,
          document: source.document
        });
      } catch (error) {
        console.error("Failed to duplicate sketch", error);
      }
    },
    [utils, createSketch, updateSketch]
  );

  const handleRequestDelete = useCallback((item: SidebarDocumentItem) => {
    setItemToDelete(item);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (itemToDelete) {
      deleteSketch.mutate({ id: itemToDelete.id });
    }
  }, [itemToDelete, deleteSketch]);

  useEffect(() => {
    setActions({
      onRename: (item) => setEditingId(item.id),
      onDuplicate: (item) => void handleDuplicate(item),
      onDelete: handleRequestDelete
    });
    return () => clearActions();
  }, [setActions, clearActions, handleDuplicate, handleRequestDelete]);

  return (
    <FlexColumn fullHeight fullWidth gap={0} css={styles(theme)}>
      <ConfirmDialog
        open={itemToDelete !== null}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete sketch"
        content={`Delete "${itemToDelete?.name ?? ""}"? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
      />
      <div className="sketch-search">
        <CategorySearchBar
          ref={searchRef}
          value={filterValue}
          onChange={setFilterValue}
          placeholder="Search sketches..."
        />
      </div>

      {isLoading ? (
        <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1 }}>
          <LoadingSpinner size="large" text="Loading sketches" />
        </FlexColumn>
      ) : isError ? (
        <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1, px: 2 }}>
          <EmptyState
            variant="error"
            title="Could not load sketches"
            description={error?.message ?? "Try again later."}
          />
        </FlexColumn>
      ) : sketches.length === 0 ? (
        <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1, px: 2 }}>
          <EmptyState
            title={filterValue ? "No matching sketches" : "No sketches yet"}
            description={
              filterValue
                ? "Try a different search term."
                : "Create a new sketch with the + button above."
            }
          />
        </FlexColumn>
      ) : (
        <FlexColumn className="sketch-list" gap={0.5}>
          {(() => {
            let currentGroup = "";
            return sketches.map((sketch) => {
              const group = groupByDate(sketch.updatedAt);
              const showHeader = group !== currentGroup;
              currentGroup = group;
              return (
                <Fragment key={sketch.id}>
                  {showHeader && (
                    <div className="date-header-row">
                      <Text
                        className="date-header"
                        size="small"
                        color="secondary"
                        weight={400}
                      >
                        {group}
                      </Text>
                    </div>
                  )}
                  <SketchListItem
                    id={sketch.id}
                    name={sketch.name}
                    updatedAt={sketch.updatedAt}
                    active={sketch.id === activeSketchId}
                    editing={sketch.id === editingId}
                    onOpen={handleOpen}
                    onContextMenu={handleContextMenu}
                    onCommitRename={handleCommitRename}
                    onCancelRename={() => setEditingId(null)}
                  />
                </Fragment>
              );
            });
          })()}
        </FlexColumn>
      )}
    </FlexColumn>
  );
};

export default memo(SketchListPanel);
