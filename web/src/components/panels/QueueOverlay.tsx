/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, FlexColumn, FlexRow, Text, Tooltip } from "../ui_primitives";
import type { SxProps } from "@mui/material/styles";
import LayersIcon from "@mui/icons-material/Layers";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import ScheduleIcon from "@mui/icons-material/Schedule";
import RemoveIcon from "@mui/icons-material/Remove";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import CloseIcon from "@mui/icons-material/Close";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { useRunningJobs } from "../../hooks/useRunningJobs";
import { useWorkflow } from "../../serverState/useWorkflow";
import { trpcClient } from "../../trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { Job } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useWorkflowRunsStore from "../../stores/WorkflowRunsStore";

const RUNNING = new Set(["running", "suspended", "paused"]);
const QUEUED = new Set(["queued", "scheduled", "starting"]);

/** Elapsed clock "M:SS" since an ISO start time, empty when unknown. */
const formatClock = (startedAt: string | null | undefined, now: number) => {
  if (!startedAt) {
    return "";
  }
  const start = Date.parse(startedAt);
  if (isNaN(start)) {
    return "";
  }
  const total = Math.max(0, Math.floor((now - start) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const sweep = keyframes`
  0% { transform: translateX(-110%); }
  100% { transform: translateX(320%); }
`;

const panelEnter = keyframes`
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
`;

const panelExit = keyframes`
  from { opacity: 1; transform: translateY(0) scale(1); }
  to { opacity: 0; transform: translateY(-6px) scale(0.98); }
`;

const progressStyles = (theme: Theme) =>
  css({
    position: "relative",
    height: "4px",
    borderRadius: "var(--rounded-pill)",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.07)",
    "&::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      width: "35%",
      borderRadius: "inherit",
      background: `linear-gradient(90deg, ${theme.vars.palette.primary.main}, ${theme.vars.palette.secondary.main})`,
      animation: `${sweep} 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite`
    },
    "@media (prefers-reduced-motion: reduce)": {
      "&::after": { animation: "none", width: "100%", opacity: 0.5 }
    }
  });

/** Indeterminate gradient progress bar shown under a running job. */
const RunBar = memo(function RunBar() {
  const theme = useTheme();
  return <Box css={progressStyles(theme)} />;
});

/** Job title — the stored run name, falling back to the workflow name. */
const useJobName = (job: Job): string => {
  const { data: workflow } = useWorkflow(job.workflow_id);
  return job.name || workflow?.name || "Untitled";
};

const cardSx: SxProps<Theme> = {
  backgroundColor: "grey.800",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: "var(--rounded-lg)",
  px: 1.5,
  py: 1
};

const Dot = ({ color = "primary.main" }: { color?: string }) => (
  <Box
    sx={{
      width: 8,
      height: 8,
      flex: "0 0 auto",
      borderRadius: "var(--rounded-circle)",
      backgroundColor: color
    }}
  />
);

const IconButton = ({
  icon,
  label,
  onClick,
  hoverColor = "text.primary"
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  hoverColor?: string;
}) => (
  <Tooltip title={label}>
    <Box
      component="button"
      aria-label={label}
      onClick={onClick}
      sx={{
        display: "flex",
        flex: "0 0 auto",
        border: "none",
        background: "transparent",
        color: "text.secondary",
        cursor: "pointer",
        p: 0.25,
        borderRadius: "var(--rounded-sm)",
        "&:hover": { color: hoverColor }
      }}
    >
      {icon}
    </Box>
  </Tooltip>
);

const RunningCard = memo(function RunningCard({
  job,
  now,
  onCancel,
  isFocused,
  onFocus
}: {
  job: Job;
  now: number;
  onCancel: (id: string) => void;
  isFocused: boolean;
  onFocus?: () => void;
}) {
  const theme = useTheme();
  const name = useJobName(job);
  const elapsed = formatClock(job.started_at, now);

  const focusableSx: SxProps<Theme> = onFocus
    ? {
        cursor: "pointer",
        "&:hover": {
          borderColor: theme.vars.palette.primary.main,
          backgroundColor: "grey.900"
        }
      }
    : {};

  const focusedAccentSx: SxProps<Theme> = isFocused
    ? {
        borderColor: theme.vars.palette.primary.main,
        borderLeftWidth: "3px"
      }
    : {};

  const cardContent = (
    <Box
      sx={{
        ...cardSx,
        ...focusableSx,
        ...focusedAccentSx,
        transition: "border-color 120ms ease, background-color 120ms ease"
      }}
    >
      <FlexRow align="center" gap={1} sx={{ minWidth: 0 }}>
        <Dot color={isFocused ? "primary.main" : undefined} />
        <Text size="small" weight={500} truncate sx={{ flex: 1, minWidth: 0 }}>
          {name}
        </Text>
        {isFocused && (
          <FlexRow
            align="center"
            gap={0.4}
            sx={{ flex: "0 0 auto", color: "primary.main" }}
          >
            <VisibilityIcon sx={{ fontSize: 12 }} />
            <Text size="tiny" sx={{ color: "primary.main" }}>
              On canvas
            </Text>
          </FlexRow>
        )}
        {elapsed && !isFocused && (
          <Text size="tiny" color="secondary" family="secondary">
            {elapsed}
          </Text>
        )}
        <Box
          component="span"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <IconButton
            icon={<CloseIcon sx={{ fontSize: 15 }} />}
            label="Stop run"
            onClick={() => onCancel(job.id)}
            hoverColor="error.main"
          />
        </Box>
      </FlexRow>
      <Box sx={{ mt: 1 }}>
        <RunBar />
      </Box>
    </Box>
  );

  if (onFocus) {
    return (
      <Box
        role="button"
        tabIndex={0}
        aria-label="Show run on canvas"
        aria-pressed={isFocused}
        onClick={onFocus}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onFocus();
          }
        }}
        sx={{
          display: "block",
          width: "100%",
          padding: 0,
          textAlign: "left",
          outline: "none",
          "&:focus-visible": {
            outline: `2px solid ${theme.vars.palette.primary.main}`,
            outlineOffset: "2px",
            borderRadius: "var(--rounded-lg)"
          }
        }}
      >
        {cardContent}
      </Box>
    );
  }

  return cardContent;
});

