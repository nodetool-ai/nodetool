import { useState, useEffect, useCallback, memo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  FlexColumn,
  FlexRow,
  Text,
  LoadingSpinner,
  Tooltip,
  ToolbarIconButton,
  Box,
  MediaThumbnail,
  ProgressBar,
  MOTION,
  BORDER_RADIUS,
  SPACING,
  selectableRowStyles
} from "../../ui_primitives";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import BoltIcon from "@mui/icons-material/Bolt";
import CheckIcon from "@mui/icons-material/Check";
import BlockIcon from "@mui/icons-material/Block";
import StopIcon from "@mui/icons-material/Stop";

import { Job, Asset } from "../../../stores/ApiTypes";
import { useWorkflow } from "../../../serverState/useWorkflow";
import { getWorkflowRunnerStore } from "../../../stores/WorkflowRunner";
import { useJobAssets } from "../../../serverState/useJobAssets";
import { trpcClient } from "../../../trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import isEqual from "../../../utils/isEqual";
import { notifyMutationError } from "../../../utils/notifyMutationError";
import { formatClockTime } from "../../../utils/formatUtils";
import ReportBugButton from "../../support/ReportBugButton";

const formatDuration = (ms: number, t: TFunction): string => {
  if (ms < 0) {
    return t("i18n-next58.jobs.duration.milliseconds", { value: 0 });
  }
  if (ms < 1000) {
    return t("i18n-next58.jobs.duration.milliseconds", { value: ms });
  }
  const seconds = Math.floor(ms / 1000);
  const milliseconds = ms % 1000;
  if (seconds < 60) {
    return t("i18n-next58.jobs.duration.secondsDecimal", {
      value: `${seconds}.${String(milliseconds).padStart(3, "0").slice(0, 2)}`
    });
  }
  if (seconds < 3600) {
    return t("i18n-next58.jobs.duration.minutesSeconds", {
      minutes: Math.floor(seconds / 60),
      seconds: seconds % 60
    });
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return t("i18n-next58.jobs.duration.hoursMinutes", { hours, minutes });
};

const formatElapsedTime = (
  startedAt: string | null | undefined,
  t: TFunction
): string => {
  if (!startedAt) {
    return t("i18n-next58.jobs.notStarted");
  }
  const start = new Date(startedAt).getTime();
  if (isNaN(start)) {
    return t("i18n-next58.jobs.invalidDate");
  }
  const elapsed = Date.now() - start;
  return formatDuration(elapsed, t);
};

const getJobDuration = (
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined,
  t: TFunction
): string | null => {
  if (!startedAt || !finishedAt) {
    return null;
  }
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (isNaN(start) || isNaN(end)) {
    return null;
  }
  return formatDuration(end - start, t);
};

/** Short clock label (e.g. "11:21 AM"), empty when no timestamp. */
const clockLabel = (iso?: string | null): string =>
  iso ? formatClockTime(iso) : "";

const TILE_SIZE = 40;

type TileVisual = {
  icon: ReactNode;
  fg: string;
  /** Semantic palette to tint the tile background, or undefined for neutral. */
  tint?: "primary" | "error" | "success";
};

const statusTileVisual = (job: Job, cancelling: boolean): TileVisual => {
  if (cancelling) {
    return { icon: <LoadingSpinner size="small" />, fg: "text.secondary" };
  }
  if (job.status === "failed" || job.status === "timed_out" || job.error) {
    return {
      icon: <ErrorOutlineIcon fontSize="small" />,
      fg: "error.main",
      tint: "error"
    };
  }
  switch (job.status) {
    case "running":
      return {
        icon: <BoltIcon fontSize="small" />,
        fg: "primary.main",
        tint: "primary"
      };
    case "queued":
    case "scheduled":
    case "starting":
      return { icon: <LoadingSpinner size="small" />, fg: "text.secondary" };
    case "cancelled":
      return { icon: <BlockIcon fontSize="small" />, fg: "text.secondary" };
    case "completed":
      return {
        icon: <CheckIcon fontSize="small" />,
        fg: "success.main",
        tint: "success"
      };
    default:
      return { icon: <CheckIcon fontSize="small" />, fg: "text.secondary" };
  }
};

/**
 * Leading status glyph (40px). Anchors the row with an at-a-glance status that
 * stays put while output thumbnails load alongside it.
 */
const StatusTile = memo(function StatusTile({
  job,
  cancelling
}: {
  job: Job;
  cancelling: boolean;
}) {
  const visual = statusTileVisual(job, cancelling);
  return (
    <FlexRow
      align="center"
      justify="center"
      sx={{
        width: TILE_SIZE,
        height: TILE_SIZE,
        flex: "0 0 auto",
        borderRadius: BORDER_RADIUS.lg,
        color: visual.fg,
        backgroundColor: visual.tint
          ? (theme) =>
              `rgb(${theme.vars.palette[visual.tint!].mainChannel} / 0.16)`
          : "action.hover",
        transition: MOTION.all
      }}
    >
      {visual.icon}
    </FlexRow>
  );
});

/**
 * A single generated output. Visual assets (image/video) render as a thumbnail;
 * everything else as a small type tile. Clicking opens the asset.
 */
const AssetThumb = memo(function AssetThumb({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (asset.get_url) {
        window.open(asset.get_url, "_blank", "noopener,noreferrer");
      }
    },
    [asset.get_url]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (asset.get_url) {
        window.open(asset.get_url, "_blank", "noopener,noreferrer");
      }
    },
    [asset.get_url]
  );

  return (
    <Tooltip title={asset.name || asset.content_type}>
      <FlexRow
        role="button"
        tabIndex={0}
        aria-label={t("i18n-next58.jobs.openJobOutput")}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        align="center"
        justify="center"
        sx={{
          width: TILE_SIZE,
          height: TILE_SIZE,
          flex: "0 0 auto",
          borderRadius: BORDER_RADIUS.lg,
          overflow: "hidden",
          border: 1,
          borderColor: "divider",
          backgroundColor: "action.hover",
          cursor: asset.get_url ? "pointer" : "default"
        }}
      >
        <MediaThumbnail
          asset={asset}
          alt={asset.name || t("i18n-next58.jobs.output")}
          borderRadius={0}
          icon={
            <Text size="smaller" color="secondary" truncate sx={{ px: 0.5 }}>
              {asset.content_type?.split("/")[1] || t("i18n-next58.jobs.file")}
            </Text>
          }
        />
      </FlexRow>
    </Tooltip>
  );
});

