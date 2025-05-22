import { Asset, AssetRef } from "../stores/ApiTypes";

/**
 * Helper function to get the thumbnail URL for an asset
 * Handles both cases: thumb_url or binary data as UInt8Array
 *
 * @param asset The asset to get the thumbnail URL for
 * @param fallbackUrl Optional fallback URL if no image is available
 * @returns The URL to display the thumbnail
 */
export const getAssetThumbUrl = (
  asset: AssetRef,
  fallbackUrl: string = "/images/placeholder.png"
): string => {
  if (asset.data && asset.type === "image") {
    try {
      // Convert to Uint8Array if it's not already
      const uint8Array =
        asset.data instanceof Uint8Array
          ? asset.data
          : new Uint8Array(Object.values(asset.data as any));

      // Create a blob URL from the binary data
      return URL.createObjectURL(new Blob([uint8Array], { type: "image/png" }));
    } catch (error) {
      console.error("Failed to create thumbnail URL from binary data:", error);
    }
  }

  // Fallback: Return the provided fallback URL
  return fallbackUrl;
};
