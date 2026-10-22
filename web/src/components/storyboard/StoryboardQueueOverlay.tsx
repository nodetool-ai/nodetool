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
import { useTranslation } from "react-i18next";
import type { Shot } from "@nodetool-ai/protocol";
import {
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  ProgressBar,
  ScrollArea,
  Text,
  ToolbarIconButton,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  Z_INDEX,
  getSpacingPx,
  reducedMotion,
  StatusDot,
  EYEBROW
} from "../ui_primitives";
import type { SxProps } from "@mui/material/styles";
import TheatersIcon from "@mui/icons-material/Theaters";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import RemoveIcon from "@mui/icons-material/Remove";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import CloseIcon from "@mui/icons-material/CloseOutlined";
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

const panelEnter = keyframes`
  from { opacity: 0; transform: translateY(6px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
`;

/**
 * Progress bar under a rendering job: determinate when the run reports
 * progress, an indeterminate sweep otherwise.
 */
const RenderBar = memo(function RenderBar({ progress }: { progress?: number }) {
  const { t } = useTranslation();
  const determinate = progress != null && progress > 0 && progress < 100;
  return (
    <ProgressBar
      value={determinate ? progress : 0}
      progressVariant={determinate ? "determinate" : "indeterminate"}
      showValue={false}
      size="small"
      aria-label={t("screens4_21.storyboardQueue.rendering")}
    />
  );
});

const cardSx: SxProps<Theme> = {
  backgroundColor: "grey.800",
  border: "1px solid",
  borderColor: "c_overlay",
  borderRadius: BORDER_RADIUS.lg,
  px: SPACING.sm,
  py: SPACING.xs
};

const KindTag = ({ kind }: { kind: ShotJobKind }) => {
  const { t } = useTranslation();
  return (
    <Caption
      color="secondary"
      sx={{
        flex: "0 0 auto",
        ...EYEBROW,
      }}
    >
      {t(`screens4_21.storyboardQueue.kind.${kind}`)}
    </Caption>
  );
};

