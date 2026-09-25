interface PreviewVideoFrameState {
  generation: number;
  ready: boolean;
  expectedTimeSec?: number;
  postSeek?: { timeSec: number; direction: -1 | 1 };
  mediaTime?: number;
  onFrame: () => void;
}

const previewVideoFrames = new WeakMap<HTMLVideoElement, PreviewVideoFrameState>();
const videoGenerations = new WeakMap<HTMLVideoElement, number>();

/** Preview elements use decoded frames; untracked export elements use seek positions. */
export function previewVideoFrameGeneration(video: HTMLVideoElement): number | undefined {
  return previewVideoFrames.get(video)?.generation;
}

export function previewVideoFrameReady(video: HTMLVideoElement): boolean | undefined {
  return previewVideoFrames.get(video)?.ready;
}

export function previewVideoFrameMediaTime(video: HTMLVideoElement): number | undefined {
  return previewVideoFrames.get(video)?.mediaTime;
}

/** Hold a seek's old pixels until the callback identifies its target frame. */
export function expectPreviewVideoFrame(video: HTMLVideoElement, timeSec: number): void {
  const state = previewVideoFrames.get(video);
  if (!state) return;
  state.expectedTimeSec = timeSec;
  state.postSeek = undefined;
  state.ready = false;
}

/** `seeked` also proves a paused target is decoded when no callback follows. */
export function markPreviewVideoSeeked(video: HTMLVideoElement): void {
  const state = previewVideoFrames.get(video);
  if (!state || state.expectedTimeSec === undefined || video.seeking || video.readyState < 2) return;
  if (Math.abs(video.currentTime - state.expectedTimeSec) > 1 / 24) return;
  const target = state.expectedTimeSec;
  state.postSeek = {
    timeSec: target,
    direction: state.mediaTime !== undefined && target < state.mediaTime ? -1 : 1
  };
  state.expectedTimeSec = undefined;
  state.ready = true;
  state.mediaTime = video.currentTime;
  state.generation += 1;
  videoGenerations.set(video, state.generation);
  state.onFrame();
}

/** Seek one motion-blur shutter sample before its source is composited. */
export function seekPreviewShutterFrame(
  video: HTMLVideoElement,
  timeSec: number,
  clipId: string,
  timeoutMs = 2000
): Promise<void> {
  if (Math.abs(video.currentTime - timeSec) < 0.001 && !video.seeking && video.readyState >= 2) {
    markPreviewVideoSeeked(video);
    if (previewVideoFrameReady(video) !== false) return Promise.resolve();
  }
  expectPreviewVideoFrame(video, timeSec);
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Preview seek timed out for ${clipId}`));
    }, timeoutMs);
    const cleanup = (): void => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("loadeddata", onData);
      video.removeEventListener("error", onError);
    };
    const onData = (): void => {
      markPreviewVideoSeeked(video);
      if (video.readyState >= 2 && previewVideoFrameReady(video) !== false) {
        cleanup();
        resolve();
      }
    };
    const onSeeked = (): void => { onData(); };
    const onError = (): void => {
      cleanup();
      reject(new Error(`Preview seek failed for ${clipId}`));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("loadeddata", onData);
    video.addEventListener("error", onError);
    if (Math.abs(video.currentTime - timeSec) >= 0.001) video.currentTime = timeSec;
    else onData();
  });
}

export function trackPreviewVideoFrames(video: HTMLVideoElement, onFrame: () => void): () => void {
  if (typeof video.requestVideoFrameCallback !== "function") return () => {};
  const state: PreviewVideoFrameState = {
    generation: (videoGenerations.get(video) ?? 0) + 1,
    ready: false,
    onFrame
  };
  videoGenerations.set(video, state.generation);
  previewVideoFrames.set(video, state);
  let callbackId = 0;
  let active = true;
  const callback: VideoFrameRequestCallback = (_now, metadata) => {
    if (!active) return;
    if (state.expectedTimeSec !== undefined) {
      if (Math.abs(metadata.mediaTime - state.expectedTimeSec) > 1 / 24) {
        callbackId = video.requestVideoFrameCallback(callback);
        return;
      }
      state.expectedTimeSec = undefined;
    }
    if (state.postSeek) {
      const { timeSec, direction } = state.postSeek;
      if (
        direction === 1
          ? metadata.mediaTime < timeSec - 1 / 24
          : metadata.mediaTime > timeSec + 1 / 24
      ) {
        callbackId = video.requestVideoFrameCallback(callback);
        return;
      }
      state.postSeek = undefined;
    }
    state.generation += 1;
    videoGenerations.set(video, state.generation);
    state.ready = true;
    state.mediaTime = metadata.mediaTime;
    onFrame();
    callbackId = video.requestVideoFrameCallback(callback);
  };
  callbackId = video.requestVideoFrameCallback(callback);
  return () => {
    active = false;
    video.cancelVideoFrameCallback(callbackId);
    if (previewVideoFrames.get(video) === state) previewVideoFrames.delete(video);
  };
}
