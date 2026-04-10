import { useEffect, useMemo, useRef } from "react";
import { Asset, AssetRef } from "../../../stores/ApiTypes";
import { BASE_URL } from "../../../stores/BASE_URL";
import log from "loglevel";

/**
 * Base type for typed output values with a type discriminator
 */
interface TypedValue {
  type: string;
}

/**
 * Video output value - either has byte data or a URI reference
 */
interface VideoValue extends TypedValue {
  type: "video";
  data?: Uint8Array;
  uri?: string;
}

/**
 * Image output value - either has byte data or a URI reference
 */
interface ImageValue extends TypedValue {
  type: "image";
  data?: Uint8Array;
  uri?: string;
  id?: string;
  name?: string;
}

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
    return `${BASE_URL}/api/storage/${assetId}`;
  }

  // Handle /api/storage/ relative URLs — prefix with BASE_URL for Electron
  if (uri.startsWith("/api/storage/")) {
    const resolved = `${BASE_URL}${uri}`;
    return resolved;
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

export function useVideoSrc(value: unknown) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const videoValue = value as VideoValue | null;
    if (videoValue?.type === "video" && videoRef.current) {
      if (videoValue.data) {
        const arrayBuffer = videoValue.data.buffer.slice(videoValue.data.byteOffset, videoValue.data.byteOffset + videoValue.data.byteLength) as ArrayBuffer;
        const blob = new Blob([arrayBuffer]);
        const url = URL.createObjectURL(blob);
        videoRef.current.src = url;
        return () => URL.revokeObjectURL(url);
      } else if (videoValue.uri) {
        videoRef.current.src = resolveAssetUri(videoValue.uri);
      }
    }
  }, [value]);
  return videoRef;
}

export function useImageAssets(value: unknown) {
  return useMemo(() => {
    const imageValues = value as ImageValue[];
    if (
      !Array.isArray(imageValues) ||
      imageValues.length === 0 ||
      imageValues[0]?.type !== "image"
    ) {
      return { assets: [] as Asset[], urls: [] as string[] };
    }
    const urls: string[] = [];
    const assets: Asset[] = (imageValues as AssetRef[]).map(
      (item: AssetRef, index: number) => {
        const imageItem = item as ImageValue;
        const contentType = "image/png";
        let url = "";
        if (imageItem.uri) {
          url = resolveAssetUri(imageItem.uri);
        } else if (imageItem.data) {
          try {
            // Ensure the typed array is backed by a non-shared ArrayBuffer (BlobPart typing)
            const safeBytes: Uint8Array<ArrayBuffer> = new Uint8Array(
              imageItem.data as Uint8Array<ArrayBufferLike>
            );
            const blob = new Blob([safeBytes], {
              type: contentType
            });
            url = URL.createObjectURL(blob);
            urls.push(url);
          } catch {
            // Blob creation failed (may be due to shared ArrayBuffer), use empty URL
            url = "";
          }
        }
        return {
          id: imageItem.id || `output-image-${index}`,
          user_id: "",
          workflow_id: null,
          parent_id: "",
          name: imageItem.name || `Image ${index + 1}.png`,
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
          log.error("Error revoking blob URL", u);
        }
      });
    };
  }, [urls]);
}
