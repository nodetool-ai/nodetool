/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
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
import type { FocusEvent, KeyboardEvent, MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  useApplications,
  useCreateApplication,
  useDeleteApplication,
  useUpdateApplication
} from "../../hooks/useApplications";
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
import {
  Dialog,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Text,
  ToolbarIconButton,
  TruncatedText,
  Tooltip,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  getSpacingPx
} from "../ui_primitives";

const UNTITLED = "Untitled app";

const styles = (theme: Theme) =>
  css({
    height: "100%",
    minHeight: 0,
    ".application-search": {
      paddingBottom: theme.spacing(1)
    },
    ".application-list": {
      minHeight: 0,
      overflowY: "auto",
      paddingRight: theme.spacing(0.5)
    },
    ".application-item": {
      width: "100%",
      border: 0,
      borderRadius: theme.rounded.md,
      backgroundColor: "transparent",
      color: theme.vars.palette.text.primary,
      cursor: "pointer",
      padding: theme.spacing(1),
      textAlign: "left",
      transition: `background-color ${MOTION.fast}, color ${MOTION.fast}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: -2
      },
      "&.active": {
        backgroundColor: theme.vars.palette.action.selected
      }
    },
    ".application-icon": {
      flexShrink: 0,
      color: theme.vars.palette.text.secondary,
      fontSize: 20
    },
    ".rename-input": {
      width: "100%",
      background: "transparent",
      border: `1px solid ${theme.vars.palette.primary.main}`,
      borderRadius: theme.rounded.sm,
      color: "inherit",
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 600,
      outline: "none"
    },
    ".date-header-row": {
      width: "100%",
      padding: `0 ${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xs)} 0`,
      display: "flex",
      alignItems: "flex-end",
      borderBottom: "1px solid var(--palette-divider)"
    },
    ".date-header": {
      fontSize: theme.fontSizeSmaller,
      flexShrink: 0,
      padding: 0,
      lineHeight: 1.1,
      width: "100%",
      textAlign: "right",
      letterSpacing: "0.02em",
      textTransform: "uppercase",
      whiteSpace: "nowrap"
    }
  });

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

interface ApplicationListItemProps {
  id: string;
  name: string;
  operationCount: number;
  active: boolean;
  editing: boolean;
  onOpen: (id: string, name: string) => void;
  onContextMenu: (
    event: MouseEvent<HTMLButtonElement>,
    id: string,
    name: string
  ) => void;
  onCommitRename: (id: string, newName: string) => void;
  onCancelRename: () => void;
}

const ApplicationListItem = memo(function ApplicationListItem({
  id,
  name,
  operationCount,
  active,
  editing,
  onOpen,
  onContextMenu,
  onCommitRename,
  onCancelRename
}: ApplicationListItemProps) {
  const handleClick = useCallback(() => onOpen(id, name), [id, name, onOpen]);
  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => onContextMenu(event, id, name),
    [id, name, onContextMenu]
  );
  const handleRenameKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        onCommitRename(id, event.currentTarget.value);
      } else if (event.key === "Escape") {
        onCancelRename();
      }
    },
    [id, onCommitRename, onCancelRename]
  );
  const handleRenameBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      onCommitRename(id, event.currentTarget.value);
    },
    [id, onCommitRename]
  );
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen(id, name);
      }
    },
    [id, name, onOpen]
  );

  if (editing) {
    return (
      <div className={`application-item ${active ? "active" : ""}`}>
        <FlexRow align="center" gap={1} fullWidth>
          <DashboardCustomizeOutlinedIcon className="application-icon" />
          <FlexColumn gap={0.5} sx={{ minWidth: 0, flex: 1 }}>
            <input
              className="rename-input"
              type="text"
              defaultValue={name}
              aria-label="App name"
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRenameBlur}
            />
          </FlexColumn>
        </FlexRow>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`application-item ${active ? "active" : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      aria-current={active ? "page" : undefined}
    >
      <FlexRow align="center" gap={1} fullWidth>
        <DashboardCustomizeOutlinedIcon className="application-icon" />
        <FlexColumn gap={0.5} sx={{ minWidth: 0, flex: 1 }}>
          <TruncatedText
            component="span"
            sx={{ fontSize: "var(--fontSizeSmall)", fontWeight: 600 }}
          >
            {name || UNTITLED}
          </TruncatedText>
          <Text size="small" color="secondary">
            {operationCount === 1 ? "1 operation" : `${operationCount} operations`}
          </Text>
        </FlexColumn>
      </FlexRow>
    </button>
  );
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
 * Creates an app from a workflow's legacy `app_doc`, binding that workflow as
 * the app's first operation.
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
        <Tooltip title="New app from workflow" placement="right-start">
          <ToolbarIconButton
            ariaLabel="New app from workflow"
            onClick={() => setOpen(true)}
            tabIndex={-1}
            icon={<AccountTreeOutlinedIcon />}
          />
        </Tooltip>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="New app from workflow"
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

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

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
      if (trimmed && current && trimmed !== current.name) {
        updateApplication.mutate({ id, name: trimmed });
      }
    },
    [data, updateApplication]
  );

  const handleRequestDelete = useCallback((item: SidebarDocumentItem) => {
    setItemToDelete(item);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (itemToDelete) {
      deleteApplication.mutate({ id: itemToDelete.id });
    }
  }, [itemToDelete, deleteApplication]);

  useEffect(() => {
    setActions({
      onRename: (item) => setEditingId(item.id),
      onDelete: handleRequestDelete
    });
    return () => clearActions();
  }, [setActions, clearActions, handleRequestDelete]);

  return (
    <FlexColumn fullHeight fullWidth gap={0} css={styles(theme)}>
      <ConfirmDialog
        open={itemToDelete !== null}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete app"
        content={`Delete "${itemToDelete?.name ?? ""}"? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
      />
      <div className="application-search">
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
                : "Create an app with the + button above, or build one from a workflow."
            }
          />
        </FlexColumn>
      ) : (
        <FlexColumn className="application-list" gap={0.5}>
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
                  <ApplicationListItem
                    id={app.id}
                    name={app.name}
                    operationCount={app.operationCount}
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
