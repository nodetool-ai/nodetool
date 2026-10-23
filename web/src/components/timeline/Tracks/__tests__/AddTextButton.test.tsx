import React from "react";
import { describe, it, expect, beforeEach } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import type { TimelineTrack } from "@nodetool-ai/timeline";
import { AddTextButton } from "../AddTextButton";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";

const track = (id: string, type: TimelineTrack["type"], index: number) =>
  ({ id, name: id, type, index, visible: true, locked: false }) as TimelineTrack;

const addText = async (atMs: number) => {
  useTimelinePlaybackStore.setState({ currentTimeMs: atMs });
  await userEvent.click(screen.getByTestId("add-text-button"));
  const { tracks, clips } = useTimelineStore.getState();
  const sorted = [...tracks].sort((a, b) => a.index - b.index);
  return { sorted, clips, top: sorted[0] };
};

describe("AddTextButton", () => {
  beforeEach(() => {
    useTimelineStore.setState({
      tracks: [track("video", "video", 0), track("music", "audio", 1)],
      clips: []
    });
    render(
      <ThemeProvider theme={mockTheme}>
        <AddTextButton />
      </ThemeProvider>
    );
  });

  it("puts a text clip at the playhead on a new top track, over the picture", async () => {
    // Study 16: 6 of 6 people asked to add words looked in the toolbar.
    const { sorted, clips, top } = await addText(2000);
    expect(sorted.map((t) => t.type)).toEqual(["overlay", "video", "audio"]);
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({ trackId: top.id, startMs: 2000, mediaType: "text" });
    expect([...useTimelineUIStore.getState().selectedClipIds]).toEqual([clips[0].id]);
  });

  it("reuses the top overlay track where it has room, and adds another where it does not", async () => {
    const first = await addText(0);
    const later = await addText(first.clips[0].durationMs + 1000);
    expect(later.sorted).toHaveLength(3);
    expect(later.clips[1].trackId).toBe(first.top.id);

    const overlapping = await addText(500);
    expect(overlapping.sorted.map((t) => t.type)).toEqual([
      "overlay",
      "overlay",
      "video",
      "audio"
    ]);
    expect(overlapping.clips[2].trackId).toBe(overlapping.top.id);
  });
});
