/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useMemo } from "react";
import { Job, Workflow } from "../../stores/ApiTypes";
import { useRunningJobs } from "../../hooks/useRunningJobs";
import { BORDER_RADIUS, MOTION, SPACING, getSpacingPx } from "../ui_primitives";
import { shortAgo, toneFor } from "./runStatus";

const MAX_RUNS = 6;

const styles = (theme: Theme) =>
  css({
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.lg,
    background: theme.vars.palette.c_node_bg,
    padding: getSpacingPx(SPACING.lg),

    ".act-head": {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: getSpacingPx(SPACING.sm),
      marginBottom: getSpacingPx(SPACING.md)
    },
    ".act-title": {
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 500,
      color: theme.vars.palette.text.primary
    },
    ".act-count": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled
    },
    ".act-list": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.micro)
    },
    ".act-run": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
      width: "100%",
      textAlign: "left",
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.sm)}`,
      background: "transparent",
      border: "none",
      borderRadius: BORDER_RADIUS.sm,
      cursor: "pointer",
      transition: `background ${MOTION.fast}`,
      "&:hover": { background: theme.vars.palette.action.hover }
    },
    ".act-dot": {
      width: 7,
      height: 7,
      flexShrink: 0,
      borderRadius: BORDER_RADIUS.circle,
      background: theme.vars.palette.text.disabled,
      "&.running": { background: theme.vars.palette.primary.main },
      "&.failed": { background: theme.vars.palette.error.main },
      "&.done": { background: theme.vars.palette.success.main }
    },
    ".act-name": {
      flex: 1,
      minWidth: 0,
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".act-when": {
      flexShrink: 0,
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled
    },
    ".act-empty": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.disabled,
      lineHeight: 1.5
    }
  });

interface DashboardActivityProps {
  workflows: Workflow[];
  onOpenWorkflow: (workflowId: string) => void;
}

/**
 * Recent tasks, in the dashboard's right rail. An agent tool whose dashboard
 * says nothing about what ran, or what broke, is missing the one thing only it
 * can show.
 */
const DashboardActivity: React.FC<DashboardActivityProps> = ({
  workflows,
  onOpenWorkflow
}) => {
  const theme = useTheme();
  const { data: jobs } = useRunningJobs();

  const namesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const workflow of workflows) {
      map.set(workflow.id, workflow.name);
    }
    return map;
  }, [workflows]);

  const runs = useMemo(() => {
    const all: Job[] = jobs ?? [];
    return [...all]
      .sort((a, b) =>
        (b.started_at ?? "").localeCompare(a.started_at ?? "")
      )
      .slice(0, MAX_RUNS);
  }, [jobs]);

  const runningCount = runs.filter(
    (job) => toneFor(job.status) === "running"
  ).length;

  return (
    <section css={styles(theme)} aria-label="Task activity">
      <div className="act-head">
        <span className="act-title">Task activity</span>
        {runningCount > 0 && (
          <span className="act-count">{runningCount} running</span>
        )}
      </div>

      {runs.length === 0 ? (
        <p className="act-empty">
          Nothing has run yet. Ask the agent for something, or run a workflow —
          every task lands here.
        </p>
      ) : (
        <div className="act-list">
          {runs.map((job) => {
            const tone = toneFor(job.status);
            const name =
              job.name || namesById.get(job.workflow_id) || "Workflow";
            return (
              <button
                key={job.id}
                type="button"
                className="act-run"
                onClick={() => onOpenWorkflow(job.workflow_id)}
                title={job.error ?? undefined}
              >
                <span className={`act-dot ${tone}`} />
                <span className="act-name">{name}</span>
                <span className="act-when">
                  {shortAgo(job.finished_at ?? job.started_at)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default memo(DashboardActivity);
