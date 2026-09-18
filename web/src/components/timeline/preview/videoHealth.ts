import { describeMediaError } from "../render/OffscreenVideoPool";
import type { PreviewFailureHandler } from "./previewFailure";

export const VIDEO_PROGRESS_TIMEOUT_MS = 15_000;

/** Watches only bound media. Empty pool slots and normal pauses have no deadline. */
export function watchVideoHealth(
  el: HTMLVideoElement,
  onFailure: PreviewFailureHandler
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = (): void => {
    clearTimeout(timer);
    timer = undefined;
  };
  const fail = (stage: string, error: unknown): void => {
    clear();
    onFailure({
      stage,
      error,
      resourceId: el.dataset.clipId,
      detail: JSON.stringify({
        readyState: el.readyState,
        networkState: el.networkState,
        time: el.currentTime,
        duration: el.duration,
        seeking: el.seeking
      })
    });
  };
  const arm = (): void => {
    if (!el.getAttribute("src") || timer !== undefined) return;
    const startTime = el.currentTime;
    timer = setTimeout(() => {
      timer = undefined;
      // A paused/preloaded element may stop fetching once its current frame is ready.
      if (
        !el.getAttribute("src") ||
        (el.readyState >= 2 &&
          !el.seeking &&
          (el.paused || el.currentTime !== startTime))
      )
        return;
      fail(
        "video-timeout",
        new Error("Video made no decoding progress for 15 seconds")
      );
    }, VIDEO_PROGRESS_TIMEOUT_MS);
  };
  const ready = (): void => {
    if (el.readyState >= 2 && !el.seeking) clear();
  };
  const error = (): void => {
    if (el.getAttribute("src"))
      fail("video-decode", new Error(describeMediaError(el)));
  };
  const pendingEvents = ["loadstart", "seeking", "waiting", "stalled"];
  const readyEvents = [
    "loadeddata",
    "canplay",
    "seeked",
    "timeupdate",
    "playing"
  ];
  pendingEvents.forEach((event) => el.addEventListener(event, arm));
  readyEvents.forEach((event) => el.addEventListener(event, ready));
  el.addEventListener("error", error);
  el.addEventListener("emptied", clear);
  return () => {
    clear();
    pendingEvents.forEach((event) => el.removeEventListener(event, arm));
    readyEvents.forEach((event) => el.removeEventListener(event, ready));
    el.removeEventListener("error", error);
    el.removeEventListener("emptied", clear);
  };
}
