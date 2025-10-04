import { useCallback } from "react";
import type { Asset } from "../../stores/ApiTypes";

export function useAssetDownload(params: {
  currentAsset?: Asset;
  url?: string;
}) {
  const { currentAsset, url } = params;

  const handleDownload = useCallback(() => {
    const downloadUrl = url || (currentAsset && currentAsset.get_url);
    if (!downloadUrl) return;

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