const RequestCard = memo(function RequestCard({
  row,
  onStopTracking
}: {
  row: JobRow;
  onStopTracking?: (requestId: string) => void;
}) {
  const { t } = useTranslation();
  const statusLabel = row.awaitingReview
    ? t("screens4_21.storyboardQueue.status.awaitingReview")
    : t(`screens4_21.storyboardQueue.status.${row.status}`);
  return (
    <Box sx={cardSx}>
      <FlexRow align="center" gap={SPACING.xs} sx={{ minWidth: 0 }}>
        <StatusDot tone={row.status === "failed" ? "error" : "primary"} size="medium" />
        <Text size="small" truncate sx={{ flex: 1, minWidth: 0 }}>
          {row.name}
        </Text>
        <KindTag kind={row.kind} />
        {row.status === "running" && onStopTracking && (
          <ToolbarIconButton
            icon={<CloseIcon fontSize="inherit" />}
            tooltip={t("screens4_21.storyboardQueue.stopTrackingTooltip")}
            ariaLabel={t("screens4_21.storyboardQueue.stopTrackingRender")}
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
}) => {
  const { i18n } = useTranslation();
  return (
    <FlexRow align="center" gap={SPACING.micro} sx={{ color: "text.secondary" }}>
      {icon}
      <Caption color="secondary">
        {new Intl.NumberFormat(i18n.language).format(count)}
      </Caption>
    </FlexRow>
  );
};

const overlayStyles = (theme: Theme) =>
  css({
    position: "absolute",
    bottom: getSpacingPx(SPACING.xl),
    right: getSpacingPx(SPACING.xl),
    width: getSpacingPx(76),
    // Stay inside a narrow board column instead of spilling past its edge.
    maxWidth: `calc(100% - ${getSpacingPx(SPACING.xl)} * 2)`,
    maxHeight: `min(420px, calc(100% - ${getSpacingPx(SPACING.xxxl)}))`,
    display: "flex",
    flexDirection: "column",
    zIndex: Z_INDEX.overlay,
    backgroundColor: theme.vars.palette.background.default,
    border: `1px solid ${theme.vars.palette.divider}`,
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
  const { t, i18n } = useTranslation();
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
            ? `${new Intl.NumberFormat(i18n.language).format(shot.index + 1)}. ${shot.slug ?? t("screens4_21.storyboardQueue.untitledShot")}`
            : t("screens4_21.storyboardQueue.shot"),
          index: shot?.index ?? Number.MAX_SAFE_INTEGER,
          awaitingReview: requestAwaitsReview(job, shot)
        };
      })
      .sort(
        (a, b) => a.index - b.index || (a.startedAt ?? 0) - (b.startedAt ?? 0)
      );
    return { id: latest.batchId, rows };
  }, [requestRecords, shots, boardId, i18n.language, t]);

  const counts = useMemo(() => {
    const rows = batch?.rows ?? [];
    return {
      total: rows.length,
      queued: rows.filter((row) => row.status === "queued").length,
      running: rows.filter((row) => row.status === "running").length,
      completed: rows.filter((row) => row.status === "completed").length,
      failed: rows.filter((row) => row.status === "failed").length,
      stopped: rows.filter((row) => row.status === "stopped").length,
      awaitingReview: rows.filter((row) => row.awaitingReview).length
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
        ? t("screens4_21.storyboardQueue.compactRunningSummary", {
            requests: t("screens4_21.storyboardQueue.requestCount", {
              count: counts.total
            }),
            running: t("screens4_21.storyboardQueue.runningCount", {
              count: counts.running
            })
          })
        : t("screens4_21.storyboardQueue.compactFinishedSummary", {
            completed: t("screens4_21.storyboardQueue.completedCount", {
              count: counts.completed
            }),
            queued: t("screens4_21.storyboardQueue.queuedCount", {
              count: counts.queued
            }),
            failed: t("screens4_21.storyboardQueue.failedCount", {
              count: counts.failed
            }),
            stopped:
              counts.stopped > 0
                ? t("screens4_21.storyboardQueue.stoppedCount", {
                    count: counts.stopped
                  })
                : ""
          });
    return (
      <Box css={overlayStyles(theme)}>
        <FlexColumn gap={SPACING.xs} sx={{ p: SPACING.sm }}>
          <FlexRow align="center" gap={SPACING.xs} sx={{ minWidth: 0 }}>
            <StatusDot tone={counts.failed > 0 ? "error" : "primary"} size="medium" />
            <Text size="small" truncate sx={{ flex: 1, minWidth: 0 }}>
              {summary}
            </Text>
            <ToolbarIconButton
              icon={<KeyboardArrowUpIcon fontSize="inherit" />}
              tooltip={t("screens4_21.storyboardQueue.expandQueue")}
              ariaLabel={t("screens4_21.storyboardQueue.expandQueue")}
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
        <TheatersIcon sx={{ fontSize: "inherit", color: "text.secondary" }} />
        <Text size="small" sx={{ flex: 1 }}>
          {t("screens4_21.storyboardQueue.title")}
        </Text>
        <HeaderCount
          icon={<PlayArrowOutlinedIcon fontSize="inherit" />}
          count={counts.running}
        />
        {counts.running > 0 && !readOnly && (
          <ToolbarIconButton
            icon={<CloseIcon fontSize="inherit" />}
            tooltip={t("screens4_21.storyboardQueue.stopTrackingAllTooltip")}
            ariaLabel={t("screens4_21.storyboardQueue.stopTrackingAll")}
            variant="error"
            onClick={handleStopAll}
          />
        )}
        <ToolbarIconButton
          icon={<RemoveIcon fontSize="inherit" />}
          tooltip={t("screens4_21.storyboardQueue.collapseQueue")}
          ariaLabel={t("screens4_21.storyboardQueue.collapseQueue")}
          onClick={() => setExpanded(false)}
        />
      </FlexRow>

      <FlexColumn gap={SPACING.xs} sx={{ px: SPACING.md }}>
        <Text role="status" aria-live="polite" size="small">
          {t("screens4_21.storyboardQueue.statusSummary", {
            requests: t("screens4_21.storyboardQueue.requestCount", {
              count: counts.total
            }),
            running: t("screens4_21.storyboardQueue.runningCount", {
              count: counts.running
            }),
            completed: t("screens4_21.storyboardQueue.completedCount", {
              count: counts.completed
            }),
            queued: t("screens4_21.storyboardQueue.queuedCount", {
              count: counts.queued
            }),
            failed: t("screens4_21.storyboardQueue.failedCount", {
              count: counts.failed
            }),
            awaitingReview: t(
              "screens4_21.storyboardQueue.awaitingReviewCount",
              { count: counts.awaitingReview }
            ),
            stopped: t("screens4_21.storyboardQueue.stoppedCount", {
              count: counts.stopped
            })
          })}
        </Text>
        {counts.running > 0 && (
          <Caption color="secondary">
            {t("screens4_21.storyboardQueue.stopTrackingNotice")}
          </Caption>
        )}
        <FlexRow gap={SPACING.xs} wrap>
          {counts.failed > 0 && !readOnly && (
            <EditorButton variant="outlined" onClick={handleRetryFailed}>
              {t("screens4_21.storyboardQueue.retryFailed", {
                count: counts.failed
              })}
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
              {t("screens4_21.storyboardQueue.reviewCompletedTakes")}
            </EditorButton>
          )}
          {counts.stopped > 0 && !readOnly && (
            <EditorButton variant="outlined" onClick={handleResumeTracking}>
              {t("screens4_21.storyboardQueue.resumeTracking")}
            </EditorButton>
          )}
          {counts.running === 0 && !readOnly && (
            <EditorButton
              variant="outlined"
              onClick={() => dismissBatch(batch.id)}
            >
              {t("screens4_21.storyboardQueue.dismissReceipt")}
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
