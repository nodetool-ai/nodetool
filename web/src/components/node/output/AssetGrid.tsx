import React, { memo } from "react";
import { AssetRef } from "../../../stores/ApiTypes";
import PreviewImageGrid, { ImageSource } from "../PreviewImageGrid";
import { resolveAssetUri } from "./hooks";

type Props = {
  values: AssetRef[];
  onOpenIndex: (index: number) => void;
};

/**
 * Type guard to check if an AssetRef is an image type with data/uri
 */
function isImageValue(item: AssetRef): item is AssetRef & { data?: Uint8Array; uri: string } {
  return (item as { type?: string }).type === "image" &&
    ("uri" in item || "data" in item);
}

export const AssetGrid: React.FC<Props> = ({ values, onOpenIndex }) => {
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
  return <PreviewImageGrid images={images} onDoubleClick={onOpenIndex} />;
};

export default memo(AssetGrid);
