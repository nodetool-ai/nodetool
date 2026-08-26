import AddIcon from "@mui/icons-material/Add";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import { memo, useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  useCreateStoryboard,
  useStoryboards
} from "../../hooks/storyboard/useStoryboards";
import { usePanelStore } from "../../stores/PanelStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import type { SidebarDocumentItem } from "../../stores/SidebarDocumentActionsStore";
import { useSidebarDocumentMenu } from "../../hooks/useSidebarDocumentMenu";
import { trpc } from "../../trpc/client";
import { notifyMutationError } from "../../utils/notifyMutationError";
import { downgradeScriptsLinkedToBoard } from "../../lib/scriptStoryboardDowngrade";
import {
  DocumentListPanel,
  ListPanelItem,
  ToolbarIconButton,
  Tooltip
} from "../ui_primitives";

export const CreateStoryboardButton = memo(function CreateStoryboardButton() {
  const createStoryboard = useCreateStoryboard();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const handleCreate = useCallback(async () => {
    try {
      const created = await createStoryboard.mutateAsync({
        name: "Untitled storyboard",
        projectId: "default"
      });
      openTab({
        type: "storyboard",
        ref: created.id,
        mode: "edit",
        title: created.name || "Untitled storyboard"
      });
      if (!location.pathname.startsWith("/workspace")) {
        navigate("/workspace");
      }
      setVisibility(false);
    } catch (error) {
      notifyMutationError("create the storyboard", error);
    }
  }, [createStoryboard, location.pathname, navigate, openTab, setVisibility]);

  return (
    <Tooltip title="New storyboard" placement="right-start">
      <ToolbarIconButton
        ariaLabel="New storyboard"
        onClick={() => void handleCreate()}
        disabled={createStoryboard.isPending}
        tabIndex={-1}
        icon={<AddIcon />}
      />
    </Tooltip>
  );
});

const StoryboardListPanel = () => {
  const { data, isLoading, isError, error } = useStoryboards();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const activeStoryboardId = activeTabId?.startsWith("storyboard:")
    ? activeTabId.slice("storyboard:".length)
    : null;

  const handleOpen = useCallback(
    (id: string, name: string) => {
      openTab({
        type: "storyboard",
        ref: id,
        mode: "edit",
        title: name || "Untitled storyboard"
      });
      if (!location.pathname.startsWith("/workspace")) {
        navigate("/workspace");
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
  const createStoryboard = useCreateStoryboard();
  const updateStoryboard = trpc.storyboards.update.useMutation({
    onSuccess: (updated) => {
      utils.storyboards.get.setData({ id: updated.id }, updated);
      void utils.storyboards.list.invalidate();
    }
  });
  const deleteStoryboard = trpc.storyboards.delete.useMutation({
    onSuccess: () => {
      void utils.storyboards.list.invalidate();
    }
  });
  const handleCommitRename = useCallback(
    (id: string, newName: string) => {
      const trimmed = newName.trim();
      const current = (data ?? []).find((b) => b.id === id);
      setEditingId(null);
      if (trimmed && current && trimmed !== current.name) {
        updateStoryboard.mutate({ id, name: trimmed });
      }
    },
    [data, updateStoryboard]
  );

  const handleDuplicate = useCallback(
    async (item: SidebarDocumentItem) => {
      try {
        const source = await utils.storyboards.get.fetch({ id: item.id });
        const copy = await createStoryboard.mutateAsync({
          name: `${source.name} (copy)`.substring(0, 200),
          projectId: source.projectId
        });
        await updateStoryboard.mutateAsync({
          id: copy.id,
          document: source.document
        });
      } catch (error) {
        notifyMutationError("duplicate the storyboard", error);
      }
    },
    [utils, createStoryboard, updateStoryboard]
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
    if (!itemToDelete) {
      return;
    }
    const { id } = itemToDelete;
    deleteStoryboard.mutate({ id });
    // The script keeps its words; only its pointer at this board goes. Never
    // blocks the delete (design §4).
    void downgradeScriptsLinkedToBoard(id).then((scriptIds) => {
      if (scriptIds.length > 0) {
        void utils.scripts.list.invalidate();
      }
    });
  }, [itemToDelete, deleteStoryboard, utils]);

  return (
    <DocumentListPanel
      singular="storyboard"
      plural="storyboards"
      documents={data}
      isLoading={isLoading}
      isError={isError}
      errorMessage={error?.message}
      emptyDescription="Create a new storyboard with the + button above."
      deleteTarget={itemToDelete}
      onCancelDelete={() => setItemToDelete(null)}
      onConfirmDelete={handleConfirmDelete}
      renderItem={(board) => (
        <ListPanelItem
          id={board.id}
          name={board.name}
          fallbackName="Untitled storyboard"
          renameLabel="Storyboard name"
          icon={DashboardOutlinedIcon}
          active={board.id === activeStoryboardId}
          editing={board.id === editingId}
          onOpen={handleOpen}
          onContextMenu={handleContextMenu}
          onCommitRename={handleCommitRename}
          onCancelRename={() => setEditingId(null)}
        />
      )}
    />
  );
};

export default memo(StoryboardListPanel);
