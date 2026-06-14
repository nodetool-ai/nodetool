import type { MediaBox } from "./mediaAspectResize";

/**
 * Intrinsic aspect ratio (width / height) of a media element, or `null` when it
 * has no usable dimensions yet (image not decoded, empty canvas, …).
 */
function intrinsicRatio(el: Element): number | null {
  if (el instanceof HTMLImageElement) {
    return el.naturalWidth > 0 && el.naturalHeight > 0
      ? el.naturalWidth / el.naturalHeight
      : null;
  }
  if (el instanceof HTMLCanvasElement) {
    return el.width > 0 && el.height > 0 ? el.width / el.height : null;
  }
  if (el instanceof HTMLVideoElement) {
    return el.videoWidth > 0 && el.videoHeight > 0
      ? el.videoWidth / el.videoHeight
      : null;
  }
  return null;
}

/**
 * Containers an image view renders inside. The media element itself is sized
 * `100%` or `max-*: 100%`, so the *container* is the box whose width tracks the
 * node width — that's what we measure for the chrome offsets.
 */
const MEDIA_CONTAINER_SELECTOR = ".image-output, .preview-area";

const MEDIA_SELECTOR =
  ".image-output img, .image-output canvas, .image-output video, " +
  ".preview-area img, .preview-area canvas, .preview-area video";

function findMediaElement(nodeEl: HTMLElement): Element | null {
  // Prefer media inside a known preview container.
  const scoped = nodeEl.querySelectorAll(MEDIA_SELECTOR);
  for (const el of Array.from(scoped)) {
    if (intrinsicRatio(el) !== null) {
      return el;
    }
  }
  // Fall back to any media element that has reported intrinsic dimensions.
  const any = nodeEl.querySelectorAll("img, canvas, video");
  for (const el of Array.from(any)) {
    if (intrinsicRatio(el) !== null) {
      return el;
    }
  }
  return null;
}

/**
 * Measure the media a node is currently showing so the resize can keep that
 * media's aspect ratio. Returns `null` when the node has no decoded media —
 * the caller then falls back to a free resize, which is why the same handle
 * works for nodes that only *sometimes* hold an image (Preview / Output).
 *
 * @param zoom        current viewport zoom, to convert screen px → flow units
 * @param nodeWidth   node width at drag start, in flow units
 * @param nodeHeight  node height at drag start, in flow units
 */
export function measureNodeMedia(
  nodeEl: HTMLElement,
  zoom: number,
  nodeWidth: number,
  nodeHeight: number
): MediaBox | null {
  const media = findMediaElement(nodeEl);
  if (!media) {
    return null;
  }
  const ratio = intrinsicRatio(media);
  if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) {
    return null;
  }

  const container =
    media.closest<HTMLElement>(MEDIA_CONTAINER_SELECTOR) ??
    (media.parentElement as HTMLElement | null) ??
    (media as HTMLElement);

  const rect = container.getBoundingClientRect();
  const boxWidth = rect.width / zoom;
  const boxHeight = rect.height / zoom;
  if (boxWidth <= 0 || boxHeight <= 0) {
    return null;
  }

  return {
    ratio,
    sidePad: Math.max(0, nodeWidth - boxWidth),
    chrome: Math.max(0, nodeHeight - boxHeight)
  };
}
