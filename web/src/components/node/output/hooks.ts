import { useEffect, useMemo, useRef } from "react";
import { Asset, AssetRef } from "../../../stores/ApiTypes";

export function useVideoSrc(value: any) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (value?.type === "video" && videoRef.current) {
      if (value?.data) {
        console.log("value?.data", value?.data);
        const blob = new Blob([value?.data]);
        const url = URL.createObjectURL(blob);
        videoRef.current.src = url;
        return () => URL.revokeObjectURL(url);
      } else {
        videoRef.current.src = value?.uri;
      }
    }
  }, [value]);
  return videoRef;
}

export function useImageAssets(value: any) {
  return useMemo(() => {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value[0]?.type !== "image"
    ) {
      return { assets: [] as Asset[], urls: [] as string[] };
    }
    const urls: string[] = [];
    const assets: Asset[] = (value as AssetRef[]).map(
      (item: AssetRef, index: number) => {
        const contentType = "image/png";
        let url = "";
        if ((item as any).uri) {
          url = (item as any).uri as string;
        } else if ((item as any).data) {
          try {
            const blob = new Blob([(item as any).data as Uint8Array], {
              type: contentType
            });
            url = URL.createObjectURL(blob);
            urls.push(url);
          } catch {
            url = "";
          }
        }
        return {
          id: (item as any).id || `output-image-${index}`,
          user_id: "",
          workflow_id: null,
          parent_id: "",
          name: (item as any).name || `Image ${index + 1}.png`,
          content_type: contentType,
          metadata: {},
          created_at: new Date().toISOString(),
          get_url: url,
          thumb_url: url,
          duration: null
        } as Asset;
      }
    );
    return { assets, urls };
  }, [value]);
}

export function useRevokeBlobUrls(urls: string[]) {
  useEffect(() => {
    return () => {
      urls.forEach((u) => {
        try {
          if (u && u.startsWith("blob:")) {URL.revokeObjectURL(u);}
        } catch {
          console.error("Error revoking blob URL", u);
        }
      });
    };
  }, [urls]);
}
