/** @jsxImportSource @emotion/react */
/**
 * StoryboardQueueOverlay
 *
 * Floating render queue for the Storyboard surface, mirroring the node
 * editor's {@link QueueOverlay}: shows the board's in-flight still and clip
 * renders, with per-render cancel and a cancel-all action. Collapses to a
 * compact summary bar and hides entirely when the board is idle.
 *
 * A render is a direct `generate_media` request, so there is no server queue
 * to wait in — every tracked render is already running.
 */
import { css, keyframes } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useState } from "react";
import type { Shot } from "@nodetool-ai/protocol";
import {
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  ScrollArea,
  Text,
  ToolbarIconButton,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  Z_INDEX,
  getSpacingPx,
  reducedMotion
} from "../ui_primitives";
import type { SxProps } from "@mui/material/styles";
import TheatersIcon from "@mui/icons-material/Theaters";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import RemoveIcon from "@mui/icons-material/Remove";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import CloseIcon from "@mui/icons-material/Close";
import {
  sameMediaRef,
  useStoryboardStore
} from "../../stores/storyboard/StoryboardStore";
import {
  reattachBoardJobs,
  stopTrackingShotRequest,
  useStoryboardGenerationStore,
  type ShotJobKind,
  type ShotRequestRecord
} from "../../stores/storyboard/StoryboardGenerationStore";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";

export interface StoryboardQueueOverlayProps {
  boardId: string;
  readOnly?: boolean;
  onReviewCompleted?: (target: { shotId: string; requestId: string }) => void;
}

interface JobRow extends ShotRequestRecord {
  /** "1. Slug" display name resolved from the board's shots. */
  name: string;
  index: number;
  awaitingReview: boolean;
}

const requestAwaitsReview = (
  row: ShotRequestRecord,
  shot: Shot | undefined
): boolean => {
  if (row.status !== "completed" || !shot) {
    return false;
  }
  const versions =
    row.kind === "keyframe"
      ? (shot.keyframe_versions ?? [])
      : (shot.clip_versions ?? []);
  const current = row.kind === "keyframe" ? shot.keyframe : shot.clip;
  const candidate = versions.find((version) => {
    if (row.assetId) {
      return version.asset_id === row.assetId;
    }
    if (row.production && "candidateId" in version) {
      return version.candidateId === row.production.identity.candidateId;
    }
    if (row.mediaEdit && "mediaEdit" in version) {
      return version.mediaEdit?.requestId === row.jobId;
    }
    return false;
  });
  return Boolean(candidate && (!current || !sameMediaRef(candidate, current)));
};

const KIND_LABEL = {
  keyframe: "Still",
  clip: "Clip"
} satisfies Record<ShotJobKind, string>;

const sweep = keyframes`
  0% { transform: translateX(-110%); }
  100% { transform: translateX(320%); }
`;

const panelEnter = keyframes`
  from { opacity: 0; transform: translateY(6px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
`;

const progressStyles = (theme: Theme) =>
  css({
    position: "relative",
    height: "4px",
    borderRadius: BORDER_RADIUS.pill,
    overflow: "hidden",
    backgroundColor: theme.vars.palette.c_overlay,
    "&::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      width: "35%",
      borderRadius: "inherit",
      background: `linear-gradient(90deg, ${theme.vars.palette.primary.main}, ${theme.vars.palette.secondary.main})`,
      animation: `${sweep} ${MOTION.pulse} infinite`
    },
    ...reducedMotion({
      "&::after": { animation: "none", width: "100%", opacity: 0.5 }
    })
  });

/**
 * Progress bar under a rendering job: determinate when the run reports
 * progress, an indeterminate sweep otherwise.
 */
