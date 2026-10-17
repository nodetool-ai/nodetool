/** @jsxImportSource @emotion/react */
import { useMemo, useState, memo } from "react";
import { useRunningJobs } from "../../../hooks/useRunningJobs";
import { Job } from "../../../stores/ApiTypes";
import JobItem from "./JobItem";
import {
  AutoGrid,
  Box,
  Chip,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ScrollArea,
  SectionHeader,
  SPACING,
  Text
} from "../../ui_primitives";
import { groupByDate } from "../../../utils/groupByDate";

const RUNNING = new Set(["running"]);
const QUEUED = new Set(["queued", "scheduled", "starting"]);
const CANCELLED = new Set(["cancelled"]);

/** Narrowest job row before the grid drops a column. */
const ROW_MIN_WIDTH = 400;

export type HistoryFilter = "all" | "failed" | "completed" | "cancelled";

const FILTERS: {
  id: HistoryFilter;
  label: string;
  color?: "error";
}[] = [
  { id: "all", label: "All" },
  { id: "failed", label: "Failed", color: "error" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" }
];

const isFailed = (job: Job): boolean =>
  job.status === "failed" || job.status === "timed_out" || !!job.error;

/** Which history filter a finished job belongs to (besides "all"). */
const historyBucket = (job: Job): Exclude<HistoryFilter, "all"> => {
  if (CANCELLED.has(job.status ?? "")) {
    return "cancelled";
  }
  return isFailed(job) ? "failed" : "completed";
};

const jobTime = (job: Job): number => {
  const iso = job.finished_at || job.started_at;
  const time = iso ? new Date(iso).getTime() : NaN;
  return isNaN(time) ? 0 : time;
};

/** Finished jobs, newest first, split into day groups ("Today", "Yesterday"). */
const groupByDay = (jobs: Job[]): { label: string; jobs: Job[] }[] => {
  const sorted = [...jobs].sort((a, b) => jobTime(b) - jobTime(a));
  const groups: { label: string; jobs: Job[] }[] = [];
  for (const job of sorted) {
    const time = jobTime(job);
    const label = time ? groupByDate(new Date(time)) : "Earlier";
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.jobs.push(job);
    } else {
      groups.push({ label, jobs: [job] });
    }
  }
  return groups;
};

const JobGrid = memo(function JobGrid({
  jobs,
  label
}: {
  jobs: Job[];
  label: string;
}) {
  return (
    <AutoGrid
      minItemWidth={ROW_MIN_WIDTH}
      gap={SPACING.xs}
      role="list"
      aria-label={label}
    >
      {jobs.map((job) => (
        <Box key={job.id} role="listitem" sx={{ minWidth: 0 }}>
          <JobItem job={job} />
        </Box>
      ))}
    </AutoGrid>
  );
});

/**
 * Queue view. Running and queued jobs sit pinned at the top so live work is
 * never more than a glance away. Finished jobs fill the rest as a history
 * grouped by day, with filter chips that pull failed runs out of the list.
 */
const QueuePanel = memo(function QueuePanel() {
  const { data: jobs, isLoading, error } = useRunningJobs();
  const [filter, setFilter] = useState<HistoryFilter>("all");

  const { running, queued, history, counts } = useMemo(() => {
    const running: Job[] = [];
    const queued: Job[] = [];
    const history: Job[] = [];
    const counts: Record<HistoryFilter, number> = {
      all: 0,
      failed: 0,
      completed: 0,
      cancelled: 0
    };

    for (const job of jobs ?? []) {
      const status = job.status ?? "";
      if (RUNNING.has(status)) {
        running.push(job);
      } else if (QUEUED.has(status)) {
        queued.push(job);
      } else {
        history.push(job);
        counts.all += 1;
        counts[historyBucket(job)] += 1;
      }
    }

    return { running, queued, history, counts };
  }, [jobs]);

  // A filter whose last job left the list falls back to everything.
  const activeFilter = counts[filter] > 0 ? filter : "all";

  const groups = useMemo(
    () =>
      groupByDay(
        activeFilter === "all"
          ? history
          : history.filter((job) => historyBucket(job) === activeFilter)
      ),
    [history, activeFilter]
  );

  if (isLoading) {
    return (
      <FlexColumn align="center" justify="center" sx={{ flex: 1, minHeight: 0 }}>
        <LoadingSpinner size="small" />
      </FlexColumn>
    );
  }

  if (error) {
    return (
      <EmptyState
        size="small"
        variant="error"
        title="Could not load jobs"
      />
    );
  }

  const active = [...running, ...queued];
  const activeSummary = [
    running.length > 0 ? `${running.length} running` : null,
    queued.length > 0 ? `${queued.length} queued` : null
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <FlexColumn sx={{ flex: 1, minHeight: 0, height: "100%" }}>
      <FlexColumn
        component="section"
        aria-label="Active"
        sx={{
          flex: "0 0 auto",
          maxHeight: "45%",
          minHeight: 0,
          pb: SPACING.md,
          borderBottom: 1,
          borderColor: "divider"
        }}
      >
        <SectionHeader
          size="small"
          title="Active"
          action={
            activeSummary ? (
              <Text size="smaller" color="secondary">
                {activeSummary}
              </Text>
            ) : undefined
          }
        />
        {active.length === 0 ? (
          <EmptyState
            size="small"
            title="Nothing running or queued"
            description="Runs show up here while they work."
          />
        ) : (
          <ScrollArea sx={{ minHeight: 0 }}>
            <JobGrid jobs={active} label="Active jobs" />
          </ScrollArea>
        )}
      </FlexColumn>

      <FlexColumn
        component="section"
        aria-label="History"
        sx={{ flex: 1, minHeight: 0 }}
      >
        <SectionHeader
          size="small"
          title="History"
          action={
            counts.all > 0 ? (
              <FlexRow
                gap={SPACING.xs}
                role="group"
                aria-label="Filter history"
              >
                {FILTERS.filter(
                  (f) => f.id === "all" || counts[f.id] > 0
                ).map((f) => (
                  <Chip
                    key={f.id}
                    compact
                    color={f.color}
                    active={activeFilter === f.id}
                    label={`${f.label} ${counts[f.id]}`}
                    onClick={() => setFilter(f.id)}
                  />
                ))}
              </FlexRow>
            ) : undefined
          }
        />
        <ScrollArea sx={{ flex: 1, minHeight: 0, pb: SPACING.md }}>
          {groups.length === 0 ? (
            <EmptyState
              size="small"
              title="No finished runs yet"
              description="Completed, failed and cancelled runs are listed here."
            />
          ) : (
            <FlexColumn gap={SPACING.md}>
              {groups.map((group) => (
                <FlexColumn key={group.label} gap={SPACING.xs}>
                  <Text size="smaller" color="secondary">
                    {group.label}
                  </Text>
                  <JobGrid jobs={group.jobs} label={group.label} />
                </FlexColumn>
              ))}
            </FlexColumn>
          )}
        </ScrollArea>
      </FlexColumn>
    </FlexColumn>
  );
});

QueuePanel.displayName = "QueuePanel";

export default QueuePanel;
