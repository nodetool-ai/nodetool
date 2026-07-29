/** @jsxImportSource @emotion/react */
/**
 * StoryboardQueueOverlay
 *
 * Floating render queue for the Storyboard surface, mirroring the node
 * editor's {@link QueueOverlay}: shows the board's still and clip jobs that
 * are queued or rendering, with per-job cancel and a cancel-all action.
 * Collapses to a compact summary bar and hides entirely when the board is
 * idle.
 */
import { css, keyframes } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useState } from "react";
import {
  Box,
  FlexColumn,
  FlexRow,
  Text,
  Tooltip,
  MOTION,
  reducedMotion,
  BORDER_RADIUS
} from "../ui_primitives";
import type { SxProps } from "@mui/material/styles";
import TheatersIcon from "@mui/icons-material/Theaters";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import ScheduleIcon from "@mui/icons-material/Schedule";
import RemoveIcon from "@mui/icons-material/Remove";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import CloseIcon from "@mui/icons-material/Close";
import { trpcClient } from "../../trpc/client";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import {
  useStoryboardGenerationStore,
  settleCancelledShotJob,
  type ShotJobKind,
  type ShotJobState
} from "../../stores/storyboard/StoryboardGenerationStore";

interface StoryboardQueueOverlayProps {
  boardId: string;
}

interface JobRow extends ShotJobState {
  /** "1. Slug" display name resolved from the board's shots. */
  name: string;
  index: number;
}

const KIND_LABEL: Record<ShotJobKind, string> = {
  keyframe: "Still",
  clip: "Clip"
};

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
  if (typeof progress === "number" && progress > 0 && progress < 100) {
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
  border: "1px solid var(--palette-c_overlay)",
  borderRadius: BORDER_RADIUS.lg,
  px: 1.5,
  py: 1
};

const Dot = ({ color = "primary.main" }: { color?: string }) => (
  <Box
    sx={{
      width: 8,
      height: 8,
      flex: "0 0 auto",
      borderRadius: BORDER_RADIUS.circle,
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
        borderRadius: BORDER_RADIUS.sm,
        "&:hover": { color: hoverColor }
      }}
    >
      {icon}
    </Box>
  </Tooltip>
);

const KindTag = ({ kind }: { kind: ShotJobKind }) => (
  <Text
    size="smaller"
    color="secondary"
    family="secondary"
    sx={{ flex: "0 0 auto", textTransform: "uppercase", letterSpacing: "0.05em" }}
  >
    {KIND_LABEL[kind]}
  </Text>
);

const RenderingCard = memo(function RenderingCard({
  row,
  onCancel
}: {
  row: JobRow;
  onCancel: (shotId: string) => void;
}) {
  return (
    <Box sx={cardSx}>
      <FlexRow align="center" gap={1} sx={{ minWidth: 0 }}>
        <Dot />
        <Text size="small" weight={500} truncate sx={{ flex: 1, minWidth: 0 }}>
          {row.name}
        </Text>
        <KindTag kind={row.kind} />
        <IconButton
          icon={<CloseIcon sx={{ fontSize: 15 }} />}
          label="Cancel render"
          onClick={() => onCancel(row.shotId)}
          hoverColor="error.main"
        />
      </FlexRow>
      <Box sx={{ mt: 1 }}>
        <RenderBar progress={row.progress} />
      </Box>
    </Box>
  );
});

const EnqueuedCard = memo(function EnqueuedCard({
  row,
  position,
  onCancel
}: {
  row: JobRow;
  position: number;
  onCancel: (shotId: string) => void;
}) {
  return (
    <Box sx={cardSx}>
      <FlexRow align="center" gap={1} sx={{ minWidth: 0 }}>
        <Text
          size="smaller"
          color="secondary"
          family="secondary"
          sx={{ flex: "0 0 auto" }}
        >
          #{position + 1}
        </Text>
        <Text size="small" truncate sx={{ flex: 1, minWidth: 0 }}>
          {row.name}
        </Text>
        <KindTag kind={row.kind} />
        <IconButton
          icon={<CloseIcon sx={{ fontSize: 15 }} />}
          label="Remove from queue"
          onClick={() => onCancel(row.shotId)}
          hoverColor="error.main"
        />
      </FlexRow>
    </Box>
  );
});

const SectionLabel = ({ children }: { children: string }) => (
  <Text
    size="smaller"
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
    <Text size="smaller" color="secondary" family="secondary">
      {count}
    </Text>
  </FlexRow>
);

