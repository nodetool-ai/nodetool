/**
 * ShotMediaViewer
 *
 * Fullscreen gallery over one storyboard's media. Opening it from a shot card
 * or a take thumbnail starts on that still or clip, and the same arrows,
 * filmstrip, and left/right keys the asset explorer has then page through the
 * board in shot order.
 *
 * Stills and clips are separate galleries. They are different passes over the
 * same board — comparing frames, or watching takes — and interleaving them
 * would put a video between two stills you are flipping between. What was
 * opened decides which gallery this is.
 *
 * Each item is captioned with its shot number. The description stays in the
 * selected-shot inspector.
 *
 * The toolbar leads with the shot's own actions ({@link ShotActions}), the
 * same ones its card shows, for whichever shot is on screen: paging to the
 * next shot's still brings that shot's actions. Editing or deleting the shot
 * closes the viewer, since what it was showing has moved or gone.
 *
 * A board holds its media as `asset://` locators, so the records come from the
 * asset store; the viewer itself is {@link AssetViewer}, which is what gives
 * the shot media a download, copy, compare, and info panel for free. Its
 * filmstrip is built from `AssetItem`s, which reach for the context-menu
 * actions the explorer's shell provides — the board has no such shell, so the
 * gallery brings an inert provider of its own rather than crashing on the
 * missing context.
 */

import React, { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ImageRef, Shot, VideoRef } from "@nodetool-ai/protocol";

import AssetViewer from "../assets/AssetViewer";
import { Box } from "../ui_primitives";
import ShotActions from "./ShotActions";
import type { Asset } from "../../stores/ApiTypes";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { useBoard } from "../../stores/storyboard/StoryboardStore";
import { useAssetsForLocators } from "../../hooks/assets/useAssetsForLocators";
import { assetIdOf } from "../../utils/mediaRef";
import { useResolvedMedia } from "../../hooks/useResolvedMediaUri";

interface ShotMediaViewerProps {
  /** The board whose media the gallery pages through. */
  boardId: string;
  /** The still or clip to open on, or nothing when the viewer is closed. */
  media: ImageRef | VideoRef | null | undefined;
  /** Hides the shot actions that change the board. */
  readOnly?: boolean;
  /** Opens a shot's editor. Without it the toolbar has no edit action. */
  onEdit?: (shotId: string, focus: "fields" | "dialogue") => void;
  onClose: () => void;
}

interface ShotMediaGalleryProps extends ShotMediaViewerProps {
  media: ImageRef | VideoRef;
}

/**
 * The viewer portals out of the DOM but not out of the React tree, which runs
 * through the shot card. A click in it would reach the card, select the shot,
 * and open the board's slideshow behind the viewer.
 */
const swallowEvent = (event: React.SyntheticEvent): void => {
  event.stopPropagation();
};

/** A shot's takes of one kind, in the order they were made. */
const shotMedia = (shot: Shot, kind: "image" | "video"): (ImageRef | VideoRef)[] =>
  kind === "video"
    ? (shot.clip_versions ?? (shot.clip ? [shot.clip] : []))
    : (shot.keyframe_versions ?? (shot.keyframe ? [shot.keyframe] : []));

/**
 * The open gallery. Mounted only while there is something to show, so a
 * board's cards fetch nothing just by sitting in the grid.
 */
const ShotMediaGallery: React.FC<ShotMediaGalleryProps> = ({
  boardId,
  media,
  readOnly,
  onEdit,
  onClose
}) => {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { shots } = useBoard(boardId);
  const kind = media.type === "video" ? "video" : "image";

  // The gallery's entries, each carrying the shot it came from so the caption
  // survives the walk from locator to asset record.
  const entries = useMemo(
    () =>
      shots.flatMap((shot) =>
        shotMedia(shot, kind).map((item) => ({ item, shot }))
      ),
    [shots, kind]
  );
  const boardAssets = useAssetsForLocators(
    useMemo(() => entries.map((entry) => entry.item), [entries])
  );
  // An asset still loading drops out of the strip rather than shifting it:
  // filtering keeps the remaining order, and the arrows stay on real items.
  const galleryAssets = useMemo(
    () => boardAssets.filter((asset) => asset !== undefined),
    [boardAssets]
  );
  const captions = useMemo(() => {
    const byAssetId: Record<string, string> = {};
    boardAssets.forEach((asset, index) => {
      if (asset) {
        const shotNumber = new Intl.NumberFormat(locale, {
          minimumIntegerDigits: 2,
          useGrouping: false
        }).format(entries[index].shot.index + 1);
        byAssetId[asset.id] = `SH ${shotNumber}`;
      }
    });
    return byAssetId;
  }, [boardAssets, entries, locale]);
  const shotIdByAssetId = useMemo(() => {
    const byAssetId = new Map<string, string>();
    boardAssets.forEach((asset, index) => {
      if (asset) {
        byAssetId.set(asset.id, entries[index].shot.id);
      }
    });
    return byAssetId;
  }, [boardAssets, entries]);

  const handleEdit = useCallback(
    (shotId: string, focus: "fields" | "dialogue") => {
      onClose();
      onEdit?.(shotId, focus);
    },
    [onClose, onEdit]
  );
  const renderShotActions = useCallback(
    (asset: Asset) => {
      const shotId = shotIdByAssetId.get(asset.id);
      const shot = shots.find((candidate) => candidate.id === shotId);
      return shot ? (
        <ShotActions
          // A fresh row per shot, so a dialog opened for one shot does not
          // stay open over the next one.
          key={shot.id}
          boardId={boardId}
          shot={shot}
          readOnly={readOnly}
          placement="inline"
          onEdit={onEdit ? handleEdit : undefined}
          onDeleted={onClose}
        />
      ) : null;
    },
    [shotIdByAssetId, shots, boardId, readOnly, onEdit, handleEdit, onClose]
  );

  const activeId = assetIdOf(media);
  const activeAsset = useMemo(
    () => galleryAssets.find((asset) => asset.id === activeId),
    [galleryAssets, activeId]
  );

  // The fallback while the clicked asset's record is in flight, and the answer
  // for media that is a plain URL rather than a stored asset.
  const { url, contentType } = useResolvedMedia(media);

  if (!activeAsset && !url) {
    return null;
  }

  return (
    // The board mounts no context menus, so opening one is a no-op here.
    <ContextMenuProvider active={false}>
      <Box
        onClick={swallowEvent}
        onDoubleClick={swallowEvent}
        sx={{ display: "contents" }}
      >
        <AssetViewer
          asset={activeAsset}
          sortedAssets={galleryAssets}
          captions={captions}
          renderActions={renderShotActions}
          url={activeAsset ? undefined : url}
          contentType={
            activeAsset
              ? undefined
              : (contentType ?? (media.type === "video" ? "video/*" : "image/*"))
          }
          open
          onClose={onClose}
        />
      </Box>
    </ContextMenuProvider>
  );
};

const ShotMediaViewerInner: React.FC<ShotMediaViewerProps> = ({
  media,
  ...props
}) => (media ? <ShotMediaGallery media={media} {...props} /> : null);

export const ShotMediaViewer = memo(ShotMediaViewerInner);
ShotMediaViewer.displayName = "ShotMediaViewer";

export default ShotMediaViewer;
