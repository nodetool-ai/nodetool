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
 * Each shot's action line rides over the media as a caption, so a frame says
 * which shot it belongs to without leaving the viewer.
 *
 * A board holds its media as `asset://` locators, so the records come from the
 * asset store; the viewer itself is {@link AssetViewer}, which is what gives
 * the shot media a download, copy, compare, and info panel for free. Its
 * filmstrip is built from `AssetItem`s, which reach for the context-menu
 * actions the explorer's shell provides — the board has no such shell, so the
 * gallery brings an inert provider of its own rather than crashing on the
 * missing context.
 */

import React, { memo, useMemo } from "react";
import type { ImageRef, Shot, VideoRef } from "@nodetool-ai/protocol";

import AssetViewer from "../assets/AssetViewer";
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
  onClose: () => void;
}

interface ShotMediaGalleryProps {
  boardId: string;
  media: ImageRef | VideoRef;
  onClose: () => void;
}

/** A shot's takes of one kind, in the order they were made. */
const shotMedia = (shot: Shot, kind: "image" | "video"): (ImageRef | VideoRef)[] =>
  kind === "video"
    ? (shot.clip_versions ?? (shot.clip ? [shot.clip] : []))
    : (shot.keyframe_versions ?? (shot.keyframe ? [shot.keyframe] : []));

/** The caption over a shot's media: which shot it is, and what happens in it. */
const shotCaption = (shot: Shot): string =>
  `SH ${String(shot.index + 1).padStart(2, "0")} · ${shot.action}`;

/**
 * The open gallery. Mounted only while there is something to show, so a
 * board's cards fetch nothing just by sitting in the grid.
 */
const ShotMediaGallery: React.FC<ShotMediaGalleryProps> = ({
  boardId,
  media,
  onClose
}) => {
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
        byAssetId[asset.id] = shotCaption(entries[index].shot);
      }
    });
    return byAssetId;
  }, [boardAssets, entries]);

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
      <AssetViewer
        asset={activeAsset}
        sortedAssets={galleryAssets}
        captions={captions}
        url={activeAsset ? undefined : url}
        contentType={
          activeAsset
            ? undefined
            : (contentType ?? (media.type === "video" ? "video/*" : "image/*"))
        }
        open
        onClose={onClose}
      />
    </ContextMenuProvider>
  );
};

const ShotMediaViewerInner: React.FC<ShotMediaViewerProps> = ({
  boardId,
  media,
  onClose
}) =>
  media ? (
    <ShotMediaGallery boardId={boardId} media={media} onClose={onClose} />
  ) : null;

export const ShotMediaViewer = memo(ShotMediaViewerInner);
ShotMediaViewer.displayName = "ShotMediaViewer";

export default ShotMediaViewer;
