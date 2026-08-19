/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DashboardCustomizeOutlinedIcon from "@mui/icons-material/DashboardCustomizeOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  isConcurrencyConflict,
  useApplications,
  useCreateApplication,
  useDeleteApplication,
  useUpdateApplication
} from "../../hooks/useApplications";
import { useNotificationStore } from "../../stores/NotificationStore";
import { usePanelStore } from "../../stores/PanelStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import useContextMenuStore from "../../stores/ContextMenuStore";
import {
  useSidebarDocumentActionsStore,
  type SidebarDocumentItem
} from "../../stores/SidebarDocumentActionsStore";
import { trpc } from "../../trpc/client";
import { groupByDate } from "../../utils/groupByDate";
import ConfirmDialog from "../dialogs/ConfirmDialog";
import CategorySearchBar from "../node_menu/CategorySearchBar";
import { useAutoFocusEnabled } from "../../hooks/useAutoFocusEnabled";
import {
  Dialog,
  EmptyState,
  FlexColumn,
  ListPanelItem,
  LoadingSpinner,
  Text,
  ToolbarIconButton,
  TruncatedText,
  Tooltip,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
  listPanelStyles
} from "../ui_primitives";

const UNTITLED = "Untitled app";

const pickerStyles = () =>
  css({
    ".workflow-option": {
      width: "100%",
      border: 0,
      background: "transparent",
      color: "inherit",
      cursor: "pointer",
      textAlign: "left",
      padding: getSpacingPx(SPACING.md),
      borderRadius: BORDER_RADIUS.md,
      "&:hover": {
        backgroundColor: "var(--palette-action-hover)"
      }
    },
    ".workflow-options": {
      maxHeight: "50vh",
      overflowY: "auto"
    }
  });

/** Focus the workspace and open the app's tab. */
const useOpenApplication = () => {
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (id: string, name: string) => {
      openTab({
        type: "application",
        ref: id,
        mode: "edit",
        title: name || UNTITLED
      });
      if (!location.pathname.startsWith("/workspace")) {
        navigate("/workspace");
      }
      setVisibility(false);
    },
    [location.pathname, navigate, openTab, setVisibility]
  );
};

export const CreateApplicationButton = memo(function CreateApplicationButton() {
  const createApplication = useCreateApplication();
  const openApplication = useOpenApplication();

  const handleCreate = useCallback(async () => {
    try {
      const created = await createApplication.mutateAsync({
        name: UNTITLED,
        description: "",
        projectId: "default"
      });
      openApplication(created.id, created.name);
    } catch (error) {
      console.error("Failed to create app", error);
    }
  }, [createApplication, openApplication]);

  return (
    <Tooltip title="New app" placement="right-start">
      <ToolbarIconButton
        ariaLabel="New app"
        onClick={() => void handleCreate()}
        disabled={createApplication.isPending}
        tabIndex={-1}
        icon={<AddIcon />}
      />
    </Tooltip>
  );
});

/**
 * One-way scaffold: creates a new app bound to the picked workflow as its
 * first operation. The app is a real, separate resource from that moment on —
 * nothing syncs back to the workflow.
 */
export const CreateApplicationFromWorkflowButton = memo(
  function CreateApplicationFromWorkflowButton() {
    const [open, setOpen] = useState(false);
    const createApplication = useCreateApplication();
    const openApplication = useOpenApplication();
    const { data, isLoading } = trpc.workflows.list.useQuery(
      { cursor: "", limit: 100 },
      { enabled: open }
    );

    const handlePick = useCallback(
      async (workflowId: string, workflowName: string) => {
        setOpen(false);
        try {
          const created = await createApplication.mutateAsync({
            name: workflowName || UNTITLED,
            description: "",
            projectId: "default",
            fromWorkflowId: workflowId
          });
          openApplication(created.id, created.name);
        } catch (error) {
          console.error("Failed to create app from workflow", error);
        }
      },
      [createApplication, openApplication]
    );

    const workflows = data?.workflows ?? [];

    return (
      <>
        <Tooltip title="Create app from workflow" placement="right-start">
          <ToolbarIconButton
            ariaLabel="Create app from workflow"
            onClick={() => setOpen(true)}
            tabIndex={-1}
            icon={<AccountTreeOutlinedIcon />}
          />
        </Tooltip>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Create app from workflow"
        >
          <div css={pickerStyles()}>
            {isLoading ? (
              <LoadingSpinner text="Loading workflows" />
            ) : workflows.length === 0 ? (
              <EmptyState
                title="No workflows"
                description="Create a workflow first, then build an app on top of it."
              />
            ) : (
              <FlexColumn className="workflow-options" gap={0.5}>
                {workflows.map((workflow) => (
                  <button
                    key={workflow.id}
                    type="button"
                    className="workflow-option"
                    onClick={() =>
                      void handlePick(workflow.id, workflow.name ?? "")
                    }
                  >
                    <TruncatedText component="span">
                      {workflow.name || "Untitled workflow"}
                    </TruncatedText>
                  </button>
                ))}
              </FlexColumn>
            )}
          </div>
        </Dialog>
      </>
    );
  }
);