const EnqueuedCard = memo(function EnqueuedCard({
  job,
  index,
  onCancel
}: {
  job: Job;
  index: number;
  onCancel: (id: string) => void;
}) {
  const name = useJobName(job);
  return (
    <Box sx={cardSx}>
      <FlexRow align="center" gap={1} sx={{ minWidth: 0 }}>
        <Text
          size="tiny"
          color="secondary"
          family="secondary"
          sx={{ flex: "0 0 auto" }}
        >
          #{index + 1}
        </Text>
        <Text size="small" truncate sx={{ flex: 1, minWidth: 0 }}>
          {name}
        </Text>
        <IconButton
          icon={<CloseIcon sx={{ fontSize: 15 }} />}
          label="Remove from queue"
          onClick={() => onCancel(job.id)}
          hoverColor="error.main"
        />
      </FlexRow>
    </Box>
  );
});

const CancelledCard = memo(function CancelledCard({ job }: { job: Job }) {
  const name = useJobName(job);
  return (
    <Box sx={{ ...cardSx, opacity: 0.55 }}>
      <FlexRow align="center" gap={1} sx={{ minWidth: 0 }}>
        <Dot color="grey.600" />
        <Text size="small" truncate sx={{ flex: 1, minWidth: 0 }}>
          {name}
        </Text>
        <Text size="tiny" color="secondary" family="secondary">
          Cancelled
        </Text>
      </FlexRow>
    </Box>
  );
});

const SectionLabel = ({ children }: { children: string }) => (
  <Text
    size="tinyer"
    color="secondary"
    weight={600}
    sx={{
      display: "block",
      px: 0.5,
      pt: 2,
      pb: 1,
      textTransform: "uppercase",
      letterSpacing: "0.07em"
    }}
  >
    {children}
  </Text>
);

