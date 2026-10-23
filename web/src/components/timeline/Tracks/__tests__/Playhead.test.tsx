/**
 * Playhead imperative-position tests.
 *
 * The playhead must update its DOM position from the playback store's TRANSIENT
 * channel (`setTimeMs` → `subscribeTime`) WITHOUT re-rendering the React tree.
 * These tests verify the element's `transform` (compositor-only positioning;
 * the -8px is the folded half-width centering offset) and the pill text track
 * live time pushes, and that those pushes don't trigger a component render.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { Playhead } from "../Playhead";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { installPointerEvent } from "../../../../test-utils/timelineClipHarness";

installPointerEvent();

const renderPlayhead = (endMs?: number) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <Playhead heightPx={300} trackAreaOffsetPx={0} endMs={endMs} />
      </TimelineProvider>
    </ThemeProvider>
  );

describe("Playhead", () => {
  it("positions imperatively from the transient time channel", () => {
    act(() => {
      useTimelineUIStore.getState().setZoom(10); // 10 ms per px
    });
    renderPlayhead();

    const el = screen.getByTestId("playhead");

    // Push a live time of 1000ms → 1000 / 10 = 100px, minus the 8px
    // half-width centering offset.
    act(() => {
      useTimelinePlaybackStore.getState().setTimeMs(1000);
    });
    expect(el.style.transform).toBe("translateX(92px)");

    // A second push moves it again without remounting.
    act(() => {
      useTimelinePlaybackStore.getState().setTimeMs(2000);
    });
    expect(el.style.transform).toBe("translateX(192px)");
  });

  it("hands a right-click to the lane beneath, so its menu opens", () => {
    // Study 16: a click on a lane parks the playhead under the pointer, and
    // the next right-click there opened no "Add text" menu.
    renderPlayhead();
    const lane = document.createElement("div");
    document.body.appendChild(lane);
    const onLaneMenu = jest.fn();
    lane.addEventListener("contextmenu", onLaneMenu);
    const grab = screen.getByTestId("playhead-grab");
    const original = document.elementsFromPoint;
    document.elementsFromPoint = () => [grab, lane];
    try {
      fireEvent.contextMenu(grab, { clientX: 40, clientY: 20 });
    } finally {
      document.elementsFromPoint = original;
      lane.remove();
    }
    expect(onLaneMenu).toHaveBeenCalledTimes(1);
    expect(onLaneMenu.mock.calls[0][0]).toMatchObject({ clientX: 40, clientY: 20 });
  });

  describe("over the ruler", () => {
    const renderWithRuler = () =>
      render(
        <ThemeProvider theme={mockTheme}>
          <TimelineProvider>
            <Playhead heightPx={300} trackAreaOffsetPx={0} grabTopPx={28} />
          </TimelineProvider>
        </ThemeProvider>
      );

    it("lets clicks in the ruler band through to the markers under it", () => {
      renderWithRuler();
      const root = screen.getByTestId("playhead");
      const grab = screen.getByTestId("playhead-grab");
      // The full-height root draws the line and pill but takes no pointer.
      expect(getComputedStyle(root).pointerEvents).toBe("none");
      // Only the zone below the ruler grabs the playhead.
      expect(getComputedStyle(grab).pointerEvents).toBe("auto");
      expect(grab.style.top).toBe("28px");
    });

    it("drags from the grab zone below the ruler", () => {
      act(() => {
        useTimelineUIStore.getState().setZoom(10);
      });
      renderWithRuler();
      const grab = screen.getByTestId("playhead-grab");
      // jsdom has no pointer capture; the browser captures on the grab zone.
      grab.setPointerCapture = jest.fn();
      fireEvent.pointerDown(grab, { button: 0, buttons: 1, clientX: 0, pointerId: 1 });
      fireEvent.pointerMove(grab, { buttons: 1, clientX: 50, pointerId: 1 });
      fireEvent.pointerUp(grab, { pointerId: 1 });
      expect(useTimelinePlaybackStore.getState().getTimeMs()).toBe(500);
    });
  });

  it("reflects the live position in the timecode pill", () => {
    act(() => {
      useTimelineUIStore.getState().setZoom(10);
    });
    renderPlayhead();

    const pill = screen.getByTestId("playhead-pill");
    act(() => {
      useTimelinePlaybackStore.getState().setTimeMs(5000);
    });
    expect(pill.textContent).not.toBe("");
  });

  it("End jumps to the content end passed in, past a stale durationMs", () => {
    renderPlayhead(8000);
    fireEvent.keyDown(screen.getByTestId("playhead"), { key: "End" });
    expect(useTimelinePlaybackStore.getState().getTimeMs()).toBe(8000);
  });
});
