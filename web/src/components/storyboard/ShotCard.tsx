/**
 * ShotCard
 *
 * One cell of the storyboard's shot grid: the rendered clip or selected still
 * on top, the action line under it. The card carries only what reads at a
 * glance — the shot number and length, a status pill, a render's progress —
 * and clicking it selects the shot, which opens {@link ShotInspector} under
 * the grid with the shot's prompt, takes, cast, and per-shot actions.
 */

import React, { memo, useCallback, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { ImageRef, Shot, VideoRef } from "@nodetool-ai/protocol";
import FullscreenIcon from "@mui/icons-material/Fullscreen";

import {
  Box,
  Card,
  Caption,
  FlexColumn,
  ProgressBar,
  Text,
  ToolbarIconButton,
  VideoPlayer,
  BORDER_RADIUS,
  SPACING,
  TYPOGRAPHY
} from "../ui_primitives";
import ImageRefPreview from "../node/ImageRefPreview";
import ShotMediaViewer from "./ShotMediaViewer";
import ShotStatusPill, {
  CLIP_COLOR,
  isShotGenerating
} from "./ShotStatusPill";
import { useStoryboardGenerationStore } from "../../stores/storyboard/StoryboardGenerationStore";
import { useShotDuration } from "../../hooks/storyboard/useShotDuration";
import { useResolvedMediaUri } from "../../hooks/useResolvedMediaUri";

interface ShotCardProps {
  boardId: string;
  shot: Shot;
  /** True when this card is the board's selected shot. */
  selected?: boolean;
  /** Selects (or, on the selected card, deselects) this shot. */
  onSelect?: (shotId: string) => void;
}

/** The thumbnail: a fixed 16:9 media area every card in the grid shares. */
const mediaSx = {
  position: "relative",
  width: "100%",
  aspectRatio: "16 / 9",
  overflow: "hidden",
  bgcolor: "c_overlay_subtle",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  "& img": {
    width: "100%",
    height: "100%",
    objectFit: "cover"
  }
} as const;

/** The `SH 01 · 3s` label, on a scrim so it reads over any still. */
const shotLabelSx = {
  position: "absolute",
  left: SPACING.md,
  top: SPACING.md,
  px: SPACING.sm,
  py: SPACING.micro,
  borderRadius: BORDER_RADIUS.xs,
  bgcolor: "c_scrim_soft",
  color: "text.secondary",
  ...TYPOGRAPHY.mono.caption
} as const;

/** The render bar sits on the thumbnail's bottom edge, 3px per the design. */
const RENDER_BAR_HEIGHT = 3;

const shotNumber = (shot: Shot): string =>
  `SH ${String(shot.index + 1).padStart(2, "0")}`;

const ShotCardInner: React.FC<ShotCardProps> = ({
  boardId,
  shot,
  selected,
  onSelect
}) => {
  const theme = useTheme();
  // The still or clip the fullscreen viewer shows; null when it is closed.
  const [viewerMedia, setViewerMedia] = useState<ImageRef | VideoRef | null>(
    null
  );

  // Why the last still or clip failed. Kept on the shot's job state until the
  // next attempt registers, so the card can say more than "failed".
  const renderError = useStoryboardGenerationStore((state) => {
    const job = state.shotJobs[shot.id];
    return job?.status === "failed" ? job.errorMessage : undefined;
  });
  const progress = useStoryboardGenerationStore(
    (state) => state.shotJobs[shot.id]?.progress
  );

  const failed = shot.status === "failed";
  const isGenerating = isShotGenerating(shot);
  const duration = useShotDuration(boardId, shot);
  // Whether there is a clip to show at all: the player itself resolves the
  // `asset://` locator, but the card renders the keyframe when it cannot.
  const clipUri = useResolvedMediaUri(shot.clip);
  const shotName = `${shot.index + 1}. ${shot.slug ?? "Untitled shot"}`;
  // What the preview shows is what fullscreen opens: the clip once there is
  // one, the selected still before that.
  const previewMedia: ImageRef | VideoRef | null = clipUri
    ? (shot.clip as VideoRef)
    : (shot.keyframe ?? null);

  const handleOpenViewer = useCallback(
    (event?: React.SyntheticEvent) => {
      // The card itself selects on click; opening the viewer is its own action.
      event?.stopPropagation();
      if (previewMedia) {
        setViewerMedia(previewMedia);
      }
    },
    [previewMedia]
  );
  const handleCloseViewer = useCallback(() => setViewerMedia(null), []);
  const handleSelect = useCallback(() => {
    onSelect?.(shot.id);
  }, [onSelect, shot.id]);

  return (
    <Card
      variant="outlined"
      padding="none"
      clickable={!!onSelect}
      onClick={handleSelect}
      className="shot-card"
      aria-label={shotName}
      aria-pressed={onSelect ? !!selected : undefined}
      data-generating={isGenerating ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      sx={{
        overflow: "hidden",
        borderRadius: BORDER_RADIUS.lg,
        borderColor: isGenerating
          ? CLIP_COLOR
          : selected
            ? "primary.main"
            : "divider",
        boxShadow: isGenerating
          ? `0 0 0 1px ${CLIP_COLOR}`
          : selected
            ? `0 0 0 1px ${theme.palette.primary.main}`
            : undefined
      }}
    >
      <Box sx={mediaSx} onDoubleClick={previewMedia ? handleOpenViewer : undefined}>
        {clipUri ? (
          <VideoPlayer locator={shot.clip} />
        ) : (
          <ImageRefPreview
            value={shot.keyframe}
            placeholder={
              <Caption color="muted" sx={{ textAlign: "center", p: SPACING.md }}>
                No still yet
              </Caption>
            }
          />
        )}
        <Box sx={shotLabelSx}>
          {duration.seconds != null
            ? `${shotNumber(shot)} · ${duration.seconds}s`
            : shotNumber(shot)}
        </Box>
        {previewMedia && !isGenerating && (
          <ToolbarIconButton
            icon={<FullscreenIcon sx={{ fontSize: "1em" }} />}
            tooltip="View fullscreen (double-click)"
            ariaLabel={clipUri ? "View clip fullscreen" : "View still fullscreen"}
            onClick={handleOpenViewer}
            sx={{
              position: "absolute",
              top: SPACING.xs,
              right: SPACING.xs,
              bgcolor: "c_scrim_soft",
              opacity: 0,
              ".shot-card:hover &": { opacity: 1 },
              "&:focus-visible": { opacity: 1 },
              // Touch devices cannot hover; keep the affordance reachable.
              "@media (pointer: coarse)": { opacity: 1 }
            }}
          />
        )}
        <ShotStatusPill
          shot={shot}
          sx={{
            position: "absolute",
            right: SPACING.md,
            bottom: SPACING.md
          }}
        />
        {isGenerating && (
          <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
            <ProgressBar
              value={progress ?? 0}
              progressVariant={progress == null ? "indeterminate" : "determinate"}
              showValue={false}
              sx={{
                height: RENDER_BAR_HEIGHT,
                backgroundColor: "c_overlay_subtle",
                "& .MuiLinearProgress-bar": { backgroundColor: CLIP_COLOR }
              }}
            />
          </Box>
        )}
      </Box>

      <FlexColumn gap={SPACING.xs} sx={{ p: SPACING.lg, minWidth: 0 }}>
        {failed && (
          <Caption
            role="alert"
            data-testid="shot-render-error"
            sx={{ color: "error.main" }}
          >
            {renderError ?? "The render failed. Try again."}
          </Caption>
        )}
        <Text size="small" weight={400} lineClamp={2} sx={{ lineHeight: 1.45 }}>
          {shot.action}
        </Text>
      </FlexColumn>

      <ShotMediaViewer
        boardId={boardId}
        media={viewerMedia}
        onClose={handleCloseViewer}
      />
    </Card>
  );
};

export const ShotCard = memo(ShotCardInner);
ShotCard.displayName = "ShotCard";

export default ShotCard;
