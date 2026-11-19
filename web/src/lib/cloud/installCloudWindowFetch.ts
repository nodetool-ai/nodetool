/**
 * The page's `fetch` in the desktop app's cloud window (D27). Imported first
 * by the app entry, before any module can send a request.
 *
 * A request to the cloud server goes through the main process, which adds the
 * account's credential. A request to the local server's API is refused: the
 * cloud window shows the cloud server's documents only. The drafts client,
 * which keeps unsaved edits on this computer, uses `localFetch`. Everything
 * else, such as the app's own scripts and translations, loads as before.
 */
import { CLOUD_WINDOW, localFetch, refusedInCloudWindow, type CloudWindowOrigin } from "./cloudWindow";
import { CloudRequestError, createCloudFetch, type CloudRequester } from "./cloudFetch";

function requestUrl(input: RequestInfo | URL, base: string): URL {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return new URL(href, base);
}

/** The cloud window's `fetch` over `pageFetch`, for a page at `pageOrigin`. */
export function cloudWindowFetch(
  origin: CloudWindowOrigin,
  request: CloudRequester,
  pageFetch: typeof fetch,
  pageOrigin: string
): typeof fetch {
  const toCloud = createCloudFetch(origin.server, request);
  return (input, init) => {
    let url: URL;
    try {
      url = requestUrl(input, pageOrigin);
    } catch {
      return pageFetch(input, init);
    }
    if (url.origin === origin.server) {
      return toCloud(url.href, init);
    }
    if (refusedInCloudWindow(url, pageOrigin)) {
      return Promise.reject(new CloudRequestError("REFUSED"));
    }
    return pageFetch(input, init);
  };
}

const cloud = typeof window !== "undefined" ? window.api?.cloud : undefined;
if (CLOUD_WINDOW && cloud && localFetch) {
  window.fetch = cloudWindowFetch(CLOUD_WINDOW, (input) => cloud.request(input), localFetch, window.location.origin);
}
