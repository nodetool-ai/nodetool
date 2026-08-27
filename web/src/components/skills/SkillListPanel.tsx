import AddIcon from "@mui/icons-material/Add";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  useCreateSkill,
  useDeleteSkill,
  useSkills,
  useUpdateSkill
} from "../../hooks/skills/useSkills";
import { usePanelStore } from "../../stores/PanelStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import type { SidebarDocumentItem } from "../../stores/SidebarDocumentActionsStore";
import { useSidebarDocumentMenu } from "../../hooks/useSidebarDocumentMenu";
import { trpc } from "../../trpc/client";
import { newDocumentId } from "../../lib/newDocumentId";
import { notifyMutationError } from "../../utils/notifyMutationError";
import type { SkillListItem } from "@nodetool-ai/protocol/api-schemas/skills.js";
import ReportBugButton from "../support/ReportBugButton";
import {
  DocumentListPanel,
  ListPanelItem,
  ToolbarIconButton,
  Tooltip
} from "../ui_primitives";

export const CreateSkillButton = () => {
  const createSkill = useCreateSkill();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const handleCreate = useCallback(async () => {
    try {
      const created = await createSkill.mutateAsync({
        id: newDocumentId(),
        name: `skill-${Date.now().toString(36)}`,
        description: "A reusable skill for the NodeTool agent.",
        content: "# New skill\n\nDescribe what this skill does and when the agent should use it."
      });
      openTab({
        type: "skill",
        ref: created.id,
        mode: "edit",
        title: created.name || "Untitled skill"
      });
      if (!location.pathname.startsWith("/workspace")) {
        navigate("/workspace");
      }
      setVisibility(false);
    } catch (error) {
      notifyMutationError("create the skill", error);
    }
  }, [createSkill, location.pathname, navigate, openTab, setVisibility]);
  const handleCreateClick = useCallback(() => {
    void handleCreate();
  }, [handleCreate]);

  return (
    <Tooltip title="New skill" placement="right-start">
      <ToolbarIconButton
        ariaLabel="New skill"
        onClick={handleCreateClick}
        disabled={createSkill.isPending}
        tabIndex={-1}
        icon={<AddIcon />}
      />
    </Tooltip>
  );
};

const SkillListPanel = () => {
  const { data, isLoading, isError, error } = useSkills();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const activeSkillId = activeTabId?.startsWith("skill:")
    ? activeTabId.slice("skill:".length)
    : null;

  const handleOpen = useCallback(
    (id: string, name: string) => {
      openTab({
        type: "skill",
        ref: id,
        mode: "edit",
        title: name || "Untitled skill"
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
  const createSkill = useCreateSkill();
  const updateSkill = useUpdateSkill();
  const deleteSkill = useDeleteSkill();

  const handleCommitRename = useCallback(
    (id: string, newName: string) => {
      const trimmed = newName.trim();
      const current = (data ?? []).find((s) => s.id === id);
      setEditingId(null);
      if (trimmed && current && trimmed !== current.name) {
        updateSkill.mutate({
          id,
          name: trimmed,
          baseUpdatedAt: current.updatedAt
        });
      }
    },
    [data, updateSkill]
  );

  const handleDuplicate = useCallback(
    async (item: SidebarDocumentItem) => {
      try {
        const source = await utils.skills.get.fetch({ id: item.id });
        const copy = await createSkill.mutateAsync({
          id: newDocumentId(),
          name: `${source.name}-copy`
            .substring(0, 64)
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-"),
          description: source.description,
          content: source.content
        });
        // already created with correct content, no second update needed
        void copy;
      } catch (error) {
        notifyMutationError("duplicate the skill", error);
      }
    },
    [utils, createSkill]
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
    if (!itemToDelete) return;
    const id = itemToDelete.id;
    deleteSkill.mutate(
      { id },
      {
        onSuccess: () => {
          useWorkspaceTabsStore.getState().closeTab(`skill:${id}`);
          setItemToDelete(null);
        }
      }
    );
  }, [itemToDelete, deleteSkill]);
  const handleCancelDelete = useCallback(() => setItemToDelete(null), []);
  const handleCancelRename = useCallback(() => setEditingId(null), []);
  const renderSkill = useCallback(
    (skill: SkillListItem) => (
      <ListPanelItem
        id={skill.id}
        name={skill.name}
        fallbackName="Untitled skill"
        renameLabel="Skill name"
        icon={AutoAwesomeIcon}
        active={skill.id === activeSkillId}
        editing={skill.id === editingId}
        onOpen={handleOpen}
        onContextMenu={handleContextMenu}
        onCommitRename={handleCommitRename}
        onCancelRename={handleCancelRename}
      />
    ),
    [
      activeSkillId,
      editingId,
      handleCancelRename,
      handleCommitRename,
      handleContextMenu,
      handleOpen
    ]
  );

  return (
    <DocumentListPanel
      singular="skill"
      plural="skills"
      documents={data}
      isLoading={isLoading}
      isError={isError}
      errorMessage={error?.message}
      errorAction={
        <ReportBugButton
          context={{
            source: "panel-crash",
            summary: "Skills panel failed to load",
            errorText: error?.message,
            stackTrace: error instanceof Error ? error.stack : undefined
          }}
        />
      }
      emptyDescription="Create a new skill with the + button above."
      deleteTarget={itemToDelete}
      onCancelDelete={handleCancelDelete}
      onConfirmDelete={handleConfirmDelete}
      renderItem={renderSkill}
    />
  );
};

export default SkillListPanel;
