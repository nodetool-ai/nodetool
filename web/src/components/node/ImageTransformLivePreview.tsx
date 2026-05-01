import React, { useEffect, useMemo, useRef, useState } from "react";
import { Caption, FlexColumn } from "../ui_primitives";
import { useAsset } from "../../serverState/useAsset";
import { NodeData } from "../../stores/NodeData";
import {
  calculateImageTransformPreviewGeometry,
  renderImageTransformPreview
} from "../../utils/imageTransformPreview";

interface ImageTransformLivePreviewProps {
  nodeType: string;
  data: NodeData;
}

const ImageTransformLivePreview: React.FC<ImageTransformLivePreviewProps> = ({
  nodeType,
  data
}) => {
  const imageValue = data.properties?.image;
  const { uri } = useAsset({ image: imageValue });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawError, setDrawError] = useState<string | null>(null);

  const props = useMemo(() => (data.properties || {}) as Record<string, unknown>, [data.properties]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !uri) {
      return;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        setDrawError(null);
        const geometry = calculateImageTransformPreviewGeometry({
          nodeType,
          properties: props,
          sourceWidth: image.naturalWidth,
          sourceHeight: image.naturalHeight
        });
        renderImageTransformPreview({ canvas, image, geometry });
      } catch (error) {
        setDrawError(error instanceof Error ? error.message : "Preview rendering failed");
      }
    };
    image.onerror = () => setDrawError("Could not load source image");
    image.src = uri;
  }, [uri, nodeType, props]);

  if (!uri) {
    return null;
  }

  return (
    <FlexColumn
      fullWidth
      sx={{
        px: 1,
        pb: 1,
        gap: 0.5
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          borderRadius: "var(--rounded-sm)",
          background: "var(--mui-palette-common-black)"
        }}
      />
      {drawError && <Caption size="tiny">{drawError}</Caption>}
    </FlexColumn>
  );
};

export default ImageTransformLivePreview;
