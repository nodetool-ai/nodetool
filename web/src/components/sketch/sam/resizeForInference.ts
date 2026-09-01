/**
 * Downscale guardrail for segmentation input.
 *
 * A sketch layer can be far larger than any SAM endpoint wants. The caller
 * scales the image down before inference and undoes the returned `scale` when
 * it maps masks back into document space.
 */

/** Maximum image dimension (width or height) sent to a segmentation model. */
export const MAX_INFERENCE_DIMENSION = 2048;

/**
 * Resize a data URL if it exceeds `maxDim`. Returns the (possibly resized)
 * data URL and the scale factor applied — 1 when nothing was resized.
 */
export async function resizeForInference(
  dataUrl: string,
  maxDim: number = MAX_INFERENCE_DIMENSION
): Promise<{ dataUrl: string; scale: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      if (width <= maxDim && height <= maxDim) {
        resolve({ dataUrl, scale: 1 });
        return;
      }

      const scale = maxDim / Math.max(width, height);
      const newW = Math.round(width * scale);
      const newH = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to create canvas context for resize"));
        return;
      }
      ctx.drawImage(img, 0, 0, newW, newH);
      resolve({ dataUrl: canvas.toDataURL("image/png"), scale });
    };
    img.onerror = () => reject(new Error("Failed to load image for resize"));
    img.src = dataUrl;
  });
}
