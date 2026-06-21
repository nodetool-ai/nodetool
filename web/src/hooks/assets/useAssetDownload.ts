import { useCallback } from "react";
import type { Asset } from "../../stores/ApiTypes";

export function useAssetDownload(params: {
  currentAsset?: Asset;
  url?: string;
}) {
  const { currentAsset, url } = params;

  const handleDownload = useCallback(() => {
    // Prefer the current asset's own URL over the `url` prop: in a gallery the
    // viewer updates `currentAsset` as you navigate while `url` stays pinned to
    // the asset the viewer opened with, so `url`-first downloads the wrong one.
    // Fall back to `url` only when there is no asset (e.g. a raw data URL).
    const downloadUrl = (currentAsset && currentAsset.get_url) || url;
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










