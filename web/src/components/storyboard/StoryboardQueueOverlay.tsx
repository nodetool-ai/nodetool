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
import {
  Box,
  Caption,
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

const RenderingCard = memo(function RenderingCard({
  row,
  onCancel
}: {
  row: JobRow;
  onCancel: (shotId: string) => void;
}) {
  return (
    <Box sx={cardSx}>
      <FlexRow align="center" gap={SPACING.xs} sx={{ minWidth: 0 }}>
        <Dot />
        <Text size="small" truncate sx={{ flex: 1, minWidth: 0 }}>
          {row.name}
        </Text>
        <KindTag kind={row.kind} />
        <ToolbarIconButton
          icon={<CloseIcon sx={{ fontSize: "1em" }} />}
          tooltip="Cancel render"
          ariaLabel="Cancel render"
          variant="error"
          onClick={() => onCancel(row.shotId)}
        />
      </FlexRow>
      <Box sx={{ mt: SPACING.xs }}>
        <RenderBar progress={row.progress} />
      </Box>
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
  boardId
}: StoryboardQueueOverlayProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const shots = useStoryboardStore((state) => state.boards[boardId]?.shots);
  const shotJobs = useStoryboardGenerationStore((state) => state.shotJobs);

  const rendering = useMemo(() => {
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
    return rows.filter((row) => row.status === "running");
  }, [shotJobs, shots, boardId]);

  // A direct request has no server job to cancel: stop tracking and settle,
  // and the provider call runs to completion unwatched.
  const handleCancel = useCallback((shotId: string) => {
    settleCancelledShotJob(shotId);
  }, []);

  const handleCancelAll = useCallback(() => {
    for (const row of rendering) {
      handleCancel(row.shotId);
    }
  }, [rendering, handleCancel]);

  if (rendering.length === 0) {
    return null;
  }

  if (!expanded) {
    const single = rendering.length === 1 ? rendering[0] : null;
    return (
      <Box css={overlayStyles(theme)}>
        <FlexColumn gap={SPACING.xs} sx={{ p: SPACING.sm }}>
          <FlexRow align="center" gap={SPACING.xs} sx={{ minWidth: 0 }}>
            <Dot />
            <Text size="small" truncate sx={{ flex: 1, minWidth: 0 }}>
              {single ? single.name : `${rendering.length} shots rendering`}
            </Text>
            {single && <KindTag kind={single.kind} />}
            <ToolbarIconButton
              icon={<KeyboardArrowUpIcon sx={{ fontSize: "1em" }} />}
              tooltip="Expand render queue"
              ariaLabel="Expand render queue"
              onClick={() => setExpanded(true)}
            />
          </FlexRow>
          <RenderBar progress={single?.progress} />
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
          count={rendering.length}
        />
        <ToolbarIconButton
          icon={<CloseIcon sx={{ fontSize: "1em" }} />}
          tooltip="Cancel all renders"
          ariaLabel="Cancel all renders"
          variant="error"
          onClick={handleCancelAll}
        />
        <ToolbarIconButton
          icon={<RemoveIcon sx={{ fontSize: "1em" }} />}
          tooltip="Collapse render queue"
          ariaLabel="Collapse render queue"
          onClick={() => setExpanded(false)}
        />
      </FlexRow>

      <ScrollArea
        thin
        sx={{ flex: 1, minHeight: 0, px: SPACING.md, pb: SPACING.md }}
      >
        <FlexColumn gap={SPACING.xs} sx={{ pt: SPACING.sm }}>
          {rendering.map((row) => (
            <RenderingCard key={row.jobId} row={row} onCancel={handleCancel} />
          ))}
        </FlexColumn>
      </ScrollArea>
    </Box>
  );
});

StoryboardQueueOverlay.displayName = "StoryboardQueueOverlay";

export default StoryboardQueueOverlay;
