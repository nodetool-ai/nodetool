import { useEffect, useMemo, useRef } from "react";
import { packageAssetHttpPath, isBitmapImage } from "@nodetool-ai/protocol";
import { Asset } from "../../../stores/ApiTypes";
import { BASE_URL } from "../../../stores/BASE_URL";
import { trpc } from "../../../trpc/client";
import { bitmapToPngDataUrl } from "../../../lib/workflow/materializeBrowserOutputs";
import { fileUriToHttpUrl } from "../../../utils/localFile";
import {
  asResolvedMediaUrl,
  type ResolvedMediaUrl
} from "../../../utils/resolveMediaUri";
import {
  useResolvedMediaUri,
  useResolvedMediaUris,
  type MediaLocator
} from "../../../hooks/useResolvedMediaUri";

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

export function toUint8Array(
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
    return new Uint8Array(
      value.buffer.slice(
        value.byteOffset,
        value.byteOffset + value.byteLength
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
 * Extracts the storage key from a `/api/storage/` URI.
 *
 * `asset://<id>` is deliberately not a key: the object is
 * `<user_id>/<asset_id>.<ext>`, so signing the bare id resolves nothing —
 * `useSignedUrl` routes that scheme through the asset record instead.
 */
function extractStorageKey(uri: string | null | undefined): string | null {
  if (!uri) return null;
  if (uri.startsWith("/api/storage/")) return uri.slice("/api/storage/".length);
  return null;
}

/**
 * Resolves a media URI to a fetchable URL, without a server round trip.
 * Converts package:// URIs to the /api/assets/packages/ route and prefixes
 * relative /api/storage/ paths. Passes through other URI schemes unchanged.
 *
 * `asset://` returns "" on purpose: it is an identifier, not a path. The bytes
 * live under `<user_id>/<asset_id>.<ext>` behind a signed URL, so the old
 * `${BASE_URL}/api/storage/<id>` rewrite 404s on any cloud deploy. Resolve it
 * with `useResolvedMediaUri` (or the asset's `get_url`) instead.
 */
export function resolveAssetUri(uri: string | undefined | null): string {
  if (!uri || uri.startsWith("asset://")) {
    return "";
  }

  // Handle package:// scheme - constant assets shipped with a package
  const pkgPath = packageAssetHttpPath(uri);
  if (pkgPath) {
    return `${BASE_URL}${pkgPath}`;
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
 *
 * `asset://<id>` resolves through the asset record's own `get_url`, the same
 * path the image branches take. Signing it as a storage key produced a URL for
 * an object that does not exist — the bytes are `<user_id>/<asset_id>.<ext>`
 * and the locator carries neither the owner prefix nor the extension — so
 * every video and audio output whose ref was an extensionless `asset://`
 * (what chat persistence and `save_asset` produce) rendered an empty element.
 */
export function useSignedUrl(
  uri: string | undefined | null
): ResolvedMediaUrl | "" {
  const isAssetUri = Boolean(uri?.startsWith("asset://"));
  const assetUrl = useResolvedMediaUri(isAssetUri ? uri : undefined);
  const key = isAssetUri ? null : extractStorageKey(uri);
  const { data } = trpc.storage.signUrl.useQuery(
    { key: key ?? "" },
    { enabled: Boolean(key), staleTime: 6 * 24 * 60 * 60 * 1000 }
  );
  // `file://` URIs (local-mode assets) can't be loaded directly by the renderer
  // under webSecurity — point them at the backend's `/api/files/local`
  // streaming endpoint.
  const fileHttpUrl = fileUriToHttpUrl(uri);
  if (fileHttpUrl !== null) {
    return asResolvedMediaUrl(fileHttpUrl) ?? "";
  }
  if (isAssetUri) {
    return assetUrl ?? "";
  }
  return asResolvedMediaUrl(data?.url ?? resolveAssetUri(uri)) ?? "";
}

function isVideoValue(value: unknown): value is VideoValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "video"
  );
}

function isImageValueArray(value: unknown): value is ImageValue[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === "object" &&
    value[0] !== null &&
    "type" in value[0] &&
    value[0].type === "image"
  );
}

export function useVideoSrc(value: unknown): React.RefObject<HTMLVideoElement | null> {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoValue = isVideoValue(value) ? value : null;
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
  const items: ImageValue[] = useMemo(
    () => (isImageValueArray(value) ? value : []),
    [value]
  );

  // Encoding a bitmap and creating a blob URL are side effects — do them once
  // per value, not per render. `null` marks an item whose URL comes from the
  // asset lookup below.
  const { localUrls, blobUrls } = useMemo(() => {
    const blobs: string[] = [];
    const locals = items.map((item): string | null => {
      if (item.uri) {
        return null;
      }
      if (isBitmapImage(item)) {
        return bitmapToPngDataUrl(item.bitmap as ImageBitmap);
      }
      if (item.data) {
        try {
          // Ensure the typed array is backed by a non-shared ArrayBuffer (BlobPart typing)
          const safeBytes: Uint8Array<ArrayBuffer> = new Uint8Array(item.data);
          const url = URL.createObjectURL(
            new Blob([safeBytes], { type: "image/png" })
          );
          blobs.push(url);
          return url;
        } catch {
          // Blob creation failed (may be due to shared ArrayBuffer), no URL
          return "";
        }
      }
      return null;
    });
    return { localUrls: locals, blobUrls: blobs };
  }, [items]);

  // Anything left resolves through the asset record: an `asset://` uri or a
  // bare `id` both need the asset's own `get_url`, which is signed on the
  // cloud backends and owner-prefixed everywhere.
  const locators = useMemo(
    () =>
      items.map((item, i): MediaLocator =>
        localUrls[i] !== null
          ? undefined
          : item.uri ?? (item.id ? { asset_id: item.id } : undefined)
      ),
    [items, localUrls]
  );
  const resolved = useResolvedMediaUris(locators);

  const assets: Asset[] = useMemo(
    () =>
      items.map((item, index): Asset => {
        const url = localUrls[index] ?? resolved[index] ?? "";
        return {
          id: item.id || `output-image-${index}`,
          user_id: "",
          workflow_id: null,
          parent_id: "",
          name: item.name || `Image ${index + 1}.png`,
          content_type: "image/png",
          metadata: {},
          created_at: new Date().toISOString(),
          get_url: url,
          thumb_url: url,
          duration: null
        };
      }),
    [items, localUrls, resolved]
  );

  return { assets, urls: blobUrls };
}

export function useRevokeBlobUrls(urls: string[]): void {
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