const JobItem = ({ job }: { job: Job }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: workflow } = useWorkflow(job.workflow_id);
  const [elapsedTime, setElapsedTime] = useState(
    formatElapsedTime(job.started_at, t)
  );
  const [cancelling, setCancelling] = useState(false);

  // Only fetch outputs for finished runs — running/queued rows show a status
  // glyph, so there's nothing to thumbnail yet.
  const isCompleted = job.status === "completed";
  const { data: assets } = useJobAssets(isCompleted ? job.id : "");

  useEffect(() => {
    if (job.status !== "running" && job.status !== "queued") {
      return;
    }
    const interval = setInterval(() => {
      setElapsedTime(formatElapsedTime(job.started_at, t));
    }, 1000);
    return () => clearInterval(interval);
  }, [job.started_at, job.status, t]);

  const handleClick = useCallback(
    () => navigate(`/editor/${job.workflow_id}`),
    [navigate, job.workflow_id]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick]
  );

  const handleStop = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (cancelling) {
        return;
      }
      setCancelling(true);

      try {
        // Cancel via tRPC — reliably reaches the backend
        await trpcClient.jobs.cancel.mutate({ id: job.id });

        // Also update the local runner store state if it has this job
        const runnerStore = getWorkflowRunnerStore(job.workflow_id);
        const runnerState = runnerStore.getState();
        if (runnerState.job_id === job.id) {
          runnerState.cancel();
        }
      } catch (err) {
        notifyMutationError(t("i18n-next58.jobs.cancelTheJob"), err);
      } finally {
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
        setCancelling(false);
      }
    },
    [cancelling, job.id, job.workflow_id, queryClient, t]
  );

  const workflowName =
    job.name || workflow?.name || t("i18n-next58.jobs.loading");
  const shortId = `#${job.id.slice(0, 4)}`;
  const isActive =
    job.status === "running" ||
    job.status === "queued" ||
    job.status === "scheduled" ||
    job.status === "starting";
  const isError =
    job.status === "failed" || job.status === "timed_out" || !!job.error;

  const elapsed = job.started_at ? elapsedTime : null;
  const duration = getJobDuration(job.started_at, job.finished_at, t);
  const assetCount = assets?.length ?? 0;
  const assetNoun = assets?.[0]?.content_type?.startsWith("video/")
    ? t("i18n-next58.jobs.video")
    : assets?.[0]?.content_type?.startsWith("image/")
      ? t("i18n-next58.jobs.image")
      : t("i18n-next58.jobs.asset");
  const countText =
    assetCount > 0
      ? t("i18n-next58.jobs.outputCount", {
          count: assetCount,
          type: assetNoun
        })
      : null;

  let metaText: string;
  if (cancelling) {
    metaText = t("i18n-next58.jobs.cancelling");
  } else if (isError) {
    metaText = job.error || t("i18n-next58.jobs.failed");
  } else if (job.status === "running") {
    metaText = [t("i18n-next58.jobs.running"), elapsed]
      .filter(Boolean)
      .join(" · ");
  } else if (
    job.status === "queued" ||
    job.status === "scheduled" ||
    job.status === "starting"
  ) {
    metaText = [t("i18n-next58.jobs.inQueue"), clockLabel(job.started_at)]
      .filter(Boolean)
      .join(" · ");
  } else if (job.status === "cancelled") {
    metaText = [t("i18n-next58.jobs.cancelled"), clockLabel(job.finished_at)]
      .filter(Boolean)
      .join(" · ");
  } else {
    metaText =
      [duration, countText, clockLabel(job.finished_at)]
        .filter(Boolean)
        .join(" · ") || t("i18n-next58.jobs.completed");
  }

  return (
    <FlexRow
      align="center"
      gap={1}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      sx={(theme) => ({
        ...selectableRowStyles(theme),
        position: "relative",
        overflow: "hidden",
        px: SPACING.md,
        py: SPACING.md,
        cursor: "pointer",
        // Failed runs keep a faint error wash so they stand out in history.
        ...(isError && {
          backgroundColor: `rgb(${theme.vars.palette.error.mainChannel} / 0.08)`,
          "&:hover": {
            backgroundColor: `rgb(${theme.vars.palette.error.mainChannel} / 0.14)`
          }
        })
      })}
    >
      <StatusTile job={job} cancelling={cancelling} />
      <FlexColumn gap={SPACING.micro} sx={{ flex: "1 1 auto", minWidth: 0 }}>
        <FlexRow align="baseline" gap={1} sx={{ minWidth: 0 }}>
          <Text size="small" weight={500} truncate sx={{ minWidth: 0 }}>
            {workflowName}
          </Text>
          <Tooltip title={job.id}>
            <Text size="smaller" color="secondary"
            family="secondary"
            sx={{ flex: "0 0 auto" }}>{shortId}</Text>
          </Tooltip>
        </FlexRow>
        {isError ? (
          <Tooltip title={metaText}>
            <Text size="smaller" color="error" truncate>
              {metaText}
            </Text>
          </Tooltip>
        ) : (
          <Text size="smaller" color="secondary" truncate>
            {metaText}
          </Text>
        )}
      </FlexColumn>
      {/* Outputs, right-aligned; scrolls sideways when there are many. */}
      <FlexRow
        gap={SPACING.micro}
        sx={{ flex: "0 1 auto", minWidth: 0, overflowX: "auto" }}
      >
        {assets?.map((asset) => (
          <AssetThumb key={asset.id} asset={asset} />
        ))}
      </FlexRow>
      {isError && (
        <ReportBugButton
          context={{
            source: "job-failure",
            summary: t("i18n-next58.jobs.jobFailedSummary", { workflowName }),
            errorText: job.error || t("i18n-next58.jobs.jobFailed"),
            workflowId: job.workflow_id,
            jobId: job.id
          }}
        />
      )}
      {isActive && (
        <ToolbarIconButton
          size="small"
          onClick={handleStop}
          disabled={cancelling}
          ariaLabel={t("i18n-next58.jobs.stopJob")}
          tooltip={t("i18n-next58.jobs.stopJob")}
          icon={
            cancelling ? (
              <LoadingSpinner size="small" />
            ) : (
              <StopIcon fontSize="small" />
            )
          }
          sx={{
            flex: "0 0 auto",
            color: "text.secondary",
            "&:hover": { color: "error.main" }
          }}
        />
      )}
      {job.status === "running" && !cancelling && (
        <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
          <ProgressBar
            value={0}
            progressVariant="indeterminate"
            showValue={false}
            size="small"
            aria-label={t("i18n-next58.jobs.runningWorkflow", {
              workflowName
            })}
          />
        </Box>
      )}
    </FlexRow>
  );
};

const MemoizedJobItem = memo(JobItem, (prevProps, nextProps) =>
  isEqual(prevProps.job, nextProps.job)
);

export default MemoizedJobItem;
