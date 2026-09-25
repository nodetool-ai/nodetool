import { OffscreenVideoPool, describeMediaError } from "../OffscreenVideoPool";
import { SequentialVideoSource } from "../SequentialVideoSource";

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

  it("waits for the first decoded frame when source time zero already matches", async () => {
    const pool = new OffscreenVideoPool({ retryDelayMs: 0 });
    const pending = pool.seek("clip", "http://x/a.mp4", 0);
    const [el] = videos();
    ready(el);
    el.dispatchEvent(new Event("loadedmetadata"));
    let settled = false;
    void pending.then(() => { settled = true; });
    await flush();
    expect(settled).toBe(false);
    Object.defineProperty(el, "readyState", { value: 2, configurable: true });
    el.dispatchEvent(new Event("loadeddata"));
    await expect(pending).resolves.toBe(el);
    pool.dispose();
  });

  it("aborts while waiting for current data at source time zero", async () => {
    const pool = new OffscreenVideoPool();
    const controller = new AbortController();
    const pending = pool.seek("clip", "http://x/a.mp4", 0, controller.signal);
    const [el] = videos();
    ready(el);
    el.dispatchEvent(new Event("loadedmetadata"));
    await flush();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    pool.dispose();
  });

  it("reports a media error while waiting for current data", async () => {
    const pool = new OffscreenVideoPool({ attempts: 1 });
    const pending = pool.seek("clip", "http://x/a.mp4", 0);
    const [el] = videos();
    ready(el);
    el.dispatchEvent(new Event("loadedmetadata"));
    await flush();
    fail(el, 3, "first frame failed");
    await expect(pending).rejects.toThrow(/MEDIA_ERR_DECODE.*first frame failed/);
    pool.dispose();
  });

  it("times out while waiting for current data", async () => {
    jest.useFakeTimers();
    try {
      const pool = new OffscreenVideoPool({ attempts: 1, seekTimeoutMs: 100 });
      const pending = pool.seek("clip", "http://x/a.mp4", 0);
      const [el] = videos();
      ready(el);
      el.dispatchEvent(new Event("loadedmetadata"));
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(101);
      await expect(pending).rejects.toThrow(/frame not decoded after 100ms/);
      pool.dispose();
    } finally {
      jest.useRealTimers();
    }
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

  it("cancels all pending element seeks when disposed", async () => {
    const pool = new OffscreenVideoPool();
    const first = pool.seek("first", "http://x/first.mp4", 1);
    const second = pool.seek("second", "http://x/second.mp4", 2);
    const [firstEl, secondEl] = videos();
    for (const el of [firstEl, secondEl]) {
      ready(el);
      el.dispatchEvent(new Event("loadedmetadata"));
    }
    await flush();
    pool.dispose();
    let settled = 0;
    void first.catch(() => { settled += 1; });
    void second.catch(() => { settled += 1; });
    await flush();
    expect(settled).toBe(2);
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
  });

  it("describes a media error by name and code", () => {
    const el = document.createElement("video");
    expect(describeMediaError(el)).toBe("no media error reported");
    Object.defineProperty(el, "error", { value: { code: 2, message: "" } });
    expect(describeMediaError(el)).toBe("MEDIA_ERR_NETWORK (2)");
  });

  it("reuses a sequential decoded source and releases its bitmap owner", async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "VideoDecoder");
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: {}, configurable: true
    });
    const bitmap = { width: 640, height: 360 } as ImageBitmap;
    const source = {
      frameAt: jest.fn().mockResolvedValue(bitmap),
      dispose: jest.fn()
    };
    const open = jest.spyOn(SequentialVideoSource, "open").mockResolvedValue(
      source as unknown as SequentialVideoSource
    );
    const pool = new OffscreenVideoPool();
    try {
      const [picture, reused] = await Promise.all([
        pool.seek("clip", "http://x/a.mp4", 0),
        pool.seek("clip", "http://x/a.mp4", 0)
      ]);
      expect(picture).toBe(bitmap);
      expect(reused).toBe(bitmap);
      await expect(pool.seek("clip", "http://x/a.mp4", 1 / 24)).resolves.toBe(bitmap);
      expect(open).toHaveBeenCalledTimes(1);
      expect(source.frameAt).toHaveBeenCalledTimes(2);
      expect(videos()).toHaveLength(0);
      pool.release("clip");
      expect(source.dispose).toHaveBeenCalledTimes(1);
    } finally {
      pool.dispose();
      open.mockRestore();
      if (previous) Object.defineProperty(globalThis, "VideoDecoder", previous);
      else Reflect.deleteProperty(globalThis, "VideoDecoder");
    }
  });

  it("falls back to a seeked element when timestamped decode fails", async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "VideoDecoder");
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: {}, configurable: true
    });
    const source = {
      frameAt: jest.fn().mockRejectedValue(new Error("decoder failed")),
      dispose: jest.fn()
    };
    const open = jest.spyOn(SequentialVideoSource, "open").mockResolvedValue(
      source as unknown as SequentialVideoSource
    );
    const pool = new OffscreenVideoPool({ retryDelayMs: 0 });
    try {
      const pending = pool.seek("clip", "http://x/a.mp4", 0.5);
      await flush();
      const [el] = videos();
      ready(el);
      el.dispatchEvent(new Event("loadedmetadata"));
      await flush();
      el.dispatchEvent(new Event("seeked"));
      await expect(pending).resolves.toBe(el);
      expect(source.dispose).toHaveBeenCalledTimes(1);
      Object.defineProperty(el, "readyState", { value: 2, configurable: true });
      await expect(pool.seek("clip", "http://x/a.mp4", 0.5)).resolves.toBe(el);
      expect(open).toHaveBeenCalledTimes(1);
    } finally {
      pool.dispose();
      open.mockRestore();
      if (previous) Object.defineProperty(globalThis, "VideoDecoder", previous);
      else Reflect.deleteProperty(globalThis, "VideoDecoder");
    }
  });

  it("uses the seek path when WebCodecs does not support the source", async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "VideoDecoder");
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: {}, configurable: true
    });
    const open = jest.spyOn(SequentialVideoSource, "open").mockResolvedValue(null);
    const pool = new OffscreenVideoPool({ retryDelayMs: 0 });
    try {
      const pending = pool.seek("clip", "http://x/unsupported.mp4", 1);
      await flush();
      const [el] = videos();
      ready(el);
      el.dispatchEvent(new Event("loadedmetadata"));
      await flush();
      el.dispatchEvent(new Event("seeked"));
      await expect(pending).resolves.toBe(el);
      expect(open).toHaveBeenCalledTimes(1);
    } finally {
      pool.dispose();
      open.mockRestore();
      if (previous) Object.defineProperty(globalThis, "VideoDecoder", previous);
      else Reflect.deleteProperty(globalThis, "VideoDecoder");
    }
  });

  it("keeps a picture and its generated matte separate until clip release", async () => {
    const pool = new OffscreenVideoPool();
    try {
      const picture = pool.seek("clip", "http://x/picture.mp4", 0.5);
      const matte = pool.seek("clip", "http://x/matte.mp4", 0.5);
      const [pictureEl, matteEl] = videos();
      expect(matteEl).not.toBe(pictureEl);
      for (const el of [pictureEl, matteEl]) {
        ready(el);
        el.dispatchEvent(new Event("loadedmetadata"));
      }
      await flush();
      pictureEl.dispatchEvent(new Event("seeked"));
      matteEl.dispatchEvent(new Event("seeked"));
      await expect(picture).resolves.toBe(pictureEl);
      await expect(matte).resolves.toBe(matteEl);
      pool.release("clip");
      expect(videos()).toHaveLength(0);
    } finally {
      pool.dispose();
    }
  });

  it("keeps WebCodecs picture and matte bitmaps separate for the same clip", async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "VideoDecoder");
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: {}, configurable: true
    });
    const sources: Array<{ frameAt: jest.Mock; dispose: jest.Mock }> = [];
    const open = jest.spyOn(SequentialVideoSource, "open").mockImplementation(async () => {
      const source = {
        frameAt: jest.fn().mockResolvedValue({ width: 640, height: 360 }),
        dispose: jest.fn()
      };
      sources.push(source);
      return source as unknown as SequentialVideoSource;
    });
    const pool = new OffscreenVideoPool();
    try {
      const [picture, matte] = await Promise.all([
        pool.seek("clip", "http://x/picture.mp4", 0.5),
        pool.seek("clip", "http://x/matte.mp4", 0.5)
      ]);
      expect(picture).not.toBe(matte);
      expect(open).toHaveBeenCalledTimes(2);
      pool.release("clip");
      expect(sources.every((source) => source.dispose.mock.calls.length === 1)).toBe(true);
    } finally {
      pool.dispose();
      open.mockRestore();
      if (previous) Object.defineProperty(globalThis, "VideoDecoder", previous);
      else Reflect.deleteProperty(globalThis, "VideoDecoder");
    }
  });

  it("falls back on a reverse source-time request", async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "VideoDecoder");
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: {}, configurable: true
    });
    const bitmap = { width: 640, height: 360 } as ImageBitmap;
    const source = {
      frameAt: jest.fn()
        .mockResolvedValueOnce(bitmap)
        .mockRejectedValueOnce(new Error("Video timestamp moved backward")),
      dispose: jest.fn()
    };
    const open = jest.spyOn(SequentialVideoSource, "open").mockResolvedValue(
      source as unknown as SequentialVideoSource
    );
    const pool = new OffscreenVideoPool();
    try {
      await expect(pool.seek("clip", "http://x/a.mp4", 2)).resolves.toBe(bitmap);
      const pending = pool.seek("clip", "http://x/a.mp4", 1);
      await flush();
      const [el] = videos();
      ready(el);
      el.dispatchEvent(new Event("loadedmetadata"));
      await flush();
      el.dispatchEvent(new Event("seeked"));
      await expect(pending).resolves.toBe(el);
      expect(source.dispose).toHaveBeenCalledTimes(1);
    } finally {
      pool.dispose();
      open.mockRestore();
      if (previous) Object.defineProperty(globalThis, "VideoDecoder", previous);
      else Reflect.deleteProperty(globalThis, "VideoDecoder");
    }
  });

  it("rejects concurrent requests for different times on one source", async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "VideoDecoder");
    Object.defineProperty(globalThis, "VideoDecoder", { value: {}, configurable: true });
    let resolveOpen!: (source: SequentialVideoSource) => void;
    const source = {
      frameAt: jest.fn().mockResolvedValue({ width: 640, height: 360 }),
      dispose: jest.fn()
    };
    const open = jest.spyOn(SequentialVideoSource, "open").mockImplementation(() =>
      new Promise<SequentialVideoSource>((resolve) => { resolveOpen = resolve; })
    );
    const pool = new OffscreenVideoPool();
    try {
      const first = pool.seek("clip", "http://x/a.mp4", 0);
      await expect(pool.seek("clip", "http://x/a.mp4", 1 / 24)).rejects.toThrow(
        "Concurrent video requests for different source times"
      );
      resolveOpen(source as unknown as SequentialVideoSource);
      await expect(first).resolves.toMatchObject({ width: 640 });
      expect(source.frameAt).toHaveBeenCalledTimes(1);
      expect(source.frameAt).toHaveBeenCalledWith(0, expect.any(AbortSignal));
    } finally {
      pool.dispose();
      open.mockRestore();
      if (previous) Object.defineProperty(globalThis, "VideoDecoder", previous);
      else Reflect.deleteProperty(globalThis, "VideoDecoder");
    }
  });

  it("disposes a decoder that opens after its clip is released", async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "VideoDecoder");
    Object.defineProperty(globalThis, "VideoDecoder", { value: {}, configurable: true });
    let resolveOpen!: (source: SequentialVideoSource) => void;
    const source = { frameAt: jest.fn(), dispose: jest.fn() };
    const open = jest.spyOn(SequentialVideoSource, "open").mockImplementation(() =>
      new Promise<SequentialVideoSource>((resolve) => { resolveOpen = resolve; })
    );
    const pool = new OffscreenVideoPool();
    try {
      const pending = pool.seek("clip", "http://x/a.mp4", 0);
      pool.release("clip");
      resolveOpen(source as unknown as SequentialVideoSource);
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      expect(source.dispose).toHaveBeenCalledTimes(1);
      expect(source.frameAt).not.toHaveBeenCalled();
    } finally {
      pool.dispose();
      open.mockRestore();
      if (previous) Object.defineProperty(globalThis, "VideoDecoder", previous);
      else Reflect.deleteProperty(globalThis, "VideoDecoder");
    }
  });
});
