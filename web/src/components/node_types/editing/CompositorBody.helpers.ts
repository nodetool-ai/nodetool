import { useMemo } from "react";
import { rawRgbaToPngDataUrl } from "../../../lib/workflow/materializeBrowserOutputs";

export interface ImageRefLike {
  uri?: string;
  width?: number;
  height?: number;
  data?: unknown;
}

export const asImageRef = (value: unknown): ImageRefLike | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  return {
    uri: typeof v.uri === "string" ? v.uri : undefined,
    width: typeof v.width === "number" ? v.width : undefined,
    height: typeof v.height === "number" ? v.height : undefined,
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
 * Resolve an `ImageRefLike` to a displayable URL (pure). Converts Uint8Array
 * to a base64 data URI to avoid blob URL leaks.
 */
export const resolveImageUrl = (
  image: ImageRefLike | undefined
): string | undefined => {
  if (!image) return undefined;
  if (image.uri) return image.uri;
  if (typeof image.data === "string") {
    if (
      image.data.startsWith("data:") ||
      image.data.startsWith("blob:") ||
      image.data.startsWith("http")
    ) {
      return image.data;
    }
    return `data:image/png;base64,${image.data}`;
  }
  if (image.data instanceof Uint8Array) {
    const { width, height } = image;
    // Raw-RGBA buffers (length === w*h*4) aren't an encoded image — base64-ing
    // the bytes as PNG yields an undecodable URL. Encode them via a canvas.
    if (
      typeof width === "number" &&
      typeof height === "number" &&
      image.data.length === width * height * 4
    ) {
      return rawRgbaToPngDataUrl(image.data, width, height) || undefined;
    }
    return `data:image/png;base64,${uint8ArrayToBase64(image.data)}`;
  }
  return undefined;
};

/**
 * Hook that resolves an `ImageRefLike` to a displayable URL.
 */
export const useImageUrl = (
  image: ImageRefLike | undefined
): string | undefined => useMemo(() => resolveImageUrl(image), [image]);

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