const HeaderCount = ({
  icon,
  count
}: {
  icon: React.ReactNode;
  count: number;
}) => (
  <FlexRow align="center" gap={0.4} sx={{ color: "text.secondary" }}>
    {icon}
    <Text size="tiny" color="secondary" family="secondary">
      {count}
    </Text>
  </FlexRow>
);

const overlayStyles = (theme: Theme) =>
  css({
    position: "fixed",
    top: "104px",
    left: "92px",
    width: "304px",
    maxHeight: "calc(100vh - 160px)",
    display: "flex",
    flexDirection: "column",
    zIndex: theme.zIndex.drawer,
    backgroundColor: theme.vars.palette.grey[900],
    border: `1px solid ${theme.vars.palette.grey[800]}`,
    borderRadius: "var(--rounded-xl)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)",
    overflow: "hidden",
    transformOrigin: "top left",
    '&[data-state="open"]': {
      animation: `${panelEnter} 200ms cubic-bezier(0.16, 1, 0.3, 1) both`
    },
    '&[data-state="closed"]': {
      animation: `${panelExit} 160ms cubic-bezier(0.16, 1, 0.3, 1) both`
    },
    "@media (prefers-reduced-motion: reduce)": {
      animation: "none",
      opacity: 1,
      transform: "none"
    }
  });

const SingleName = memo(function SingleName({ job }: { job: Job }) {
  return <>{useJobName(job)}</>;
});

/**
 * Floating queue overlay for the node editor. Shows running and enqueued jobs
 * across all workflows; collapses to a compact summary bar. Hidden when nothing
 * is running or queued so it never clutters an idle canvas.
 */