const overlayStyles = (theme: Theme) =>
  css({
    position: "absolute",
    bottom: "16px",
    right: "16px",
    width: "304px",
    maxHeight: "min(420px, calc(100% - 32px))",
    display: "flex",
    flexDirection: "column",
    zIndex: theme.zIndex.drawer,
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
  boardId
}: StoryboardQueueOverlayProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const shots = useStoryboardStore((state) => state.boards[boardId]?.shots);
  const shotJobs = useStoryboardGenerationStore((state) => state.shotJobs);

  const { rendering, queued } = useMemo(() => {
    const byId = new Map((shots ?? []).map((s) => [s.id, s]));
    const rows: JobRow[] = Object.values(shotJobs)
      .filter((job) => job.boardId === boardId)
      .map((job) => {
        const shot = byId.get(job.shotId);
        return {
          ...job,
          name: shot
            ? `${shot.index + 1}. ${shot.slug ?? "Untitled shot"}`
            : "Shot",
          index: shot?.index ?? Number.MAX_SAFE_INTEGER
        };
      })
      .sort((a, b) => a.index - b.index);
    return {
      rendering: rows.filter((row) => row.status === "running"),
      queued: rows.filter((row) => row.status === "queued")
    };
  }, [shotJobs, shots, boardId]);

  const handleCancel = useCallback(async (shotId: string) => {
    const job = useStoryboardGenerationStore.getState().shotJobs[shotId];
    if (!job) {
      return;
    }
    try {
      await trpcClient.jobs.cancel.mutate({ id: job.jobId });
      // Settle immediately rather than waiting for the cancelled job_update —
      // a job cancelled before it starts may never emit one.
      settleCancelledShotJob(shotId);
    } catch (err) {
      // Keep tracking the job: if the cancel failed because the run already
      // finished, the completion message settles the shot on its own.
      console.error("Failed to cancel storyboard render:", err);
    }
  }, []);

  const handleCancelAll = useCallback(() => {
    for (const row of [...rendering, ...queued]) {
      void handleCancel(row.shotId);
    }
  }, [rendering, queued, handleCancel]);

  if (rendering.length === 0 && queued.length === 0) {
    return null;
  }

  if (!expanded) {
    const single = rendering.length === 1 ? rendering[0] : null;
    return (
      <Box css={overlayStyles(theme)}>
        <FlexColumn gap={1} sx={{ p: 1.5 }}>
          <FlexRow align="center" gap={1} sx={{ minWidth: 0 }}>
            <Dot color={rendering.length ? "primary.main" : "grey.600"} />
            <Text
              size="small"
              weight={500}
              truncate
              sx={{ flex: 1, minWidth: 0 }}
            >
              {single
                ? single.name
                : rendering.length
                  ? `${rendering.length} shots rendering`
                  : "Render queue"}
            </Text>
            {single && <KindTag kind={single.kind} />}
            <IconButton
              icon={<KeyboardArrowUpIcon sx={{ fontSize: 18 }} />}
              label="Expand render queue"
              onClick={() => setExpanded(true)}
            />
          </FlexRow>
          {rendering.length > 0 && (
            <RenderBar progress={single?.progress} />
          )}
          {queued.length > 0 && (
            <FlexRow align="center" gap={0.5} sx={{ color: "text.secondary" }}>
              <ScheduleIcon sx={{ fontSize: 13 }} />
              <Text size="smaller" color="secondary">
                {queued.length} queued
              </Text>
            </FlexRow>
          )}
        </FlexColumn>
      </Box>
    );
  }

  return (
    <Box css={overlayStyles(theme)}>
      <FlexRow align="center" gap={1} sx={{ px: 2, py: 1.5, flex: "0 0 auto" }}>
        <TheatersIcon sx={{ fontSize: 17, color: "text.secondary" }} />
        <Text size="normal" weight={600} sx={{ flex: 1 }}>
          Render queue
        </Text>
        <FlexRow align="center" gap={1.25}>
          <HeaderCount
            icon={<PlayArrowOutlinedIcon sx={{ fontSize: 15 }} />}
            count={rendering.length}
          />
          <HeaderCount
            icon={<ScheduleIcon sx={{ fontSize: 14 }} />}
            count={queued.length}
          />
        </FlexRow>
        <IconButton
          icon={<CloseIcon sx={{ fontSize: 15 }} />}
          label="Cancel all renders"
          onClick={handleCancelAll}
          hoverColor="error.main"
        />
        <IconButton
          icon={<RemoveIcon sx={{ fontSize: 16 }} />}
          label="Collapse render queue"
          onClick={() => setExpanded(false)}
        />
      </FlexRow>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", px: 2, pb: 2 }}>
        {rendering.length > 0 && (
          <>
            <SectionLabel>Rendering</SectionLabel>
            <FlexColumn gap={1}>
              {rendering.map((row) => (
                <RenderingCard
                  key={row.jobId}
                  row={row}
                  onCancel={handleCancel}
                />
              ))}
            </FlexColumn>
          </>
        )}
        {queued.length > 0 && (
          <>
            <SectionLabel>Enqueued</SectionLabel>
            <FlexColumn gap={1}>
              {queued.map((row, position) => (
                <EnqueuedCard
                  key={row.jobId}
                  row={row}
                  position={position}
                  onCancel={handleCancel}
                />
              ))}
            </FlexColumn>
          </>
        )}
      </Box>
    </Box>
  );
});

StoryboardQueueOverlay.displayName = "StoryboardQueueOverlay";

export default StoryboardQueueOverlay;
