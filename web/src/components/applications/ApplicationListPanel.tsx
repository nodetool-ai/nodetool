/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import AddIcon from "@mui/icons-material/AddOutlined";
import DashboardCustomizeOutlinedIcon from "@mui/icons-material/DashboardCustomizeOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  isConcurrencyConflict,
  useApplications,
  useCreateApplication,
  useDeleteApplication,
  useUpdateApplication
} from "../../hooks/useApplications";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  useWorkspaceTabsStore,
  creationProjectId
} from "../../stores/WorkspaceTabsStore";
import type { SidebarDocumentItem } from "../../stores/SidebarDocumentActionsStore";
import { useSidebarDocumentMenu } from "../../hooks/useSidebarDocumentMenu";
import {
  UNTITLED_APP as UNTITLED,
  useOpenApplication
} from "../../hooks/useOpenApplication";
import { trpc } from "../../trpc/client";
import {
  Dialog,
  DocumentListPanel,
  EmptyState,
  AlertBanner,
  FlexColumn,
  ListPanelItem,
  LoadingSpinner,
  ToolbarIconButton,
  TruncatedText,
  Tooltip,
  SPACING,
  getSpacingPx,
  selectableRowStyles
} from "../ui_primitives";

const pickerStyles = (theme: Theme) =>
  css({
    ".workflow-option": {
      width: "100%",
      border: 0,
      color: "inherit",
      cursor: "pointer",
      textAlign: "left",
      padding: getSpacingPx(SPACING.md),
      ...selectableRowStyles(theme)
    },
    ".workflow-options": {
      maxHeight: "50vh",
      overflowY: "auto"
    }
  });

export const CreateApplicationButton = memo(function CreateApplicationButton() {
  const { t } = useTranslation();
  const createApplication = useCreateApplication();
  const openApplication = useOpenApplication();

  const handleCreate = useCallback(async () => {
    try {
      const created = await createApplication.mutateAsync({
        name: UNTITLED,
        description: "",
        projectId: creationProjectId()
      });
      openApplication(created.id, created.name, created.projectId);
    } catch (error) {
      console.error("Failed to create app", error);
    }
  }, [createApplication, openApplication]);

  return (
    <Tooltip
      title={t("i18n-next30.applications.newApp")}
      placement="right-start"
    >
      <ToolbarIconButton
        ariaLabel={t("i18n-next30.applications.newApp")}
        onClick={() => void handleCreate()}
        disabled={createApplication.isPending}
        tabIndex={-1}
        icon={<AddIcon />}
      />
    </Tooltip>
  );
});

interface CreateApplicationFromWorkflowButtonProps {
  readonly projectId?: string;
}

/**
 * One-way scaffold: creates a new app bound to the picked workflow as its
 * first operation. The app is a real, separate resource from that moment on —
 * nothing syncs back to the workflow.
 */
