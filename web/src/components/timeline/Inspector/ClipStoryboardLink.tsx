/**
 * ClipStoryboardLink
 *
 * The cut's half of the board ↔ cut link: a chip on a clip that came from a
 * storyboard shot, naming the shot and jumping back to it on the board. The
 * board's own selection footer draws the same link in the other direction.
 *
 * Renders nothing for a clip carrying no shot provenance, or while the board
 * it names cannot be read.
 */

import { memo } from "react";
import type { TimelineClip } from "@nodetool-ai/timeline";

import { Chip, FlexRow, BORDER_RADIUS, CONTROL, SPACING } from "../../ui_primitives";
import { colorForType } from "../../../config/data_types";
import { hexToRgba } from "../../../utils/ColorUtils";
import { useClipStoryboardLink } from "../../../hooks/timeline/useClipStoryboardLink";

/** Violet — the app's colour for anything picture-shaped. */
const BOARD_COLOR = colorForType("video");

const chipSx = {
  height: `${CONTROL.height.xs}px`,
  borderRadius: BORDER_RADIUS.md,
  borderColor: hexToRgba(BOARD_COLOR, 0.4),
  color: BOARD_COLOR
} as const;

interface ClipStoryboardLinkProps {
  clip: TimelineClip;
}

const ClipStoryboardLinkInner = ({ clip }: ClipStoryboardLinkProps) => {
  const link = useClipStoryboardLink(
    clip.storyboardBoardId,
    clip.storyboardShotId
  );

  if (!link) {
    return null;
  }

  return (
    <FlexRow align="center" sx={{ px: SPACING.xs, pb: SPACING.xs }}>
      <Chip
        compact
        variant="outlined"
        label={link.label}
        sx={chipSx}
        onClick={link.open}
        title={`Open ${link.shot.slug ?? "this shot"} on the storyboard`}
      />
    </FlexRow>
  );
};

export const ClipStoryboardLink = memo(ClipStoryboardLinkInner);
ClipStoryboardLink.displayName = "ClipStoryboardLink";

export default ClipStoryboardLink;
