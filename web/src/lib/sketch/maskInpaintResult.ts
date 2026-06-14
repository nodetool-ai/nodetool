/**
 * Clip a full-frame inpaint result down to the selection mask.
 *
 * Image providers return a complete image for inpainting — the whole frame
 * regenerated, not just the masked region. Dropping that straight into a new
 * layer would cover the entire canvas and discard the original pixels outside
 * the selection. Instead we keep only the pixels inside the mask (transparent
 * elsewhere) so the new layer overlays just the inpainted area and the layers
 * below show through unchanged.
 *
 * The mask is the same white-on-alpha PNG produced by
 * `selectionToMaskDataUrl` (R=G=B=255, A=selection value), so a
 * `destination-in` composite both clips to the selection and respects soft
 * (feathered) edges.
 */

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

export async function maskInpaintResult(
  generatedUrl: string,
  maskUrl: string,
  width: number,
  height: number
): Promise<Blob> {
  if (width <= 0 || height <= 0) {
    throw new Error("Invalid canvas dimensions for inpaint masking");
  }
  const [generated, mask] = await Promise.all([
    loadImage(generatedUrl),
    loadImage(maskUrl)
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not get 2D context for inpaint masking");
  }

  // Scale the generated frame to the document canvas, then keep only the
  // pixels covered by the mask's alpha.
  ctx.drawImage(generated, 0, 0, width, height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Failed to encode masked inpaint result"));
      }
    }, "image/png");
  });
}
