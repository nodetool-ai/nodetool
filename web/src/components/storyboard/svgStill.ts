/**
 * svgStill
 *
 * A shot's still can be an SVG. The board, viewer and downloads show the
 * vector as it is, but anything that needs pixels (a canvas edit, a mask, a
 * reframe's padding) renders it at one fixed size first. The server renders
 * an SVG at the same size before an image or video model reads it
 * (`SVG_GENERATION_SIDE` in `@nodetool-ai/runtime`), so a mask painted here
 * lines up with the frame the model receives.
 */

/** Longest side an SVG still is rendered at. Matches `SVG_GENERATION_SIDE`. */
export const SVG_STILL_SIDE = 2048;

/** Whether a resolved media URL points at an SVG file. */
export const isSvgUrl = (url: string): boolean => {
  if (/^data:image\/svg\+xml[;,]/i.test(url)) {
    return true;
  }
  const path = url.split(/[?#]/)[0];
  return /\.svg$/i.test(path);
};

/**
 * The pixel size an SVG still is rendered at: its longest side scaled to
 * {@link SVG_STILL_SIDE}, keeping the aspect ratio of `width` × `height`.
 * A document with no readable size renders square.
 */
export const svgRasterSize = (
  width: number,
  height: number
): { width: number; height: number } => {
  if (!(width > 0) || !(height > 0)) {
    return { width: SVG_STILL_SIDE, height: SVG_STILL_SIDE };
  }
  const scale = SVG_STILL_SIDE / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
};

/**
 * The pixel size a loaded still works at. A raster still uses its own pixels.
 * An SVG's natural size is only its declared size (24 × 24 for an icon), so
 * it is rendered at {@link svgRasterSize} instead.
 */
export const stillPixelSize = (
  image: HTMLImageElement,
  url: string
): { width: number; height: number } => {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  return isSvgUrl(url) ? svgRasterSize(width, height) : { width, height };
};
