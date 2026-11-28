/**
 * Loads a game sprite as an ImageBitmap through a CORS-mode fetch.
 *
 * Signed storage URLs are cross-origin. An `<img>` loaded without `crossOrigin` is tainted, and the
 * WebGPU renderer's `copyExternalImageToTexture` throws on it. A bitmap decoded from fetched bytes is
 * never tainted, and it shares nothing with the non-CORS copies the Assets panel thumbnails keep in the
 * image cache.
 */
export async function loadGameImage(url: string, signal?: AbortSignal): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(url, { mode: "cors", signal });
    if (!response.ok) { return null; }
    return await createImageBitmap(await response.blob(), { premultiplyAlpha: "none" });
  } catch {
    // A missing or undecodable sprite draws as the renderer's placeholder, as it did with <img>.
    return null;
  }
}
