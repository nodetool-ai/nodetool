/**
 * In-page media capture for browser tools.
 *
 * Reads a `blob:`/`<video>`/`<audio>`/`<img>` source from the page, fetches it
 * to an ArrayBuffer inside the page context, and returns base64 bytes plus the
 * resolved MIME type. This is the universally-available rung of the capture
 * ladder (it uses only `CdpPage.evaluate`), shared verbatim between the
 * host-process and in-container browser tools.
 *
 * An IDENTICAL copy lives at
 * `packages/sandbox-agent/src/lib/browser-capture.ts`. Keep the two in sync.
 */

import type {
  BrowserCaptureMediaInput,
  BrowserCaptureMediaRaw
} from "@nodetool-ai/sandbox/schemas";
import type { CdpPage } from "../lib/cdp-page.js";

/** Page-side capture payload returned by the injected function. */
interface InPageCaptureResult {
  base64: string;
  mime: string;
  sourceUrl: string;
}

/**
 * Resolve the source URL for an indexed element (a media element previously
 * tagged with `data-nt-idx` by browser_view), preferring `currentSrc` so the
 * actually-loaded resolution variant is captured.
 */
async function resolveElementSource(
  page: CdpPage,
  index: number,
  mediaType: BrowserCaptureMediaInput["media_type"]
): Promise<string | null> {
  return page.evaluate(
    (idx: number, _kind: string | null) => {
      const el = document.querySelector(
        `[data-nt-idx="${idx}"]`
      ) as HTMLElement | null;
      if (!el) return null;
      const media = el as HTMLMediaElement & HTMLImageElement;
      const src = media.currentSrc || media.src || el.getAttribute("src");
      if (src) return src;
      // Fall back to a nested media/source element (e.g. <video><source>).
      const nested = el.querySelector(
        "video, audio, img, source"
      ) as HTMLMediaElement | HTMLImageElement | HTMLSourceElement | null;
      if (!nested) return null;
      return (
        (nested as HTMLMediaElement).currentSrc ||
        (nested as HTMLImageElement).src ||
        nested.getAttribute("src")
      );
    },
    index,
    mediaType ?? null
  );
}

/** Default MIME when the source declares none, biased by the caller's hint. */
function fallbackMime(
  mediaType: BrowserCaptureMediaInput["media_type"]
): string {
  if (mediaType === "video") return "video/mp4";
  if (mediaType === "audio") return "audio/mpeg";
  if (mediaType === "image") return "image/png";
  return "application/octet-stream";
}

/**
 * Fetch a URL inside the page to an ArrayBuffer and return base64 + MIME.
 * Runs in the page so `blob:` URLs and same-origin credentials resolve.
 */
async function fetchToBase64(
  page: CdpPage,
  url: string
): Promise<InPageCaptureResult | null> {
  return page.evaluate(async (target: string) => {
    const res = await fetch(target, { credentials: "include" });
    if (!res.ok) {
      throw new Error(`fetch ${target} failed: HTTP ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    const view = new Uint8Array(buf);
    // Base64-encode in chunks so a large buffer never overflows the call stack
    // via String.fromCharCode(...spread).
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < view.length; i += CHUNK) {
      binary += String.fromCharCode(...view.subarray(i, i + CHUNK));
    }
    return {
      base64: btoa(binary),
      mime: res.headers.get("content-type")?.split(";")[0]?.trim() || "",
      sourceUrl: target
    };
  }, url);
}

/**
 * Capture media via the in-page `fetch()` rung.
 *
 * @throws if no source URL can be resolved or the fetch fails.
 */
export async function captureMediaInPage(
  page: CdpPage,
  input: BrowserCaptureMediaInput
): Promise<BrowserCaptureMediaRaw> {
  let url = input.url ?? input.resource_url ?? null;
  if (input.index !== undefined) {
    url = await resolveElementSource(page, input.index, input.media_type);
    if (!url) {
      throw new Error(
        `No media source found on element index ${input.index}`
      );
    }
  }
  if (!url) {
    throw new Error("No media URL to capture");
  }

  const result = await fetchToBase64(page, url);
  if (!result || !result.base64) {
    throw new Error(`Failed to capture media from ${url}`);
  }
  return {
    media_b64: result.base64,
    mime_type: result.mime || fallbackMime(input.media_type),
    source_url: result.sourceUrl,
    via: "in_page_fetch"
  };
}
