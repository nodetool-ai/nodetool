import React, { memo } from "react";
import { AssetRef } from "../../../stores/ApiTypes";
import PreviewImageGrid, { ImageSource } from "../PreviewImageGrid";
import { resolveAssetUri } from "./hooks";

type Props = {
  values: AssetRef[];
  onOpenIndex: (index: number) => void;
  /** When false, multi-select / compare controls are hidden. Default true. */
  enableSelection?: boolean;
};

/**
 * Type guard to check if an AssetRef is an image type with data/uri
 */
function isImageValue(item: AssetRef): item is AssetRef & { data?: Uint8Array; uri: string } {
  return (item as { type?: string }).type === "image" &&
    ("uri" in item || "data" in item);
}

/** Count of images that {@link AssetGrid} will actually render (same filter as the grid). */
export function countPreviewGridImages(values: AssetRef[]): number {
  return values
    .filter(isImageValue)
    .map((item): ImageSource | undefined =>
      item.uri
        ? resolveAssetUri(item.uri)
        : item.data
    )
    .filter((image): image is ImageSource => image !== undefined).length;
}

export const AssetGrid: React.FC<Props> = ({ values, onOpenIndex, enableSelection = true }) => {
  // Memoize the expensive filter/map operations to avoid recalculating on every render
  const images: ImageSource[] = React.useMemo(
    () =>
      values
        .filter(isImageValue)
        .map((item): ImageSource | undefined =>
          item.uri
            ? resolveAssetUri(item.uri)
            : item.data
        )
        .filter((image): image is ImageSource => image !== undefined),
    [values]
  );
  return (
    <PreviewImageGrid
      images={images}
      onDoubleClick={onOpenIndex}
      enableSelection={enableSelection}
    />
  );
};

export default memo(AssetGrid);
