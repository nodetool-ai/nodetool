/**
 * Reproduces the reported bug: a video asset whose `thumb_url` 404s (no
 * `ffmpeg` on the server) painted an empty tile, because `get_url` is an MP4
 * and no browser renders one as a background image.
 */
import { act, renderHook, waitFor } from "@testing-library/react";

import {
  resetVideoThumbnailProbes,
  useVideoThumbnail
} from "../useVideoThumbnail";

const extractVideoFrames = jest.fn();

jest.mock("../../components/timeline/Tracks/clipThumbnails", () => {
  const thumbs = new Map<string, Array<{ time: number; dataUrl: string }>>();
  const subs = new Map<string, Set<() => void>>();
  return {
    extractVideoFrames: (...args: unknown[]) => extractVideoFrames(...args),
    getThumbnails: (key: string) => thumbs.get(key) ?? null,
    requestThumbnailsFrom: (key: string, produce: () => Promise<unknown>) => {
      if (thumbs.has(key)) return;
      // The real module swallows extraction failures — the entry state is
      // the result, so a rejection must not surface as an unhandled one.
      void produce()
        .then((frames) => {
          thumbs.set(key, frames as Array<{ time: number; dataUrl: string }>);
          for (const cb of subs.get(key) ?? []) cb();
        })
        .catch(() => undefined);
    },
    subscribeThumbnails: (key: string, cb: () => void) => {
      const set = subs.get(key) ?? new Set<() => void>();
      set.add(cb);
      subs.set(key, set);
      return () => set.delete(cb);
    }
  };
});

/** Detached `Image` whose load outcome the test drives. */
class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";
  constructor() {
    FakeImage.instances.push(this);
  }
  set src(value: string) {
    this._src = value;
  }
  get src(): string {
    return this._src;
  }
}

describe("useVideoThumbnail", () => {
  beforeEach(() => {
    resetVideoThumbnailProbes();
    FakeImage.instances = [];
    extractVideoFrames.mockReset();
    extractVideoFrames.mockResolvedValue([
      { time: 1, dataUrl: "data:image/jpeg;base64,decoded" }
    ]);
    (globalThis as { Image: unknown }).Image = FakeImage;
  });

  it("paints the stored thumbnail when it loads", async () => {
    const { result } = renderHook(() =>
      useVideoThumbnail("https://host/a_thumb.jpg", "https://host/a.mp4")
    );

    expect(result.current).toBe("https://host/a_thumb.jpg");
    act(() => FakeImage.instances[0].onload?.());
    expect(result.current).toBe("https://host/a_thumb.jpg");
    expect(extractVideoFrames).not.toHaveBeenCalled();
  });

  it("decodes a poster frame when the stored thumbnail 404s", async () => {
    const { result } = renderHook(() =>
      useVideoThumbnail("https://host/b_thumb.jpg", "https://host/b.mp4")
    );

    act(() => FakeImage.instances[0].onerror?.());

    await waitFor(() =>
      expect(result.current).toBe("data:image/jpeg;base64,decoded")
    );
    expect(extractVideoFrames).toHaveBeenCalledWith(
      "https://host/b.mp4",
      [1],
      512
    );
  });

  it("decodes a poster frame when the asset has no thumb_url at all", async () => {
    const { result } = renderHook(() =>
      useVideoThumbnail(null, "https://host/c.mp4")
    );

    await waitFor(() =>
      expect(result.current).toBe("data:image/jpeg;base64,decoded")
    );
  });

  it("returns null when neither the thumbnail nor the video yields a frame", async () => {
    extractVideoFrames.mockRejectedValue(new Error("no CORS"));
    const { result } = renderHook(() =>
      useVideoThumbnail("https://host/d_thumb.jpg", "https://host/d.mp4")
    );

    act(() => FakeImage.instances[0].onerror?.());

    await waitFor(() => expect(result.current).toBeNull());
  });
});
