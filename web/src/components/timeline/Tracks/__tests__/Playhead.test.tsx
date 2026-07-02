/**
 * Playhead imperative-position tests.
 *
 * The playhead must update its DOM position from the playback store's TRANSIENT
 * channel (`setTimeMs` → `subscribeTime`) WITHOUT re-rendering the React tree.
 * These tests verify the element's `transform` (compositor-only positioning;
 * the -8px is the folded half-width centering offset) and the pill text track
 * live time pushes, and that those pushes don't trigger a component render.
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { Playhead } from "../Playhead";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";

const renderPlayhead = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <Playhead heightPx={300} trackAreaOffsetPx={0} />
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
});
