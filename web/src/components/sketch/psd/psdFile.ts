/**
 * psdFile – browser helpers for PSD import: recognising, picking and
 * rasterising.
 */

const PSD_MIME = "image/vnd.adobe.photoshop";

/** True for a Photoshop file; browsers often report no MIME type for one. */
export function isPsdFile(file: File): boolean {
  return file.type === PSD_MIME || file.name.toLowerCase().endsWith(".psd");
}

/** Open the file picker for one PSD; resolves null when it is dismissed. */
export function pickPsdFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = window.document.createElement("input");
    input.type = "file";
    input.accept = `.psd,${PSD_MIME}`;
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), {
      once: true
    });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

/** Encode straight RGBA pixels as a PNG data URL. */
export function pixelsToPngDataUrl(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): string {
  const canvas = window.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }
  const image = ctx.createImageData(width, height);
  image.data.set(pixels);
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}
