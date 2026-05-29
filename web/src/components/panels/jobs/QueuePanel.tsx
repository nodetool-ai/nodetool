/** @jsxImportSource @emotion/react */
import { useMemo, memo } from "react";
import { useRunningJobs } from "../../../hooks/useRunningJobs";
import { Job } from "../../../stores/ApiTypes";
import JobItem from "./JobItem";
import {
  LoadingSpinner,
  Text,
  FlexColumn,
  FlexRow,
  Box
} from "../../ui_primitives";

// Explicit lifecycle buckets; everything else (completed, failed, timed out)
// lands in the "Completed" column so no job is hidden.
const RUNNING = new Set(["running", "suspended", "paused"]);
const QUEUED = new Set(["queued", "scheduled", "starting"]);
const CANCELLED = new Set(["cancelled"]);

/**
 * One lifecycle column (Running / Queued / Completed): a labelled header with a
 * count and a vertically scrolling list of jobs.
 */
const JobColumn = memo(function JobColumn({
  title,
  jobs,
  emptyText,
  last
}: {
  title: string;
  jobs: Job[];
  emptyText: string;
  last?: boolean;
}) {
  return (
    <FlexColumn
      role="region"
      aria-label={title}
      sx={{
        flex: 1,
        minWidth: 0,
        height: "100%",
        borderRight: last ? 0 : 1,
        borderColor: "divider"
      }}
    >
      <FlexRow
        align="center"
        justify="space-between"
        gap={0.75}
        sx={{
          flex: "0 0 auto",
          px: 1.5,
          py: 1,
          borderBottom: 1,
          borderColor: "divider"
        }}
      >
        <Text
          size="tiny"
          weight={600}
          sx={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
        >
          {title}
        </Text>
        <Text size="tiny" color="secondary" family="secondary">
          {jobs.length}
        </Text>
      </FlexRow>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 0.5 }}>
        {jobs.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Text size="tiny" color="secondary">
              {emptyText}
            </Text>
          </Box>
        ) : (
          jobs.map((job) => <JobItem key={job.id} job={job} />)
        )}
      </Box>
    </FlexColumn>
  );
});

JobColumn.displayName = "JobColumn";

/**
 * Queue view — running, queued, and completed jobs across all workflows shown
 * as three lifecycle columns. The wide bottom panel makes the board layout
 * scan faster than a single status-mixed list.
 */
const QueuePanel = memo(function QueuePanel() {
  const { data: jobs, isLoading, error } = useRunningJobs();

  const { running, queued, cancelled, completed } = useMemo(() => {
    const all = jobs ?? [];
    const status = (j: Job) => j.status ?? "";
    return {
      running: all.filter((j) => RUNNING.has(status(j))),
      queued: all.filter((j) => QUEUED.has(status(j))),
      cancelled: all.filter((j) => CANCELLED.has(status(j))),
      completed: all.filter(
        (j) =>
          !RUNNING.has(status(j)) &&
          !QUEUED.has(status(j)) &&
          !CANCELLED.has(status(j))
      )
    };
  }, [jobs]);

  if (isLoading) {
    return (
      <FlexColumn
        align="center"
        justify="center"
        sx={{ flex: 1, minHeight: 0 }}
      >
        <LoadingSpinner size="small" />
      </FlexColumn>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Text size="small" color="error">
          Error loading jobs
        </Text>
      </Box>
    );
  }

  return (
    <FlexRow sx={{ flex: 1, minHeight: 0, height: "100%" }}>
      <JobColumn title="Running" jobs={running} emptyText="Nothing running" />
      <JobColumn title="Queued" jobs={queued} emptyText="Queue is empty" />
      <JobColumn
        title="Completed"
        jobs={completed}
        emptyText="No completed jobs"
      />
      <JobColumn
        title="Cancelled"
        jobs={cancelled}
        emptyText="Nothing cancelled"
        last
      />
    </FlexRow>
  );
});

QueuePanel.displayName = "QueuePanel";

export default QueuePanel;
