/** @jsxImportSource @emotion/react */
import React from "react";
import { ImageComparer } from "../../widgets";

export interface ImageComparisonData {
  type: "image_comparison";
  image_a: {
    uri?: string;
    data?: string;
  };
  image_b: {
    uri?: string;
    data?: string;
  };
  label_a?: string;
  label_b?: string;
}

interface ImageComparisonRendererProps {
  value: ImageComparisonData;
}

const getImageUrl = (image: { uri?: string; data?: string }): string => {
  if (image.uri) {
    return image.uri;
  }
  if (image.data) {
    // Handle base64 or data URI
    if (image.data.startsWith("data:")) {
      return image.data;
    }
    return `data:image/png;base64,${image.data}`;
  }
  return "";
};

export const ImageComparisonRenderer: React.FC<ImageComparisonRendererProps> = ({
  value
}) => {
  const imageAUrl = getImageUrl(value.image_a);
  const imageBUrl = getImageUrl(value.image_b);

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

