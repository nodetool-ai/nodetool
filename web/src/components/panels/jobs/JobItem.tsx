import { useState, useEffect, useCallback, memo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { alpha } from "@mui/material/styles";
import {
  FlexColumn,
  FlexRow,
  Text,
  LoadingSpinner,
  Tooltip,
  ToolbarIconButton,
  Box,
  MOTION,
  BORDER_RADIUS
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
import isEqual from "fast-deep-equal";

/**
 * Format a duration in milliseconds to a human-readable string
 */
const formatDuration = (ms: number): string => {
  if (ms < 0) {
    return "0ms";
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  const milliseconds = ms % 1000;
  if (seconds < 60) {
    return `${seconds}.${String(milliseconds).padStart(3, "0").slice(0, 2)}s`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

/**
 * Format elapsed time since job started
 */
const formatElapsedTime = (startedAt: string | null | undefined): string => {
  if (!startedAt) {
    return "Not started";
  }
  const start = new Date(startedAt).getTime();
  if (isNaN(start)) {
    return "Invalid date";
  }
  const elapsed = Date.now() - start;
  return formatDuration(elapsed);
};

/**
 * Calculate job duration from started_at to finished_at
 */
const getJobDuration = (
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined
): string | null => {
  if (!startedAt || !finishedAt) {
    return null;
  }
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (isNaN(start) || isNaN(end)) {
    return null;
  }
  return formatDuration(end - start);
};

/** Short clock label (e.g. "11:21 AM"), empty when no timestamp. */
const clockLabel = (iso?: string | null): string =>
  iso
    ? new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })
    : "";

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
    <Box
      sx={{
        width: TILE_SIZE,
        height: TILE_SIZE,
        flex: "0 0 auto",
        borderRadius: BORDER_RADIUS.lg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: visual.fg,
        backgroundColor: visual.tint
          ? (theme) => alpha(theme.palette[visual.tint!].main, 0.16)
          : "action.hover",
        transition: MOTION.all
      }}
    >
      {visual.icon}
    </Box>
  );
});

/**
 * A single generated output. Visual assets (image/video) render as a thumbnail;
 * everything else as a small type tile. Clicking opens the asset.
 */
