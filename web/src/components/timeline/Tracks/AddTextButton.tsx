/** @jsxImportSource @emotion/react */
/**
 * AddTextButton
 *
 * "Add text" in the timeline toolbar. Places a text clip at the playhead on
 * the top track, so it draws over the picture. The top track is reused when
 * it is an overlay track with room at the playhead; otherwise a new overlay
 * track is inserted on top. Study 16: 6 of 6 people asked to add words
 * looked for it in this toolbar, and 3 of 6 never found the lane menu's
 * "Add text".
 */

import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import TitleIcon from "@mui/icons-material/Title";

import {
  makeClip,
  DEFAULT_TEXT_CLIP_COLOR,
  DEFAULT_TEXT_CLIP_DURATION_MS,
  DEFAULT_TEXT_CLIP_FONT_SIZE_PX
} from "@nodetool-ai/timeline";
import { useTimelineStoreApi } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStoreApi } from "../../../stores/timeline/TimelinePlaybackStore";
import { Tooltip } from "../../ui_primitives";
import { toolbarLabelButtonStyles } from "./ScriptToggleButton";

interface AddTextButtonProps {
  /** Phone toolbar: icon only, with the label carried by the tooltip / a11y name. */
  compact?: boolean;
}

export const AddTextButton: React.FC<AddTextButtonProps> = memo(({ compact = false }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const timelineStore = useTimelineStoreApi();
  const playbackStore = useTimelinePlaybackStoreApi();
  const setSelection = useTimelineUIStore((s) => s.setSelection);

  const handleClick = useCallback(() => {
    const { tracks, clips, insertTrack, addClip } = timelineStore.getState();
    const startMs = playbackStore.getState().currentTimeMs;
    const endMs = startMs + DEFAULT_TEXT_CLIP_DURATION_MS;
    const top = tracks.reduce<(typeof tracks)[number] | undefined>(
      (best, track) => (!best || track.index < best.index ? track : best),
      undefined
    );
    const topHasRoom =
      top?.type === "overlay" &&
      !top.locked &&
      !clips.some(
        (c) =>
          c.trackId === top.id &&
          c.startMs < endMs &&
          c.startMs + c.durationMs > startMs
      );
    const trackId = top && topHasRoom ? top.id : insertTrack("overlay", 0);
    const clip = makeClip({
      trackId,
      startMs,
      durationMs: DEFAULT_TEXT_CLIP_DURATION_MS,
      name: t("i18n-next73.trackLane.textClipName"),
      mediaType: "text",
      sourceType: "imported",
      status: "generated",
      textStyle: {
        text: t("i18n-next73.trackLane.textClipContent"),
        fontSizePx: DEFAULT_TEXT_CLIP_FONT_SIZE_PX,
        color: DEFAULT_TEXT_CLIP_COLOR
      }
    });
    addClip(clip);
    setSelection([clip.id]);
  }, [playbackStore, setSelection, t, timelineStore]);

  const label = t("i18n-next119.trackLane.addText");

  return (
    <Tooltip title={label} describeChild>
      <button
        type="button"
        css={toolbarLabelButtonStyles(theme, compact)}
        onClick={handleClick}
        aria-label={label}
        data-testid="add-text-button"
      >
        <TitleIcon />
        {!compact && <span>{label}</span>}
      </button>
    </Tooltip>
  );
});

AddTextButton.displayName = "AddTextButton";
