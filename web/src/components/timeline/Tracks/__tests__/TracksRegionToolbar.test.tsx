/**
 * TracksRegion toolbar and lane affordances:
 *   - Undo / Redo buttons follow the temporal store and drive it
 *   - the empty-sequence hint shows until a clip exists, without taking drops
 *   - the track-height separator resizes from the keyboard
 *
 * Store state is seeded AFTER render so `getState()` routes to the mounted
 * provider's instance.
 */
import { describe, it, expect, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TracksRegion } from "../TracksRegion";
import {
  TimelineProvider,
  getTimelineTemporal
} from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";

jest.mock("../../../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));

const renderRegion = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
    </ThemeProvider>
  );

const resetDoc = () => {
  act(() => {
    useTimelineStore.getState().reset();
    getTimelineTemporal().clear();
  });
};

describe("TracksRegion toolbar undo/redo", () => {
  it("disables both buttons with no history, then undoes and redoes", () => {
    renderRegion();
    resetDoc();

    const undo = screen.getByTestId("timeline-undo");
    const redo = screen.getByTestId("timeline-redo");
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();

    act(() => {
      useTimelineStore.getState().addTrack("video", "Video 1");
    });
    expect(useTimelineStore.getState().tracks).toHaveLength(1);
    expect(undo).toBeEnabled();

    act(() => {
      fireEvent.click(undo);
    });
    expect(useTimelineStore.getState().tracks).toHaveLength(0);
    expect(redo).toBeEnabled();

    act(() => {
      fireEvent.click(redo);
    });
    expect(useTimelineStore.getState().tracks).toHaveLength(1);
  });
});

describe("TracksRegion empty-sequence hint", () => {
  it("shows guidance until a clip exists and never takes pointer events", () => {
    renderRegion();
    resetDoc();

    const hint = screen.getByTestId("tracks-empty-hint");
    expect(hint).toHaveTextContent(
      "Drag media here from Assets, or add a track to start."
    );
    expect(getComputedStyle(hint).pointerEvents).toBe("none");

    act(() => {
      useTimelineStore
        .getState()
        .addClips([
          makeClip({ trackId: "t1", name: "a", startMs: 0, durationMs: 1000 })
        ]);
    });
    expect(screen.queryByTestId("tracks-empty-hint")).not.toBeInTheDocument();
  });
});

describe("TrackHeader height separator", () => {
  it("is focusable, steps the height with the arrow keys and clamps", () => {
    renderRegion();
    resetDoc();
    act(() => {
      useTimelineStore.getState().addTrack("video", "Video 1");
    });
    const track = useTimelineStore.getState().tracks[0];
    const before = track.heightPx ?? 64;
    expect(before).toBe(64);

    const separator = screen.getByTestId(`track-resize-${track.id}`);
    expect(separator).toHaveAttribute("tabindex", "0");
    expect(separator).toHaveAttribute("aria-valuenow", String(before));

    act(() => {
      fireEvent.keyDown(separator, { key: "ArrowDown" });
    });
    expect(useTimelineStore.getState().tracks[0].heightPx).toBe(before + 8);

    act(() => {
      fireEvent.keyDown(separator, { key: "ArrowUp", shiftKey: true });
    });
    // 72 - 32 clamps at the 48px minimum.
    expect(useTimelineStore.getState().tracks[0].heightPx).toBe(48);
  });
});
