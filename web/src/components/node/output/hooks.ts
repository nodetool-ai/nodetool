import { useEffect, useMemo, useRef } from "react";
import { Asset, AssetRef } from "../../../stores/ApiTypes";
import { BASE_URL } from "../../../stores/BASE_URL";
import { trpc } from "../../../trpc/client";

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

function toUint8Array(
  value: unknown
): Uint8Array<ArrayBuffer> | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Uint8Array) {
    return new Uint8Array(
      value.buffer.slice(
        value.byteOffset,
        value.byteOffset + value.byteLength
      ) as ArrayBuffer
    );
  }

  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView<ArrayBufferLike>;
    return new Uint8Array(
      view.buffer.slice(
        view.byteOffset,
        view.byteOffset + view.byteLength
      ) as ArrayBuffer
    );
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value.slice(0));
  }

  if (Array.isArray(value)) {
    return new Uint8Array(value);
  }

  return undefined;
}

/**
 * Extracts the storage key from an asset URI.
 * Handles asset:// and /api/storage/ schemes.
 * Returns null for other schemes.
 */
function extractStorageKey(uri: string | null | undefined): string | null {
  if (!uri) return null;
  if (uri.startsWith("asset://")) return uri.slice("asset://".length);
  if (uri.startsWith("/api/storage/")) return uri.slice("/api/storage/".length);
  return null;
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

/**
 * Returns the signed URL for an asset URI.
 * For cloud backends (S3/Supabase), returns a pre-signed URL.
 * For the local file backend, returns the /api/storage/ URL.
 * Falls back to resolveAssetUri() while the query is loading.
 */
export function useSignedUrl(uri: string | undefined | null): string {
  const key = extractStorageKey(uri);
  const { data } = trpc.storage.signUrl.useQuery(
    { key: key ?? "" },
    { enabled: Boolean(key), staleTime: 6 * 24 * 60 * 60 * 1000 }
  );
  return data?.url ?? resolveAssetUri(uri);
}

export function useVideoSrc(value: unknown) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoValue = value as VideoValue | null;
  const signedUrl = useSignedUrl(videoValue?.uri);

  useEffect(() => {
    if (videoValue?.type === "video" && videoRef.current) {
      const videoBytes = toUint8Array(videoValue.data);
      if (videoBytes && videoBytes.byteLength > 0) {
        const blob = new Blob([videoBytes]);
        const url = URL.createObjectURL(blob);
        videoRef.current.src = url;
        return () => URL.revokeObjectURL(url);
      } else if (videoValue.uri) {
        videoRef.current.src = signedUrl;
      }
    }
  }, [value, signedUrl]);
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
          console.error("Error revoking blob URL", u);
        }
      });
    };
  }, [urls]);
}