const AssetThumb = memo(function AssetThumb({ asset }: { asset: Asset }) {
  const isVisual =
    asset.content_type?.startsWith("image/") ||
    asset.content_type?.startsWith("video/");
  const src = isVisual ? asset.thumb_url || asset.get_url || undefined : undefined;

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (asset.get_url) {
        window.open(asset.get_url, "_blank", "noopener,noreferrer");
      }
    },
    [asset.get_url]
  );

  return (
    <Tooltip title={asset.name || asset.content_type}>
      <Box
        onClick={handleOpen}
        sx={{
          width: TILE_SIZE,
          height: TILE_SIZE,
          flex: "0 0 auto",
          borderRadius: BORDER_RADIUS.lg,
          overflow: "hidden",
          border: 1,
          borderColor: "divider",
          backgroundColor: "action.hover",
          cursor: asset.get_url ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {src ? (
          <Box
            component="img"
            src={src}
            alt={asset.name || "Output"}
            loading="lazy"
            sx={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Text size="tinyer" color="secondary" truncate sx={{ px: 0.5 }}>
            {asset.content_type?.split("/")[1] || "file"}
          </Text>
        )}
      </Box>
    </Tooltip>
  );
});

const JobItem = ({ job }: { job: Job }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: workflow } = useWorkflow(job.workflow_id);
  const [elapsedTime, setElapsedTime] = useState(
    formatElapsedTime(job.started_at)
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
      setElapsedTime(formatElapsedTime(job.started_at));
    }, 1000);
    return () => clearInterval(interval);
  }, [job.started_at, job.status]);

  const handleClick = () => navigate(`/editor/${job.workflow_id}`);

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
        console.error("Failed to cancel job:", err);
      } finally {
        // Refresh the jobs list to show updated status
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
        setCancelling(false);
      }
    },
    [cancelling, job.id, job.workflow_id, queryClient]
  );

  const workflowName = job.name || workflow?.name || "Loading...";
  const shortId = `#${job.id.slice(0, 4)}`;
  const isActive =
    job.status === "running" ||
    job.status === "queued" ||
    job.status === "scheduled" ||
    job.status === "starting";
  const isError =
    job.status === "failed" || job.status === "timed_out" || !!job.error;

  const elapsed = job.started_at ? elapsedTime : null;
  const duration = getJobDuration(job.started_at, job.finished_at);
  const assetCount = assets?.length ?? 0;
  const assetNoun = assets?.[0]?.content_type?.startsWith("video/")
    ? "video"
    : assets?.[0]?.content_type?.startsWith("image/")
      ? "image"
      : "asset";
  const countText =
    assetCount > 0
      ? `${assetCount} ${assetNoun}${assetCount > 1 ? "s" : ""}`
      : null;

  let metaText: string;
  if (cancelling) {
    metaText = "Cancelling…";
  } else if (isError) {
    metaText = job.error || "Failed";
  } else if (job.status === "running") {
    metaText = ["Running", elapsed].filter(Boolean).join(" · ");
  } else if (
    job.status === "queued" ||
    job.status === "scheduled" ||
    job.status === "starting"
  ) {
    metaText = ["In queue", clockLabel(job.started_at)].filter(Boolean).join(
      " · "
    );
  } else if (job.status === "cancelled") {
    metaText = ["Cancelled", clockLabel(job.finished_at)]
      .filter(Boolean)
      .join(" · ");
  } else {
    metaText =
      [duration, countText, clockLabel(job.finished_at)]
        .filter(Boolean)
        .join(" · ") || "Completed";
  }

  return (
    <FlexRow
      align="center"
      gap={1}
      onClick={handleClick}
      sx={{
        px: 1,
        py: 1,
        mb: 0.5,
        borderRadius: "6px",
        cursor: "pointer",
        backgroundColor: isActive ? "action.selected" : "transparent",
        transition: `background-color ${MOTION.fast}`,
        "&:hover": { backgroundColor: "action.hover" }
      }}
    >
      <StatusTile job={job} cancelling={cancelling} />
      <FlexColumn gap={0.5} sx={{ flex: "0 1 240px", minWidth: 0 }}>
        <FlexRow align="baseline" gap={1} sx={{ minWidth: 0 }}>
          <Text size="small" weight={500} truncate sx={{ minWidth: 0 }}>
            {workflowName}
          </Text>
          <Tooltip title={job.id}>
            <Text
              size="tiny"
              color="secondary"
              family="secondary"
              sx={{ flex: "0 0 auto" }}
            >
              {shortId}
            </Text>
          </Tooltip>
        </FlexRow>
        <Text size="tiny" color={isError ? "error" : "secondary"} truncate>
          {metaText}
        </Text>
      </FlexColumn>
      {/* All outputs, shown inline across the available width. */}
      <FlexRow
        gap={0.5}
        sx={{ flex: "1 1 auto", minWidth: 0, overflowX: "auto", py: 0.5 }}
      >
        {assets?.map((asset) => (
          <AssetThumb key={asset.id} asset={asset} />
        ))}
      </FlexRow>
      {isActive && (
        <ToolbarIconButton
          size="small"
          onClick={handleStop}
          disabled={cancelling}
          ariaLabel="Stop job"
          tooltip="Stop job"
          icon={
            cancelling ? (
              <LoadingSpinner size="small" />
            ) : (
              <StopIcon fontSize="small" />
            )
          }
          sx={{
            flex: "0 0 auto",
            color: "error.main",
            "&:hover": {
              backgroundColor: "error.light",
              color: "error.contrastText"
            }
          }}
        />
      )}
    </FlexRow>
  );
};

const MemoizedJobItem = memo(JobItem, (prevProps, nextProps) => {
  // Custom comparison for Job props - only re-render if job data changes
  return isEqual(prevProps.job, nextProps.job);
});

export default MemoizedJobItem;
