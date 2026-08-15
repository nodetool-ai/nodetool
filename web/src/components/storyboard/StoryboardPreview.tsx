/**
 * StoryboardPreview
 *
 * Plays a whole board in shot order: clips where they exist, held keyframe
 * stills where they do not. The cut is an in-memory sequence handed to
 * {@link TimelineRenderer}, so nothing is written to the timeline library.
 */

import React, { memo, useMemo } from "react";

import TimelineRenderer from "../timeline/TimelineRenderer";
import {
  BORDER_RADIUS,
  Box,
  Caption,
  FlexColumn,
  FlexRow,
  PADDING,
  SPACING
} from "../ui_primitives";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { buildPreviewSequence, previewSignature } from "./previewSequence";

const PREVIEW_HEIGHT = 400;

const frameSx = {
  width: "100%",
  height: PREVIEW_HEIGHT,
  minHeight: 0,
  overflow: "hidden"
} as const;

const emptySx = {
  width: "100%",
  border: "1px dashed",
  borderColor: "divider",
  borderRadius: BORDER_RADIUS.sm,
  padding: PADDING.comfortable,
  textAlign: "center"
} as const;

/** "3 shots · 1 still · 2 not rendered", dropping the zero parts. */
const statusLine = (
  clipCount: number,
  stillCount: number,
  skippedCount: number
): string => {
  const parts = [`${clipCount} shot${clipCount === 1 ? "" : "s"}`];
  if (stillCount > 0) {
    parts.push(`${stillCount} still${stillCount === 1 ? "" : "s"}`);
  }
  if (skippedCount > 0) {
    parts.push(`${skippedCount} not rendered`);
  }
  return parts.join(" · ");
};

interface StoryboardPreviewProps {
  boardId: string;
}

const StoryboardPreviewInner: React.FC<StoryboardPreviewProps> = ({
  boardId
}) => {
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
        <Caption color="secondary">
          Nothing to preview yet — generate stills or clips first.
        </Caption>
      </Box>
    );
  }

  return (
    <FlexColumn gap={SPACING.sm} className="storyboard-preview">
      <Box sx={frameSx}>
        <TimelineRenderer
          sequence={preview.sequence}
          showMetadata={false}
          ariaLabel="Storyboard preview"
        />
      </Box>
      <FlexRow gap={SPACING.sm} align="center">
        <Caption color="secondary">
          {statusLine(
            preview.sequence.clips.length,
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
