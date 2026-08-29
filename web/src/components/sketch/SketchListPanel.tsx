import AddIcon from "@mui/icons-material/Add";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import { memo, useCallback, useState } from "react";
import type { DragEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { usePanelStore } from "../../stores/PanelStore";
import {
  useWorkspaceTabsStore,
  creationProjectId
} from "../../stores/WorkspaceTabsStore";
import { serializeDragData, useDragDropStore } from "../../lib/dragdrop";
import type { SidebarDocumentItem } from "../../stores/SidebarDocumentActionsStore";
import {
  useSidebarDocumentMenu,
  type SidebarDocumentContextMenuHandler
} from "../../hooks/useSidebarDocumentMenu";
import { trpc } from "../../trpc/client";
import { notifyMutationError } from "../../utils/notifyMutationError";
import {
  DocumentListPanel,
  ListPanelItem,
  ToolbarIconButton,
  Tooltip,
  BORDER_RADIUS,
  FONT_WEIGHT,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { newDocumentId } from "../../lib/newDocumentId";

// Above every tier on the shared Z_INDEX scale, so it keeps its own value.
const DRAG_IMAGE_Z_INDEX = 9999;

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
    border-radius: ${BORDER_RADIUS.lg};
    display: flex;
    align-items: center;
    gap: ${getSpacingPx(SPACING.lg)};
    padding: ${getSpacingPx(SPACING.md)};
    box-sizing: border-box;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    color: var(--palette-text-primary);
    font-family: Inter, sans-serif;
    pointer-events: none;
    z-index: ${DRAG_IMAGE_Z_INDEX};
  `;

  const icon = document.createElement("div");
  icon.textContent = "✎";
  icon.style.cssText = `
    width: 48px;
    height: 48px;
    border-radius: ${BORDER_RADIUS.sm};
    flex-shrink: 0;
    background-color: var(--palette-grey-800);
    color: var(--palette-text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--fontSizeBig);
    font-weight: ${FONT_WEIGHT.semibold};
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
    font-weight: ${FONT_WEIGHT.medium};
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
  onContextMenu: SidebarDocumentContextMenuHandler;
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

  return (
    <ListPanelItem
      id={id}
      name={name}
      fallbackName="Untitled sketch"
      renameLabel="Sketch name"
      icon={BrushOutlinedIcon}
      active={active}
      editing={editing}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onOpen={onOpen}
      onContextMenu={onContextMenu}
      onCommitRename={onCommitRename}
      onCancelRename={onCancelRename}
    />
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
        projectId: creationProjectId()
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
      notifyMutationError("create the sketch", error);
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
  const handleCommitRename = useCallback(
    (id: string, newName: string) => {
      const trimmed = newName.trim();
      const current = (data ?? []).find((s) => s.id === id);
      setEditingId(null);
      if (trimmed && current && trimmed !== current.name) {
        updateSketch.mutate({ id, name: trimmed });
        useWorkspaceTabsStore.getState().setTitle(id, "sketch", trimmed);
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
        notifyMutationError("duplicate the sketch", error);
      }
    },
    [utils, createSketch, updateSketch]
  );

  const handleRequestRename = useCallback((item: SidebarDocumentItem) => {
    setEditingId(item.id);
  }, []);

  const handleRequestDelete = useCallback((item: SidebarDocumentItem) => {
    setItemToDelete(item);
  }, []);

  const handleContextMenu = useSidebarDocumentMenu({
    onRename: handleRequestRename,
    onDuplicate: handleDuplicate,
    onDelete: handleRequestDelete
  });

  const handleConfirmDelete = useCallback(() => {
    if (itemToDelete) {
      deleteSketch.mutate({ id: itemToDelete.id });
    }
  }, [itemToDelete, deleteSketch]);

  return (
    <DocumentListPanel
      singular="sketch"
      plural="sketches"
      documents={data}
      isLoading={isLoading}
      isError={isError}
      errorMessage={error?.message}
      emptyDescription="Create a new sketch with the + button above."
      deleteTarget={itemToDelete}
      onCancelDelete={() => setItemToDelete(null)}
      onConfirmDelete={handleConfirmDelete}
      renderItem={(sketch) => (
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
      )}
    />
  );
};

export default memo(SketchListPanel);
