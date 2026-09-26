import { renderHook, waitFor } from "@testing-library/react";

import { restFetch } from "../../../../lib/rest-fetch";
import {
  FULL_ASSET_PEAK_COUNT,
  resetAudioPeaksCache,
  useAudioPeaks
} from "../useAudioPeaks";

jest.mock("../../../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));

const mockedRestFetch = restFetch as jest.MockedFunction<typeof restFetch>;

function peaksResponse(peaks: number[], durationMs: number): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ peaks, duration_ms: durationMs })
  } as Response;
}

describe("useAudioPeaks", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetAudioPeaksCache();
    mockedRestFetch.mockReset();
    // The audio file itself must never be fetched.
    global.fetch = jest.fn(() => {
      throw new Error("the audio file was fetched");
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("loads peaks from the server endpoint instead of decoding the file", async () => {
    mockedRestFetch.mockResolvedValue(peaksResponse([0, 0.5, 1], 3000));

    const { result } = renderHook(() =>
      useAudioPeaks("asset-1", "/api/storage/u/asset-1.wav")
    );

    await waitFor(() => expect(result.current.peaks).not.toBeNull());
    expect(Array.from(result.current.peaks!)).toEqual([0, 0.5, 1]);
    expect(result.current.peaks).toBeInstanceOf(Float32Array);
    expect(result.current.durationMs).toBe(3000);
    expect(mockedRestFetch).toHaveBeenCalledWith(
      `/api/assets/asset-1/peaks?count=${FULL_ASSET_PEAK_COUNT}`
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shares one request between clips on the same media URL", async () => {
    mockedRestFetch.mockResolvedValue(peaksResponse([0.25], 1000));
    const url = "/api/storage/u/asset-1.wav";

    const first = renderHook(() => useAudioPeaks("asset-1", url));
    const second = renderHook(() => useAudioPeaks("asset-1", url));
    await waitFor(() => expect(first.result.current.peaks).not.toBeNull());
    await waitFor(() => expect(second.result.current.peaks).not.toBeNull());

    // A clip mounted later reads the cache synchronously.
    const third = renderHook(() => useAudioPeaks("asset-1", url));
    expect(third.result.current.durationMs).toBe(1000);
    expect(mockedRestFetch).toHaveBeenCalledTimes(1);
  });

  it("loads again when the media URL version changes after a relink", async () => {
    mockedRestFetch
      .mockResolvedValueOnce(peaksResponse([0.1], 1000))
      .mockResolvedValueOnce(peaksResponse([0.9], 2000));

    const { result, rerender } = renderHook(
      ({ url }: { url: string }) => useAudioPeaks("asset-1", url),
      { initialProps: { url: "/api/storage/u/asset-1.wav?v=1" } }
    );
    await waitFor(() => expect(result.current.durationMs).toBe(1000));

    rerender({ url: "/api/storage/u/asset-1.wav?v=2" });
    await waitFor(() => expect(result.current.durationMs).toBe(2000));
    expect(mockedRestFetch).toHaveBeenCalledTimes(2);
  });

  it("waits for the media URL and leaves peaks empty when the server fails", async () => {
    mockedRestFetch.mockResolvedValue({ ok: false, status: 422 } as Response);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const { result, rerender } = renderHook(
      ({ url }: { url: string | undefined }) => useAudioPeaks("asset-1", url),
      { initialProps: { url: undefined as string | undefined } }
    );
    expect(mockedRestFetch).not.toHaveBeenCalled();

    rerender({ url: "/api/storage/u/asset-1.wav" });
    await waitFor(() => expect(mockedRestFetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(result.current).toEqual({ peaks: null, durationMs: null });
    warn.mockRestore();
  });
});
