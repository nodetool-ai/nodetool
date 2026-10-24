import React from "react";
import { describe, it, expect, beforeEach } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import type { TimelineTrack } from "@nodetool-ai/timeline";
import { AddTrackButton } from "../AddTrackButton";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";

const track = (id: string, type: TimelineTrack["type"], index: number) =>
  ({ id, name: id, type, index, visible: true, locked: false }) as TimelineTrack;

describe("AddTrackButton", () => {
  beforeEach(() => {
    useTimelineStore.setState({
      tracks: [track("video", "video", 0), track("music", "audio", 1)],
      clips: []
    });
  });

  const addTrack = async (label: RegExp) => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AddTrackButton />
      </ThemeProvider>
    );
    await userEvent.click(screen.getByTestId("add-track-button"));
    await userEvent.click(screen.getByRole("menuitem", { name: label }));
    return [...useTimelineStore.getState().tracks].sort((a, b) => a.index - b.index);
  };

  it("puts a new overlay track on top, where it draws over the video", async () => {
    // Study 16: a title on an overlay track appended under a full-frame
    // video never showed, in 3 of 3 sessions that added one.
    const tracks = await addTrack(/overlay/i);
    expect(tracks.map((t) => t.type)).toEqual(["overlay", "video", "audio"]);
  });

  it("appends a new audio track", async () => {
    const tracks = await addTrack(/^audio$/i);
    expect(tracks.map((t) => t.type)).toEqual(["video", "audio", "audio"]);
  });
});
