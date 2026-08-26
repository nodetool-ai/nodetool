/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import AddIcon from "@mui/icons-material/Add";
import DashboardCustomizeOutlinedIcon from "@mui/icons-material/DashboardCustomizeOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import { memo, useCallback, useState } from "react";
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
import type { SidebarDocumentItem } from "../../stores/SidebarDocumentActionsStore";
import { useSidebarDocumentMenu } from "../../hooks/useSidebarDocumentMenu";
import { trpc } from "../../trpc/client";
import {
  Dialog,
  DocumentListPanel,
  EmptyState,
  FlexColumn,
  ListPanelItem,
  LoadingSpinner,
  ToolbarIconButton,
  TruncatedText,
  Tooltip,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
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
  const { data, isLoading, isError, error } = useApplications();
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const openApplication = useOpenApplication();

  const activeApplicationId = activeTabId?.startsWith("application:")
    ? activeTabId.slice("application:".length)
    : null;

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

  return (
    <DocumentListPanel
      singular="app"
      plural="apps"
      documents={data}
      isLoading={isLoading}
      isError={isError}
      errorMessage={error?.message}
      emptyDescription="Create an app with the + button above, or scaffold one from a workflow."
      deleteTarget={itemToDelete}
      onCancelDelete={() => setItemToDelete(null)}
      onConfirmDelete={handleConfirmDelete}
      renderItem={(app) => (
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
      )}
    />
  );
};

export default memo(ApplicationListPanel);
