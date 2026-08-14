import type { Audio, Image, Video } from "../../stores/ApiTypes";
import { useAsset } from "../../serverState/useAsset";
import { resolveUri } from "../../utils/imageUtils";

type MediaItem = { uri: string; asset_id?: string };

function useDisplayUri(
  kind: "image" | "video" | "audio",
  item: MediaItem
): string {
  const { uri } = useAsset(
    kind === "image"
      ? { image: item as Image }
      : kind === "video"
        ? { video: item as Video }
        : { audio: item as Audio }
  );
  return resolveUri(uri ?? item.uri);
}

export function ListImageThumb({
  item,
  alt,
  imgRef,
  onLoad
}: {
  item: MediaItem;
  alt: string;
  imgRef?: (el: HTMLImageElement | null) => void;
  onLoad?: () => void;
}) {
  const src = useDisplayUri("image", item);
  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      draggable={false}
      onLoad={onLoad}
    />
  );
}

export function ListVideoThumb({
  item,
  label
}: {
  item: MediaItem;
  label: string;
}) {
  const src = useDisplayUri("video", item);
  return (
    <video src={src} controls muted preload="metadata" aria-label={label} />
  );
}

export function ListAudioThumb({
  item,
  label
}: {
  item: MediaItem;
  label: string;
}) {
  const src = useDisplayUri("audio", item);
  return <audio src={src} controls preload="metadata" aria-label={label} />;
}
