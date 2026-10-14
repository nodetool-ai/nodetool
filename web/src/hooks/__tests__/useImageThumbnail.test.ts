import { act, renderHook } from "@testing-library/react";

import {
  THUMBNAIL_RETRY_BASE_MS,
  useImageThumbnail
} from "../useImageThumbnail";

/** Controls which URLs load; each probe settles on the next microtask. */
const available = new Set<string>();
const requested: string[] = [];

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(url: string) {
    requested.push(url);
    void Promise.resolve().then(() => {
      if (available.has(url)) {
        this.onload?.();
      } else {
        this.onerror?.();
      }
    });
  }
}

const THUMB = "/api/storage/u/abc_thumb.jpg";
const FULL = "/api/storage/u/abc.jpg";

const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe("useImageThumbnail", () => {
  const OriginalImage = global.Image;

  beforeEach(() => {
    jest.useFakeTimers();
    available.clear();
    requested.length = 0;
    global.Image = FakeImage as unknown as typeof Image;
  });

  afterEach(() => {
    global.Image = OriginalImage;
    jest.useRealTimers();
  });

  it("returns the thumbnail when it loads", async () => {
    available.add(THUMB);
    const { result } = renderHook(() => useImageThumbnail(THUMB, FULL));
    await flush();
    expect(result.current).toBe(THUMB);
  });

  it("shows the full image while the thumbnail is missing, then switches once it exists", async () => {
    // The upload listed the asset before its thumbnail was written.
    const { result } = renderHook(() => useImageThumbnail(THUMB, FULL));
    await flush();
    expect(result.current).toBe(FULL);

    available.add(THUMB);
    await act(async () => {
      jest.advanceTimersByTime(THUMBNAIL_RETRY_BASE_MS);
    });
    await flush();

    expect(requested.filter((url) => url === THUMB)).toHaveLength(2);
    expect(result.current).toBe(THUMB);
  });

  it("falls back to the full image when there is no thumbnail URL", () => {
    const { result } = renderHook(() => useImageThumbnail(null, FULL));
    expect(result.current).toBe(FULL);
  });
});
