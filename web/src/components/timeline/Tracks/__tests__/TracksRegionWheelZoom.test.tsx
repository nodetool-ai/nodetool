/**
 * Ctrl/Cmd+wheel zoom (and the Chromium trackpad pinch, which arrives as a
 * ctrlKey wheel) across the whole tracks region:
 *   - a pinch over the ruler, a track header or the playhead zooms the
 *     timeline instead of the page;
 *   - the store's scroll offset moves in the same frame as the scale, so the
 *     ruler and playhead never draw the new scale at the old offset;
 *   - a large wheel delta zooms by a bounded factor instead of jumping to the
 *     zoom limit.
 *
 * Store state is seeded AFTER render so `getState()` routes to the mounted
 * provider's instance.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { act, render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { TracksRegion } from "../TracksRegion";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";

jest.mock("../../../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));

const VIEWPORT_PX = 1000;

const ctrlWheel = (deltaY: number, clientX: number): WheelEvent =>
  new WheelEvent("wheel", {
    deltaY,
    clientX,
    ctrlKey: true,
    bubbles: true,
    cancelable: true
  });

describe("TracksRegion wheel zoom", () => {
  let frames: Array<FrameRequestCallback>;
  let rafSpy: jest.SpiedFunction<typeof window.requestAnimationFrame>;

  beforeEach(() => {
    frames = [];
    rafSpy = jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        frames.push(cb);
        return frames.length;
      });
  });

  afterEach(() => {
    rafSpy.mockRestore();
  });

  const flushFrames = () => {
    const pending = frames.splice(0, frames.length);
    act(() => {
      for (const frame of pending) frame(0);
    });
  };

  const setup = () => {
    const result = render(
      <ThemeProvider theme={mockTheme}>
        <TimelineProvider>
          <TracksRegion heightPx={400} />
        </TimelineProvider>
      </ThemeProvider>
    );
    act(() => {
      useTimelineUIStore.getState().setZoom(10);
    });
    const lanes = result.getByTestId("tracks-scroll-area");
    Object.defineProperty(lanes, "clientWidth", {
      configurable: true,
      value: VIEWPORT_PX
    });
    lanes.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: VIEWPORT_PX, bottom: 300, width: VIEWPORT_PX, height: 300, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    return { ...result, lanes };
  };

  it("zooms the timeline for a pinch over the ruler, not the page", () => {
    const { getByTestId } = setup();
    const event = ctrlWheel(-100, 400);
    act(() => {
      getByTestId("time-ruler").dispatchEvent(event);
    });
    flushFrames();
    expect(event.defaultPrevented).toBe(true);
    expect(useTimelineUIStore.getState().msPerPx).toBeLessThan(10);
  });

  it("moves the store's scroll offset in the same frame as the scale", () => {
    const { lanes } = setup();
    act(() => {
      lanes.scrollLeft = 1000;
    });
    act(() => {
      lanes.dispatchEvent(ctrlWheel(-100, 500));
    });
    flushFrames();
    // No scroll event fires here (jsdom, like the frame before Chrome's), so
    // only a synchronous update keeps the store in step with the lanes.
    const { msPerPx, scrollLeftPx } = useTimelineUIStore.getState();
    expect(msPerPx).toBeLessThan(10);
    expect(scrollLeftPx).toBe(lanes.scrollLeft);
    // The time under the cursor (1500 px × 10 ms) stays under the cursor.
    expect(lanes.scrollLeft).toBeCloseTo(15_000 / msPerPx - 500, 3);
  });

  it("zooms by a bounded factor for a large wheel delta", () => {
    const { lanes } = setup();
    act(() => {
      lanes.dispatchEvent(ctrlWheel(-2000, 500));
    });
    flushFrames();
    const { msPerPx } = useTimelineUIStore.getState();
    expect(msPerPx).toBeGreaterThan(1);
    expect(msPerPx).toBeLessThan(10);
  });
});
