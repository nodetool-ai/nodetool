/**
 * TrackHeader drag-reorder — dragging a track's grip handle onto another
 * same-type track reorders the tracks via reorderTracks. jsdom reports a
 * zero-size rect, so the computed drop position is "after"; we assert a move
 * that is meaningful under that position.
 *
 * Setup runs AFTER render: TimelineProvider creates a fresh store instance on
 * mount and pushes it active, so static getState() only reaches that instance
 * once the provider is rendered.
 */
import React from "react";
import { describe, it, expect } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { TracksRegion } from "../TracksRegion";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";

const renderRegion = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
    </ThemeProvider>
  );

function dataTransferMock(): DataTransfer {
  return {
    types: [] as string[],
    dropEffect: "",
    effectAllowed: "",
    setData: () => {},
    getData: () => "",
    setDragImage: () => {}
  } as unknown as DataTransfer;
}

function videoTrackIds(): string[] {
  return useTimelineStore
    .getState()
    .tracks.filter((t) => t.type === "video")
    .map((t) => t.id);
}

describe("TrackHeader drag-reorder", () => {
  it("moves a video track after another video track on drop", () => {
    renderRegion();
    act(() => {
      const s = useTimelineStore.getState();
      s.reset();
      s.addTrack("video", "Video 1");
      s.addTrack("video", "Video 2");
      s.addTrack("video", "Video 3");
    });

    const ids0 = videoTrackIds();
    expect(ids0.length).toBeGreaterThanOrEqual(3);
    const [first, , third] = ids0;

    const dt = dataTransferMock();
    act(() => {
      fireEvent.dragStart(
        screen.getByTestId(`track-drag-handle-${first}`),
        { dataTransfer: dt }
      );
      fireEvent.dragOver(screen.getByTestId(`track-header-${third}`), {
        dataTransfer: dt
      });
      fireEvent.drop(screen.getByTestId(`track-header-${third}`), {
        dataTransfer: dt
      });
    });

    // first moved to just after third (position "after" under a zero rect).
    const ids = videoTrackIds();
    expect(ids[ids.indexOf(third) + 1]).toBe(first);
    expect(ids.indexOf(first)).toBeGreaterThan(ids.indexOf(third));
  });

  it("does not reorder when dropped onto a different track type", () => {
    renderRegion();
    act(() => {
      const s = useTimelineStore.getState();
      s.reset();
      s.addTrack("video", "Video A");
      s.addTrack("audio", "Audio 1");
    });

    const before = useTimelineStore.getState().tracks.map((t) => t.id);
    const videoId = useTimelineStore
      .getState()
      .tracks.find((t) => t.type === "video")!.id;
    const audioId = useTimelineStore
      .getState()
      .tracks.find((t) => t.type === "audio")!.id;

    const dt = dataTransferMock();
    act(() => {
      fireEvent.dragStart(
        screen.getByTestId(`track-drag-handle-${videoId}`),
        { dataTransfer: dt }
      );
      fireEvent.dragOver(screen.getByTestId(`track-header-${audioId}`), {
        dataTransfer: dt
      });
      fireEvent.drop(screen.getByTestId(`track-header-${audioId}`), {
        dataTransfer: dt
      });
    });

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(before);
  });
});