export const CreateApplicationFromWorkflowButton = memo(
  function CreateApplicationFromWorkflowButton({
    projectId
  }: CreateApplicationFromWorkflowButtonProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const pickerCss = useMemo(() => pickerStyles(theme), [theme]);
    const [open, setOpen] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const createApplication = useCreateApplication();
    const openApplication = useOpenApplication();
    const scopedProjectId = projectId ?? creationProjectId();
    const { data, isLoading } = trpc.workflows.list.useQuery(
      { cursor: "", limit: 100, project_id: scopedProjectId },
      { enabled: open, staleTime: 30_000, retry: false }
    );

    const handlePick = useCallback(
      async (workflowId: string, workflowName: string) => {
        setCreateError(null);
        try {
          const created = await createApplication.mutateAsync({
            name: workflowName || UNTITLED,
            description: "",
            projectId: scopedProjectId,
            fromWorkflowId: workflowId
          });
          setOpen(false);
          openApplication(created.id, created.name, created.projectId);
        } catch (error) {
          setCreateError(
            error instanceof Error
              ? error.message
              : t("i18n-next30.applications.createFromWorkflowError")
          );
        }
      },
      [createApplication, openApplication, scopedProjectId]
    );

    const workflows = data?.workflows ?? [];

    return (
      <>
        <Tooltip
          title={t("i18n-next30.applications.createFromWorkflow")}
          placement="right-start"
        >
          <ToolbarIconButton
            ariaLabel={t("i18n-next30.applications.createFromWorkflow")}
            onClick={() => setOpen(true)}
            tabIndex={-1}
            icon={<AccountTreeOutlinedIcon />}
          />
        </Tooltip>
        <Dialog
          open={open}
          onClose={() => {
            setOpen(false);
            setCreateError(null);
          }}
          title={t("i18n-next30.applications.createFromWorkflow")}
        >
          <div css={pickerCss}>
            {createError ? (
              <AlertBanner
                severity="error"
                title={t("i18n-next30.applications.createAppErrorTitle")}
              >
                {t("i18n-next30.applications.createAppErrorRetry", {
                  error: createError
                })}
              </AlertBanner>
            ) : null}
            {isLoading ? (
              <LoadingSpinner
                text={t("i18n-next30.applications.loadingWorkflows")}
              />
            ) : workflows.length === 0 ? (
              <EmptyState
                title={t("i18n-next30.applications.noWorkflows")}
                description={t(
                  "i18n-next30.applications.noWorkflowsDescription"
                )}
              />
            ) : (
              <FlexColumn className="workflow-options" gap={SPACING.micro}>
                {workflows.map((workflow) => (
                  <button
                    key={workflow.id}
                    type="button"
                    className="workflow-option"
                    disabled={createApplication.isPending}
                    onClick={() =>
                      void handlePick(workflow.id, workflow.name ?? "")
                    }
                  >
                    <TruncatedText component="span">
                      {workflow.name ||
                        t("i18n-next30.applications.untitledWorkflow")}
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

interface ApplicationListPanelProps {
  readonly projectId: string;
}

const ApplicationListPanel = ({ projectId }: ApplicationListPanelProps) => {
  const { t } = useTranslation();
  const { data, isLoading, isError, error } = useApplications(projectId);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const openApplication = useOpenApplication();
  const handleOpenApplication = useCallback(
    (id: string, name: string) => openApplication(id, name, projectId),
    [openApplication, projectId]
  );

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
                ? t("i18n-next30.applications.renameConflict", {
                    currentName: current.name,
                    newName: trimmed
                  })
                : t("i18n-next30.applications.renameError", {
                    name: current.name,
                    error: error.message
                  })
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
          content: t("i18n-next30.applications.duplicateError", {
            name: item.name,
            error:
              error instanceof Error
                ? error.message
                : t("i18n-next30.applications.unknownError")
          })
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
            content: t("i18n-next30.applications.deleteError", { name, error: error.message })
          });
          void utils.applications.list.invalidate();
        }
      }
    );
  }, [addNotification, itemToDelete, deleteApplication, utils]);

  return (
    <DocumentListPanel
      singular={t("i18n-next100.applications.singular")}
      plural={t("i18n-next100.applications.plural")}
      documents={data}
      isLoading={isLoading}
      isError={isError}
      errorMessage={error?.message}
      emptyDescription={t("i18n-next30.applications.emptyDescription")}
      deleteTarget={itemToDelete}
      onCancelDelete={() => setItemToDelete(null)}
      onConfirmDelete={handleConfirmDelete}
      renderItem={(app) => (
        <ListPanelItem
          id={app.id}
          name={app.name}
          fallbackName={UNTITLED}
          renameLabel={t("i18n-next30.applications.appName")}
          icon={DashboardCustomizeOutlinedIcon}
          secondary={
            app.operationCount === 1
              ? t("i18n-next30.applications.operationCount", { count: 1 })
              : t("i18n-next30.applications.operationCount", {
                  count: app.operationCount
                })
          }
          active={app.id === activeApplicationId}
          editing={app.id === editingId}
          onOpen={handleOpenApplication}
          onContextMenu={handleContextMenu}
          onCommitRename={handleCommitRename}
          onCancelRename={() => setEditingId(null)}
        />
      )}
    />
  );
};

export default memo(ApplicationListPanel);
