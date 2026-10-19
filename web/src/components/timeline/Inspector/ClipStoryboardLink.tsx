/**
 * ClipStoryboardLink
 *
 * The cut's half of the board ↔ cut link: a chip on a clip that came from a
 * storyboard shot, naming the shot and jumping back to it on the board. The
 * board's own selection footer draws the same link in the other direction.
 *
 * An unlinked, unlocked video clip offers `Link to shot` instead, which opens
 * {@link LinkShotDialog}. Renders nothing for any other clip without a shot,
 * or while the board a linked clip names cannot be read.
 */

import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import type { TimelineClip } from "@nodetool-ai/timeline";

import {
  Chip,
  EditorButton,
  FlexRow,
  SPACING,
  Tooltip
} from "../../ui_primitives";
import LinkShotDialog from "../shot/LinkShotDialog";
import { colorForType } from "../../../config/data_types";
import { useClipStoryboardLink } from "../../../hooks/timeline/useClipStoryboardLink";

/** Violet — the app's colour for anything picture-shaped. */
const BOARD_COLOR = colorForType("video");

interface ClipStoryboardLinkProps {
  clip: TimelineClip;
}

const ClipStoryboardLinkInner = ({ clip }: ClipStoryboardLinkProps) => {
  const { t } = useTranslation();
  const link = useClipStoryboardLink(
    clip.storyboardBoardId,
    clip.storyboardShotId
  );

  const [linkOpen, setLinkOpen] = useState(false);

  if (!clip.storyboardShotId) {
    if (clip.mediaType !== "video" || clip.locked || clip.scriptLineId) {
      return null;
    }
    return (
      <FlexRow align="center" sx={{ pt: SPACING.micro }}>
        <EditorButton
          size="small"
          startIcon={<LinkOutlinedIcon />}
          onClick={() => setLinkOpen(true)}
          tooltip={t("pass3_26.timelineInspector.storyboard.linkTooltip")}
        >
          {t("pass3_26.timelineInspector.storyboard.linkToShot")}
        </EditorButton>
        {linkOpen && (
          <LinkShotDialog clipId={clip.id} onClose={() => setLinkOpen(false)} />
        )}
      </FlexRow>
    );
  }

  if (!link) {
    return null;
  }

  return (
    <FlexRow align="center" sx={{ pt: SPACING.micro }}>
      <Tooltip title={t("pass3_26.timelineInspector.storyboard.openShot", { shot: link.shot.slug ?? t("pass3_26.timelineInspector.storyboard.thisShot") })} describeChild>
        <Chip
          compact
          variant="outlined"
          label={link.label}
          accent={BOARD_COLOR}
          onClick={link.open}
        />
      </Tooltip>
    </FlexRow>
  );
};

export const ClipStoryboardLink = memo(ClipStoryboardLinkInner);
ClipStoryboardLink.displayName = "ClipStoryboardLink";

export default ClipStoryboardLink;
