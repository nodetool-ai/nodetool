/**
 * StoryboardPreview
 *
 * Plays a whole board in shot order: clips where they exist, held keyframe
 * stills where they do not. The cut is an in-memory sequence handed to
 * {@link TimelineRenderer}, so nothing is written to the timeline library.
 */

import React, { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";

import TimelineRenderer from "../timeline/TimelineRenderer";
import {
  BORDER_RADIUS,
  Box,
  Caption,
  FlexColumn,
  FlexRow,
  PADDING,
  SPACING,
  EmptyState
} from "../ui_primitives";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { buildPreviewSequence, previewSignature } from "./previewSequence";

/** Grows with the window, so the player stays the board's main picture. */
const PREVIEW_HEIGHT = "max(400px, 60vh)";

const emptySx = {
  width: "100%",
  border: "1px dashed",
  borderColor: "divider",
  borderRadius: BORDER_RADIUS.sm,
  padding: PADDING.comfortable,
  textAlign: "center"
} as const;

/** A localized summary, dropping the zero-count parts. */
const statusLine = (
  t: ReturnType<typeof useTranslation>["t"],
  clipCount: number,
  stillCount: number,
  skippedCount: number
): string => {
  const parts = [t("screens4_21.storyboardPreview.shots", { count: clipCount })];
  if (stillCount > 0) {
    parts.push(t("screens4_21.storyboardPreview.stills", { count: stillCount }));
  }
  if (skippedCount > 0) {
    parts.push(
      t("screens4_21.storyboardPreview.notRendered", { count: skippedCount })
    );
  }
  return parts.join(" · ");
};

interface StoryboardPreviewProps {
  boardId: string;
  /** Player height: px, or any CSS length. */
  height?: number | string;
}

const StoryboardPreviewInner: React.FC<StoryboardPreviewProps> = ({
  boardId,
  height = PREVIEW_HEIGHT
}) => {
  const { t } = useTranslation();
  // Subscribe to a signature string, not the board: a board object is replaced
  // on every edit (typing in the brief, changing selection), and a fresh
  // `sequence` prop resets playback in TimelineRenderer.
  const signature = useStoryboardStore((state) =>
    previewSignature(state.boards[boardId])
  );

  const preview = useMemo(() => {
    const board = useStoryboardStore.getState().boards[boardId];
    return board ? buildPreviewSequence(board) : null;
  }, [boardId, signature]);

  if (!preview) {
    return (
      <Box sx={emptySx} className="storyboard-preview storyboard-preview--empty">
        <EmptyState
          size="small"
          title={t("screens4_21.storyboardPreview.emptyTitle")}
          description={t("screens4_21.storyboardPreview.emptyDescription")}
        />
      </Box>
    );
  }

  return (
    <FlexColumn gap={SPACING.sm} className="storyboard-preview">
      <Box sx={{ width: "100%", height, minHeight: 0, overflow: "hidden" }}>
        <TimelineRenderer
          sequence={preview.sequence}
          showMetadata={false}
          ariaLabel={t("screens4_21.storyboardPreview.playerLabel")}
        />
      </Box>
      <FlexRow gap={SPACING.sm} align="center">
        <Caption color="secondary">
          {statusLine(
            t,
            preview.shotCount,
            preview.stillShotIds.length,
            preview.skippedShotIds.length
          )}
        </Caption>
      </FlexRow>
    </FlexColumn>
  );
};

export const StoryboardPreview = memo(StoryboardPreviewInner);
StoryboardPreview.displayName = "StoryboardPreview";

export default StoryboardPreview;
