/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import React, { memo, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Workflow, WorkflowList as WorkflowListType } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { trpcClient } from "../../trpc/client";
import RecentWorkflowCard from "./RecentWorkflowCard";
import WorkflowListView from "../workflows/WorkflowListView";
import WorkflowDeleteDialog from "../workflows/WorkflowDeleteDialog";
import { wrapStyles, SectionHeader, DashboardSearchBox } from "./dashboardChrome";

type ViewMode = "grid" | "list";

const styles = (theme: Theme) =>
  css({
    paddingTop: 38,
    paddingBottom: 8,
    ".viewtog": {
      display: "flex",
      gap: 2,
      background: theme.vars.palette.c_node_bg,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: 7,
      padding: 2
    },
    ".viewtog button": {
      width: 28,
      height: 26,
      display: "grid",
      placeItems: "center",
      color: theme.vars.palette.text.secondary,
      background: "transparent",
      border: "none",
      borderRadius: 5,
      cursor: "pointer",
      "&.on": {
        background: theme.vars.palette.c_node_bg_group,
        color: theme.vars.palette.text.primary
      }
    },
    ".rec-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 16,
      [theme.breakpoints.down("lg")]: {
        gridTemplateColumns: "repeat(3, 1fr)"
      },
      [theme.breakpoints.down("md")]: {
        gridTemplateColumns: "repeat(2, 1fr)"
      },
      [theme.breakpoints.down("sm")]: {
        gridTemplateColumns: "1fr"
      }
    },
    ".rec-new": {
      display: "flex",
      flexDirection: "column",
      gap: 10,
      textAlign: "left",
      background: "transparent",
      border: "none",
      padding: 0,
      cursor: "pointer"
    },
    ".rec-new-thumb": {
      aspectRatio: "4 / 3",
      borderRadius: "var(--rounded-xl)",
      border: `1px dashed ${theme.vars.palette.divider}`,
      display: "grid",
      placeItems: "center",
      transition: "border-color 0.18s ease"
    },
    ".rec-new:hover .rec-new-thumb": {
      borderColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.5)`
    },
    ".rec-new-icon": {
      width: 40,
      height: 40,
      borderRadius: 10,
      display: "grid",
      placeItems: "center",
      background: theme.vars.palette.c_node_bg,
      color: theme.vars.palette.primary.main
    },
    ".rec-new-label": {
      fontSize: 14,
      fontWeight: 500,
      color: theme.vars.palette.text.primary
    },
    ".rec-new-hint": {
      fontFamily: theme.fontFamily2,
      fontSize: 12,
      color: theme.vars.palette.text.disabled,
      marginTop: 2
    },
    ".rec-list": {
      height: 420,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "var(--rounded-lg)",
      padding: "6px 10px",
      background: `rgba(${theme.vars.palette.common.whiteChannel} / 0.012)`
    },
    ".rec-empty": {
      padding: "40px 0",
      textAlign: "center",
      color: theme.vars.palette.text.secondary,
      fontSize: 14
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const copyWorkflow = useWorkflowManager((state) => state.copy);
  const createWorkflow = useWorkflowManager((state) => state.create);

  const [view, setView] = useState<ViewMode>("grid");
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
      const request = await copyWorkflow(workflow);
      request.name = `${workflow.name} (copy)`.substring(0, 50);
      const created = await createWorkflow(request);
      navigate(`/editor/${created.id}`);
    },
    [copyWorkflow, createWorkflow, navigate]
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
        queryClient.setQueryData<WorkflowListType>(["workflows"], (old) =>
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
      }
    },
    [queryClient]
  );

  const noop = useCallback(() => {}, []);

  const countLabel = isLoading
    ? "my files"
    : `my files · ${workflows.length}`;

  return (
    <section css={styles(theme)}>
      <WorkflowDeleteDialog
        open={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        workflowsToDelete={workflowsToDelete}
      />
      <div css={wrapStyles(theme)}>
        <SectionHeader title="Recent workflows" count={countLabel}>
          <DashboardSearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search my files…"
            aria-label="Search workflows"
          />
          <div className="viewtog" role="group" aria-label="View mode">
            <button
              type="button"
              className={view === "list" ? "on" : ""}
              aria-label="List view"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 4h10M3 8h10M3 12h10" />
              </svg>
            </button>
            <button
              type="button"
              className={view === "grid" ? "on" : ""}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2.5" y="2.5" width="4.5" height="4.5" />
                <rect x="9" y="2.5" width="4.5" height="4.5" />
                <rect x="2.5" y="9" width="4.5" height="4.5" />
                <rect x="9" y="9" width="4.5" height="4.5" />
              </svg>
            </button>
          </div>
        </SectionHeader>

        {view === "grid" ? (
          <div className="rec-grid">
            <button type="button" className="rec-new" onClick={onCreateNew}>
              <div className="rec-new-thumb">
                <span className="rec-new-icon">
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M8 3v10M3 8h10" />
                  </svg>
                </span>
              </div>
              <div>
                <div className="rec-new-label">New workflow</div>
                <div className="rec-new-hint">Start from blank</div>
              </div>
            </button>
            {filtered.map((workflow) => (
              <RecentWorkflowCard
                key={workflow.id}
                workflow={workflow}
                onClick={handleOpen}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rec-empty">No workflows yet. Create one to get started.</div>
        ) : (
          <div className="rec-list">
            <WorkflowListView
              workflows={filtered}
              onOpenWorkflow={handleOpen}
              onDuplicateWorkflow={handleDuplicate}
              onDelete={handleDelete}
              onEdit={noop}
              onRename={handleRename}
              onSelect={noop}
              selectedWorkflows={[]}
              workflowCategory="user"
              showCheckboxes={false}
            />
          </div>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardWorkflows);