const ApplicationListPanel = () => {
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

  const { data, isLoading, isError, error } = useApplications();
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const openApplication = useOpenApplication();

  const activeApplicationId = activeTabId?.startsWith("application:")
    ? activeTabId.slice("application:".length)
    : null;

  const applications = useMemo(() => {
    const all = data ?? [];
    const needle = filterValue.trim().toLowerCase();
    const filtered = needle
      ? all.filter((app) => app.name.toLowerCase().includes(needle))
      : all;
    return [...filtered].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [data, filterValue]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<SidebarDocumentItem | null>(
    null
  );
  const updateApplication = useUpdateApplication();
  const deleteApplication = useDeleteApplication();
  const createApplication = useCreateApplication();
  const utils = trpc.useUtils();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
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
      const current = (data ?? []).find((app) => app.id === id);
      setEditingId(null);
      if (!trimmed || !current || trimmed === current.name) return;
      // Send the row's updatedAt so the server can reject a rename that would
      // overwrite an edit made elsewhere since this list was fetched.
      updateApplication.mutate(
        { id, name: trimmed, baseUpdatedAt: current.updatedAt },
        {
          onError: (error) => {
            addNotification({
              type: "error",
              alert: true,
              content: isConcurrencyConflict(error)
                ? `"${current.name}" changed elsewhere — the rename to "${trimmed}" was not saved.`
                : `Could not rename "${current.name}": ${error.message}`
            });
            void utils.applications.list.invalidate();
          }
        }
      );
    },
    [addNotification, data, updateApplication, utils]
  );

  const handleDuplicate = useCallback(
    async (item: SidebarDocumentItem) => {
      try {
        const source = await utils.applications.get.fetch({ id: item.id });
        await createApplication.mutateAsync({
          name: `${source.name} (copy)`.substring(0, 200),
          description: source.description,
          projectId: source.projectId,
          document: source.document
        });
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content: `Could not duplicate "${item.name}": ${
            error instanceof Error ? error.message : "unknown error"
          }`
        });
      }
    },
    [addNotification, createApplication, utils]
  );

  const handleRequestDelete = useCallback((item: SidebarDocumentItem) => {
    setItemToDelete(item);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!itemToDelete) return;
    const { id, name } = itemToDelete;
    deleteApplication.mutate(
      { id },
      {
        onError: (error) => {
          addNotification({
            type: "error",
            alert: true,
            content: `Could not delete "${name}": ${error.message}`
          });
          void utils.applications.list.invalidate();
        }
      }
    );
  }, [addNotification, itemToDelete, deleteApplication, utils]);

  useEffect(() => {
    setActions({
      onRename: (item) => setEditingId(item.id),
      onDuplicate: (item) => void handleDuplicate(item),
      onDelete: handleRequestDelete
    });
    return () => clearActions();
  }, [setActions, clearActions, handleDuplicate, handleRequestDelete]);

  return (
    <FlexColumn fullHeight fullWidth gap={0} css={listPanelStyles(theme)}>
      <ConfirmDialog
        open={itemToDelete !== null}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete app"
        content={`Delete "${itemToDelete?.name ?? ""}"? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
      />
      <div className="list-panel-search">
        <CategorySearchBar
          ref={searchRef}
          value={filterValue}
          onChange={setFilterValue}
          placeholder="Search apps..."
        />
      </div>

      {isLoading ? (
        <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1 }}>
          <LoadingSpinner size="large" text="Loading apps" />
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
            title="Could not load apps"
            description={error?.message ?? "Try again later."}
          />
        </FlexColumn>
      ) : applications.length === 0 ? (
        <FlexColumn
          gap={2}
          justify="center"
          align="center"
          sx={{ flex: 1, px: 2 }}
        >
          <EmptyState
            title={filterValue ? "No matching apps" : "No apps yet"}
            description={
              filterValue
                ? "Try a different search term."
                : "Create an app with the + button above, or scaffold one from a workflow."
            }
          />
        </FlexColumn>
      ) : (
        <FlexColumn className="list-panel-list" gap={0.5}>
          {(() => {
            let currentGroup = "";
            return applications.map((app) => {
              const group = groupByDate(app.updatedAt);
              const showHeader = group !== currentGroup;
              currentGroup = group;
              return (
                <Fragment key={app.id}>
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
                    id={app.id}
                    name={app.name}
                    fallbackName={UNTITLED}
                    renameLabel="App name"
                    icon={DashboardCustomizeOutlinedIcon}
                    secondary={
                      app.operationCount === 1
                        ? "1 operation"
                        : `${app.operationCount} operations`
                    }
                    active={app.id === activeApplicationId}
                    editing={app.id === editingId}
                    onOpen={openApplication}
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

export default memo(ApplicationListPanel);
