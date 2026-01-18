/**
 * useAssetDownload
 *
 * Hook for downloading assets from the application.
 * Provides a download handler that:
 * - Creates a download link from asset URL or data URL
 * - Determines filename from asset metadata or URL
 * - Handles data URLs (base64) with MIME type detection
 * - Handles external URLs with path parsing
 * - Triggers browser download in a new tab/window
 *
 * @param params - Configuration object
 * @param params.currentAsset - Optional Asset object with metadata
 * @param params.url - Optional direct URL to download
 * @returns Object containing handleDownload function
 */

import { useCallback } from "react";
import type { Asset } from "../../stores/ApiTypes";

export function useAssetDownload(params: {
  currentAsset?: Asset;
  url?: string;
}) {
  const { currentAsset, url } = params;

  const handleDownload = useCallback(() => {
    const downloadUrl = url || (currentAsset && currentAsset.get_url);
    if (!downloadUrl) {return;}

    const link = document.createElement("a");
    link.href = downloadUrl;

    let filename = "download";
    if (currentAsset?.name) {
      filename = currentAsset.name;
    } else if (downloadUrl.startsWith("data:")) {
      const match = downloadUrl.match(/data:([^;]+)/);
      if (match) {
        const mimeType = match[1];
        const extension = mimeType.split("/")[1];
        if (extension) {
          filename = `download.${extension}`;
        }
      }
    } else {
      try {
        const urlObj = new URL(downloadUrl);
        const pathname = urlObj.pathname;
        const lastSegment = pathname.split("/").pop();
        if (lastSegment && lastSegment.includes(".")) {
          filename = lastSegment;
        }
      } catch {
        /* empty */
      }
    }

    link.download = filename;
    link.target = "_blank";
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      document.body.removeChild(link);
    }
  }, [currentAsset, url]);

  return { handleDownload } as const;
}










