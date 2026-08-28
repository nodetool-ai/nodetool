/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import React, { memo, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { workflowListQueryKey } from "../../serverState/workflowQueryKeys";
import { DASHBOARD_WORKFLOW_LIMIT } from "../../hooks/useDashboardData";
import { Workflow, WorkflowList as WorkflowListType } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient } from "../../trpc/client";
import {
  EmptyState,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import WorkflowListView from "../workflows/WorkflowListView";
import WorkflowDeleteDialog from "../workflows/WorkflowDeleteDialog";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import ContextMenus from "../context_menus/ContextMenus";
import {
  useSectionWrap,
  SectionHeader,
  DashboardSearchBox,
  SectionLink
} from "./dashboardChrome";

/** The dashboard never selects rows; a fresh `[]` would defeat the list's memo. */
const EMPTY_SELECTION: string[] = [];

/** Cap on the scrolling list; the rows inside it are virtualized. */
const MAX_LIST_HEIGHT = 420;
/** WorkflowListView's row height, and room for a date header plus padding. */
const ROW_HEIGHT = 28;
const LIST_CHROME = 40;

const styles = (theme: Theme) =>
  css({
    paddingTop: getSpacingPx(SPACING.md),
    ".rec-list": {
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.lg,
      background: theme.vars.palette.c_node_bg,
      padding: getSpacingPx(SPACING.sm)
    },
    // The list view is shared with the editor panel, where names are bold.
    // On the dashboard they sit next to the document and template lists, so
    // they carry the same weight those rows do.
    ".rec-list .name": {
      fontWeight: 400
    }
  });

interface DashboardWorkflowsProps {
  workflows: Workflow[];
  isLoading: boolean;
  onOpenWorkflow: (workflowId: string) => void;
  onCreateNew: () => void;
}

const DashboardWorkflows: React.FC<DashboardWorkflowsProps> = ({
  workflows,
  isLoading,
  onOpenWorkflow,
  onCreateNew
}) => {
  const theme = useTheme();
  const sectionWrap = useSectionWrap();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const copyWorkflow = useWorkflowManager((state) => state.copy);
  const createWorkflow = useWorkflowManager((state) => state.create);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const [query, setQuery] = useState("");
  const [workflowsToDelete, setWorkflowsToDelete] = useState<Workflow[]>([]);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workflows;
    return workflows.filter((w) => w.name.toLowerCase().includes(q));
  }, [workflows, query]);

  const handleOpen = useCallback(
    (workflow: Workflow) => onOpenWorkflow(workflow.id),
    [onOpenWorkflow]
  );

  const handleDuplicate = useCallback(
    async (event: React.MouseEvent, workflow: Workflow) => {
      event.stopPropagation();
      try {
        const request = await copyWorkflow(workflow);
        request.name = `${workflow.name} (copy)`.substring(0, 50);
        const created = await createWorkflow(request);
        navigate(`/editor/${created.id}`);
      } catch (err) {
        console.error("Failed to duplicate workflow:", err);
        addNotification({
          type: "error",
          alert: true,
          content: `Failed to duplicate "${workflow.name}".`
        });
      }
    },
    [copyWorkflow, createWorkflow, navigate, addNotification]
  );

  const handleDelete = useCallback((workflow: Workflow) => {
    setWorkflowsToDelete([workflow]);
    setIsDeleteOpen(true);
  }, []);

  const handleRename = useCallback(
    async (workflow: Workflow, newName: string) => {
      try {
        await trpcClient.workflows.update.mutate({
          id: workflow.id,
          name: newName
        });
        queryClient.setQueryData<WorkflowListType>(
          workflowListQueryKey(DASHBOARD_WORKFLOW_LIMIT),
          (old) =>
            old
              ? {
                  ...old,
                  workflows: old.workflows.map((w) =>
                    w.id === workflow.id ? { ...w, name: newName } : w
                  )
                }
              : old
        );
      } catch (err) {
        console.error("Failed to rename workflow:", err);
        addNotification({
          type: "error",
          alert: true,
          content: `Failed to rename "${workflow.name}".`
        });
      }
    },
    [queryClient, addNotification]
  );

  const noop = useCallback(() => {}, []);

  const hasQuery = query.trim().length > 0;
  const noMatches = !isLoading && hasQuery && filtered.length === 0;
  const isEmpty = !isLoading && workflows.length === 0;

  const countLabel = isLoading
    ? undefined
    : hasQuery
      ? `${filtered.length} of ${workflows.length}`
      : `${workflows.length}`;

  return (
    <section css={styles(theme)}>
      <WorkflowDeleteDialog
        open={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        workflowsToDelete={workflowsToDelete}
      />
      <div css={sectionWrap}>
        <SectionHeader title="Recent workflows" count={countLabel}>
          <DashboardSearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search workflows…"
            aria-label="Search workflows"
          />
          <SectionLink onClick={onCreateNew}>New workflow</SectionLink>
        </SectionHeader>

        {noMatches ? (
          <EmptyState
            variant="no-results"
            size="small"
            title="No matching workflows"
            description={`No workflows match “${query.trim()}”.`}
            actionText="Clear search"
            onAction={() => setQuery("")}
          />
        ) : isEmpty ? (
          <EmptyState
            title="No workflows yet"
            description="Create your first workflow to get started."
            actionText="New workflow"
            onAction={onCreateNew}
          />
        ) : (
          // WorkflowListItem opens the workflow context menu on right-click,
          // and the dashboard sits outside the editor panels that provide it.
          <ContextMenuProvider>
            <ContextMenus />
            <div
              className="rec-list"
              // Short lists should not leave a tall empty box; the cap keeps a
              // long one from pushing the sections below it off screen.
              style={{
                height: Math.min(
                  MAX_LIST_HEIGHT,
                  filtered.length * ROW_HEIGHT + LIST_CHROME
                )
              }}
            >
              <WorkflowListView
                workflows={filtered}
                onOpenWorkflow={handleOpen}
                onDuplicateWorkflow={handleDuplicate}
                onDelete={handleDelete}
                onEdit={noop}
                onRename={handleRename}
                onSelect={noop}
                selectedWorkflows={EMPTY_SELECTION}
                workflowCategory="user"
                showCheckboxes={false}
              />
            </div>
          </ContextMenuProvider>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardWorkflows);
