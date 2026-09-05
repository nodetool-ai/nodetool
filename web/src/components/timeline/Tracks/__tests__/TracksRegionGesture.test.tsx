/**
 * TracksRegion pinch-to-zoom over WebKit gesture events (macOS trackpad in
 * Safari). jsdom has no GestureEvent, so the events are synthesized with the
 * fields WebKit sends: a cumulative `scale` and the gesture centroid.
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

type GestureInit = { scale: number; clientX: number };

const gesture = (type: string, init: GestureInit): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { ...init, clientY: 0, rotation: 0 });
  return event;
};

/** Run the pending rAF callback the zoom batches into. */
const flushFrame = (frames: Array<FrameRequestCallback>) => {
  const pending = frames.splice(0, frames.length);
  act(() => {
    for (const frame of pending) frame(0);
  });
};

describe("TracksRegion WebKit pinch zoom", () => {
  let frames: Array<FrameRequestCallback>;
  let rafSpy: jest.SpiedFunction<typeof window.requestAnimationFrame>;

  beforeEach(() => {
    frames = [];
    // Feature detection: only a browser that dispatches gesture events (Safari)
    // gets the listeners.
    (window as unknown as { ongesturechange: unknown }).ongesturechange = null;
    rafSpy = jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        frames.push(cb);
        return frames.length;
      });
  });

  afterEach(() => {
    rafSpy.mockRestore();
    delete (window as unknown as { ongesturechange?: unknown }).ongesturechange;
  });

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
    const el = result.getByTestId("tracks-scroll-area");
    return el;
  };

  it("zooms in as the fingers move apart and out as they close", () => {
    const el = setup();

    act(() => {
      el.dispatchEvent(gesture("gesturestart", { scale: 1, clientX: 100 }));
      el.dispatchEvent(gesture("gesturechange", { scale: 2, clientX: 100 }));
    });
    flushFrame(frames);
    expect(useTimelineUIStore.getState().msPerPx).toBe(5);

    // Still the same gesture: `scale` is cumulative, so 0.5 is half the scale
    // it started at, not half of the last frame.
    act(() => {
      el.dispatchEvent(gesture("gesturechange", { scale: 0.5, clientX: 100 }));
    });
    flushFrame(frames);
    expect(useTimelineUIStore.getState().msPerPx).toBe(20);
  });

  it("takes the gesture over so Safari does not zoom the page", () => {
    const el = setup();
    const start = gesture("gesturestart", { scale: 1, clientX: 100 });
    const change = gesture("gesturechange", { scale: 1.5, clientX: 100 });

    act(() => {
      el.dispatchEvent(start);
      el.dispatchEvent(change);
    });
    expect(start.defaultPrevented).toBe(true);
    expect(change.defaultPrevented).toBe(true);
  });

  it("ignores a gesturechange after the gesture ended", () => {
    const el = setup();

    act(() => {
      el.dispatchEvent(gesture("gesturestart", { scale: 1, clientX: 100 }));
      el.dispatchEvent(gesture("gestureend", { scale: 2, clientX: 100 }));
      el.dispatchEvent(gesture("gesturechange", { scale: 4, clientX: 100 }));
    });
    flushFrame(frames);
    expect(useTimelineUIStore.getState().msPerPx).toBe(10);
  });

  it("leaves the zoom to the wheel route where gesture events don't exist", () => {
    delete (window as unknown as { ongesturechange?: unknown }).ongesturechange;
    const el = setup();

    act(() => {
      el.dispatchEvent(gesture("gesturestart", { scale: 1, clientX: 100 }));
      el.dispatchEvent(gesture("gesturechange", { scale: 2, clientX: 100 }));
    });
    flushFrame(frames);
    expect(useTimelineUIStore.getState().msPerPx).toBe(10);
  });
});
