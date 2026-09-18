import { VIDEO_PROGRESS_TIMEOUT_MS, watchVideoHealth } from "../videoHealth";

describe("preview video health", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function setup(): {
    video: HTMLVideoElement;
    fail: jest.Mock;
    dispose: () => void;
  } {
    const video = document.createElement("video");
    video.src = "https://media.example/video.mov?token=private";
    video.dataset.clipId = "clip-one";
    const fail = jest.fn();
    return { video, fail, dispose: watchVideoHealth(video, fail) };
  }

  it("reports decoder failures with clip identity and media state, without the signed URL", () => {
    const { video, fail, dispose } = setup();
    Object.defineProperty(video, "error", {
      value: { code: 3, message: "decode failed" }
    });
    video.dispatchEvent(new Event("error"));
    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "video-decode", resourceId: "clip-one" })
    );
    expect(fail.mock.calls[0][0].error.message).toContain("MEDIA_ERR_DECODE");
    expect(JSON.stringify(fail.mock.calls)).not.toContain("private");
    dispose();
  });

  it("detects a stalled seek even if repeated waiting events arrive", () => {
    const { video, fail, dispose } = setup();
    video.dispatchEvent(new Event("seeking"));
    jest.advanceTimersByTime(VIDEO_PROGRESS_TIMEOUT_MS - 1);
    video.dispatchEvent(new Event("waiting"));
    jest.advanceTimersByTime(1);
    expect(fail).toHaveBeenCalledTimes(1);
    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "video-timeout" })
    );
    dispose();
  });

  it("cancels the deadline once the seek has decoded, and removes listeners on disposal", () => {
    const { video, fail, dispose } = setup();
    video.dispatchEvent(new Event("loadstart"));
    Object.defineProperty(video, "readyState", { value: 4 });
    video.dispatchEvent(new Event("seeked"));
    jest.advanceTimersByTime(VIDEO_PROGRESS_TIMEOUT_MS);
    expect(fail).not.toHaveBeenCalled();
    video.dispatchEvent(new Event("stalled"));
    dispose();
    jest.advanceTimersByTime(VIDEO_PROGRESS_TIMEOUT_MS);
    video.dispatchEvent(new Event("error"));
    expect(fail).not.toHaveBeenCalled();
  });

  it("does not interpret an empty pool slot as a failed video", () => {
    const { video, fail, dispose } = setup();
    video.removeAttribute("src");
    video.dispatchEvent(new Event("error"));
    video.dispatchEvent(new Event("waiting"));
    jest.advanceTimersByTime(VIDEO_PROGRESS_TIMEOUT_MS);
    expect(fail).not.toHaveBeenCalled();
    dispose();
  });

  it("does not restart a paused preview when background preloading stalls with a ready frame", () => {
    const { video, fail, dispose } = setup();
    Object.defineProperty(video, "readyState", { value: 2 });
    video.dispatchEvent(new Event("stalled"));
    jest.advanceTimersByTime(VIDEO_PROGRESS_TIMEOUT_MS);
    expect(fail).not.toHaveBeenCalled();
    dispose();
  });

  it("detects playback stuck on a current frame without future decoded data", () => {
    const { video, fail, dispose } = setup();
    Object.defineProperty(video, "readyState", { value: 2 });
    Object.defineProperty(video, "paused", { value: false });
    video.dispatchEvent(new Event("waiting"));
    jest.advanceTimersByTime(VIDEO_PROGRESS_TIMEOUT_MS);
    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "video-timeout" })
    );
    dispose();
  });
});
