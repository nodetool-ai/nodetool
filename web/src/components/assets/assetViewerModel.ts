/**
 * Pure decisions behind the asset viewer: what kind of media is on screen,
 * which editor its edit button opens, and which thumbnails the filmstrip
 * shows. Kept out of the component so each rule is testable on its own.
 */
import type { Asset } from "../../stores/ApiTypes";
import { isEditableModel3DAsset } from "../model_editor/isEditableModel3D";
import { assetTabType } from "../workspace/assetTabType";

export type ViewerMedia = {
  isImage: boolean;
  isAudio: boolean;
  isVideo: boolean;
  isModel3D: boolean;
  isSvg: boolean;
};

/** Classify the viewed media from the asset record, falling back to the caller's url and type. */
export function viewerMedia(
  asset: Asset | undefined,
  url: string | undefined,
  contentType: string | undefined
): ViewerMedia {
  const ct = asset?.content_type || contentType || "";
  const name = (asset?.name || "").toLowerCase();
  const src = (asset?.get_url || url || "").toLowerCase().split("?")[0];
  return {
    isImage:
      ct.startsWith("image/") || name.endsWith(".svg") || src.endsWith(".svg"),
    isAudio: ct.startsWith("audio/"),
    isVideo: ct.startsWith("video/"),
    isModel3D: asset ? isEditableModel3DAsset(asset) : false,
    // An SVG is an image to the compare view, but the image tab hosts the
    // raster sketch editor; saving a vector there would replace the markup
    // with pixels. It has its own tab.
    isSvg: asset ? assetTabType(asset) === "svg" : false
  };
}

export type EditAction =
  | {
      kind: "tab";
      tabType: "image" | "svg" | "model3d" | "audio";
      title: string;
      tooltip: string;
    }
  | { kind: "video"; tooltip: string };

/** The editor the viewer's edit button opens for `asset`, or null when it has none. */
export function editActionFor(
  asset: Asset | undefined,
  media: ViewerMedia
): EditAction | null {
  if (!asset) {
    return null;
  }
  if (media.isImage) {
    return media.isSvg
      ? {
          kind: "tab",
          tabType: "svg",
          title: asset.name || "SVG",
          tooltip: "Edit SVG"
        }
      : {
          kind: "tab",
          tabType: "image",
          title: asset.name || "Image",
          tooltip: "Edit Image"
        };
  }
  if (media.isModel3D) {
    return {
      kind: "tab",
      tabType: "model3d",
      title: asset.name || "3D model",
      tooltip: "Edit in 3D Editor"
    };
  }
  if (media.isAudio) {
    return {
      kind: "tab",
      tabType: "audio",
      title: asset.name || "Audio",
      tooltip: "Edit Audio"
    };
  }
  if (media.isVideo) {
    return {
      kind: "video",
      tooltip: asset.timeline_id
        ? "Edit Timeline"
        : "Create Timeline from Video"
    };
  }
  return null;
}

/** Tooltip for the copy button, which only appears for a clipboard-supported type. */
export function copyTooltip(contentType: string, copied: boolean): string {
  if (copied) {
    return "Copied!";
  }
  if (contentType.startsWith("image/")) {
    return "Copy Image";
  }
  if (contentType.startsWith("video/")) {
    return "Copy Video Info";
  }
  if (contentType.startsWith("audio/")) {
    return "Copy Audio Info";
  }
  return "Copy Content";
}

export type FilmstripThumb = { asset: Asset; index: number };

export type FilmstripWindow = {
  /** Thumbnails before the current asset, nearest last. */
  before: FilmstripThumb[];
  /** Thumbnails after the current asset, nearest first. */
  after: FilmstripThumb[];
  hasPrev: boolean;
  hasNext: boolean;
};

/**
 * Up to `amount` neighbours on each side of `currentIndex`. Compare mode
 * shows only images, since only two images can be compared; the prev and next
 * buttons follow the unfiltered list.
 */
export function filmstripWindow(
  assets: Asset[],
  currentIndex: number,
  amount: number,
  imagesOnly: boolean
): FilmstripWindow {
  const start = Math.max(0, currentIndex - amount);
  const keep = (thumb: FilmstripThumb) =>
    !imagesOnly || Boolean(thumb.asset.content_type?.startsWith("image/"));
  const before = assets
    .slice(start, currentIndex)
    .map((asset, i) => ({ asset, index: start + i }));
  const after = assets
    .slice(currentIndex + 1, currentIndex + amount + 1)
    .map((asset, i) => ({ asset, index: currentIndex + 1 + i }));
  return {
    before: before.filter(keep),
    after: after.filter(keep),
    hasPrev: before.length > 0,
    hasNext: after.length > 0
  };
}
