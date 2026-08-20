/** @jsxImportSource @emotion/react */
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import RecordVoiceOverOutlinedIcon from "@mui/icons-material/RecordVoiceOverOutlined";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useCreateScript, useScripts } from "../../hooks/script/useScripts";
import { usePanelStore } from "../../stores/PanelStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import type { SidebarDocumentItem } from "../../stores/SidebarDocumentActionsStore";
import { useSidebarDocumentMenu } from "../../hooks/useSidebarDocumentMenu";
import { trpc } from "../../trpc/client";
import { groupByDate } from "../../utils/groupByDate";
import ConfirmDialog from "../dialogs/ConfirmDialog";
import { notifyMutationError } from "../../utils/notifyMutationError";
import { downgradeBoardsLinkedToScript } from "../../lib/scriptStoryboardDowngrade";
import CategorySearchBar from "../node_menu/CategorySearchBar";
import { useAutoFocusEnabled } from "../../hooks/useAutoFocusEnabled";
import {
  EmptyState,
  FlexColumn,
  ListPanelItem,
  LoadingSpinner,
  Text,
  ToolbarIconButton,
  Tooltip,
  listPanelStyles
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
        projectId: "default"
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
  const theme = useTheme();
  const [filterValue, setFilterValue] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const autoFocusEnabled = useAutoFocusEnabled();

  // Focus the filter on open so users can immediately type to search — except
  // on touch, where the virtual keyboard would cover the list.
  useEffect(() => {
    if (autoFocusEnabled) {
      searchRef.current?.focus();
    }
  }, [autoFocusEnabled]);
  const { data, isLoading, isError, error } = useScripts();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const activeScriptId = activeTabId?.startsWith("script:")
    ? activeTabId.slice("script:".length)
    : null;

  const scripts = useMemo(() => {
    const all = data ?? [];
    const needle = filterValue.trim().toLowerCase();
    const filtered = needle
      ? all.filter((script) => script.name.toLowerCase().includes(needle))
      : all;
    return [...filtered].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [data, filterValue]);

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
    <FlexColumn fullHeight fullWidth gap={0} css={listPanelStyles(theme)}>
      <ConfirmDialog
        open={itemToDelete !== null}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete script"
        content={`Delete "${itemToDelete?.name ?? ""}"? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
      />
      <div className="list-panel-search">
        <CategorySearchBar
          ref={searchRef}
          value={filterValue}
          onChange={setFilterValue}
          placeholder="Search scripts..."
        />
      </div>

      {isLoading ? (
        <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1 }}>
          <LoadingSpinner size="large" text="Loading scripts" />
        </FlexColumn>
      ) : isError ? (
        <FlexColumn
          gap={2}
          justify="center"
          align="center"
          sx={{ flex: 1, px: 2 }}
        >
          <EmptyState
            variant="error"
            title="Could not load scripts"
            description={error?.message ?? "Try again later."}
          />
        </FlexColumn>
      ) : scripts.length === 0 ? (
        <FlexColumn
          gap={2}
          justify="center"
          align="center"
          sx={{ flex: 1, px: 2 }}
        >
          <EmptyState
            title={filterValue ? "No matching scripts" : "No scripts yet"}
            description={
              filterValue
                ? "Try a different search term."
                : "Create a new script with the + button above."
            }
          />
        </FlexColumn>
      ) : (
        <FlexColumn className="list-panel-list" gap={0.5}>
          {(() => {
            let currentGroup = "";
            return scripts.map((script) => {
              const group = groupByDate(script.updatedAt);
              const showHeader = group !== currentGroup;
              currentGroup = group;
              return (
                <Fragment key={script.id}>
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
                </Fragment>
              );
            });
          })()}
        </FlexColumn>
      )}
    </FlexColumn>
  );
};

export default memo(ScriptListPanel);
