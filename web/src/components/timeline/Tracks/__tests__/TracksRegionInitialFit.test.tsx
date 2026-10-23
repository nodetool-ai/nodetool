import { act, render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { TracksRegion } from "../TracksRegion";

jest.mock("../Clip", () => ({
  Clip: ({ clipId }: { clipId: string }) => <div data-testid={`clip-${clipId}`} />
}));
jest.mock("../../../../lib/rest-fetch", () => ({ restFetch: jest.fn() }));

const VIEWPORT_PX = 664;

describe("TracksRegion initial fit", () => {
  let widthSpy: jest.SpyInstance;
  const resizeCallbacks: Array<(entries: unknown[]) => void> = [];
  const OriginalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    widthSpy = jest
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(VIEWPORT_PX);
    resizeCallbacks.length = 0;
    globalThis.ResizeObserver = class {
      constructor(callback: (entries: unknown[]) => void) {
        resizeCallbacks.push(callback);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    widthSpy.mockRestore();
    globalThis.ResizeObserver = OriginalResizeObserver;
  });

  /** The dock settles the lanes to a new width, as a panel layout does. */
  const resizeLanes = (widthPx: number) => {
    widthSpy.mockReturnValue(widthPx);
    act(() => {
      resizeCallbacks.forEach((callback) => callback([]));
    });
  };

  const renderRegion = () =>
    render(
      <ThemeProvider theme={mockTheme}>
        <TimelineProvider>
          <TracksRegion heightPx={400} />
        </TimelineProvider>
      </ThemeProvider>
    );

  const loadClips = (durationsMs: number[]) => {
    const track = makeTrack({ id: "t1", name: "Video" });
    let startMs = 0;
    const clips = durationsMs.map((durationMs, index) => {
      const clip = makeClip({ id: `c${index}`, trackId: track.id, startMs, durationMs });
      startMs += durationMs;
      return clip;
    });
    act(() => {
      useTimelineStore.setState({ tracks: [track], clips });
    });
  };

  it("fits a timeline that opens wider than the view", () => {
    // Study 14: an example ad opened on its last two seconds.
    renderRegion();
    act(() => {
      useTimelineUIStore.getState().setZoom(5);
    });
    loadClips([15_000]);
    // 15 s across the 600 px left after the fit padding.
    expect(useTimelineUIStore.getState().msPerPx).toBeCloseTo(15_000 / 600, 3);
  });

  it("keeps the zoom when the content already fits", () => {
    renderRegion();
    act(() => {
      useTimelineUIStore.getState().setZoom(50);
    });
    loadClips([10_000]);
    expect(useTimelineUIStore.getState().msPerPx).toBe(50);
  });

  it("does not rezoom for a clip added after the first content", () => {
    renderRegion();
    act(() => {
      useTimelineUIStore.getState().setZoom(50);
    });
    loadClips([10_000]);
    loadClips([10_000, 60_000]);
    expect(useTimelineUIStore.getState().msPerPx).toBe(50);
  });

  it("fits again when the lanes settle narrower before the person zooms", () => {
    // Study 14 validation: the lanes measured 784 px while the dock laid out,
    // then settled near 300 px, so the fit showed 7 of 17 seconds.
    widthSpy.mockReturnValue(784);
    renderRegion();
    act(() => {
      useTimelineUIStore.getState().setZoom(10);
    });
    loadClips([17_000]);
    resizeLanes(364);
    expect(useTimelineUIStore.getState().msPerPx).toBeCloseTo(17_000 / 300, 3);
  });

  it("fits content that overflows only once the lanes settle", () => {
    widthSpy.mockReturnValue(1_064);
    renderRegion();
    act(() => {
      useTimelineUIStore.getState().setZoom(10);
    });
    loadClips([6_000]);
    expect(useTimelineUIStore.getState().msPerPx).toBe(10);
    resizeLanes(364);
    expect(useTimelineUIStore.getState().msPerPx).toBeCloseTo(6_000 / 300, 3);
  });

  it("keeps the person's zoom when the lanes resize after it", () => {
    renderRegion();
    act(() => {
      useTimelineUIStore.getState().setZoom(5);
    });
    loadClips([15_000]);
    act(() => {
      useTimelineUIStore.getState().setZoom(8);
    });
    resizeLanes(364);
    expect(useTimelineUIStore.getState().msPerPx).toBe(8);
  });
});
