/**
 * ShotTakesGallery
 *
 * The takes browser for one shot: every generated still and every rendered
 * clip, viewable in place — from the first one, since a shot with a single
 * still and a single clip still needs somewhere to show them. The galleries
 * reuse {@link OutputRenderer} — the same component that renders node results
 * — so an array of stills gets the asset grid (double-click opens the
 * fullscreen viewer) and clips get the standard video players. Still
 * thumbnails and take chips above each gallery pick the selected still/clip —
 * the one the card shows, the clip render animates, and export uses.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import type { ImageRef, Shot, VideoRef } from "@nodetool-ai/protocol";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FullscreenIcon from "@mui/icons-material/Fullscreen";

import {
  Box,
  Caption,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  ToolbarIconButton,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import OutputRenderer from "../node/OutputRenderer";
import ShotMediaViewer from "./ShotMediaViewer";
import {
  sameMediaRef,
  useStoryboardStore
} from "../../stores/storyboard/StoryboardStore";
import { syncShotClipToTimeline } from "../../stores/storyboard/timelineSync";
import { useResolvedMediaUris } from "../../hooks/useResolvedMediaUri";
import { ResponsiveImage } from "../ui_primitives";

interface ShotTakesGalleryProps {
  boardId: string;
  shot: Shot;
  readOnly?: boolean;
}

const takeThumbSx = {
  width: getSpacingPx(28),
  aspectRatio: "16 / 9",
  p: 0,
  overflow: "hidden",
  cursor: "pointer",
  borderRadius: BORDER_RADIUS.sm,
  border: "1px solid",
  borderColor: "divider",
  bgcolor: "c_overlay_subtle",
  display: "grid",
  placeItems: "center",
  color: "text.secondary",
  "& img": {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block"
  },
  // Unselected takes sit back; the selected one is the only lit thumbnail,
  // marked by a border rather than a glow.
  opacity: 0.6,
  "&:hover": { opacity: 1 },
  "&[aria-pressed='true']": {
    opacity: 1,
    borderColor: "primary.main"
  },
  "&:disabled": {
    cursor: "default"
  }
} as const;

const takeWrapSx = {
  position: "relative",
  display: "inline-flex"
} as const;

// The take actions belong to the take under the pointer, not to every take in
// the panel: hovering anywhere in the column used to reveal all of them, and on
// a thumbnail this size they cover the image they act on.
const takeActionSx = {
  opacity: 0,
  ".take:hover &": { opacity: 1 },
  "&:focus-visible": { opacity: 1 },
  // Touch devices cannot hover; keep the affordance reachable.
  "@media (pointer: coarse)": { opacity: 1 }
} as const;

const viewButtonSx = {
  ...takeActionSx,
  position: "absolute",
  bottom: SPACING.micro,
  right: SPACING.micro,
  bgcolor: "c_scrim_soft"
} as const;

const removeButtonSx = {
  ...takeActionSx,
  position: "absolute",
  top: SPACING.micro,
  right: SPACING.micro,
  bgcolor: "c_scrim_soft"
} as const;

// Both take rows lead with the same fixed-width label so the thumbnails and
// the chips line up under each other.
const takeRowLabelSx = { width: getSpacingPx(9), flexShrink: 0 } as const;

const versionKey = (ref: ImageRef | VideoRef, index: number): string =>
  ref.asset_id ?? ref.uri ?? String(index);

const ShotTakesGalleryInner: React.FC<ShotTakesGalleryProps> = ({
  boardId,
  shot,
  readOnly
}) => {
  const [expanded, setExpanded] = useState(false);
  // The take the fullscreen viewer shows; null when it is closed.
  const [viewerMedia, setViewerMedia] = useState<ImageRef | VideoRef | null>(
    null
  );
  const selectKeyframeVersion = useStoryboardStore(
    (state) => state.selectKeyframeVersion
  );
  const removeKeyframeVersion = useStoryboardStore(
    (state) => state.removeKeyframeVersion
  );
  const removeClipVersion = useStoryboardStore(
    (state) => state.removeClipVersion
  );
  const selectClipVersion = useStoryboardStore(
    (state) => state.selectClipVersion
  );

  const isGenerating =
    shot.status === "keyframe_generating" || shot.status === "clip_generating";

  const stills = useMemo(
    () => shot.keyframe_versions ?? (shot.keyframe ? [shot.keyframe] : []),
    [shot.keyframe_versions, shot.keyframe]
  );
  const clips = useMemo(
    () => shot.clip_versions ?? (shot.clip ? [shot.clip] : []),
    [shot.clip_versions, shot.clip]
  );
  // Whether each still has anything to show at all; `ResponsiveImage` resolves
  // the `asset://` locator itself.
  const stillThumbSrcs = useResolvedMediaUris(stills);

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

  const handleRemoveStill = useCallback(
    (index: number) => {
      removeKeyframeVersion(boardId, shot.id, index);
    },
    [removeKeyframeVersion, boardId, shot.id]
  );

  const handleRemoveClip = useCallback(
    (index: number) => {
      removeClipVersion(boardId, shot.id, index);
    },
    [removeClipVersion, boardId, shot.id]
  );

  const handleCloseViewer = useCallback(() => setViewerMedia(null), []);

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  // Nothing to browse until a shot has rendered something.
  if (stills.length === 0 && clips.length === 0) {
    return null;
  }

  return (
    <FlexColumn gap={SPACING.xs} className="takes">
      {stills.length > 0 && (
        <FlexRow
          gap={SPACING.micro}
          align="center"
          wrap
          className="still-thumbs"
        >
          <Caption color="secondary" sx={takeRowLabelSx}>
            Stills
          </Caption>
          {stills.map((still, i) => (
            <Box key={versionKey(still, i)} className="take" sx={takeWrapSx}>
              <Box
                component="button"
                type="button"
                aria-label={`Use still ${i + 1}`}
                aria-pressed={i === selectedStill}
                disabled={readOnly}
                onClick={() => handleSelectStill(i)}
                onDoubleClick={() => setViewerMedia(still)}
                sx={takeThumbSx}
              >
                {stillThumbSrcs[i] ? (
                  <ResponsiveImage
                    locator={still}
                    alt=""
                    fit="cover"
                    sx={{ width: "100%", height: "100%" }}
                  />
                ) : (
                  <span>{i + 1}</span>
                )}
              </Box>
              {!readOnly && (
                <ToolbarIconButton
                  icon={<DeleteOutlineIcon sx={{ fontSize: "1em" }} />}
                  tooltip="Remove still"
                  ariaLabel={`Remove still ${i + 1}`}
                  onClick={() => handleRemoveStill(i)}
                  disabled={isGenerating}
                  sx={removeButtonSx}
                  variant="error"
                />
              )}
              <ToolbarIconButton
                icon={<FullscreenIcon sx={{ fontSize: "1em" }} />}
                tooltip="View fullscreen"
                ariaLabel={`View still ${i + 1} fullscreen`}
                onClick={() => setViewerMedia(still)}
                sx={viewButtonSx}
              />
            </Box>
          ))}
        </FlexRow>
      )}

      {clips.length > 0 && (
        <FlexRow gap={SPACING.micro} align="center" wrap className="clip-chips">
          <Caption color="secondary" sx={takeRowLabelSx}>
            Clips
          </Caption>
          {clips.map((clip, i) => (
            <FlexRow
              key={versionKey(clip, i)}
              className="take"
              align="center"
              gap={0}
            >
              <Chip
                compact
                clickable={!readOnly}
                variant="outlined"
                label={`Take ${i + 1}`}
                sx={{
                  borderRadius: BORDER_RADIUS.pill,
                  color: i === selectedClip ? "text.primary" : "text.secondary",
                  borderColor: i === selectedClip ? "primary.main" : "divider"
                }}
                onClick={readOnly ? undefined : () => handleSelectClip(i)}
              />
              {!readOnly && (
                <ToolbarIconButton
                  icon={<DeleteOutlineIcon sx={{ fontSize: "1em" }} />}
                  tooltip="Remove clip"
                  ariaLabel={`Remove clip ${i + 1}`}
                  onClick={() => handleRemoveClip(i)}
                  disabled={isGenerating}
                  variant="error"
                  sx={takeActionSx}
                />
              )}
              <ToolbarIconButton
                icon={<FullscreenIcon sx={{ fontSize: "1em" }} />}
                tooltip="View fullscreen"
                ariaLabel={`View clip take ${i + 1} fullscreen`}
                onClick={() => setViewerMedia(clip)}
                sx={takeActionSx}
              />
            </FlexRow>
          ))}
        </FlexRow>
      )}

      <FlexRow align="center">
        <EditorButton
          onClick={handleToggle}
          sx={{
            color: "text.secondary",
            "&:hover": { color: "text.primary", bgcolor: "c_overlay_subtle" }
          }}
        >
          {expanded ? "Hide takes" : "View takes"}
        </EditorButton>
      </FlexRow>

      {expanded && (
        <FlexColumn
          gap={SPACING.xs}
          sx={{ "& video": { width: "100%", height: "auto" } }}
        >
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

      <ShotMediaViewer
        boardId={boardId}
        media={viewerMedia}
        onClose={handleCloseViewer}
      />
    </FlexColumn>
  );
};

export const ShotTakesGallery = memo(ShotTakesGalleryInner);
ShotTakesGallery.displayName = "ShotTakesGallery";

export default ShotTakesGallery;
