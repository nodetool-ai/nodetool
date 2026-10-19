import AddIcon from "@mui/icons-material/AddOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import { memo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { ChangeEvent, DragEvent } from "react";
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
import { useNotificationStore } from "../../stores/NotificationStore";
import { importTimelineZip } from "../../utils/timelineBundle";
import { buildTimelineDocumentPayload } from "../../hooks/timeline/timelineDocumentPayload";
import { isTranscriptClip } from "../../stores/timeline/transcriptOps";
import {
  DocumentListPanel,
  FlexRow,
  ListPanelItem,
  ToolbarIconButton,
  Tooltip,
  BORDER_RADIUS,
  FONT_WEIGHT,
  SHADOW,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { newDocumentId } from "../../lib/newDocumentId";

// Above every tier on the shared Z_INDEX scale, so it keeps its own value.
const DRAG_IMAGE_Z_INDEX = 9999;

function createTimelineDragImage(name: string, theme: Theme): HTMLElement {
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
    box-shadow: ${SHADOW(theme).md};
    color: var(--palette-text-primary);
    font-family: var(--fontFamily1);
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
  label.textContent = name;
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
  const { t } = useTranslation();
  const theme = useTheme();
  const setActiveDrag = useDragDropStore((state) => state.setActiveDrag);
  const clearDrag = useDragDropStore((state) => state.clearDrag);
  const handleDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      const payload = { id, name, updatedAt };
      serializeDragData(
        {
          type: "timeline",
          payload,
          metadata: {
            sourceId: id,
            sourceName: name || t("i18n-next65.timeline.listPanel.untitled")
          }
        },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "copyMove";
      const dragImage = createTimelineDragImage(
        name || t("i18n-next65.timeline.listPanel.untitled"),
        theme
      );
      document.body.appendChild(dragImage);
      event.dataTransfer.setDragImage(dragImage, 10, 10);
      window.setTimeout(() => document.body.removeChild(dragImage), 0);
      setActiveDrag({
        type: "timeline",
        payload,
        metadata: {
          sourceId: id,
          sourceName: name || t("i18n-next65.timeline.listPanel.untitled")
        }
      });
    },
    [id, name, updatedAt, setActiveDrag, t, theme]
  );
  const handleDragEnd = useCallback(() => {
    clearDrag();
  }, [clearDrag]);

  return (
    <ListPanelItem
      id={id}
      name={name}
      fallbackName={t("i18n-next65.timeline.listPanel.untitled")}
      renameLabel={t("i18n-next65.timeline.listPanel.nameLabel")}
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
  const { t } = useTranslation();
  const createTimeline = useCreateTimeline();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const handleCreate = useCallback(async () => {
    try {
      const timeline = await createTimeline.mutateAsync({
        id: newDocumentId(),
        name: t("i18n-next65.timeline.listPanel.untitled"),
        projectId: creationProjectId()
      });
      if (location.pathname.startsWith("/workspace")) {
        openTab({
          type: "timeline",
          ref: timeline.id,
          mode: "edit",
          title: timeline.name || t("i18n-next65.timeline.listPanel.untitled"),
          projectId: timeline.projectId
        });
      } else {
        navigate(`/timeline/${timeline.id}?mode=edit`);
      }
      setVisibility(false);
    } catch (error) {
      notifyMutationError(t("i18n-next65.timeline.listPanel.createError"), error);
    }
  }, [createTimeline, location.pathname, navigate, openTab, setVisibility, t]);

  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (!file) return;
      setIsImporting(true);
      try {
        const result = await importTimelineZip(file, {
          projectId: creationProjectId()
        });
        const timeline = result.timeline;
        utils.timeline.list.invalidate();
        utils.timeline.get.setData({ id: timeline.id }, timeline);
        if (location.pathname.startsWith("/workspace")) {
          openTab({
            type: "timeline",
            ref: timeline.id,
            mode: "edit",
            title: timeline.name || t("i18n-next65.timeline.listPanel.untitled"),
            projectId: timeline.projectId
          });
        } else {
          navigate(`/timeline/${timeline.id}?mode=edit`);
        }
        setVisibility(false);
        const addNotification =
          useNotificationStore.getState().addNotification;
        addNotification({
          type: "success",
          alert: true,
          content: t("i18n-next65.timeline.listPanel.imported", {
            name: timeline.name || t("i18n-next65.timeline.listPanel.untitled")
          })
        });
        if (result.missing.length > 0) {
          addNotification({
            type: "warning",
            alert: true,
            content: t("i18n-next65.timeline.listPanel.missingAssets", {
              count: result.missing.length
            })
          });
        }
        if (result.missing_clips) {
          addNotification({
            type: "warning",
            alert: true,
            content: t("i18n-next65.timeline.listPanel.missingClips", {
              count: result.missing_clips
            })
          });
        }
        const notCarried = (result.warnings ?? []).filter(
          (warning) => !warning.includes("their media was not supplied")
        );
        if (notCarried.length > 0) {
          addNotification({
            type: "info",
            dismissable: true,
            content: t("i18n-next65.timeline.listPanel.notCarriedOver", {
              warnings: notCarried.join(" ")
            })
          });
        }
      } catch (error) {
        notifyMutationError(t("i18n-next65.timeline.listPanel.importError"), error);
      } finally {
        setIsImporting(false);
      }
    },
    [location.pathname, navigate, openTab, setVisibility, t, utils]
  );

  return (
    <FlexRow align="center" gap={SPACING.xs}>
      <Tooltip
        title={t("i18n-next65.timeline.listPanel.newTimeline")}
        placement="right-start"
      >
        <ToolbarIconButton
          ariaLabel={t("i18n-next65.timeline.listPanel.newTimeline")}
          onClick={() => void handleCreate()}
          disabled={createTimeline.isPending}
          tabIndex={-1}
          icon={<AddIcon />}
        />
      </Tooltip>
      <Tooltip
        title={t("i18n-next65.timeline.listPanel.importTimelineTooltip")}
        placement="right-start"
      >
        <ToolbarIconButton
          ariaLabel={t("i18n-next65.timeline.listPanel.importTimeline")}
          onClick={handleImportClick}
          disabled={isImporting}
          tabIndex={-1}
          icon={<UploadFileOutlinedIcon />}
        />
      </Tooltip>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        aria-label={t("i18n-next65.timeline.listPanel.importTimelineArchive")}
        style={{ display: "none" }}
        onChange={(event) => void handleImportFile(event)}
      />
    </FlexRow>
  );
});