const RenderBar = memo(function RenderBar({ progress }: { progress?: number }) {
  const theme = useTheme();
  if (progress != null && progress > 0 && progress < 100) {
    return (
      <Box
        sx={{
          position: "relative",
          height: "4px",
          borderRadius: BORDER_RADIUS.pill,
          overflow: "hidden",
          backgroundColor: theme.vars.palette.c_overlay
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            width: `${progress}%`,
            borderRadius: "inherit",
            background: `linear-gradient(90deg, ${theme.vars.palette.primary.main}, ${theme.vars.palette.secondary.main})`,
            transition: `width ${MOTION.normal}`
          }}
        />
      </Box>
    );
  }
  return <Box css={progressStyles(theme)} />;
});

const cardSx: SxProps<Theme> = {
  backgroundColor: "grey.800",
  border: "1px solid",
  borderColor: "c_overlay",
  borderRadius: BORDER_RADIUS.lg,
  px: SPACING.sm,
  py: SPACING.xs
};

const Dot = ({ color = "primary.main" }: { color?: string }) => (
  <Box
    sx={{
      width: getSpacingPx(SPACING.md),
      height: getSpacingPx(SPACING.md),
      flex: "0 0 auto",
      borderRadius: BORDER_RADIUS.circle,
      backgroundColor: color
    }}
  />
);

const KindTag = ({ kind }: { kind: ShotJobKind }) => (
  <Caption
    color="secondary"
    sx={{
      flex: "0 0 auto",
      textTransform: "uppercase",
      letterSpacing: "0.05em"
    }}
  >
    {KIND_LABEL[kind]}
  </Caption>
);

const RequestCard = memo(function RequestCard({
  row,
  onStopTracking
}: {
  row: JobRow;
  onStopTracking?: (requestId: string) => void;
}) {
  const statusLabel =
    row.status === "stopped"
      ? "Stopped tracking; provider may still finish and charge"
      : row.awaitingReview
        ? "Completed · awaiting review"
        : row.status;
  return (
    <Box sx={cardSx}>
      <FlexRow align="center" gap={SPACING.xs} sx={{ minWidth: 0 }}>
        <Dot color={row.status === "failed" ? "error.main" : "primary.main"} />
        <Text size="small" truncate sx={{ flex: 1, minWidth: 0 }}>
          {row.name}
        </Text>
        <KindTag kind={row.kind} />
        {row.status === "running" && onStopTracking && (
          <ToolbarIconButton
            icon={<CloseIcon sx={{ fontSize: "1em" }} />}
            tooltip="Stop tracking. The provider request may still finish and charge."
            ariaLabel="Stop tracking render"
            variant="error"
            onClick={() => onStopTracking(row.jobId)}
          />
        )}
      </FlexRow>
      <Caption color="secondary">{statusLabel}</Caption>
      {row.status === "running" && (
        <Box sx={{ mt: SPACING.xs }}>
          <RenderBar progress={row.progress} />
        </Box>
      )}
    </Box>
  );
});

const HeaderCount = ({
  icon,
  count
}: {
  icon: React.ReactNode;
  count: number;
}) => (
  <FlexRow align="center" gap={SPACING.micro} sx={{ color: "text.secondary" }}>
    {icon}
    <Caption color="secondary">{count}</Caption>
  </FlexRow>
);

const overlayStyles = (theme: Theme) =>
  css({
    position: "absolute",
    bottom: getSpacingPx(SPACING.xl),
    right: getSpacingPx(SPACING.xl),
    width: getSpacingPx(76),
    maxHeight: `min(420px, calc(100% - ${getSpacingPx(SPACING.xxxl)}))`,
    display: "flex",
    flexDirection: "column",
    zIndex: Z_INDEX.overlay,
    backgroundColor: theme.vars.palette.grey[900],
    border: `1px solid ${theme.vars.palette.grey[800]}`,
    borderRadius: BORDER_RADIUS.xl,
    boxShadow: `0 8px 24px ${theme.vars.palette.c_scrim}, 0 0 0 1px ${theme.vars.palette.c_overlay_subtle}`,
    overflow: "hidden",
    transformOrigin: "bottom right",
    animation: `${panelEnter} ${MOTION.normal} both`,
    ...reducedMotion({
      animation: "none",
      opacity: 1,
      transform: "none"
    })
  });

