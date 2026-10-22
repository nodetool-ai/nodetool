/**
 * ShotTakesGallery
 *
 * The takes browser for one shot: every generated still and every rendered
 * clip, viewable in place — from the first one, since a shot with a single
 * still and a single clip still needs somewhere to show them. The galleries
 * reuse {@link OutputRenderer} — the same component that renders node results
 * — so an array of stills gets the asset grid (double-click opens the
 * fullscreen viewer) and clips get the standard video players. Above them,
 * stills and clips share one tile row each: clicking a tile makes it the
 * selected still or clip — the one the card shows, the clip render animates,
 * and export uses.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Theme } from "@mui/material/styles";
import type { ImageRef, Shot, VideoRef } from "@nodetool-ai/protocol";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FullscreenIcon from "@mui/icons-material/Fullscreen";

import {
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  ToolbarIconButton,
  SPACING,
  getSpacingPx,
  selectableTileStyles
} from "../ui_primitives";
import OutputRenderer from "../node/OutputRenderer";
import ShotMediaViewer from "./ShotMediaViewer";
import {
  sameMediaRef,
  useStoryboardStore
} from "../../stores/storyboard/StoryboardStore";
import { syncShotClipToTimeline } from "../../stores/storyboard/timelineSync";
import {
  useResolvedMedia,
  useResolvedMediaUris
} from "../../hooks/useResolvedMediaUri";
import { useVideoThumbnail } from "../../hooks/useVideoThumbnail";
import { asResolvedMediaUrl } from "../../utils/resolveMediaUri";
import { ResponsiveImage } from "../ui_primitives";

interface ShotTakesGalleryProps {
  boardId: string;
  shot: Shot;
  readOnly?: boolean;
}

const takeThumbSx = (selected: boolean) => (theme: Theme) => ({
  width: getSpacingPx(28),
  aspectRatio: "16 / 9",
  p: 0,
  overflow: "hidden",
  cursor: "pointer",
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
  ...selectableTileStyles(theme, { selected }),
  "&:disabled": {
    cursor: "default"
  }
});

// On a touch screen the take actions are always shown, and two buttons on a
// thumbnail this size cover most of it and each other. They move under the
// thumbnail instead, side by side.
const takeWrapSx = {
  position: "relative",
  display: "inline-flex",
  "@media (pointer: coarse)": {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    justifyItems: "center",
    "& > :first-of-type": { gridColumn: "1 / -1" }
  }
} as const;

const coarseStaticSx = {
  "@media (pointer: coarse)": {
    opacity: 1,
    position: "static",
    bgcolor: "transparent"
  }
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
  bottom: getSpacingPx(SPACING.micro),
  right: getSpacingPx(SPACING.micro),
  bgcolor: "c_scrim_soft",
  ...coarseStaticSx
} as const;

const removeButtonSx = {
  ...takeActionSx,
  position: "absolute",
  top: getSpacingPx(SPACING.micro),
  right: getSpacingPx(SPACING.micro),
  bgcolor: "c_scrim_soft",
  ...coarseStaticSx
} as const;

// Both take rows lead with the same fixed-width label so the thumbnails and
// the chips line up under each other.
const takeRowLabelSx = { width: getSpacingPx(9), flexShrink: 0 } as const;

const versionKey = (ref: ImageRef | VideoRef, index: number): string =>
  ref.asset_id ?? ref.uri ?? String(index);

/** A clip take's poster frame, or its number while there is none. */
const ClipTakeThumb: React.FC<{ clip: VideoRef; index: number }> = ({
  clip,
  index
}) => {
  const { i18n } = useTranslation();
  const { url, thumbUrl } = useResolvedMedia(clip);
  const poster = asResolvedMediaUrl(useVideoThumbnail(thumbUrl, url));
  const number = new Intl.NumberFormat(
    i18n.resolvedLanguage ?? i18n.language
  ).format(index + 1);
  return poster ? (
    <ResponsiveImage
      src={poster}
      alt=""
      fit="cover"
      sx={{ width: "100%", height: "100%" }}
    />
  ) : (
    <span>{number}</span>
  );
};

