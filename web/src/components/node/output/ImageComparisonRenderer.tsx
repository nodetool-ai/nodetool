/** @jsxImportSource @emotion/react */
import React, { useMemo, useRef } from "react";
import { ImageComparer } from "../../widgets";
import { createImageUrl, ImageData } from "./image";

export interface ImageComparisonData {
  type: "image_comparison";
  image_a: {
    uri?: string;
    data?: ImageData;
  };
  image_b: {
    uri?: string;
    data?: ImageData;
  };
  label_a?: string;
  label_b?: string;
}

interface ImageComparisonRendererProps {
  value: ImageComparisonData;
}

export const ImageComparisonRenderer: React.FC<ImageComparisonRendererProps> = ({
  value
}) => {
  const blobUrlARef = useRef<string | null>(null);
  const blobUrlBRef = useRef<string | null>(null);

  const { imageAUrl, imageBUrl } = useMemo(() => {
    const resultA = createImageUrl(value.image_a, blobUrlARef.current);
    const resultB = createImageUrl(value.image_b, blobUrlBRef.current);

    blobUrlARef.current = resultA.blobUrl;
    blobUrlBRef.current = resultB.blobUrl;

    return { imageAUrl: resultA.url, imageBUrl: resultB.url };
  }, [value.image_a, value.image_b]);

  if (!imageAUrl || !imageBUrl) {
    return <div>Missing image data for comparison</div>;
  }

  return (
    <div style={{ width: "100%", height: "100%", minHeight: "200px" }}>
      <ImageComparer
        imageA={imageAUrl}
        imageB={imageBUrl}
        labelA={value.label_a || "A"}
        labelB={value.label_b || "B"}
        showLabels={true}
        showMetadata={true}
        initialMode="horizontal"
      />
    </div>
  );
};

export default ImageComparisonRenderer;

