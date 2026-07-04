import React, { memo } from "react";
import { AssetRef } from "../../../stores/ApiTypes";
import PreviewImageGrid, { ImageSource } from "../PreviewImageGrid";
import { trpc } from "../../../trpc/client";

type Props = {
  values: AssetRef[];
  onOpenIndex: (index: number) => void;
  /** When false, multi-select / compare controls are hidden. Default true. */
  enableSelection?: boolean;
};

/**
 * Type guard to check if an AssetRef is an image type with data/uri
 */
function isImageValue(item: AssetRef): item is AssetRef & { data?: Uint8Array; uri?: string } {
  return (item as { type?: string }).type === "image" &&
    ("uri" in item || "data" in item);
}

function extractStorageKey(uri: string | undefined): string | null {
  if (!uri) return null;
  if (uri.startsWith("asset://")) return uri.slice("asset://".length);
  if (uri.startsWith("/api/storage/")) return uri.slice("/api/storage/".length);
  return null;
}

/**
 * Fetches signed URLs for all URI-based image items in a single batch.
 */
function useSignedImageSources(
  items: (AssetRef & { data?: Uint8Array; uri?: string })[]
): ImageSource[] {
  const uriItems = React.useMemo(() => items.filter((item) => item.uri), [items]);
  const staleTime = 6 * 24 * 60 * 60 * 1000;

  const results = trpc.useQueries((t) =>
    uriItems.map((item) => {
      const key = extractStorageKey(item.uri);
      return t.storage.signUrl(
        { key: key ?? "" },
        { enabled: Boolean(key), staleTime }
      );
    })
  );

  const uriIndexMap = React.useMemo(() => {
    const map = new Map<object, number>();
    uriItems.forEach((item, i) => map.set(item, i));
    return map;
  }, [uriItems]);

  return React.useMemo(
    () =>
      items
        .map((item): ImageSource | undefined => {
          if (item.uri) {
            const idx = uriIndexMap.get(item) ?? -1;
            return results[idx]?.data?.url ?? item.uri;
          }
          return item.data;
        })
        .filter((img): img is ImageSource => img !== undefined),
    [items, uriIndexMap, results]
  );
}

export const AssetGrid: React.FC<Props> = ({ values, onOpenIndex, enableSelection = true }) => {
  const imageItems = React.useMemo(
    () => values.filter(isImageValue),
    [values]
  );
  const images = useSignedImageSources(imageItems);
  return (
    <PreviewImageGrid
      images={images}
      onDoubleClick={onOpenIndex}
      enableSelection={enableSelection}
    />
  );
};

export default memo(AssetGrid);
