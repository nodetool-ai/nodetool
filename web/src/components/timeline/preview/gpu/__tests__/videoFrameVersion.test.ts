import {
  previewVideoFrameGeneration,
  previewVideoFrameMediaTime,
  previewVideoFrameReady,
  seekPreviewShutterFrame,
  trackPreviewVideoFrames
} from "../videoFrameVersion";

describe("seekPreviewShutterFrame", () => {
  it("uploads a newly decoded shutter sample even when its callback is late", async () => {
    const video = document.createElement("video");
    Object.defineProperty(video, "readyState", { configurable: true, value: 2 });
    let callback: VideoFrameRequestCallback | undefined;
    video.requestVideoFrameCallback = (next) => { callback = next; return 1; };
    video.cancelVideoFrameCallback = jest.fn();
    const stop = trackPreviewVideoFrames(video, jest.fn());
    try {
      callback?.(0, { mediaTime: 0 } as VideoFrameCallbackMetadata);
      const before = previewVideoFrameGeneration(video)!;
      const pending = seekPreviewShutterFrame(video, 0.5, "clip");
      expect(previewVideoFrameReady(video)).toBe(false);
      callback?.(1, { mediaTime: 0 } as VideoFrameCallbackMetadata);
      expect(previewVideoFrameGeneration(video)).toBe(before);
      video.dispatchEvent(new Event("seeked"));
      await pending;
      const decoded = previewVideoFrameGeneration(video)!;
      expect(decoded).toBeGreaterThan(before);
      expect(previewVideoFrameMediaTime(video)).toBe(0.5);
      callback?.(2, { mediaTime: 0 } as VideoFrameCallbackMetadata);
      expect(previewVideoFrameGeneration(video)).toBe(decoded);
      expect(previewVideoFrameMediaTime(video)).toBe(0.5);
    } finally {
      stop();
    }
  });

  it("uses seeked current data when requestVideoFrameCallback is unavailable", async () => {
    const video = document.createElement("video");
    Object.defineProperty(video, "readyState", { configurable: true, value: 2 });
    const pending = seekPreviewShutterFrame(video, 0.5, "clip");
    video.dispatchEvent(new Event("seeked"));
    await expect(pending).resolves.toBeUndefined();
    expect(video.currentTime).toBe(0.5);
    expect(previewVideoFrameGeneration(video)).toBeUndefined();
  });

  it("rejects a late callback from before a reverse shutter seek", async () => {
    const video = document.createElement("video");
    Object.defineProperty(video, "readyState", { configurable: true, value: 2 });
    let callback: VideoFrameRequestCallback | undefined;
    video.requestVideoFrameCallback = (next) => { callback = next; return 1; };
    video.cancelVideoFrameCallback = jest.fn();
    const stop = trackPreviewVideoFrames(video, jest.fn());
    try {
      video.currentTime = 1;
      callback?.(0, { mediaTime: 1 } as VideoFrameCallbackMetadata);
      const pending = seekPreviewShutterFrame(video, 0.5, "clip");
      video.dispatchEvent(new Event("seeked"));
      await pending;
      const decoded = previewVideoFrameGeneration(video);
      callback?.(1, { mediaTime: 1 } as VideoFrameCallbackMetadata);
      expect(previewVideoFrameGeneration(video)).toBe(decoded);
      callback?.(2, { mediaTime: 0.5 } as VideoFrameCallbackMetadata);
      expect(previewVideoFrameMediaTime(video)).toBe(0.5);
    } finally {
      stop();
    }
  });

  it("waits for current data if seeked arrives before the frame", async () => {
    const video = document.createElement("video");
    let readyState = 1;
    Object.defineProperty(video, "readyState", { configurable: true, get: () => readyState });
    const pending = seekPreviewShutterFrame(video, 0.5, "clip");
    let settled = false;
    void pending.then(() => { settled = true; });
    video.dispatchEvent(new Event("seeked"));
    await Promise.resolve();
    expect(settled).toBe(false);
    readyState = 2;
    video.dispatchEvent(new Event("loadeddata"));
    await pending;
    expect(settled).toBe(true);
  });
});
