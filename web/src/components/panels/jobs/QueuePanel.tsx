/** @jsxImportSource @emotion/react */
import { useMemo, useState, memo } from "react";
import { List, ListItem } from "@mui/material";
import { useRunningJobs } from "../../../hooks/useRunningJobs";
import { Job } from "../../../stores/ApiTypes";
import { groupByDate } from "../../../utils/groupByDate";
import JobItem from "./JobItem";
import {
  LoadingSpinner,
  Text,
  FlexColumn,
  Box,
  TabGroup
} from "../../ui_primitives";

type QueueFilter = "all" | "running" | "queued";

const QUEUE_TABS = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "queued", label: "Queued" }
];

const isRunning = (job: Job): boolean =>
  job.status === "running" || job.status === "starting";
const isQueued = (job: Job): boolean => job.status === "queued";

const matchesFilter = (job: Job, filter: QueueFilter): boolean => {
  if (filter === "running") {
    return isRunning(job);
  }
  if (filter === "queued") {
    return isQueued(job);
  }
  return true;
};

const QueueGroupHeader = memo(function QueueGroupHeader({
  label
}: {
  label: string;
}) {
  return (
    <ListItem sx={{ pt: 1, pb: 0.5, px: 2 }}>
      <Text
        size="tiny"
        color="secondary"
        weight={600}
        sx={{
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          width: "100%",
          textAlign: "right",
          borderBottom: 1,
          borderColor: "divider",
          pb: 0.5
        }}
      >
        {label}
      </Text>
    </ListItem>
  );
});

QueueGroupHeader.displayName = "QueueGroupHeader";

/**
 * Ordered list of jobs grouped by date. Running/queued jobs (no finish time)
 * sort to the top; the rest sort by start time descending.
 */
const QueueListContent = ({ jobs }: { jobs: Job[] }) => {
  const items = useMemo(() => {
    const sorted = [...jobs].sort((a, b) => {
      const aActive = isRunning(a) || isQueued(a);
      const bActive = isRunning(b) || isQueued(b);
      if (aActive !== bActive) {
        return aActive ? -1 : 1;
      }
      const dateA = a.started_at ? new Date(a.started_at).getTime() : 0;
      const dateB = b.started_at ? new Date(b.started_at).getTime() : 0;
      return dateB - dateA;
    });

    const result: React.ReactNode[] = [];
    let currentGroup = "";
    sorted.forEach((job) => {
      const group = groupByDate(job.started_at || new Date().toISOString());
      if (group !== currentGroup) {
        currentGroup = group;
        result.push(<QueueGroupHeader key={`header-${group}`} label={group} />);
      }
      result.push(<JobItem key={job.id} job={job} />);
    });
    return result;
  }, [jobs]);

  return <>{items}</>;
};

/**
 * Queue side view — lists running and queued jobs across all workflows with
 * per-job status, duration, error, and cancel. Reuses the jobs query + JobItem
 * row; adds All / Running / Queued tabs for filtering.
 */
const QueuePanel = memo(function QueuePanel() {
  const { data: jobs, isLoading, error } = useRunningJobs();
  const [filter, setFilter] = useState<QueueFilter>("all");

  const counts = useMemo(() => {
    const all = jobs ?? [];
    return {
      running: all.filter(isRunning).length,
      queued: all.filter(isQueued).length
    };
  }, [jobs]);

  const filtered = useMemo(
    () => (jobs ?? []).filter((job) => matchesFilter(job, filter)),
    [jobs, filter]
  );

  return (
    <FlexColumn sx={{ height: "100%", minHeight: 0 }}>
      <Box sx={{ px: 1, pt: 0.5 }}>
        <TabGroup
          tabs={QUEUE_TABS}
          value={filter}
          onChange={(value) => setFilter(value as QueueFilter)}
          size="small"
          aria-label="Queue filter"
        />
        <Text size="tiny" color="secondary" sx={{ px: 1, pb: 0.5 }}>
          {counts.running} running · {counts.queued} queued
        </Text>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {isLoading ? (
          <FlexColumn align="center" padding={2}>
            <LoadingSpinner size="small" />
          </FlexColumn>
        ) : error ? (
          <Box sx={{ p: 2 }}>
            <Text size="small" color="error">
              Error loading jobs
            </Text>
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ p: 5 }}>
            <Text size="small" color="secondary">
              {filter === "all"
                ? "No jobs in the queue"
                : `No ${filter} jobs`}
            </Text>
          </Box>
        ) : (
          <List sx={{ px: 0 }}>
            <QueueListContent jobs={filtered} />
          </List>
        )}
      </Box>
    </FlexColumn>
  );
});

QueuePanel.displayName = "QueuePanel";

export default QueuePanel;
