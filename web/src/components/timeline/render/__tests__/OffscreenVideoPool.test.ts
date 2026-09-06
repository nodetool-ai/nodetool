import { OffscreenVideoPool, describeMediaError } from "../OffscreenVideoPool";

/**
 * jsdom implements no media pipeline: `load()` is a stub and `currentTime`
 * assignments fire nothing. Each test scripts the element by hand — set
 * readyState/videoWidth, then dispatch `loadedmetadata`, `seeked` or `error`.
 */
function ready(el: HTMLVideoElement, duration = 10): void {
  Object.defineProperty(el, "readyState", { value: 1, configurable: true });
  Object.defineProperty(el, "videoWidth", { value: 640, configurable: true });
  Object.defineProperty(el, "duration", { value: duration, configurable: true });
}

function fail(el: HTMLVideoElement, code = 2, message = "range request"): void {
  Object.defineProperty(el, "error", {
    value: { code, message },
    configurable: true
  });
  el.dispatchEvent(new Event("error"));
}

function videos(): HTMLVideoElement[] {
  return Array.from(document.querySelectorAll("video"));
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe("OffscreenVideoPool", () => {
  let loadSpy: jest.SpyInstance;
  let pauseSpy: jest.SpyInstance;

  beforeEach(() => {
    loadSpy = jest
      .spyOn(HTMLMediaElement.prototype, "load")
      .mockImplementation(() => undefined);
    pauseSpy = jest
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loadSpy.mockRestore();
    pauseSpy.mockRestore();
    document.body.innerHTML = "";
  });

  it("resolves with the element once the seek lands", async () => {
    const pool = new OffscreenVideoPool({ retryDelayMs: 0 });
    const p = pool.seek("clip", "http://x/a.mp4", 2);
    const [el] = videos();
    ready(el);
    el.dispatchEvent(new Event("loadedmetadata"));
    await flush();
    el.dispatchEvent(new Event("seeked"));
    await expect(p).resolves.toBe(el);
    pool.dispose();
  });

  it("retries a seek that errors on a fresh element", async () => {
    const pool = new OffscreenVideoPool({ retryDelayMs: 0 });
    const p = pool.seek("clip", "http://x/a.mp4", 2);
    const [first] = videos();
    ready(first);
    first.dispatchEvent(new Event("loadedmetadata"));
    await flush();
    fail(first);
    await flush();
    await flush();

    const current = videos();
    expect(current).toHaveLength(1);
    const second = current[0];
    expect(second).not.toBe(first);
    expect(first.isConnected).toBe(false);

    ready(second);
    second.dispatchEvent(new Event("loadedmetadata"));
    await flush();
    second.dispatchEvent(new Event("seeked"));
    await expect(p).resolves.toBe(second);
    pool.dispose();
  });

  it("reports the media error code once every attempt fails", async () => {
    const pool = new OffscreenVideoPool({ retryDelayMs: 0, attempts: 2 });
    const p = pool.seek("clip", "http://x/a.mp4", 2);
    const rejection = expect(p).rejects.toThrow(
      /after 2 attempts.*MEDIA_ERR_DECODE \(3\): bad frame/
    );
    for (let i = 0; i < 2; i++) {
      const [el] = videos();
      ready(el);
      el.dispatchEvent(new Event("loadedmetadata"));
      await flush();
      fail(el, 3, "bad frame");
      await flush();
      await flush();
    }
    await rejection;
    pool.dispose();
  });

  it("treats a seek that never fires seeked as stalled and retries", async () => {
    jest.useFakeTimers();
    try {
      const pool = new OffscreenVideoPool({
        retryDelayMs: 0,
        seekTimeoutMs: 100,
        attempts: 2
      });
      const p = pool.seek("clip", "http://x/a.mp4", 2);
      const [first] = videos();
      ready(first);
      first.dispatchEvent(new Event("loadedmetadata"));
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(101);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const [second] = videos();
      expect(second).not.toBe(first);
      ready(second);
      second.dispatchEvent(new Event("loadedmetadata"));
      await Promise.resolve();
      await Promise.resolve();
      second.dispatchEvent(new Event("seeked"));
      await expect(p).resolves.toBe(second);
      pool.dispose();
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not retry after an abort", async () => {
    const pool = new OffscreenVideoPool({ retryDelayMs: 0 });
    const ctrl = new AbortController();
    const p = pool.seek("clip", "http://x/a.mp4", 2, ctrl.signal);
    await flush();
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(videos()).toHaveLength(1);
    pool.dispose();
  });

  it("describes a media error by name and code", () => {
    const el = document.createElement("video");
    expect(describeMediaError(el)).toBe("no media error reported");
    Object.defineProperty(el, "error", { value: { code: 2, message: "" } });
    expect(describeMediaError(el)).toBe("MEDIA_ERR_NETWORK (2)");
  });
});
