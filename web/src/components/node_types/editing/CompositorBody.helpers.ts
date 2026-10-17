import { useRef } from "react";
import { useResolvedMediaUris } from "../../../hooks/useResolvedMediaUri";
import { rawRgbaToPngDataUrl } from "../../../lib/workflow/materializeBrowserOutputs";
import { resolveStaticMediaUri } from "../../../utils/resolveMediaUri";
import {
  isNumber,
  isObjectLike,
  isString
} from "../../../utils/typePredicates";

export interface ImageRefLike {
  uri?: string;
  asset_id?: string;
  width?: number;
  height?: number;
  data?: unknown;
}

export const asImageRef = (value: unknown): ImageRefLike | undefined => {
  if (!value || !isObjectLike(value)) return undefined;
  const v = value as Record<string, unknown>;
  return {
    uri: isString(v.uri) ? v.uri : undefined,
    asset_id: isString(v.asset_id) && v.asset_id ? v.asset_id : undefined,
    width: isNumber(v.width) ? v.width : undefined,
    height: isNumber(v.height) ? v.height : undefined,
    data: v.data
  };
};

const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Resolve an `ImageRefLike` to a displayable URL without a server round trip.
 * Converts Uint8Array to a base64 data URI to avoid blob URL leaks. Returns
 * `null` for an `asset://` locator (or a ref carrying only `asset_id`), which
 * only the asset's `get_url` can resolve — see {@link useImageUrls}.
 */
export const resolveImageUrlStatic = (
  image: ImageRefLike | undefined
): string | null | undefined => {
  if (!image) return undefined;
  if (image.uri) {
    const url = resolveStaticMediaUri(image.uri);
    if (url !== null) return url || undefined;
    if (!hasInlineData(image.data)) return null;
  }
  if (isString(image.data) && image.data.length > 0) {
    if (
      image.data.startsWith("data:") ||
      image.data.startsWith("blob:") ||
      image.data.startsWith("http")
    ) {
      return image.data;
    }
    return `data:image/png;base64,${image.data}`;
  }
  if (image.data instanceof Uint8Array && image.data.length > 0) {
    const { width, height } = image;
    // Raw-RGBA buffers (length === w*h*4) aren't an encoded image — base64-ing
    // the bytes as PNG yields an undecodable URL. Encode them via a canvas.
    if (
      width != null &&
      height != null &&
      image.data.length === width * height * 4
    ) {
      return rawRgbaToPngDataUrl(image.data, width, height) || undefined;
    }
    return `data:image/png;base64,${uint8ArrayToBase64(image.data)}`;
  }
  if (image.asset_id) return null;
  return undefined;
};

const hasInlineData = (data: unknown): boolean =>
  (isString(data) || data instanceof Uint8Array) && data.length > 0;

/** {@link resolveImageUrlStatic} with unresolved asset locators dropped. */
export const resolveImageUrl = (
  image: ImageRefLike | undefined
): string | undefined => resolveImageUrlStatic(image) ?? undefined;

/**
 * Resolve a batch of image refs to displayable URLs, positionally aligned.
 * Inline data and plain URLs resolve synchronously; `asset://` locators go
 * through the asset's `get_url` (shared react-query cache), so they are
 * `undefined` until the lookup lands. The result is referentially stable
 * while the URLs are unchanged.
 */
export const useImageUrls = (
  images: readonly (ImageRefLike | undefined)[]
): (string | undefined)[] => {
  const staticUrls = images.map(resolveImageUrlStatic);
  const assetLocators = images.map((image, i) =>
    staticUrls[i] === null && image
      ? { uri: image.uri, asset_id: image.asset_id }
      : undefined
  );
  const assetUrls = useResolvedMediaUris(assetLocators);
  const urls = staticUrls.map((url, i) =>
    url === null ? assetUrls[i] : url
  );
  const stable = useRef(urls);
  if (
    stable.current.length !== urls.length ||
    stable.current.some((url, i) => url !== urls[i])
  ) {
    stable.current = urls;
  }
  return stable.current;
};

/**
 * Hook that resolves an `ImageRefLike` to a displayable URL.
 */
export const useImageUrl = (
  image: ImageRefLike | undefined
): string | undefined => useImageUrls([image])[0];

/** Sort `image_N` keys by their numeric suffix. */
export const sortImageKeys = (keys: string[]): string[] =>
  keys
    .filter((k) => /^image_\d+$/.test(k))
    .sort((a, b) => {
      const ia = Number(a.slice("image_".length));
      const ib = Number(b.slice("image_".length));
      return ia - ib;
    });

/** Next unused `image_N` index given existing dynamic property keys. */
export const nextImageIndex = (keys: string[]): number => {
  let max = -1;
  for (const k of keys) {
    const m = /^image_(\d+)$/.exec(k);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return max + 1;
};
