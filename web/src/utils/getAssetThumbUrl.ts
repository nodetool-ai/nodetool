import { AssetRef } from "../stores/ApiTypes";

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
      let uint8Array: Uint8Array;
      if (asset.data instanceof Uint8Array) {
        uint8Array = asset.data;
      } else if (typeof asset.data === "object" && asset.data !== null) {
        // Handle object-based binary data (e.g., {0: 123, 1: 456, ...})
        uint8Array = new Uint8Array(Object.values(asset.data as Record<string, number>));
      } else {
        throw new Error("Invalid data type for thumbnail");
      }

      // Create a blob URL from the binary data
      return URL.createObjectURL(new Blob([uint8Array], { type: "image/png" }));
    } catch (error) {
      console.error("Failed to create thumbnail URL from binary data:", error);
    }
  }

  // Fallback: Return the provided fallback URL
  return fallbackUrl;
};
