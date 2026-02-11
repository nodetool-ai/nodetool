import { useState, useEffect, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  CircularProgress,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Collapse,
  Tooltip
} from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import CancelIcon from "@mui/icons-material/Cancel";
import StopIcon from "@mui/icons-material/Stop";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";

import { Job } from "../../../stores/ApiTypes";
import { useWorkflow } from "../../../serverState/useWorkflow";
import { getWorkflowRunnerStore } from "../../../stores/WorkflowRunner";
import { useJobAssets } from "../../../serverState/useJobAssets";
import { client } from "../../../stores/ApiClient";
import { useQueryClient } from "@tanstack/react-query";
import AssetGridContent from "../../assets/AssetGridContent";
import isEqual from "lodash/isEqual";

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

const JobAssets = ({ jobId }: { jobId: string }) => {
  const { data: assets, isLoading, error } = useJobAssets(jobId);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 1 }}>
        <CircularProgress size={16} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 1, color: "error.main" }}>
        <Typography variant="caption">Failed to load assets</Typography>
      </Box>
    );
  }

  if (!assets || assets.length === 0) {
    return (
      <Box sx={{ p: 1, pl: 7 }}>
        <Typography variant="caption" color="text.secondary">
          No assets generated
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ pl: 2, pr: 1, pb: 1 }}>
      <AssetGridContent assets={assets} itemSpacing={1} />
    </Box>
  );
};

const JobItem = ({ job }: { job: Job }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: workflow } = useWorkflow(job.workflow_id);
  const [elapsedTime, setElapsedTime] = useState(
    formatElapsedTime(job.started_at)
  );
  const [expanded, setExpanded] = useState(false);
  const [cancelling, setCancelling] = useState(false);

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
      if (cancelling) {return;}
      setCancelling(true);

      try {
        // Cancel via REST API - this reliably reaches the backend
        await client.POST("/api/jobs/{job_id}/cancel", {
          params: { path: { job_id: job.id } }
        });

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

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const getStatusIcon = () => {
    if (cancelling) {
      return <CircularProgress size={24} color="warning" />;
    }
    if (job.error) {
      return <ErrorOutlineIcon color="error" />;
    }
    switch (job.status) {
      case "running":
        return <CircularProgress size={24} />;
      case "queued":
      case "starting":
        return <HourglassEmptyIcon color="action" />;
      case "cancelled":
        return <CancelIcon color="warning" />;
      default:
        return <StopIcon color="action" />;
    }
  };

  const workflowName = workflow?.name || "Loading...";
  const startedTime = job.started_at
    ? new Date(Date.parse(job.started_at)).toLocaleTimeString()
    : "";
  const duration = getJobDuration(job.started_at, job.finished_at);
  const statusText = cancelling
    ? "Cancelling..."
    : job.status === "running"
    ? `Running • ${elapsedTime}`
    : job.status === "queued"
    ? "Queued"
    : job.status === "starting"
    ? "Starting..."
    : job.status === "cancelled"
    ? "Cancelled"
    : job.status;

  return (
    <>
      <ListItem
        onClick={handleClick}
        sx={{
          cursor: "pointer",
          borderRadius: 1,
          mb: 0.5,
          "&:hover": { backgroundColor: "action.hover" }
        }}
        secondaryAction={
          <IconButton edge="end" size="small" onClick={handleExpandClick}>
            {expanded ? (
              <KeyboardArrowUpIcon fontSize="small" />
            ) : (
              <KeyboardArrowDownIcon fontSize="small" />
            )}
          </IconButton>
        }
      >
        <ListItemIcon sx={{ minWidth: 40 }}>{getStatusIcon()}</ListItemIcon>
        <Tooltip title={job.id}>
          <ListItemText
            primary={
              <Typography
                variant="body2"
                noWrap
                sx={{ fontWeight: 500, fontSize: "0.8rem" }}
              >
                {workflowName}
              </Typography>
            }
            secondary={
              <Box
                component="span"
                sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}
              >
                <Typography variant="caption" color="text.secondary">
                  {statusText}
                </Typography>
                {job.error && (
                  <Typography variant="caption" color="error" noWrap>
                    {job.error}
                  </Typography>
                )}
              </Box>
            }
          />
        </Tooltip>
        {(job.status === "running" ||
          job.status === "queued" ||
          job.status === "starting") && (
          <IconButton
            size="small"
            onClick={handleStop}
            disabled={cancelling}
            sx={{
              mr: 1,
              color: "error.main",
              "&:hover": {
                backgroundColor: "error.light",
                color: "error.contrastText"
              }
            }}
          >
            {cancelling ? (
              <CircularProgress size={16} color="warning" />
            ) : (
              <StopIcon fontSize="small" />
            )}
          </IconButton>
        )}
        <ListItemText sx={{ flex: "0 0 auto", textAlign: "right", mr: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            {startedTime}
          </Typography>
          {duration && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", fontSize: "0.7rem" }}
            >
              {duration}
            </Typography>
          )}
        </ListItemText>
      </ListItem>
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <JobAssets jobId={job.id} />
      </Collapse>
    </>
  );
};

const MemoizedJobItem = memo(JobItem, (prevProps, nextProps) => {
  // Custom comparison for Job props - only re-render if job data changes
  return isEqual(prevProps.job, nextProps.job);
});

export default MemoizedJobItem;