const QueueOverlay = memo(function QueueOverlay() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { data: jobs } = useRunningJobs();
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const currentWorkflowId = useWorkflowManager((s) => s.currentWorkflowId);
  const focusedJob = useWorkflowRunsStore((s) =>
    currentWorkflowId ? s.focusedJob[currentWorkflowId] : undefined
  );

  const {
    running: liveRunning,
    queued: liveQueued,
    cancelled: liveCancelled
  } = useMemo(() => {
    const all = jobs ?? [];
    return {
      running: all.filter((j) => RUNNING.has(j.status ?? "")),
      queued: all.filter((j) => QUEUED.has(j.status ?? "")),
      cancelled: all.filter((j) => j.status === "cancelled")
    };
  }, [jobs]);

  // Visibility tracks active work only — cancelled jobs are shown as
  // supplementary detail but never keep the overlay open on an idle canvas.
  const hasJobs = liveRunning.length > 0 || liveQueued.length > 0;

  // Tick once a second only while something is running, to drive elapsed clocks.
  useEffect(() => {
    if (liveRunning.length === 0) {
      return;
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [liveRunning.length]);

  const handleCancel = useCallback(
    async (id: string) => {
      try {
        await trpcClient.jobs.cancel.mutate({ id });
      } catch (err) {
        console.error("Failed to cancel job:", err);
      } finally {
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
      }
    },
    [queryClient]
  );

  // Keep the panel mounted through the exit animation before unmounting.
  const [mounted, setMounted] = useState(hasJobs);
  useEffect(() => {
    if (hasJobs) {
      setMounted(true);
      return;
    }
    const id = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(id);
  }, [hasJobs]);

  // Freeze the last content so it fades out with the panel rather than emptying
  // first.
  const lastJobsRef = useRef({
    running: liveRunning,
    queued: liveQueued,
    cancelled: liveCancelled
  });
  if (hasJobs) {
    lastJobsRef.current = {
      running: liveRunning,
      queued: liveQueued,
      cancelled: liveCancelled
    };
  }
  const running = hasJobs ? liveRunning : lastJobsRef.current.running;
  const queued = hasJobs ? liveQueued : lastJobsRef.current.queued;
  const cancelled = hasJobs ? liveCancelled : lastJobsRef.current.cancelled;

  if (!mounted) {
    return null;
  }

  if (!expanded) {
    const single = running.length === 1 ? running[0] : null;
    return (
      <Box css={overlayStyles(theme)} data-state={hasJobs ? "open" : "closed"}>
        <FlexColumn gap={1} sx={{ p: 1.5 }}>
          <FlexRow align="center" gap={1} sx={{ minWidth: 0 }}>
            <Dot color={running.length ? "primary.main" : "grey.600"} />
            <Text
              size="small"
              weight={500}
              truncate
              sx={{ flex: 1, minWidth: 0 }}
            >
              {single ? (
                <SingleName job={single} />
              ) : running.length ? (
                `${running.length} jobs running`
              ) : (
                "Queue"
              )}
            </Text>
            {single && (
              <Text size="tiny" color="secondary" family="secondary">
                {formatClock(single.started_at, now)}
              </Text>
            )}
            <IconButton
              icon={<KeyboardArrowDownIcon sx={{ fontSize: 18 }} />}
              label="Expand queue"
              onClick={() => setExpanded(true)}
            />
          </FlexRow>
          {running.length > 0 && <RunBar />}
          {queued.length > 0 && (
            <FlexRow align="center" gap={0.5} sx={{ color: "text.secondary" }}>
              <ScheduleIcon sx={{ fontSize: 13 }} />
              <Text size="tiny" color="secondary">
                {queued.length} queued
              </Text>
            </FlexRow>
          )}
        </FlexColumn>
      </Box>
    );
  }

  return (
    <Box css={overlayStyles(theme)} data-state={hasJobs ? "open" : "closed"}>
      <FlexRow align="center" gap={1} sx={{ px: 2, py: 1.5, flex: "0 0 auto" }}>
        <LayersIcon sx={{ fontSize: 17, color: "text.secondary" }} />
        <Text size="normal" weight={600} sx={{ flex: 1 }}>
          Queue
        </Text>
        <FlexRow align="center" gap={1.25}>
          <HeaderCount
            icon={<PlayArrowOutlinedIcon sx={{ fontSize: 15 }} />}
            count={running.length}
          />
          <HeaderCount
            icon={<ScheduleIcon sx={{ fontSize: 14 }} />}
            count={queued.length}
          />
        </FlexRow>
        <IconButton
          icon={<RemoveIcon sx={{ fontSize: 16 }} />}
          label="Collapse queue"
          onClick={() => setExpanded(false)}
        />
      </FlexRow>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", px: 2, pb: 2 }}>
        {running.length > 0 && (
          <>
            <SectionLabel>Running</SectionLabel>
            <FlexColumn gap={1}>
              {running.map((job) => {
                const isCurrentWf =
                  currentWorkflowId !== null &&
                  currentWorkflowId !== undefined &&
                  job.workflow_id === currentWorkflowId;
                return (
                  <RunningCard
                    key={job.id}
                    job={job}
                    now={now}
                    onCancel={handleCancel}
                    isFocused={isCurrentWf && job.id === focusedJob}
                    onFocus={
                      isCurrentWf
                        ? () =>
                            useWorkflowRunsStore
                              .getState()
                              .setFocusedJob(currentWorkflowId!, job.id)
                        : undefined
                    }
                  />
                );
              })}
            </FlexColumn>
          </>
        )}
        {queued.length > 0 && (
          <>
            <SectionLabel>Enqueued</SectionLabel>
            <FlexColumn gap={1}>
              {queued.map((job, index) => (
                <EnqueuedCard
                  key={job.id}
                  job={job}
                  index={index}
                  onCancel={handleCancel}
                />
              ))}
            </FlexColumn>
          </>
        )}
        {cancelled.length > 0 && (
          <>
            <SectionLabel>Cancelled</SectionLabel>
            <FlexColumn gap={1}>
              {cancelled.map((job) => (
                <CancelledCard key={job.id} job={job} />
              ))}
            </FlexColumn>
          </>
        )}
      </Box>
    </Box>
  );
});

QueueOverlay.displayName = "QueueOverlay";

export default QueueOverlay;
