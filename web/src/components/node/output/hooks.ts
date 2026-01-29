import { useEffect, useMemo, useRef } from "react";
import { Asset, AssetRef } from "../../../stores/ApiTypes";

/**
 * Resolves asset URIs to their actual URLs.
 * Converts asset:// URIs to /api/storage/ URLs.
 * Passes through other URI schemes unchanged.
 */
export function resolveAssetUri(uri: string | undefined | null): string {
  if (!uri) {
    return "";
  }

  // Handle asset:// scheme - convert to API storage URL
  if (uri.startsWith("asset://")) {
    const assetId = uri.slice("asset://".length);
    return `/api/storage/${assetId}`;
  }

  return uri;
}

export function getMimeTypeFromUri(
  uri: string | undefined | null
): string | undefined {
  if (!uri) {
    return undefined;
  }
  // Remove query params if any
  const cleanUri = uri.split("?")[0];
  const ext = cleanUri.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "mp3":
      return "audio/mp3";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "flac":
      return "audio/flac";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    case "avi":
      return "video/x-msvideo";
    case "glb":
      return "model/gltf-binary";
    case "gltf":
      return "model/gltf+json";
    case "pdf":
      return "application/pdf";
    case "json":
      return "application/json";
    default:
      return undefined;
  }
}

export function useVideoSrc(value: any) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (value?.type === "video" && videoRef.current) {
      if (value?.data) {
        const blob = new Blob([value?.data]);
        const url = URL.createObjectURL(blob);
        videoRef.current.src = url;
        return () => URL.revokeObjectURL(url);
      } else if (value?.uri) {
        videoRef.current.src = resolveAssetUri(value.uri);
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
          url = resolveAssetUri((item as any).uri as string);
        } else if ((item as any).data) {
          try {
            // Ensure the typed array is backed by a non-shared ArrayBuffer (BlobPart typing)
            const safeBytes: Uint8Array<ArrayBuffer> = new Uint8Array(
              (item as any).data as Uint8Array<ArrayBufferLike>
            );
            const blob = new Blob([safeBytes], {
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
          if (u && u.startsWith("blob:")) {
            URL.revokeObjectURL(u);
          }
        } catch {
          console.error("Error revoking blob URL", u);
        }
      });
    };
  }, [urls]);
}