const StoryboardQueueOverlay = memo(function StoryboardQueueOverlay({
  boardId,
  readOnly = false,
  onReviewCompleted
}: StoryboardQueueOverlayProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const shots = useStoryboardStore((state) => state.boards[boardId]?.shots);
  const requestRecords = useStoryboardGenerationStore(
    (state) => state.requestRecords
  );
  const dismissBatch = useStoryboardGenerationStore(
    (state) => state.dismissBatch
  );
  const { retryFailedRequest } = useGenerateShot();

  const batch = useMemo(() => {
    const byId = new Map((shots ?? []).map((s) => [s.id, s]));
    const boardRecords = Object.values(requestRecords)
      .filter((job) => job.boardId === boardId)
      .sort((left, right) => (left.startedAt ?? 0) - (right.startedAt ?? 0));
    const latest =
      [...boardRecords]
        .reverse()
        .find((record) => record.status === "running") ?? boardRecords.at(-1);
    if (!latest) return null;
    const rows: JobRow[] = boardRecords
      .filter((record) => record.batchId === latest.batchId)
      .map((job) => {
        const shot = byId.get(job.shotId);
        return {
          ...job,
          name: shot
            ? `${shot.index + 1}. ${shot.slug ?? "Untitled shot"}`
            : "Shot",
          index: shot?.index ?? Number.MAX_SAFE_INTEGER,
          awaitingReview: requestAwaitsReview(job, shot)
        };
      })
      .sort(
        (a, b) => a.index - b.index || (a.startedAt ?? 0) - (b.startedAt ?? 0)
      );
    return { id: latest.batchId, rows };
  }, [requestRecords, shots, boardId]);

  const counts = useMemo(() => {
    const rows = batch?.rows ?? [];
    let running = 0;
    let completed = 0;
    let failed = 0;
    let stopped = 0;
    let awaitingReview = 0;
    for (const row of rows) {
      if (row.status === "running") running++;
      else if (row.status === "completed") completed++;
      else if (row.status === "failed") failed++;
      else if (row.status === "stopped") stopped++;

      if (row.awaitingReview) awaitingReview++;
    }
    return {
      total: rows.length,
      running,
      completed,
      failed,
      stopped,
      awaitingReview
    };
  }, [batch]);

  // A direct request has no server job to cancel: stop tracking and settle,
  // and the provider call runs to completion unwatched.
  const handleStopTracking = useCallback(
    (requestId: string) => {
      if (readOnly) {
        return;
      }
      stopTrackingShotRequest(requestId);
    },
    [readOnly]
  );

  const handleStopAll = useCallback(() => {
    for (const row of batch?.rows ?? []) {
      if (row.status === "running") handleStopTracking(row.jobId);
    }
  }, [batch, handleStopTracking]);

  const handleRetryFailed = useCallback(() => {
    if (readOnly) {
      return;
    }
    const retryBatchId = crypto.randomUUID();
    for (const row of batch?.rows ?? []) {
      if (row.status === "failed" && row.retriedAt === undefined) {
        void retryFailedRequest(row.jobId, retryBatchId).catch(() => undefined);
      }
    }
  }, [batch, readOnly, retryFailedRequest]);

  const handleResumeTracking = useCallback(() => {
    if (readOnly) {
      return;
    }
    void reattachBoardJobs(boardId);
  }, [boardId, readOnly]);

  const reviewTarget = batch?.rows.find((row) => row.awaitingReview);

  if (!batch) {
    return null;
  }

  if (!expanded) {
    const summary =
      counts.running > 0
        ? `${counts.total} request${counts.total === 1 ? "" : "s"} · ${counts.running} running`
        : `${counts.completed} completed · ${counts.failed} failed${counts.stopped > 0 ? ` · ${counts.stopped} stopped` : ""}`;
    return (
      <Box css={overlayStyles(theme)}>
        <FlexColumn gap={SPACING.xs} sx={{ p: SPACING.sm }}>
          <FlexRow align="center" gap={SPACING.xs} sx={{ minWidth: 0 }}>
            <Dot color={counts.failed > 0 ? "error.main" : "primary.main"} />
            <Text size="small" truncate sx={{ flex: 1, minWidth: 0 }}>
              {summary}
            </Text>
            <ToolbarIconButton
              icon={<KeyboardArrowUpIcon sx={{ fontSize: "1em" }} />}
              tooltip="Expand render queue"
              ariaLabel="Expand render queue"
              onClick={() => setExpanded(true)}
            />
          </FlexRow>
          {counts.running > 0 && <RenderBar />}
        </FlexColumn>
      </Box>
    );
  }

  return (
    <Box css={overlayStyles(theme)}>
      <FlexRow
        align="center"
        gap={SPACING.xs}
        sx={{ px: SPACING.md, py: SPACING.sm, flex: "0 0 auto" }}
      >
        <TheatersIcon sx={{ fontSize: "1em", color: "text.secondary" }} />
        <Text size="small" sx={{ flex: 1 }}>
          Render queue
        </Text>
        <HeaderCount
          icon={<PlayArrowOutlinedIcon sx={{ fontSize: "1em" }} />}
          count={counts.running}
        />
        {counts.running > 0 && !readOnly && (
          <ToolbarIconButton
            icon={<CloseIcon sx={{ fontSize: "1em" }} />}
            tooltip="Stop tracking all. Provider requests may still finish and charge."
            ariaLabel="Stop tracking all renders"
            variant="error"
            onClick={handleStopAll}
          />
        )}
        <ToolbarIconButton
          icon={<RemoveIcon sx={{ fontSize: "1em" }} />}
          tooltip="Collapse render queue"
          ariaLabel="Collapse render queue"
          onClick={() => setExpanded(false)}
        />
      </FlexRow>

      <FlexColumn gap={SPACING.xs} sx={{ px: SPACING.md }}>
        <Text role="status" aria-live="polite" size="small">
          {`${counts.total} requests: ${counts.running} running, ${counts.completed} completed, ${counts.failed} failed, ${counts.awaitingReview} awaiting review, ${counts.stopped} stopped.`}
        </Text>
        {counts.running > 0 && (
          <Caption color="secondary">
            Stop tracking hides local progress only. The provider may still
            finish the request and charge for it.
          </Caption>
        )}
        <FlexRow gap={SPACING.xs} wrap>
          {counts.failed > 0 && !readOnly && (
            <EditorButton variant="outlined" onClick={handleRetryFailed}>
              {`Retry ${counts.failed} failed`}
            </EditorButton>
          )}
          {reviewTarget && onReviewCompleted && (
            <EditorButton
              variant="outlined"
              onClick={() =>
                onReviewCompleted({
                  shotId: reviewTarget.shotId,
                  requestId: reviewTarget.jobId
                })
              }
            >
              Review completed takes
            </EditorButton>
          )}
          {counts.stopped > 0 && !readOnly && (
            <EditorButton variant="outlined" onClick={handleResumeTracking}>
              Resume tracking
            </EditorButton>
          )}
          {counts.running === 0 && !readOnly && (
            <EditorButton
              variant="outlined"
              onClick={() => dismissBatch(batch.id)}
            >
              Dismiss receipt
            </EditorButton>
          )}
        </FlexRow>
      </FlexColumn>

      <ScrollArea
        thin
        sx={{ flex: 1, minHeight: 0, px: SPACING.md, pb: SPACING.md }}
      >
        <FlexColumn gap={SPACING.xs} sx={{ pt: SPACING.sm }}>
          {batch.rows.map((row) => (
            <RequestCard
              key={row.jobId}
              row={row}
              onStopTracking={readOnly ? undefined : handleStopTracking}
            />
          ))}
        </FlexColumn>
      </ScrollArea>
    </Box>
  );
});

StoryboardQueueOverlay.displayName = "StoryboardQueueOverlay";

export default StoryboardQueueOverlay;
