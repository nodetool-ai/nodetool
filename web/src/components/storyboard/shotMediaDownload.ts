/**
 * Saving a shot's still or clip to disk.
 *
 * The URL must already be resolved: `asset://<id>` is a stored identifier, and
 * on the cloud backends the bytes sit behind a signed URL only the server can
 * mint. A signed URL is also cross-origin, where the anchor's `download`
 * attribute is ignored and the browser navigates instead — so the bytes are
 * fetched into a blob first, and the raw URL is only a fallback for when that
 * fetch is refused.
 */

import type { ResolvedMediaUrl } from "../../utils/resolveMediaUri";

/** Extension the URL's path carries, or the caller's default. */
const extensionFor = (url: string, fallback: string): string => {
  const last = url.split(/[?#]/)[0].split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  const ext = dot > 0 ? last.slice(dot + 1) : "";
  return /^[a-z0-9]{1,5}$/i.test(ext) ? ext.toLowerCase() : fallback;
};

/** `shot-03-still.png` — the shot's place in the board, not its asset id. */
export const shotDownloadName = (
  shotIndex: number,
  kind: "still" | "clip",
  url: string
): string => {
  const number = String(shotIndex + 1).padStart(2, "0");
  const ext = extensionFor(url, kind === "clip" ? "mp4" : "png");
  return `shot-${number}-${kind}.${ext}`;
};

const clickDownload = (href: string, filename: string): void => {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
};

export const downloadResolvedMedia = async (
  url: ResolvedMediaUrl,
  filename: string
): Promise<void> => {
  let objectUrl: string | null = null;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    objectUrl = URL.createObjectURL(await response.blob());
  } catch (error) {
    console.warn("[shotMediaDownload] fetch failed, using the raw URL", error);
  }
  clickDownload(objectUrl ?? url, filename);
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }
};
