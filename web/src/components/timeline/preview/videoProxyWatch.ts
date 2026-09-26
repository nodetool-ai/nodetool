/**
 * Waits for the server to finish a video asset's preview proxy.
 *
 * The preview resolves each asset's URL once. An asset imported a moment ago
 * answers `proxy_status: "queued"` or `"running"` and plays its original
 * until the proxy is made. This polls the asset until the proxy settles and
 * calls `onReady` when it is ready, so the preview can resolve the asset again
 * and switch to the proxy. One poll per asset at a time, bounded in count.
 */
import { isVideoProxyPending } from "../../../utils/assetHelpers";
import { isObjectLike } from "../../../utils/typePredicates";

/** Time between checks. */
export const VIDEO_PROXY_POLL_MS = 5_000;
/** Checks before giving up: half an hour at the default interval. */
export const VIDEO_PROXY_MAX_POLLS = 360;

const watching = new Set<string>();

export interface VideoProxyWatchOptions {
  /** Fetches the asset response fresh. */
  fetchAsset: (assetId: string) => Promise<unknown>;
  /** Called once when the proxy is ready. */
  onReady: (assetId: string) => void;
  /** Stops polling, for a preview that unmounts. */
  signal?: AbortSignal;
  pollMs?: number;
  maxPolls?: number;
}

export function watchVideoProxy(
  assetId: string,
  {
    fetchAsset,
    onReady,
    signal,
    pollMs = VIDEO_PROXY_POLL_MS,
    maxPolls = VIDEO_PROXY_MAX_POLLS
  }: VideoProxyWatchOptions
): void {
  if (watching.has(assetId) || signal?.aborted) {
    return;
  }
  watching.add(assetId);
  let polls = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    watching.delete(assetId);
    signal?.removeEventListener("abort", stop);
  };
  const tick = (): void => {
    timer = null;
    polls += 1;
    fetchAsset(assetId)
      .then((asset) => {
        if (signal?.aborted) {
          return;
        }
        if (isVideoProxyPending(asset) && polls < maxPolls) {
          timer = setTimeout(tick, pollMs);
          return;
        }
        stop();
        if (isObjectLike(asset) && asset["proxy_status"] === "ready") {
          onReady(assetId);
        }
      })
      .catch(() => {
        // The asset is gone or the server is unreachable: the preview keeps
        // the URL it has.
        stop();
      });
  };
  signal?.addEventListener("abort", stop, { once: true });
  timer = setTimeout(tick, pollMs);
}
