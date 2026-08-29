import AddIcon from "@mui/icons-material/Add";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import { memo, useCallback, useState } from "react";
import type { DragEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useCreateTimeline, useTimelines } from "../../hooks/useTimelineSequence";
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

function createTimelineDragImage(name: string): HTMLElement {
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
  icon.textContent = "▶";
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
  label.textContent = name || "Untitled video";
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

interface TimelineListItemProps {
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

const TimelineListItem = memo(function TimelineListItem({
  id,
  name,
  updatedAt,
  active,
  editing,
  onOpen,
  onContextMenu,
  onCommitRename,
  onCancelRename
}: TimelineListItemProps) {
  const setActiveDrag = useDragDropStore((state) => state.setActiveDrag);
  const clearDrag = useDragDropStore((state) => state.clearDrag);
  const handleDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      const payload = { id, name, updatedAt };
      serializeDragData(
        {
          type: "timeline",
          payload,
          metadata: { sourceId: id, sourceName: name || "Untitled video" }
        },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "copyMove";
      const dragImage = createTimelineDragImage(name);
      document.body.appendChild(dragImage);
      event.dataTransfer.setDragImage(dragImage, 10, 10);
      window.setTimeout(() => document.body.removeChild(dragImage), 0);
      setActiveDrag({
        type: "timeline",
        payload,
        metadata: { sourceId: id, sourceName: name || "Untitled video" }
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
      fallbackName="Untitled video"
      renameLabel="Timeline name"
      icon={MovieOutlinedIcon}
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

export const CreateTimelineButton = memo(function CreateTimelineButton() {
  const createTimeline = useCreateTimeline();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const handleCreate = useCallback(async () => {
    try {
      const timeline = await createTimeline.mutateAsync({
        id: newDocumentId(),
        name: "Untitled video",
        projectId: creationProjectId()
      });
      if (location.pathname.startsWith("/workspace")) {
        openTab({
          type: "timeline",
          ref: timeline.id,
          mode: "edit",
          title: timeline.name || "Untitled video"
        });
      } else {
        navigate(`/timeline/${timeline.id}`);
      }
      setVisibility(false);
    } catch (error) {
      notifyMutationError("create the timeline", error);
    }
  }, [createTimeline, location.pathname, navigate, openTab, setVisibility]);

  return (
    <Tooltip title="New timeline" placement="right-start">
      <ToolbarIconButton
        ariaLabel="New timeline"
        onClick={() => void handleCreate()}
        disabled={createTimeline.isPending}
        tabIndex={-1}
        icon={<AddIcon />}
      />
    </Tooltip>
  );
});

const TimelineListPanel = () => {
  const { data, isLoading, isError, error } = useTimelines();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const activeTimelineId = activeTabId?.startsWith("timeline:")
    ? activeTabId.slice("timeline:".length)
    : location.pathname.startsWith("/timeline/")
      ? location.pathname.split("/")[2]
      : null;

  const handleOpen = useCallback(
    (id: string, name: string) => {
      if (location.pathname.startsWith("/workspace")) {
        openTab({
          type: "timeline",
          ref: id,
          mode: "edit",
          title: name || "Untitled video"
        });
      } else {
        navigate(`/timeline/${id}`);
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
  const createTimeline = useCreateTimeline();
  const updateTimeline = trpc.timeline.update.useMutation({
    onSuccess: (updated) => {
      utils.timeline.get.setData({ id: updated.id }, updated);
      void utils.timeline.list.invalidate();
    }
  });
  const deleteTimeline = trpc.timeline.delete.useMutation({
    onSuccess: () => {
      void utils.timeline.list.invalidate();
    }
  });
  const handleCommitRename = useCallback(
    (id: string, newName: string) => {
      const trimmed = newName.trim();
      const current = (data ?? []).find((t) => t.id === id);
      setEditingId(null);
      if (trimmed && current && trimmed !== current.name) {
        updateTimeline.mutate({ id, name: trimmed });
      }
    },
    [data, updateTimeline]
  );

  const handleDuplicate = useCallback(
    async (item: SidebarDocumentItem) => {
      try {
        const source = await utils.timeline.get.fetch({ id: item.id });
        const copy = await createTimeline.mutateAsync({
          id: newDocumentId(),
          name: `${source.name} (copy)`.substring(0, 200),
          projectId: source.projectId,
          fps: source.fps,
          width: source.width,
          height: source.height
        });
        await updateTimeline.mutateAsync({
          id: copy.id,
          document: {
            tracks: source.tracks,
            clips: source.clips,
            markers: source.markers,
            transcript: source.transcript,
            scriptEnabled: source.scriptEnabled
          }
        });
      } catch (error) {
        notifyMutationError("duplicate the timeline", error);
      }
    },
    [utils, createTimeline, updateTimeline]
  );

  const handleRequestRename = useCallback((item: SidebarDocumentItem) => {
    setEditingId(item.id);
  }, []);

  const handleRequestDelete = useCallback((item: SidebarDocumentItem) => {
    setItemToDelete(item);
  }, []);

  const handleCancelRename = useCallback(() => setEditingId(null), []);

  const handleContextMenu = useSidebarDocumentMenu({
    onRename: handleRequestRename,
    onDuplicate: handleDuplicate,
    onDelete: handleRequestDelete
  });

  const handleConfirmDelete = useCallback(() => {
    if (itemToDelete) {
      deleteTimeline.mutate({ id: itemToDelete.id });
    }
  }, [itemToDelete, deleteTimeline]);

  return (
    <DocumentListPanel
      singular="timeline"
      plural="timelines"
      documents={data}
      isLoading={isLoading}
      isError={isError}
      errorMessage={error?.message}
      emptyDescription="Create a new video timeline with the + button above."
      deleteTarget={itemToDelete}
      onCancelDelete={() => setItemToDelete(null)}
      onConfirmDelete={handleConfirmDelete}
      renderItem={(timeline) => (
        <TimelineListItem
          id={timeline.id}
          name={timeline.name}
          updatedAt={timeline.updatedAt}
          active={timeline.id === activeTimelineId}
          editing={timeline.id === editingId}
          onOpen={handleOpen}
          onContextMenu={handleContextMenu}
          onCommitRename={handleCommitRename}
          onCancelRename={handleCancelRename}
        />
      )}
    />
  );
};

export default memo(TimelineListPanel);