const ShotTakesGalleryInner: React.FC<ShotTakesGalleryProps> = ({
  boardId,
  shot,
  readOnly
}) => {
  const { t, i18n } = useTranslation();
  const formatNumber = useCallback(
    (value: number) =>
      new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language).format(
        value
      ),
    [i18n.language, i18n.resolvedLanguage]
  );
  const [expanded, setExpanded] = useState(false);
  // The take the fullscreen viewer shows; null when it is closed.
  const [viewerMedia, setViewerMedia] = useState<ImageRef | VideoRef | null>(
    null
  );
  const acceptKeyframeVersion = useStoryboardStore(
    (state) => state.acceptKeyframeVersion
  );
  const removeKeyframeVersion = useStoryboardStore(
    (state) => state.removeKeyframeVersion
  );
  const removeClipVersion = useStoryboardStore(
    (state) => state.removeClipVersion
  );
  const acceptClipVersion = useStoryboardStore(
    (state) => state.acceptClipVersion
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

  const handleAcceptStill = useCallback(
    (index: number) => {
      acceptKeyframeVersion(boardId, shot.id, index);
    },
    [acceptKeyframeVersion, boardId, shot.id]
  );

  const handleUseClip = useCallback(
    (index: number) => {
      acceptClipVersion(boardId, shot.id, index);
      // Keep a linked, already-assembled timeline on the newly chosen take.
      const assetId = clips[index]?.asset_id;
      if (assetId) {
        void syncShotClipToTimeline(boardId, shot.id, assetId);
      }
    },
    [acceptClipVersion, boardId, shot.id, clips]
  );

  const handlePreviewClip = useCallback(
    (index: number) => {
      const clip = clips[index];
      if (!clip) return;
      setViewerMedia(clip);
    },
    [clips]
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
      // Removing the current take promotes another one: move a linked,
      // already-assembled timeline onto it so it stops playing the removed take.
      const next = useStoryboardStore
        .getState()
        .boards[boardId]?.shots.find((s) => s.id === shot.id)?.clip;
      if (next?.asset_id && next.asset_id !== shot.clip?.asset_id) {
        void syncShotClipToTimeline(boardId, shot.id, next.asset_id);
      }
    },
    [removeClipVersion, boardId, shot.id, shot.clip?.asset_id]
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
            {t("i18n-cont-storyboard-04.storyboard.takesGallery.stills")}
          </Caption>
          {stills.map((still, i) => {
            const isCurrent = i === selectedStill;
            return (
              <FlexRow
                key={versionKey(still, i)}
                className="take"
                align="center"
                gap={SPACING.micro}
              >
                <Box sx={takeWrapSx}>
                  <Box
                    component="button"
                    type="button"
                    aria-label={
                      isCurrent
                        ? t(
                            "i18n-cont-storyboard-04.storyboard.takesGallery.currentStill",
                            { number: formatNumber(i + 1) }
                          )
                        : readOnly
                          ? t(
                              "i18n-cont-storyboard-04.storyboard.takesGallery.previewStill",
                              { number: formatNumber(i + 1) }
                            )
                          : t(
                              "i18n-cont-storyboard-04.storyboard.takesGallery.useStill",
                              { number: formatNumber(i + 1) }
                            )
                    }
                    aria-current={isCurrent ? "true" : undefined}
                    onClick={() =>
                      readOnly || isCurrent
                        ? setViewerMedia(still)
                        : handleAcceptStill(i)
                    }
                    sx={takeThumbSx(isCurrent)}
                  >
                    {stillThumbSrcs[i] ? (
                      <ResponsiveImage
                        locator={still}
                        preferThumbnail
                        alt=""
                        fit="cover"
                        sx={{ width: "100%", height: "100%" }}
                      />
                    ) : (
                      <span>{formatNumber(i + 1)}</span>
                    )}
                  </Box>
                  {!readOnly && (
                    <ToolbarIconButton
                      icon={<DeleteOutlineIcon fontSize="inherit" />}
                      tooltip={t("i18n-cont-storyboard-04.storyboard.takesGallery.removeStill")}
                      ariaLabel={t(
                        "i18n-cont-storyboard-04.storyboard.takesGallery.removeStillNumbered",
                        { number: formatNumber(i + 1) }
                      )}
                      onClick={() => handleRemoveStill(i)}
                      disabled={isGenerating}
                      sx={removeButtonSx}
                      variant="error"
                    />
                  )}
                  <ToolbarIconButton
                    icon={<FullscreenIcon fontSize="inherit" />}
                    tooltip={t("i18n-cont-storyboard-04.storyboard.takesGallery.viewFullscreen")}
                    ariaLabel={t(
                      "i18n-cont-storyboard-04.storyboard.takesGallery.viewStillFullscreen",
                      { number: formatNumber(i + 1) }
                    )}
                    onClick={() => setViewerMedia(still)}
                    sx={viewButtonSx}
                  />
                </Box>
              </FlexRow>
            );
          })}
        </FlexRow>
      )}

      {clips.length > 0 && (
        <FlexRow
          gap={SPACING.micro}
          align="center"
          wrap
          className="clip-thumbs"
        >
          <Caption color="secondary" sx={takeRowLabelSx}>
            {t("i18n-cont-storyboard-04.storyboard.takesGallery.clips")}
          </Caption>
          {clips.map((clip, i) => {
            const isCurrent = i === selectedClip;
            return (
              <FlexRow
                key={versionKey(clip, i)}
                className="take"
                align="center"
                gap={SPACING.micro}
              >
                <Box sx={takeWrapSx}>
                  <Box
                    component="button"
                    type="button"
                    aria-label={
                      isCurrent
                        ? t(
                            "i18n-cont-storyboard-04.storyboard.takesGallery.currentClip",
                            { number: formatNumber(i + 1) }
                          )
                        : readOnly
                          ? t(
                              "i18n-cont-storyboard-04.storyboard.takesGallery.previewClip",
                              { number: formatNumber(i + 1) }
                            )
                          : t(
                              "i18n-cont-storyboard-04.storyboard.takesGallery.useClip",
                              { number: formatNumber(i + 1) }
                            )
                    }
                    aria-current={isCurrent ? "true" : undefined}
                    onClick={() =>
                      readOnly || isCurrent
                        ? handlePreviewClip(i)
                        : handleUseClip(i)
                    }
                    sx={takeThumbSx(isCurrent)}
                  >
                    <ClipTakeThumb clip={clip} index={i} />
                  </Box>
                  {!readOnly && (
                    <ToolbarIconButton
                      icon={<DeleteOutlineIcon fontSize="inherit" />}
                      tooltip={t("i18n-cont-storyboard-04.storyboard.takesGallery.removeClip")}
                      ariaLabel={t(
                        "i18n-cont-storyboard-04.storyboard.takesGallery.removeClipNumbered",
                        { number: formatNumber(i + 1) }
                      )}
                      onClick={() => handleRemoveClip(i)}
                      disabled={isGenerating}
                      sx={removeButtonSx}
                      variant="error"
                    />
                  )}
                  <ToolbarIconButton
                    icon={<FullscreenIcon fontSize="inherit" />}
                    tooltip={t("i18n-cont-storyboard-04.storyboard.takesGallery.viewFullscreen")}
                    ariaLabel={t(
                      "i18n-cont-storyboard-04.storyboard.takesGallery.viewClipFullscreen",
                      { number: formatNumber(i + 1) }
                    )}
                    onClick={() => setViewerMedia(clip)}
                    sx={viewButtonSx}
                  />
                </Box>
              </FlexRow>
            );
          })}
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
          {expanded
            ? t("i18n-cont-storyboard-04.storyboard.takesGallery.hideTakes")
            : t("i18n-cont-storyboard-04.storyboard.takesGallery.viewTakes")}
        </EditorButton>
      </FlexRow>

      {expanded && (
        <FlexColumn
          gap={SPACING.xs}
          sx={{ "& video": { width: "100%", height: "auto" } }}
        >
          {stills.length > 0 && (
            <>
              <Caption color="secondary">
                {t("i18n-cont-storyboard-04.storyboard.takesGallery.stills")}
              </Caption>
              <OutputRenderer value={stills} showTextActions={false} />
            </>
          )}
          {clips.length > 0 && (
            <>
              <Caption color="secondary">
                {t("i18n-cont-storyboard-04.storyboard.takesGallery.clips")}
              </Caption>
              <OutputRenderer value={clips} showTextActions={false} />
            </>
          )}
        </FlexColumn>
      )}

      <ShotMediaViewer
        boardId={boardId}
        media={viewerMedia}
        readOnly={readOnly}
        onClose={handleCloseViewer}
      />
    </FlexColumn>
  );
};

export const ShotTakesGallery = memo(ShotTakesGalleryInner);
ShotTakesGallery.displayName = "ShotTakesGallery";

export default ShotTakesGallery;
