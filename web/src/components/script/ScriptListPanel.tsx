import AddIcon from "@mui/icons-material/Add";
import RecordVoiceOverOutlinedIcon from "@mui/icons-material/RecordVoiceOverOutlined";
import { memo, useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useCreateScript, useScripts } from "../../hooks/script/useScripts";
import { usePanelStore } from "../../stores/PanelStore";
import {
  useWorkspaceTabsStore,
  creationProjectId
} from "../../stores/WorkspaceTabsStore";
import type { SidebarDocumentItem } from "../../stores/SidebarDocumentActionsStore";
import { useSidebarDocumentMenu } from "../../hooks/useSidebarDocumentMenu";
import { trpc } from "../../trpc/client";
import { notifyMutationError } from "../../utils/notifyMutationError";
import { downgradeBoardsLinkedToScript } from "../../lib/scriptStoryboardDowngrade";
import {
  DocumentListPanel,
  ListPanelItem,
  ToolbarIconButton,
  Tooltip
} from "../ui_primitives";

export const CreateScriptButton = memo(function CreateScriptButton() {
  const createScript = useCreateScript();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const handleCreate = useCallback(async () => {
    try {
      const created = await createScript.mutateAsync({
        name: "Untitled script",
        projectId: creationProjectId()
      });
      openTab({
        type: "script",
        ref: created.id,
        mode: "edit",
        title: created.name || "Untitled script"
      });
      if (!location.pathname.startsWith("/workspace")) {
        navigate("/workspace");
      }
      setVisibility(false);
    } catch (error) {
      notifyMutationError("create the script", error);
    }
  }, [createScript, location.pathname, navigate, openTab, setVisibility]);

  return (
    <Tooltip title="New script" placement="right-start">
      <ToolbarIconButton
        ariaLabel="New script"
        onClick={() => void handleCreate()}
        disabled={createScript.isPending}
        tabIndex={-1}
        icon={<AddIcon />}
      />
    </Tooltip>
  );
});

const ScriptListPanel = () => {
  const { data, isLoading, isError, error } = useScripts();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const activeScriptId = activeTabId?.startsWith("script:")
    ? activeTabId.slice("script:".length)
    : null;

  const handleOpen = useCallback(
    (id: string, name: string) => {
      openTab({
        type: "script",
        ref: id,
        mode: "edit",
        title: name || "Untitled script"
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
  const createScript = useCreateScript();
  const updateScript = trpc.scripts.update.useMutation({
    onSuccess: (updated) => {
      utils.scripts.get.setData({ id: updated.id }, updated);
      void utils.scripts.list.invalidate();
    }
  });
  const deleteScript = trpc.scripts.delete.useMutation({
    onSuccess: () => {
      void utils.scripts.list.invalidate();
    }
  });
  const handleCommitRename = useCallback(
    (id: string, newName: string) => {
      const trimmed = newName.trim();
      const current = (data ?? []).find((s) => s.id === id);
      setEditingId(null);
      if (trimmed && current && trimmed !== current.name) {
        updateScript.mutate({ id, name: trimmed });
      }
    },
    [data, updateScript]
  );

  const handleDuplicate = useCallback(
    async (item: SidebarDocumentItem) => {
      try {
        const source = await utils.scripts.get.fetch({ id: item.id });
        const copy = await createScript.mutateAsync({
          name: `${source.name} (copy)`.substring(0, 200),
          projectId: source.projectId
        });
        await updateScript.mutateAsync({
          id: copy.id,
          document: source.document
        });
      } catch (error) {
        notifyMutationError("duplicate the script", error);
      }
    },
    [utils, createScript, updateScript]
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
    deleteScript.mutate({ id });
    // Downgrade every board that linked this script to unlinked, keeping the
    // words it projected. Never blocks the delete (design §4).
    void downgradeBoardsLinkedToScript(id).then((boardIds) => {
      if (boardIds.length > 0) {
        void utils.storyboards.list.invalidate();
      }
    });
  }, [itemToDelete, deleteScript, utils]);

  return (
    <DocumentListPanel
      singular="script"
      plural="scripts"
      documents={data}
      isLoading={isLoading}
      isError={isError}
      errorMessage={error?.message}
      emptyDescription="Create a new script with the + button above."
      deleteTarget={itemToDelete}
      onCancelDelete={() => setItemToDelete(null)}
      onConfirmDelete={handleConfirmDelete}
      renderItem={(script) => (
        <ListPanelItem
          id={script.id}
          name={script.name}
          fallbackName="Untitled script"
          renameLabel="Script name"
          icon={RecordVoiceOverOutlinedIcon}
          active={script.id === activeScriptId}
          editing={script.id === editingId}
          onOpen={handleOpen}
          onContextMenu={handleContextMenu}
          onCommitRename={handleCommitRename}
          onCancelRename={() => setEditingId(null)}
        />
      )}
    />
  );
};

export default memo(ScriptListPanel);
