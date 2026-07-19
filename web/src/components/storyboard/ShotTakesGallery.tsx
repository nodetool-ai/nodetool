/** @jsxImportSource @emotion/react */
/**
 * ShotTakesGallery
 *
 * The takes browser for one shot: every generated still and every rendered
 * clip, viewable in place. The galleries reuse {@link OutputRenderer} — the
 * same component that renders node results — so an array of stills gets the
 * asset grid (double-click opens the fullscreen viewer) and clips get the
 * standard video players. Still thumbnails and take chips above each gallery
 * pick the selected still/clip — the one the card shows, the clip render
 * animates, and export uses.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { ImageRef, Shot, VideoRef } from "@nodetool-ai/protocol";

import {
  Caption,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING,
  getSpacingPx,
  BORDER_RADIUS
} from "../ui_primitives";
import OutputRenderer from "../node/OutputRenderer";
import {
  sameMediaRef,
  useStoryboardStore
} from "../../stores/storyboard/StoryboardStore";
import { syncShotClipToTimeline } from "../../stores/storyboard/timelineSync";

interface ShotTakesGalleryProps {
  boardId: string;
  shot: Shot;
  readOnly?: boolean;
}

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: getSpacingPx(SPACING.xs),
    ".take-thumb": {
      width: "64px",
      aspectRatio: "16 / 9",
      padding: 0,
      overflow: "hidden",
      cursor: "pointer",
      borderRadius: BORDER_RADIUS.sm,
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.c_overlay_subtle,
      display: "grid",
      placeItems: "center",
      color: theme.vars.palette.text.secondary,
      "& img": {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block"
      },
      "&[aria-pressed='true']": {
        borderColor: theme.vars.palette.primary.main,
        boxShadow: `0 0 0 1px ${theme.vars.palette.primary.main}`
      },
      "&:disabled": {
        cursor: "default"
      }
    },
    ".takes-viewer": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.xs),
      // OutputRenderer's video path sizes to its container; give clips their
      // natural height inside the card instead of a collapsed 100%-of-auto.
      "& video": {
        width: "100%",
        height: "auto"
      }
    },
    ".takes-label": {
      color: theme.vars.palette.text.secondary
    }
  });

const versionKey = (ref: ImageRef | VideoRef, index: number): string =>
  ref.asset_id ?? ref.uri ?? String(index);

const ShotTakesGalleryInner: React.FC<ShotTakesGalleryProps> = ({
  boardId,
  shot,
  readOnly
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const selectKeyframeVersion = useStoryboardStore(
    (state) => state.selectKeyframeVersion
  );
  const selectClipVersion = useStoryboardStore(
    (state) => state.selectClipVersion
  );

  const stills = useMemo(
    () => shot.keyframe_versions ?? (shot.keyframe ? [shot.keyframe] : []),
    [shot.keyframe_versions, shot.keyframe]
  );
  const clips = useMemo(
    () => shot.clip_versions ?? (shot.clip ? [shot.clip] : []),
    [shot.clip_versions, shot.clip]
  );

  const selectedStill = shot.keyframe
    ? stills.findIndex((v) => sameMediaRef(v, shot.keyframe as ImageRef))
    : -1;
  const selectedClip = shot.clip
    ? clips.findIndex((v) => sameMediaRef(v, shot.clip as VideoRef))
    : -1;

  const handleSelectStill = useCallback(
    (index: number) => {
      selectKeyframeVersion(boardId, shot.id, index);
    },
    [selectKeyframeVersion, boardId, shot.id]
  );

  const handleSelectClip = useCallback(
    (index: number) => {
      selectClipVersion(boardId, shot.id, index);
      // Keep a linked, already-assembled timeline on the newly chosen take.
      const assetId = clips[index]?.asset_id;
      if (assetId) {
        void syncShotClipToTimeline(boardId, shot.id, assetId);
      }
    },
    [selectClipVersion, boardId, shot.id, clips]
  );

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  // Nothing to browse until a shot has more than one version of something.
  if (stills.length <= 1 && clips.length <= 1) {
    return null;
  }

  const countLabel = [
    stills.length > 1 ? `${stills.length} stills` : null,
    clips.length > 1 ? `${clips.length} clips` : null
  ]
    .filter((p): p is string => p !== null)
    .join(" · ");

  return (
    <div css={styles(theme)} className="takes">
      <FlexRow align="center" justify="space-between" gap={1}>
        <Caption className="takes-label">{`Takes — ${countLabel}`}</Caption>
        <EditorButton onClick={handleToggle}>
          {expanded ? "Hide takes" : "View takes"}
        </EditorButton>
      </FlexRow>

      {stills.length > 1 && (
        <FlexRow gap={0.5} align="center" wrap className="still-thumbs">
          <Caption color="secondary">Stills</Caption>
          {stills.map((still, i) => (
            <button
              key={versionKey(still, i)}
              type="button"
              className="take-thumb"
              aria-label={`Use still ${i + 1}`}
              aria-pressed={i === selectedStill}
              disabled={readOnly}
              onClick={() => handleSelectStill(i)}
            >
              {still.uri ? <img src={still.uri} alt="" /> : <span>{i + 1}</span>}
            </button>
          ))}
        </FlexRow>
      )}

      {clips.length > 1 && (
        <FlexRow gap={0.5} align="center" wrap className="clip-chips">
          <Caption color="secondary">Clips</Caption>
          {clips.map((clip, i) => (
            <Chip
              key={versionKey(clip, i)}
              compact
              clickable={!readOnly}
              color={i === selectedClip ? "primary" : "default"}
              label={`Take ${i + 1}`}
              onClick={readOnly ? undefined : () => handleSelectClip(i)}
            />
          ))}
        </FlexRow>
      )}

      {expanded && (
        <FlexColumn gap={0.5} className="takes-viewer">
          {stills.length > 0 && (
            <>
              <Caption color="secondary">Stills</Caption>
              <OutputRenderer value={stills} showTextActions={false} />
            </>
          )}
          {clips.length > 0 && (
            <>
              <Caption color="secondary">Clips</Caption>
              <OutputRenderer value={clips} showTextActions={false} />
            </>
          )}
        </FlexColumn>
      )}
    </div>
  );
};

export const ShotTakesGallery = memo(ShotTakesGalleryInner);
ShotTakesGallery.displayName = "ShotTakesGallery";

export default ShotTakesGallery;
