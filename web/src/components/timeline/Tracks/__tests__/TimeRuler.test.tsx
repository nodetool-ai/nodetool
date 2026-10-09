/**
 * TimeRuler marker-overlay tests.
 *
 * The canvas drawing can't run in jsdom (no 2d context), but the interactive
 * marker flags are plain DOM: this verifies a marker renders, clicking it seeks
 * the playhead, and the delete button removes it from the store.
 */

import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimeRuler } from "../TimeRuler";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";

const renderRuler = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TimeRuler totalWidthPx={1000} />
      </TimelineProvider>
    </ThemeProvider>
  );

describe("TimeRuler markers", () => {
  it("renders a flag and seeks the playhead on click", () => {
    renderRuler();
    act(() => {
      useTimelineStore.getState().addMarker({ timeMs: 2000, label: "Scene 1" });
    });

    const flag = screen.getByTestId("timeline-marker");
    expect(flag).toHaveTextContent("Scene 1");
    // A real button, reachable and named for keyboard and screen-reader users.
    expect(
      screen.getByRole("button", { name: "Scene 1 at 0:02.0" })
    ).toBe(flag);

    act(() => {
      fireEvent.click(flag);
    });
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(2000);
  });

  it("deletes a marker via its × button", () => {
    renderRuler();
    act(() => {
      useTimelineStore.getState().addMarker({ timeMs: 2000, label: "Scene 1" });
    });
    expect(screen.getByTestId("timeline-marker")).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByTestId("marker-delete"));
    });
    expect(useTimelineStore.getState().markers).toHaveLength(0);
    expect(screen.queryByTestId("timeline-marker")).not.toBeInTheDocument();
  });
});

/** jsdom's pointer events drop clientX/buttons, so set them on the event. */
const pointer = (
  type: "pointerDown" | "pointerMove" | "pointerUp",
  el: Element,
  props: { clientX?: number; buttons?: number }
) => {
  const event = createEvent[type](el, { pointerId: 1 });
  for (const [k, v] of Object.entries(props)) {
    Object.defineProperty(event, k, { value: v });
  }
  fireEvent(el, event);
};

describe("TimeRuler gesture ownership", () => {
  it("ignores a drag that did not start on the ruler", () => {
    renderRuler();
    const canvas = screen.getByTestId("time-ruler").querySelector("canvas")!;
    act(() => {
      useTimelinePlaybackStore.getState().seek(500);
    });
    pointer("pointerMove", canvas, { buttons: 1, clientX: 400 });
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(500);
  });

  it("scrubs a drag that started on the ruler and stops after release", () => {
    renderRuler();
    const canvas = screen.getByTestId("time-ruler").querySelector("canvas")!;
    canvas.setPointerCapture = jest.fn();
    pointer("pointerDown", canvas, { buttons: 1, clientX: 100 });
    const afterDown = useTimelinePlaybackStore.getState().currentTimeMs;
    pointer("pointerMove", canvas, { buttons: 1, clientX: 300 });
    const afterMove = useTimelinePlaybackStore.getState().currentTimeMs;
    expect(afterMove).toBeGreaterThan(afterDown);
    pointer("pointerUp", canvas, {});
    pointer("pointerMove", canvas, { buttons: 1, clientX: 600 });
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(afterMove);
  });
});