interface TimelineListPanelProps {
  readonly projectId: string;
}

const TimelineListPanel = ({ projectId }: TimelineListPanelProps) => {
  const { t } = useTranslation();
  const { data, isLoading, isError, error } = useTimelines(projectId);
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
          mode: "view",
          title: name || t("i18n-next65.timeline.listPanel.untitled"),
          projectId
        });
      } else {
        navigate(`/timeline/${id}`);
      }
      setVisibility(false);
    },
    [location.pathname, navigate, openTab, projectId, setVisibility, t]
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
          name: t("i18n-next65.timeline.listPanel.copyName", {
            name: source.name
          }).substring(0, 200),
          projectId: source.projectId,
          fps: source.fps,
          width: source.width,
          height: source.height
        });
        await updateTimeline.mutateAsync({
          id: copy.id,
          document: buildTimelineDocumentPayload({
            ...source,
            trackFolders: source.trackFolders ?? [],
            mediaTracks: source.mediaTracks ?? [],
            transcript: source.transcript ?? [],
            scriptEnabled:
              source.scriptEnabled ?? source.clips.some(isTranscriptClip),
            camera2d: source.camera2d ?? null
          })
        });
      } catch (error) {
        notifyMutationError(t("i18n-next65.timeline.listPanel.duplicateError"), error);
      }
    },
    [t, utils, createTimeline, updateTimeline]
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
      singular={t("i18n-next65.timeline.listPanel.singular")}
      plural={t("i18n-next65.timeline.listPanel.plural")}
      documents={data}
      isLoading={isLoading}
      isError={isError}
      errorMessage={error?.message}
      emptyDescription={t("i18n-next65.timeline.listPanel.emptyDescription")}
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
