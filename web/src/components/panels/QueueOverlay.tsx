/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { useTranslation } from "react-i18next";
import { useTheme, type Theme } from "@mui/material/styles";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  FlexColumn,
  FlexRow,
  PanelHeader,
  SectionHeader,
  ProgressBar,
  Text,
  ToolbarIconButton,
  MOTION,
  reducedMotion,
  BORDER_RADIUS,
  StatusDot,
  SPACING,
  getSpacingPx,
  ICON_SIZE,
  CloseButton
} from "../ui_primitives";
import type { SxProps } from "@mui/material/styles";
import LayersIcon from "@mui/icons-material/Layers";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import ScheduleIcon from "@mui/icons-material/Schedule";
import RemoveIcon from "@mui/icons-material/Remove";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { useRunningJobs } from "../../hooks/useRunningJobs";
import { useWorkflow } from "../../serverState/useWorkflow";
import { trpcClient } from "../../trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { Job } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useWorkflowRunsStore from "../../stores/WorkflowRunsStore";
import { notifyMutationError } from "../../utils/notifyMutationError";

const RUNNING = new Set(["running"]);
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

const panelEnter = keyframes`
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
`;

const panelExit = keyframes`
  from { opacity: 1; transform: translateY(0) scale(1); }
  to { opacity: 0; transform: translateY(-6px) scale(0.98); }
`;

/** Indeterminate progress bar shown under a running job. */
const RunBar = memo(function RunBar() {
  const { t } = useTranslation();
  return (
    <ProgressBar
      value={0}
      progressVariant="indeterminate"
      showValue={false}
      size="small"
      aria-label={t("i18n-cont-panels-12.queue.running")}
    />
  );
});

/** Job title — the stored run name, falling back to the workflow name. */
const useJobName = (job: Job): string => {
  const { t } = useTranslation();
  const { data: workflow } = useWorkflow(job.workflow_id);
  return job.name || workflow?.name || t("i18n-cont-panels-12.queue.untitled");
};

const cardSx: SxProps<Theme> = {
  backgroundColor: "grey.800",
  border: "1px solid var(--palette-c_overlay)",
  borderRadius: BORDER_RADIUS.lg,
  px: 1.5,
  py: 1
};

const RunningCard = memo(function RunningCard({
  job,
  now,
  onCancel,
  isFocused,
  onFocusJob
}: {
  job: Job;
  now: number;
  onCancel: (id: string) => void;
  isFocused: boolean;
  onFocusJob?: (jobId: string) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const name = useJobName(job);
  const elapsed = formatClock(job.started_at, now);
  const handleFocus = useCallback(() => onFocusJob?.(job.id), [onFocusJob, job.id]);

  const focusableSx: SxProps<Theme> = onFocusJob
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
        transition: `border-color ${MOTION.fast}, background-color ${MOTION.fast}`
      }}
    >
      <FlexRow align="center" gap={1} sx={{ minWidth: 0 }}>
        <StatusDot tone="primary" size="medium" />
        <Text size="small" weight={500} truncate sx={{ flex: 1, minWidth: 0 }}>
          {name}
        </Text>
        {isFocused && (
          <FlexRow
            align="center"
            gap={0.4}
            sx={{ flex: "0 0 auto", color: "primary.main" }}
          >
            <VisibilityIcon sx={{ fontSize: ICON_SIZE.xs }} />
            <Text size="smaller" sx={{ color: "primary.main" }}>
              {t("i18n-cont-panels-12.queue.onCanvas")}
            </Text>
          </FlexRow>
        )}
        {elapsed && !isFocused && (
          <Text size="smaller" color="secondary" family="secondary">{elapsed}</Text>
        )}
        <Box
          component="span"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <CloseButton
            tooltip={t("i18n-cont-panels-12.queue.stopRun")}
            onClick={() => onCancel(job.id)}
            nodrag={false}
          />
        </Box>
      </FlexRow>
      <Box sx={{ mt: 1 }}>
        <RunBar />
      </Box>
    </Box>
  );

  if (onFocusJob) {
    return (
      <Box
        role="button"
        tabIndex={0}
        aria-label={t("i18n-cont-panels-12.queue.showRunOnCanvas")}
        aria-pressed={isFocused}
        onClick={handleFocus}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleFocus();
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
            borderRadius: BORDER_RADIUS.lg
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
  const { t } = useTranslation();
  const name = useJobName(job);
  return (
    <Box sx={cardSx}>
      <FlexRow align="center" gap={1} sx={{ minWidth: 0 }}>
        <Text size="smaller" color="secondary"
        family="secondary"
        sx={{ flex: "0 0 auto" }}>
          #{index + 1}</Text>
        <Text size="small" truncate sx={{ flex: 1, minWidth: 0 }}>
          {name}
        </Text>
        <CloseButton
          tooltip={t("i18n-cont-panels-12.queue.removeFromQueue")}
          onClick={() => onCancel(job.id)}
          nodrag={false}
        />
      </FlexRow>
    </Box>
  );
});

