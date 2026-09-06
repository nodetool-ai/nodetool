/**
 * shotImageEdits
 *
 * Canvas work behind the Edit Shot dialog's viewer: mirror the selected still,
 * or take a byte-for-byte copy of it.
 *
 * Both return a `File` rather than writing anywhere, because both end the same
 * way — uploaded as a fresh asset and appended through `setShotKeyframe`, which
 * never replaces the still that was there (criterion 15). The image editor gets
 * a copy for the same reason: its "Save to image" renders back into the asset
 * it was opened on, so opening it on the shot's own still would overwrite a
 * version instead of adding one.
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
  mirror: boolean,
  name: string
): Promise<File> => {
  const image = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser has no 2D canvas.");
  }
  if (mirror) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await toPng(canvas);
  return new File([blob], name, { type: "image/png" });
};

/** The still, mirrored left-to-right. */
export const flippedStill = (url: string, name: string): Promise<File> =>
  render(url, true, name);

/** The still, unchanged — the copy the image editor opens on. */
export const copiedStill = (url: string, name: string): Promise<File> =>
  render(url, false, name);
