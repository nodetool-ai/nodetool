export interface ImageTransformPreviewParams {
  nodeType: string;
  properties: Record<string, unknown>;
  sourceWidth: number;
  sourceHeight: number;
}

export interface ImageTransformPreviewGeometry {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  targetWidth: number;
  targetHeight: number;
  blurPx: number;
}

export const getNumericProperty = (
  properties: Record<string, unknown>,
  ...keys: string[]
): number | undefined => {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
};

export const calculateImageTransformPreviewGeometry = ({
  nodeType,
  properties,
  sourceWidth,
  sourceHeight
}: ImageTransformPreviewParams): ImageTransformPreviewGeometry => {
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (nodeType === "nodetool.image.Crop") {
    sx = Math.max(0, getNumericProperty(properties, "x", "left") || 0);
    sy = Math.max(0, getNumericProperty(properties, "y", "top") || 0);
    sw = getNumericProperty(properties, "width", "w") || sw;
    sh = getNumericProperty(properties, "height", "h") || sh;
    sw = Math.min(sw, sourceWidth - sx);
    sh = Math.min(sh, sourceHeight - sy);
  }

  const targetWidth = Math.max(
    1,
    Math.floor(getNumericProperty(properties, "width", "target_width", "w") || sw)
  );
  const targetHeight = Math.max(
    1,
    Math.floor(getNumericProperty(properties, "height", "target_height", "h") || sh)
  );

  const blurPx =
    nodeType === "nodetool.image.Blur"
      ? Math.max(
          0,
          getNumericProperty(properties, "size", "radius", "sigma", "strength") || 0
        )
      : 0;

  return { sx, sy, sw, sh, targetWidth, targetHeight, blurPx };
};

export const renderImageTransformPreview = ({
  canvas,
  image,
  geometry
}: {
  canvas: HTMLCanvasElement;
  image: HTMLImageElement;
  geometry: ImageTransformPreviewGeometry;
}): void => {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  canvas.width = geometry.targetWidth;
  canvas.height = geometry.targetHeight;
  context.clearRect(0, 0, geometry.targetWidth, geometry.targetHeight);
  context.filter = geometry.blurPx > 0 ? `blur(${geometry.blurPx}px)` : "none";
  context.drawImage(
    image,
    geometry.sx,
    geometry.sy,
    geometry.sw,
    geometry.sh,
    0,
    0,
    geometry.targetWidth,
    geometry.targetHeight
  );
  context.filter = "none";
};