const CancelledCard = memo(function CancelledCard({ job }: { job: Job }) {
  const { t } = useTranslation();
  const name = useJobName(job);
  return (
    <Box sx={{ ...cardSx, opacity: 0.55 }}>
      <FlexRow align="center" gap={1} sx={{ minWidth: 0 }}>
        <StatusDot tone="neutral" size="medium" />
        <Text size="small" truncate sx={{ flex: 1, minWidth: 0 }}>
          {name}
        </Text>
        <Text size="smaller" color="secondary" family="secondary">
          {t("i18n-cont-panels-12.queue.cancelled")}
        </Text>
      </FlexRow>
    </Box>
  );
});

const SectionLabel = ({ children }: { children: string }) => (
  <SectionHeader
    title={children}
    size="small"
    sx={{ px: SPACING.micro, pt: SPACING.md, pb: SPACING.xs }}
  />
);

const HEADER_COUNT_ICON_SX = { fontSize: "var(--fontSizeSmall)" };

const HeaderCount = ({
  icon,
  count
}: {
  icon: React.ReactNode;
  count: number;
}) => (
  <FlexRow align="center" gap={SPACING.micro} sx={{ color: "text.secondary" }}>
    {icon}
    <Text size="smaller" color="secondary" family="secondary">{count}</Text>
  </FlexRow>
);

// The 92px left inset clears the desktop rail, but 92 + 304 is wider than a
// phone viewport, so the overlay used to hang off the right edge with its
// expand and cancel controls out of reach. On mobile the rail is a floating
// hamburger at left 8, so the overlay starts past it and runs to the margin.
const mobileOverlayStyles = (theme: Theme) =>
  css({
    [theme.breakpoints.down("sm")]: {
      left: "56px",
      right: getSpacingPx(SPACING.md),
      width: "auto"
    }
  });

