/**
 * shotImageEdits
 *
 * Canvas work behind the shot editor's still changes: mirror the selected
 * still, take a byte-for-byte copy of it, or adjust its light and colour; and
 * the arithmetic a reframe sends the provider.
 *
 * The canvas edits return a `File` rather than writing anywhere, because they
 * all end the same way — uploaded as a fresh asset and appended as a take,
 * which never replaces the still that was there (criterion 15). The image
 * editor gets a copy for the same reason: its "Save to image" renders back
 * into the asset it was opened on, so opening it on the shot's own still
 * would overwrite a version instead of adding one.
 */

/** Load a resolved media URL into a decoded image. */
const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The still could not be loaded."));
    image.src = url;
  });

const toPng = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("The still could not be encoded."));
      }
    }, "image/png");
  });

const render = async (
  url: string,
  name: string,
  options: { mirror?: boolean; filter?: string } = {}
): Promise<File> => {
  const image = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser has no 2D canvas.");
  }
  if (options.mirror) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
  }
  if (options.filter) {
    context.filter = options.filter;
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await toPng(canvas);
  return new File([blob], name, { type: "image/png" });
};

/** The still, mirrored left-to-right. */
export const flippedStill = (url: string, name: string): Promise<File> =>
  render(url, name, { mirror: true });

/** The still, unchanged — the copy the image editor opens on. */
export const copiedStill = (url: string, name: string): Promise<File> =>
  render(url, name);

/** Light and colour, each a percentage where 100 leaves the still as it is. */
export interface StillAdjustment {
  brightness: number;
  contrast: number;
  saturation: number;
}

/** The CSS filter an adjustment is, shared by the live preview and the render. */
export const adjustmentFilter = (adjustment: StillAdjustment): string =>
  `brightness(${adjustment.brightness}%) contrast(${adjustment.contrast}%) saturate(${adjustment.saturation}%)`;

/** The still with an adjustment baked in. */
export const adjustedStill = (
  url: string,
  name: string,
  adjustment: StillAdjustment
): Promise<File> => render(url, name, { filter: adjustmentFilter(adjustment) });

/** The still's pixel size. */
export const stillSize = async (
  url: string
): Promise<{ width: number; height: number }> => {
  const image = await loadImage(url);
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height
  };
};

/** Pixels to add on each side of a still. */
export interface OutpaintPadding {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * How far to grow a `width` × `height` still, split evenly around it, to reach
 * the aspect ratio `aspect` ("W:H"). A reframe only ever adds: a wider target
 * grows the sides, a taller one the top and bottom, so the original frame is
 * kept whole in the middle. An unreadable ratio, or one the still already
 * has, adds nothing.
 */
export const outpaintPadding = (
  width: number,
  height: number,
  aspect: string
): OutpaintPadding => {
  const none = { left: 0, right: 0, top: 0, bottom: 0 };
  const [w, h] = aspect.split(":").map((part) => Number(part.trim()));
  if (
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w <= 0 ||
    h <= 0 ||
    width <= 0 ||
    height <= 0
  ) {
    return none;
  }
  const target = w / h;
  const current = width / height;
  if (Math.abs(target - current) < 1e-3) {
    return none;
  }
  if (target > current) {
    const extra = Math.round(height * target) - width;
    const left = Math.floor(extra / 2);
    return { ...none, left, right: extra - left };
  }
  const extra = Math.round(width / target) - height;
  const top = Math.floor(extra / 2);
  return { ...none, top, bottom: extra - top };
};
