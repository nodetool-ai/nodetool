/**
 * Fullscreen gallery over the image generation feed. Opening a picture starts
 * on it, and the viewer's arrows, filmstrip and arrow keys page through the
 * feed in order. Mounted only while open, so the feed fetches no asset records
 * until someone asks for them.
 */
import { memo, useMemo } from "react";

import { useAssetsForLocators } from "../../../hooks/assets/useAssetsForLocators";
import { ContextMenuProvider } from "../../../providers/ContextMenuProvider";
import type { Asset } from "../../../stores/ApiTypes";
import AssetViewer from "../../assets/AssetViewer";

export interface ImageFeedGalleryEntry {
  key: string;
  assetId: string | null;
  /** The picture's URL, used for a result that is not in the library. */
  src: string | null;
  prompt: string;
}

interface ImageFeedGalleryProps {
  /** Copied when the gallery opens, so a new result cannot move the view. */
  entries: readonly ImageFeedGalleryEntry[];
  openKey: string;
  onClose: () => void;
}

/** A viewer record for a result with no asset row. */
const detachedAsset = (entry: ImageFeedGalleryEntry): Asset =>
  ({
    id: entry.key,
    name: entry.prompt.slice(0, 40),
    content_type: "image/png",
    get_url: entry.src,
    thumb_url: entry.src
  }) as Asset;

const ImageFeedGallery = ({ entries, openKey, onClose }: ImageFeedGalleryProps) => {
  const stored = useAssetsForLocators(
    useMemo(
      () => entries.map((entry) => (entry.assetId ? `asset://${entry.assetId}` : null)),
      [entries]
    )
  );

  const { assets, captions, detachedIds, openAsset } = useMemo(() => {
    const assets: Asset[] = [];
    const captions: Record<string, string> = {};
    const detachedIds = new Set<string>();
    let openAsset: Asset | undefined;
    entries.forEach((entry, index) => {
      // A stored record still loading stays out of the strip until it arrives.
      const asset =
        stored[index] ??
        (!entry.assetId && entry.src ? detachedAsset(entry) : undefined);
      if (!asset) {
        return;
      }
      assets.push(asset);
      if (!stored[index]) {
        detachedIds.add(asset.id);
      }
      if (entry.prompt) {
        captions[asset.id] = entry.prompt;
      }
      if (entry.key === openKey) {
        openAsset = asset;
      }
    });
    return { assets, captions, detachedIds, openAsset };
  }, [entries, openKey, stored]);

  if (!openAsset) {
    return null;
  }

  return (
    <ContextMenuProvider active={false}>
      <AssetViewer
        open
        asset={openAsset}
        sortedAssets={assets}
        captions={captions}
        detachedIds={detachedIds}
        onClose={onClose}
      />
    </ContextMenuProvider>
  );
};

export default memo(ImageFeedGallery);