const overlayStyles = (theme: Theme) =>
  css({
    position: "fixed",
    top: "56px",
    left: "92px",
    width: "304px",
    maxHeight: "calc(100vh - 112px)",
    display: "flex",
    flexDirection: "column",
    zIndex: theme.zIndex.drawer,
    backgroundColor: theme.vars.palette.grey[900],
    border: `1px solid ${theme.vars.palette.grey[800]}`,
    borderRadius: BORDER_RADIUS.xl,
    boxShadow: `0 8px 24px ${theme.vars.palette.c_scrim}, 0 0 0 1px ${theme.vars.palette.c_overlay_subtle}`,
    overflow: "hidden",
    transformOrigin: "top left",
    '&[data-state="open"]': {
      animation: `${panelEnter} ${MOTION.normal} both`
    },
    '&[data-state="closed"]': {
      animation: `${panelExit} ${MOTION.normal} both`
    },
    ...reducedMotion({
      animation: "none",
      opacity: 1,
      transform: "none"
    })
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
  const { t } = useTranslation();
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
    const running: typeof jobs = [];
    const queued: typeof jobs = [];
    const cancelled: typeof jobs = [];
    for (const j of jobs ?? []) {
      const s = j.status ?? "";
      if (RUNNING.has(s)) running.push(j);
      else if (QUEUED.has(s)) queued.push(j);
      else if (s === "cancelled") cancelled.push(j);
    }
    return { running, queued, cancelled };
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
        notifyMutationError(t("i18n-cont-panels-12.queue.cancelJobErrorContext"), err);
      } finally {
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
      }
    },
    [queryClient, t]
  );

  const handleFocusJob = useCallback(
    (jobId: string) => {
      if (currentWorkflowId) {
        useWorkflowRunsStore.getState().setFocusedJob(currentWorkflowId, jobId);
      }
    },
    [currentWorkflowId]
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
      <Box css={[overlayStyles(theme), mobileOverlayStyles(theme)]} data-state={hasJobs ? "open" : "closed"}>
        <FlexColumn gap={1} sx={{ p: 1.5 }}>
          <FlexRow align="center" gap={1} sx={{ minWidth: 0 }}>
            <StatusDot tone={running.length ? "primary" : "neutral"} size="medium" />
            <Text
              size="small"
              weight={500}
              truncate
              sx={{ flex: 1, minWidth: 0 }}
            >
              {single ? (
                <SingleName job={single} />
              ) : running.length ? (
                t("i18n-cont-panels-12.queue.jobsRunning", { count: running.length })
              ) : (
                t("i18n-cont-panels-12.queue.title")
              )}
            </Text>
            {single && (
              <Text size="smaller" color="secondary" family="secondary">{formatClock(single.started_at, now)}</Text>
            )}
            <ToolbarIconButton
              icon={<KeyboardArrowDownIcon />}
              tooltip={t("i18n-cont-panels-12.queue.expandQueue")}
              onClick={() => setExpanded(true)}
              nodrag={false}
            />
          </FlexRow>
          {running.length > 0 && <RunBar />}
          {queued.length > 0 && (
            <FlexRow align="center" gap={0.5} sx={{ color: "text.secondary" }}>
              <ScheduleIcon sx={{ fontSize: ICON_SIZE.xs }} />
              <Text size="smaller" color="secondary">{t("i18n-cont-panels-12.queue.queuedCount", { count: queued.length })}
                            </Text>
            </FlexRow>
          )}
        </FlexColumn>
      </Box>
    );
  }

  return (
    <Box css={[overlayStyles(theme), mobileOverlayStyles(theme)]} data-state={hasJobs ? "open" : "closed"}>
      <PanelHeader
        title={t("i18n-cont-panels-12.queue.title")}
        icon={<LayersIcon />}
        actions={
          <ToolbarIconButton
            icon={<RemoveIcon />}
            tooltip={t("i18n-cont-panels-12.queue.collapseQueue")}
            ariaLabel={t("i18n-cont-panels-12.queue.collapseQueue")}
            onClick={() => setExpanded(false)}
          />
        }
      >
        <FlexRow align="center" gap={SPACING.md}>
          <HeaderCount
            icon={<PlayArrowOutlinedIcon sx={HEADER_COUNT_ICON_SX} />}
            count={running.length}
          />
          <HeaderCount
            icon={<ScheduleIcon sx={HEADER_COUNT_ICON_SX} />}
            count={queued.length}
          />
        </FlexRow>
      </PanelHeader>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", px: 2, pb: 2 }}>
        {running.length > 0 && (
          <>
            <SectionLabel>{t("i18n-cont-panels-12.queue.running")}</SectionLabel>
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
                    onFocusJob={isCurrentWf ? handleFocusJob : undefined}
                  />
                );
              })}
            </FlexColumn>
          </>
        )}
        {queued.length > 0 && (
          <>
            <SectionLabel>{t("i18n-cont-panels-12.queue.enqueued")}</SectionLabel>
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
            <SectionLabel>{t("i18n-cont-panels-12.queue.cancelled")}</SectionLabel>
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
