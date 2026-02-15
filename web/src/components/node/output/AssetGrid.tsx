import React, { memo, useMemo, useCallback } from "react";
import { AssetRef } from "../../../stores/ApiTypes";
import PreviewImageGrid from "../PreviewImageGrid";
import { resolveAssetUri } from "./hooks";
import isEqual from "lodash/isEqual";

type Props = {
  values: AssetRef[];
  onOpenIndex: (index: number) => void;
};

export const AssetGrid: React.FC<Props> = ({ values, onOpenIndex }) => {
  // Memoize the filtered and mapped images array to avoid recomputation on every render
  const images = useMemo(() => {
    return values
      .filter((item) => item && (item as any).type === "image")
      .map((item) =>
        (item as any).uri
          ? resolveAssetUri((item as any).uri as string)
          : ((item as any).data as unknown as Uint8Array)
      );
  }, [values]);

  // Stable callback for PreviewImageGrid
  const handleDoubleClick = useCallback((index: number) => {
    onOpenIndex(index);
  }, [onOpenIndex]);

  return <PreviewImageGrid images={images} onDoubleClick={handleDoubleClick} />;
};

// Custom comparison function to prevent unnecessary re-renders
const arePropsEqual = (prevProps: Props, nextProps: Props) => {
  return (
    prevProps.onOpenIndex === nextProps.onOpenIndex &&
    prevProps.values.length === nextProps.values.length &&
    prevProps.values.every((value, i) => {
      const nextValue = nextProps.values[i];
      return value === nextValue;
    })
  );
};

export default memo(AssetGrid, arePropsEqual);
